import type { AgentConfig } from './baseAgent';
import { BaseAgent } from './baseAgent';
import type { MindMapData, MindMapNode } from '../../src/utils/mindMapData';
import { SSEEventType } from '../../src/types';
import { logger } from '../logger';
import { sseManager } from '../sseManager';
import * as path from 'path';

export interface MindmapChange {
  action: 'create' | 'update' | 'delete';
  nodeId: string;
  parentId?: string;
  text?: string;
  notes?: string;
  sources?: Array<{ id: string; title: string; url: string; type: string }>;
}

// Type for the reasoning response from the LLM
interface ReasoningResponse {
  reasoning?: {
    isComplete?: boolean;
    decision?: string;
    explanation?: string;
    nextAction?: string;
  };
  changes?: MindmapChange[];
}

const DEFAULT_MINDMAP_ROLE = `You are a specialized mindmap agent that uses iterative reasoning to process user requests. You examine each request, create content step-by-step, and decide what to do next based on accumulated results.`;

// Direct SSE broadcasting function
const broadcastUpdate = (streamId: string, data: Record<string, unknown>) => {
  sseManager.broadcast('unified-events', {
    ...data,
    streamId: streamId, // Include streamId for client filtering
    timestamp: Date.now(),
  });
};

export interface MindmapContext {
  mindMapId: string;
  mindMapData: MindMapData;
  selectedNodeId?: string;
  selectedNode?: MindMapNode;
}

export interface ReasoningStep {
  step: number;
  request: string;
  context: string;
  decision: string;
  changes: MindmapChange[];
  reasoning: string;
  shouldContinue: boolean;
  timestamp: Date;
}

export interface IterativeWorkflowState {
  workflowId: string;
  originalRequest: string;
  currentStep: number;
  maxSteps: number;
  reasoningHistory: ReasoningStep[];
  allChanges: MindmapChange[];
  isComplete: boolean;
  isCancelled: boolean;
  abortController: AbortController;
  parentNodeId: string;
  parentTopic: string;
}

// Global registry of active workflows for cancellation
const activeWorkflows = new Map<string, IterativeWorkflowState>();

export const cancelWorkflow = (workflowId: string): boolean => {
  const workflow = activeWorkflows.get(workflowId);
  if (workflow) {
    workflow.isCancelled = true;
    // IMMEDIATELY ABORT ANY IN-FLIGHT LLM REQUESTS
    workflow.abortController.abort();
    return true;
  }
  return false;
};

export class MindmapAgentIterative extends BaseAgent {
  private currentMindmapContext: MindmapContext | null = null;
  private workflowState: IterativeWorkflowState | null = null;

  /**
   * Process message with abort signal support
   */
  private async processMessageWithAbort(
    userMessage: string,
    signal: AbortSignal
  ): Promise<{ content: string; id: string; role: string }> {
    // Check if already aborted
    if (signal.aborted) {
      throw new Error('Request was aborted');
    }

    // Create a promise that rejects when aborted
    const abortPromise = new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        reject(new Error('LLM request was aborted'));
      });
    });

    // Create a temporary thread for this reasoning step
    const reasoningThreadId = `reasoning-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Race between the actual LLM call and the abort signal
    return Promise.race([
      this.processMessage(reasoningThreadId, userMessage, {
        includePriorConversation: false,
      }),
      abortPromise,
    ]) as Promise<{ content: string; id: string; role: string }>;
  }

  /**
   * Safely parse and validate reasoning response JSON
   */
  private parseReasoningResponse(jsonString: string): ReasoningResponse {
    try {
      const parsed: unknown = JSON.parse(jsonString) as unknown;

      // Basic validation that it's an object
      if (typeof parsed !== 'object' || parsed === null) {
        return {};
      }

      const response = parsed as Record<string, unknown>;

      // Safely extract reasoning object
      const reasoning =
        typeof response.reasoning === 'object' && response.reasoning !== null
          ? (response.reasoning as Record<string, unknown>)
          : {};

      // Safely extract changes array
      const changes = Array.isArray(response.changes)
        ? (response.changes as MindmapChange[])
        : [];

      return {
        reasoning: {
          isComplete:
            typeof reasoning.isComplete === 'boolean'
              ? reasoning.isComplete
              : false,
          decision:
            typeof reasoning.decision === 'string'
              ? reasoning.decision
              : undefined,
          explanation:
            typeof reasoning.explanation === 'string'
              ? reasoning.explanation
              : undefined,
          nextAction:
            typeof reasoning.nextAction === 'string'
              ? reasoning.nextAction
              : undefined,
        },
        changes,
      };
    } catch (error) {
      logger.warn('Failed to parse reasoning response JSON:', error);
      return {};
    }
  }

  constructor(config: AgentConfig) {
    super(config);
  }

  getDefaultPrompt(): string {
    return DEFAULT_MINDMAP_ROLE;
  }

  createSystemPrompt(): string {
    const basePrompt = [
      this.getDefaultPrompt(),
      '',
      'You modify mindmaps by creating, updating, or deleting nodes. Return ONLY valid JSON with changes array.',
      '',
      'Your capabilities:',
      '- Create new nodes with text, notes, and sources',
      '- Update existing node content',
      '- Delete nodes when requested',
      '- Work with the full mindmap context provided',
      '- Use rich markdown in notes (headers, lists, code blocks, math, mermaid diagrams)',
      '',
      'CRITICAL - Response format:',
      'Return ONLY valid JSON starting with { and ending with }',
      'Use nodeId: [[GENERATE_NODE_ID]] for new nodes',
      'Escape newlines in JSON strings as \\n',
    ].join('\n');

    // Add mindmap context if available
    if (this.currentMindmapContext) {
      const contextPrompt = this.createMindmapContextPrompt();
      return [basePrompt, '', contextPrompt].join('\n');
    }

    return basePrompt;
  }

  /**
   * Set the current mindmap context for the agent
   */
  async setMindmapContext(
    mindMapId: string,
    selectedNodeId?: string
  ): Promise<void> {
    try {
      const mindMapData = await this.loadMindmapData(mindMapId);
      if (!mindMapData) {
        throw new Error(`Mindmap with ID ${mindMapId} not found`);
      }

      const selectedNode = selectedNodeId
        ? this.findNodeById(mindMapData.root, selectedNodeId)
        : undefined;

      this.currentMindmapContext = {
        mindMapId,
        mindMapData,
        selectedNodeId,
        selectedNode,
      };

      // Update system prompt with new context
      this.systemPrompt = this.createSystemPrompt();
    } catch (error) {
      logger.error('Failed to set mindmap context:', error);
      throw error;
    }
  }

  /**
   * Load mindmap data from storage
   */
  private async loadMindmapData(
    mindMapId: string
  ): Promise<MindMapData | null> {
    try {
      const fs = await import('fs/promises');
      const mindMapsPath = path.join(
        this.config.workspaceRoot,
        'mindstrike-mindmaps.json'
      );

      const data = await fs.readFile(mindMapsPath, 'utf-8');
      if (!data.trim()) {
        return null;
      }

      const mindMaps = JSON.parse(data) as {
        id: string;
        mindmapData: MindMapData;
      }[];
      const mindMap = mindMaps.find(
        (m: { id: string; mindmapData: MindMapData }) => m.id === mindMapId
      );

      return mindMap ? mindMap.mindmapData : null;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Find a node by ID in the mindmap tree
   */
  private findNodeById(
    node: MindMapNode,
    nodeId: string
  ): MindMapNode | undefined {
    if (node.id === nodeId) {
      return node;
    }

    if (node.children) {
      for (const child of node.children) {
        const found = this.findNodeById(child, nodeId);
        if (found) {
          return found;
        }
      }
    }

    return undefined;
  }

  /**
   * Create mindmap context prompt
   */
  private createMindmapContextPrompt(): string {
    if (!this.currentMindmapContext) {
      return '';
    }

    const { mindMapData, selectedNode } = this.currentMindmapContext;
    const mindmapStructure = this.serializeMindmapStructure(mindMapData.root);

    const contextParts = [
      '=== CURRENT MINDMAP CONTEXT ===',
      `Mindmap ID: ${this.currentMindmapContext.mindMapId}`,
      `Layout: ${mindMapData.root.layout}`,
      '',
      'MINDMAP STRUCTURE:',
      mindmapStructure,
    ];

    if (selectedNode) {
      contextParts.push(
        '',
        '=== SELECTED NODE ===',
        `Selected Node ID: ${selectedNode.id}`,
        `Selected Node Text: "${selectedNode.text}"`,
        selectedNode.notes
          ? `Selected Node Notes: "${selectedNode.notes.substring(0, 200)}..."`
          : 'Selected Node Notes: None',
        `Selected Node Children: ${selectedNode.children ? selectedNode.children.length : 0}`
      );
    }

    return contextParts.join('\n');
  }

  /**
   * Serialize mindmap structure for context
   */
  private serializeMindmapStructure(
    node: MindMapNode,
    level: number = 0
  ): string {
    const indent = '  '.repeat(level);
    let result = `${indent}- [${node.id}] "${node.text}"`;

    if (node.notes) {
      result += `\n${indent}  Notes: "${node.notes.length > 100 ? node.notes.substring(0, 100) + '...' : node.notes}"`;
    }

    if (node.sources && node.sources.length > 0) {
      result += `\n${indent}  Sources: ${node.sources.length} source(s)`;
    }

    if (node.children && node.children.length > 0) {
      result +=
        '\n' +
        node.children
          .map(child => this.serializeMindmapStructure(child, level + 1))
          .join('\n');
    }

    return result;
  }

  /**
   * Process message using iterative reasoning workflow
   */
  async processMessageIterative(
    userMessage: string,
    images?: string[],
    notes?: string[],
    onUpdate?: (message: {
      type: string;
      data: Record<string, unknown>;
    }) => void,
    workflowId?: string,
    streamId?: string
  ): Promise<{
    content: string;
    id: string;
    role: 'assistant';
    timestamp: Date;
  }> {
    // Generate workflow ID if not provided
    const finalWorkflowId =
      workflowId ??
      `iterative-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Set streamId for token stats broadcasting
    if (streamId) {
      this.setStreamId(streamId);
    }

    if (!this.currentMindmapContext?.selectedNode) {
      throw new Error('No mindmap context or selected node available');
    }

    try {
      // Initialize workflow state
      this.workflowState = {
        workflowId: finalWorkflowId,
        originalRequest: userMessage,
        currentStep: 0,
        maxSteps: 10, // Prevent infinite loops
        reasoningHistory: [],
        allChanges: [],
        isComplete: false,
        isCancelled: false,
        abortController: new AbortController(),
        parentNodeId: this.currentMindmapContext.selectedNode.id,
        parentTopic: this.currentMindmapContext.selectedNode.text,
      };

      // Register workflow for cancellation
      activeWorkflows.set(finalWorkflowId, this.workflowState);

      // Broadcast workflow start
      broadcastUpdate(finalWorkflowId, {
        type: SSEEventType.WORKFLOW_STARTED,
        workflowId: finalWorkflowId,
        originalQuery: userMessage,
        parentTopic: this.workflowState.parentTopic,
        maxSteps: this.workflowState.maxSteps,
      });

      // Broadcast initial tasks planned
      broadcastUpdate(finalWorkflowId, {
        type: SSEEventType.TASKS_PLANNED,
        workflowId: finalWorkflowId,
        tasks: Array.from({ length: this.workflowState.maxSteps }, (_, i) => ({
          id: `reasoning-step-${i + 1}`,
          description:
            i === 0
              ? 'Analyze request and determine approach'
              : `Reasoning step ${i + 1}`,
          priority: 'medium',
          status: 'todo',
        })),
      });

      // Main iterative reasoning loop
      while (
        !this.workflowState.isComplete &&
        this.workflowState.currentStep < this.workflowState.maxSteps &&
        !this.workflowState.isCancelled
      ) {
        this.workflowState.currentStep++;

        // Check for cancellation before executing step
        if (this.workflowState.isCancelled) {
          break;
        }

        // Broadcast task progress start - USE STREAMID FOR MINDMAP FILTERING
        if (streamId) {
          broadcastUpdate(streamId, {
            type: SSEEventType.TASK_PROGRESS,
            workflowId: finalWorkflowId,
            task: {
              id: `reasoning-step-${this.workflowState.currentStep}`,
              status: 'in-progress',
              description: `Step ${this.workflowState.currentStep}: Processing...`,
            },
          });
        }

        // Execute one reasoning step
        const stepResult = await this.executeReasoningStep();

        // Record the step
        this.workflowState.reasoningHistory.push(stepResult);

        // Add any changes to accumulated results
        if (stepResult.changes.length > 0) {
          this.workflowState.allChanges.push(...stepResult.changes);
        }

        // Update completion status
        this.workflowState.isComplete = !stepResult.shouldContinue;

        // Broadcast task progress completion - USE STREAMID FOR MINDMAP FILTERING
        if (streamId) {
          broadcastUpdate(streamId, {
            type: SSEEventType.TASK_PROGRESS,
            workflowId: finalWorkflowId,
            task: {
              id: `reasoning-step-${this.workflowState.currentStep}`,
              status: 'completed',
              description: `Step ${this.workflowState.currentStep}: ${stepResult.reasoning}`,
              result: stepResult.reasoning,
            },
          });
        }

        // Broadcast actual mindmap changes only
        if (streamId && stepResult.changes.length > 0) {
          stepResult.changes.forEach(change => {
            const changeEvent = {
              type: SSEEventType.MINDMAP_CHANGE,
              action: change.action, // CREATE/UPDATE/DELETE
              nodeId: change.nodeId,
              text: change.text,
              parentId: change.parentId,
              notes: change.notes,
              sources: change.sources,
            };
            broadcastUpdate(streamId, changeEvent);
          });
        }

        // Send progress update
        if (onUpdate) {
          onUpdate({
            type: 'reasoning_step_completed',
            data: {
              step: stepResult.step,
              maxSteps: this.workflowState.maxSteps,
              decision: stepResult.decision,
              reasoning: stepResult.reasoning,
              changesCount: stepResult.changes.length,
              totalChanges: this.workflowState.allChanges.length,
              isComplete: this.workflowState.isComplete,
            },
          });
        }

        // Small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Final result
      const finalResult = {
        content: JSON.stringify({
          changes: this.workflowState.allChanges,
          workflow: {
            id: finalWorkflowId,
            originalRequest: userMessage,
            stepsCompleted: this.workflowState.currentStep,
            maxSteps: this.workflowState.maxSteps,
            totalChanges: this.workflowState.allChanges.length,
            reasoningHistory: this.workflowState.reasoningHistory.map(step => ({
              step: step.step,
              decision: step.decision,
              reasoning: step.reasoning,
              changesCount: step.changes.length,
            })),
          },
        }),
        id: this.generateId(),
        role: 'assistant' as const,
        timestamp: new Date(),
      };

      // Broadcast workflow completion
      broadcastUpdate(finalWorkflowId, {
        type: SSEEventType.WORKFLOW_COMPLETED,
        workflowId: finalWorkflowId,
        stepsCompleted: this.workflowState.currentStep,
        totalChanges: this.workflowState.allChanges.length,
        finalReason: this.workflowState.isComplete
          ? 'Task completed'
          : 'Max steps reached',
      });

      // Send final completion update
      if (onUpdate) {
        onUpdate({
          type: 'iterative_workflow_completed',
          data: {
            stepsCompleted: this.workflowState.currentStep,
            totalChanges: this.workflowState.allChanges.length,
            finalReason: this.workflowState.isComplete
              ? 'Task completed'
              : 'Max steps reached',
          },
        });
      }

      // Clean up workflow from registry
      activeWorkflows.delete(finalWorkflowId);

      return finalResult;
    } catch (error) {
      logger.error('Iterative reasoning workflow failed:', error);

      // Clean up workflow from registry
      activeWorkflows.delete(finalWorkflowId);

      // Broadcast workflow failure
      broadcastUpdate(finalWorkflowId, {
        type: SSEEventType.WORKFLOW_FAILED,
        workflowId: finalWorkflowId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Execute one step of iterative reasoning
   */
  private async executeReasoningStep(): Promise<ReasoningStep> {
    if (!this.workflowState) {
      throw new Error('No workflow state available');
    }

    const step = this.workflowState.currentStep;

    // Build context from previous steps
    const previousContext = this.buildPreviousContext();

    // Create reasoning prompt
    const reasoningPrompt = this.createReasoningPrompt(previousContext);

    try {
      // Execute the reasoning with abort signal
      const response = await this.processMessageWithAbort(
        reasoningPrompt,
        this.workflowState.abortController.signal
      );

      const cleanedResponse = this.cleanMindmapResponse(response.content);
      const result = this.parseReasoningResponse(cleanedResponse);

      // Extract reasoning information safely
      const reasoning = result.reasoning ?? {};
      const changes = result.changes ?? [];
      const shouldContinue =
        !reasoning.isComplete && reasoning.decision !== 'completed';

      const stepResult: ReasoningStep = {
        step,
        request: this.workflowState.originalRequest,
        context: previousContext,
        decision: reasoning.decision ?? 'unknown',
        changes,
        reasoning:
          reasoning.explanation ??
          reasoning.nextAction ??
          'No reasoning provided',
        shouldContinue,
        timestamp: new Date(),
      };

      return stepResult;
    } catch (error) {
      logger.error(`Reasoning step ${step} failed:`, error);

      // Return a failed step that stops the workflow
      return {
        step,
        request: this.workflowState.originalRequest,
        context: previousContext,
        decision: 'failed',
        changes: [],
        reasoning: `Step failed: ${error instanceof Error ? error.message : String(error)}`,
        shouldContinue: false,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Build context string from previous reasoning steps
   */
  private buildPreviousContext(): string {
    if (
      !this.workflowState ||
      this.workflowState.reasoningHistory.length === 0
    ) {
      return 'No previous context.';
    }

    const contextParts = ['PREVIOUS REASONING STEPS:'];

    this.workflowState.reasoningHistory.forEach(step => {
      contextParts.push(`Step ${step.step}: ${step.decision}`);
      if (step.changes.length > 0) {
        step.changes.forEach(change => {
          if (change.action === 'create') {
            contextParts.push(
              `  - Created: "${change.text}" (${change.notes?.length ?? 0} chars)`
            );
          }
        });
      }
      contextParts.push(`  - Reasoning: ${step.reasoning}`);
    });

    contextParts.push(
      `\nTotal nodes created so far: ${this.workflowState.allChanges.length}`
    );

    return contextParts.join('\n');
  }

  /**
   * Create reasoning prompt for current step
   */
  private createReasoningPrompt(previousContext: string): string {
    if (!this.workflowState) {
      throw new Error('No workflow state available');
    }

    return `ITERATIVE MINDMAP REASONING - Step ${this.workflowState.currentStep}

ORIGINAL REQUEST: "${this.workflowState.originalRequest}"
PARENT NODE: "${this.workflowState.parentTopic}"

${previousContext}

INSTRUCTIONS:
Analyze the original request and previous progress. Decide what to do next:

1. If the request asks for multiple items (like "3 topics") and you haven't created them all yet:
   - Create ONE more high-quality node with comprehensive content (3+ paragraphs)
   - Set reasoning.isComplete = false to continue

2. If the request is fully satisfied:
   - Return empty changes array: {"changes": []}
   - Set reasoning.isComplete = true to stop

3. If you need to expand or improve what you've created:
   - Create additional content or nodes as needed
   - Set reasoning.isComplete = false to continue

Return ONLY valid JSON:
{
  "changes": [
    {
      "action": "create",
      "nodeId": "[[GENERATE_NODE_ID]]",
      "parentId": "${this.workflowState.parentNodeId}",
      "text": "Specific Topic Title",
      "notes": "## Overview\\n\\nDetailed content...\\n\\n## Key Points\\n\\n- Point 1\\n- Point 2",
      "sources": []
    }
  ],
  "reasoning": {
    "decision": "created_topic | completed | expanding",
    "explanation": "Brief explanation of what you did and why",
    "progress": "X of Y items completed",
    "isComplete": false
  }
}

CRITICAL:
- Focus on ONE quality item per step
- Use full context window for rich content
- Include detailed reasoning to guide next step
- Escape newlines as \\n in JSON strings`;
  }

  /**
   * Clean mindmap response to extract JSON
   */
  private cleanMindmapResponse(content: string): string {
    // Remove any text before the first { and after the last }
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');

    if (start === -1 || end === -1) {
      throw new Error('No valid JSON found in response');
    }

    const jsonContent = content.substring(start, end + 1);

    // Replace placeholder IDs with actual IDs
    const processedContent = this.replacePlaceholderIds(jsonContent);

    return processedContent;
  }

  /**
   * Replace placeholder IDs with actual generated IDs
   */
  private replacePlaceholderIds(content: string): string {
    let result = content;
    const timestamp = Date.now();
    let counter = 0;

    // Replace node ID placeholders
    const nodeIdRegex = /\[\[GENERATE_NODE_ID\]\]/g;
    const nodeMatches = content.match(nodeIdRegex);
    if (nodeMatches) {
      result = result.replace(nodeIdRegex, () => {
        const newId = `node-${timestamp}-${counter++}`;
        return newId;
      });
    }

    // Reset counter for source IDs
    counter = 0;

    // Replace source ID placeholders
    const sourceIdRegex = /\[\[GENERATE_SOURCE_ID\]\]/g;
    const sourceMatches = content.match(sourceIdRegex);
    if (sourceMatches) {
      result = result.replace(sourceIdRegex, () => {
        const newId = `src-${timestamp}-${counter++}`;
        return newId;
      });
    }

    return result;
  }

  /**
   * Clear mindmap context
   */
  clearMindmapContext(): void {
    this.currentMindmapContext = null;
    this.workflowState = null;
    this.systemPrompt = this.createSystemPrompt();
  }

  /**
   * Get current workflow state for debugging
   */
  getCurrentWorkflowState(): IterativeWorkflowState | null {
    return this.workflowState;
  }
}
