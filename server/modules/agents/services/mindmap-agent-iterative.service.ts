import { Injectable, Logger } from '@nestjs/common';
import type {
  MindMapData,
  MindMapNode,
} from '../../../../src/utils/mindMapData';
import { SSEEventType } from '../../../../src/types';
import { SseService } from '../../events/services/sse.service';
import * as path from 'path';
import * as fs from 'fs';

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
  steps: ReasoningStep[];
  isComplete: boolean;
  context: MindmapContext;
  accumulatedChanges: MindmapChange[];
  reasoningHistory: string[];
  started: Date;
  lastActivity: Date;
}

@Injectable()
export class MindmapAgentIterativeService {
  private readonly logger = new Logger(MindmapAgentIterativeService.name);
  private mindmapContext: MindmapContext | null = null;
  private workflowState: IterativeWorkflowState | null = null;
  private abortController: AbortController | null = null;
  private workspaceRoot: string = process.cwd();

  constructor(private readonly sseService: SseService) {}

  /**
   * Set the workspace root
   */
  setWorkspaceRoot(workspaceRoot: string): void {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Set the mindmap context for the agent
   */
  async setMindmapContext(
    mindMapId: string,
    mindMapData?: MindMapData,
    selectedNodeId?: string
  ): Promise<void> {
    this.logger.log(`Setting mindmap context for: ${mindMapId}`);

    if (!mindMapData) {
      mindMapData = await this.loadMindmapData(mindMapId);
    }

    const selectedNode = selectedNodeId
      ? this.findNodeById(mindMapData.nodes ?? [], selectedNodeId)
      : undefined;

    this.mindmapContext = {
      mindMapId,
      mindMapData,
      selectedNodeId,
      selectedNode,
    };

    this.logger.log(
      `Mindmap context set: ${mindMapId}, selected node: ${selectedNodeId ?? 'none'}`
    );
  }

  /**
   * Load mindmap data from file
   */
  private async loadMindmapData(mindMapId: string): Promise<MindMapData> {
    const filePath = path.join(
      this.workspaceRoot,
      '.mindstrike',
      'mindmaps',
      `${mindMapId}.json`
    );

    if (!fs.existsSync(filePath)) {
      // Return empty mindmap if file doesn't exist
      return {
        nodes: [
          {
            id: 'root',
            text: 'Root',
            isRoot: true,
            children: [],
          },
        ],
        edges: [],
      };
    }

    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data) as MindMapData;
  }

  /**
   * Find a node by ID in the mindmap tree
   */
  private findNodeById(
    nodes: MindMapNode[],
    nodeId: string
  ): MindMapNode | undefined {
    for (const node of nodes) {
      if (node.id === nodeId) {
        return node;
      }
      if (node.children) {
        const found = this.findNodeById(node.children, nodeId);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  }

  /**
   * Process a message using iterative reasoning
   */
  async processMessageIterative(
    message: string,
    streamId: string
  ): Promise<void> {
    if (!this.mindmapContext) {
      throw new Error('Mindmap context not set');
    }

    // Initialize workflow state
    this.workflowState = {
      workflowId: `workflow-${Date.now()}`,
      originalRequest: message,
      currentStep: 0,
      steps: [],
      isComplete: false,
      context: this.mindmapContext,
      accumulatedChanges: [],
      reasoningHistory: [],
      started: new Date(),
      lastActivity: new Date(),
    };

    // Create abort controller for this workflow
    this.abortController = new AbortController();

    // Broadcast workflow started
    this.broadcastUpdate(streamId, {
      type: SSEEventType.MINDMAP_AGENT_WORKFLOW_STARTED,
      workflowId: this.workflowState.workflowId,
      request: message,
    });

    try {
      await this.processMessageWithAbort(message, streamId);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.log('Workflow aborted');
        this.broadcastUpdate(streamId, {
          type: SSEEventType.MINDMAP_AGENT_WORKFLOW_ABORTED,
          workflowId: this.workflowState?.workflowId,
        });
      } else {
        this.logger.error('Error in iterative processing:', error);
        this.broadcastUpdate(streamId, {
          type: SSEEventType.ERROR,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Process message with abort support
   */
  private async processMessageWithAbort(
    message: string,
    streamId: string
  ): Promise<void> {
    if (!this.workflowState) {
      throw new Error('Workflow state not initialized');
    }

    const MAX_ITERATIONS = 10;
    let iteration = 0;

    while (!this.workflowState.isComplete && iteration < MAX_ITERATIONS) {
      // Check for abort
      if (this.abortController?.signal.aborted) {
        throw new Error('Workflow aborted');
      }

      iteration++;
      this.workflowState.currentStep = iteration;

      // Execute reasoning step
      const step = await this.executeReasoningStep();
      this.workflowState.steps.push(step);

      // Apply changes to mindmap
      if (step.changes.length > 0) {
        await this.applyChangesToMindmap(step.changes, streamId);
        this.workflowState.accumulatedChanges.push(...step.changes);
      }

      // Broadcast step completed
      this.broadcastUpdate(streamId, {
        type: SSEEventType.MINDMAP_AGENT_STEP_COMPLETED,
        workflowId: this.workflowState.workflowId,
        step: iteration,
        changes: step.changes,
        reasoning: step.reasoning,
        shouldContinue: step.shouldContinue,
      });

      // Check if we should continue
      if (!step.shouldContinue) {
        this.workflowState.isComplete = true;
        break;
      }

      // Update last activity
      this.workflowState.lastActivity = new Date();
    }

    // Broadcast workflow completed
    this.broadcastUpdate(streamId, {
      type: SSEEventType.MINDMAP_AGENT_WORKFLOW_COMPLETED,
      workflowId: this.workflowState.workflowId,
      totalSteps: this.workflowState.steps.length,
      totalChanges: this.workflowState.accumulatedChanges.length,
    });
  }

  /**
   * Execute a single reasoning step
   */
  private async executeReasoningStep(): Promise<ReasoningStep> {
    if (!this.workflowState || !this.mindmapContext) {
      throw new Error('Workflow state or mindmap context not initialized');
    }

    const currentContext = this.buildCurrentContext();
    const request = this.buildStepRequest();

    // Here we would call the LLM to get reasoning and changes
    // For now, return a stub response
    const llmResponse: ReasoningResponse = {
      reasoning: {
        isComplete: true,
        decision: 'Complete the request',
        explanation: 'Request has been processed',
        nextAction: 'None',
      },
      changes: [],
    };

    const step: ReasoningStep = {
      step: this.workflowState.currentStep,
      request,
      context: currentContext,
      decision: llmResponse.reasoning?.decision ?? '',
      changes: llmResponse.changes ?? [],
      reasoning: llmResponse.reasoning?.explanation ?? '',
      shouldContinue: !llmResponse.reasoning?.isComplete,
      timestamp: new Date(),
    };

    return step;
  }

  /**
   * Build the current context for the reasoning step
   */
  private buildCurrentContext(): string {
    if (!this.workflowState || !this.mindmapContext) {
      return '';
    }

    const parts = [];

    // Add mindmap structure
    parts.push(`Current Mindmap: ${this.mindmapContext.mindMapId}`);
    parts.push(
      `Total Nodes: ${this.countNodes(this.mindmapContext.mindMapData.nodes ?? [])}`
    );

    if (this.mindmapContext.selectedNode) {
      parts.push(`Selected Node: ${this.mindmapContext.selectedNode.text}`);
    }

    // Add previous steps summary
    if (this.workflowState.steps.length > 0) {
      parts.push(`Previous Steps: ${this.workflowState.steps.length}`);
      const recentChanges = this.workflowState.accumulatedChanges.slice(-5);
      if (recentChanges.length > 0) {
        parts.push(
          `Recent Changes: ${recentChanges.map(c => c.action).join(', ')}`
        );
      }
    }

    return parts.join('\n');
  }

  /**
   * Build the request for the current step
   */
  private buildStepRequest(): string {
    if (!this.workflowState) {
      return '';
    }

    if (this.workflowState.currentStep === 1) {
      return this.workflowState.originalRequest;
    }

    // For subsequent steps, build based on previous reasoning
    const lastStep =
      this.workflowState.steps[this.workflowState.steps.length - 1];
    if (lastStep) {
      return `Continue from: ${lastStep.reasoning}`;
    }

    return this.workflowState.originalRequest;
  }

  /**
   * Count total nodes in the mindmap
   */
  private countNodes(nodes: MindMapNode[]): number {
    let count = nodes.length;
    for (const node of nodes) {
      if (node.children) {
        count += this.countNodes(node.children);
      }
    }
    return count;
  }

  /**
   * Apply changes to the mindmap
   */
  private async applyChangesToMindmap(
    changes: MindmapChange[],
    streamId: string
  ): Promise<void> {
    if (!this.mindmapContext) {
      return;
    }

    for (const change of changes) {
      switch (change.action) {
        case 'create':
          await this.createNode(change, streamId);
          break;
        case 'update':
          await this.updateNode(change, streamId);
          break;
        case 'delete':
          await this.deleteNode(change, streamId);
          break;
      }
    }

    // Save mindmap after all changes
    await this.saveMindmap();
  }

  /**
   * Create a new node
   */
  private async createNode(
    change: MindmapChange,
    streamId: string
  ): Promise<void> {
    if (!this.mindmapContext) {
      return;
    }

    const newNode: MindMapNode = {
      id: change.nodeId,
      text: change.text ?? 'New Node',
      notes: change.notes,
      sources: change.sources,
      children: [],
    };

    // Add to parent or root
    if (change.parentId) {
      const parent = this.findNodeById(
        this.mindmapContext.mindMapData.nodes ?? [],
        change.parentId
      );
      if (parent) {
        parent.children ??= [];
        parent.children.push(newNode);
      }
    } else {
      if (!this.mindmapContext.mindMapData.nodes) {
        this.mindmapContext.mindMapData.nodes = [];
      }
      this.mindmapContext.mindMapData.nodes.push(newNode);
    }

    // Broadcast node created
    this.broadcastUpdate(streamId, {
      type: SSEEventType.MINDMAP_NODE_CREATED,
      node: newNode,
      parentId: change.parentId,
    });
  }

  /**
   * Update an existing node
   */
  private async updateNode(
    change: MindmapChange,
    streamId: string
  ): Promise<void> {
    if (!this.mindmapContext) {
      return;
    }

    const node = this.findNodeById(
      this.mindmapContext.mindMapData.nodes ?? [],
      change.nodeId
    );

    if (node) {
      if (change.text !== undefined) {
        node.text = change.text;
      }
      if (change.notes !== undefined) {
        node.notes = change.notes;
      }
      if (change.sources !== undefined) {
        node.sources = change.sources;
      }

      // Broadcast node updated
      this.broadcastUpdate(streamId, {
        type: SSEEventType.MINDMAP_NODE_UPDATED,
        node,
      });
    }
  }

  /**
   * Delete a node
   */
  private async deleteNode(
    change: MindmapChange,
    streamId: string
  ): Promise<void> {
    if (!this.mindmapContext) {
      return;
    }

    // Find and remove node
    const removeFromNodes = (nodes: MindMapNode[], nodeId: string): boolean => {
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === nodeId) {
          nodes.splice(i, 1);
          return true;
        }
        if (nodes[i].children) {
          if (removeFromNodes(nodes[i].children!, nodeId)) {
            return true;
          }
        }
      }
      return false;
    };

    if (
      removeFromNodes(
        this.mindmapContext.mindMapData.nodes ?? [],
        change.nodeId
      )
    ) {
      // Broadcast node deleted
      this.broadcastUpdate(streamId, {
        type: SSEEventType.MINDMAP_NODE_DELETED,
        nodeId: change.nodeId,
      });
    }
  }

  /**
   * Save mindmap to file
   */
  private async saveMindmap(): Promise<void> {
    if (!this.mindmapContext) {
      return;
    }

    const filePath = path.join(
      this.workspaceRoot,
      '.mindstrike',
      'mindmaps',
      `${this.mindmapContext.mindMapId}.json`
    );

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(
      filePath,
      JSON.stringify(this.mindmapContext.mindMapData, null, 2)
    );
  }

  /**
   * Broadcast update via SSE
   */
  private broadcastUpdate(
    streamId: string,
    data: Record<string, unknown>
  ): void {
    this.sseService.broadcast('unified-events', {
      ...data,
      streamId,
      timestamp: Date.now(),
    });
  }

  /**
   * Abort the current workflow
   */
  async abortWorkflow(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.logger.log('Workflow abort requested');
    }
  }

  /**
   * Get current workflow state
   */
  getWorkflowState(): IterativeWorkflowState | null {
    return this.workflowState;
  }

  /**
   * Clear workflow state
   */
  clearWorkflowState(): void {
    this.workflowState = null;
    this.abortController = null;
  }
}
