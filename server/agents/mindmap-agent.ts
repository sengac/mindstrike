import { BaseAgent, AgentConfig } from './base-agent.js';
import { MindMapData, MindMapNode } from '../../src/utils/mindMapData.js';
import { logger } from '../logger.js';
import { sseManager } from '../sse-manager.js';
import * as path from 'path';

const DEFAULT_MINDMAP_ROLE = `You are a specialized mindmap agent designed to work with knowledge structures, mind maps, and interconnected information. You excel at organizing, analyzing, and visualizing complex information hierarchies.`;

// Direct SSE broadcasting function
const broadcastTaskUpdate = (workflowId: string, data: any) => {
  const topic = `tasks-${workflowId}`;
  sseManager.broadcast(topic, {
    ...data,
    timestamp: Date.now()
  });
  logger.info('Broadcasted task update', { workflowId, topic, type: data.type });
};

export interface MindmapContext {
  mindMapId: string;
  mindMapData: MindMapData;
  selectedNodeId?: string;
  selectedNode?: MindMapNode;
}

export interface MindmapTask {
  id: string;
  type: 'create' | 'update' | 'delete' | 'analyze';
  description: string;
  priority: 'high' | 'medium' | 'low';
  status: 'todo' | 'in-progress' | 'completed' | 'failed';
  nodeId?: string;
  parentId?: string;
  details?: any;
  result?: any;
  error?: string;
}

export interface AgenticWorkflowState {
  originalQuery: string;
  tasks: MindmapTask[];
  currentTaskIndex: number;
  updatedMindmapData?: MindMapData;
  progressHistory: Array<{
    taskId: string;
    timestamp: Date;
    status: string;
    changes?: any;
  }>;
}

export class MindmapAgent extends BaseAgent {
  private currentMindmapContext: MindmapContext | null = null;
  private workflowState: AgenticWorkflowState | null = null;

  constructor(config: AgentConfig) {
    super(config);
  }

  getDefaultRole(): string {
    return DEFAULT_MINDMAP_ROLE;
  }

  createSystemPrompt(): string {
    const basePrompt = [
      this.createRoleDefinition(),
      '',
      this.createGoalSpecification(),
      '',
      this.createMindmapSpecificCapabilities(),
      '',
      this.createErrorHandling(),
      '',
      this.createOutputRequirements(),
      '',
      this.createStepByStepInstructions()
    ].join('\n');

    // Add mindmap context if available
    if (this.currentMindmapContext) {
      const contextPrompt = this.createMindmapContextPrompt();
      return [basePrompt, '', contextPrompt].join('\n');
    }

    return basePrompt;
  }

  async createSystemPromptWithContext(): Promise<string> {
    const remainingContext = await this.calculateRemainingContext();
    
    const basePrompt = [
      this.createRoleDefinition(),
      '',
      this.createGoalSpecification(),
      '',
      this.createMindmapSpecificCapabilities(),
      '',
      this.createErrorHandling(),
      '',
      this.createOutputRequirementsWithLimit(remainingContext),
      '',
      this.createStepByStepInstructions()
    ].join('\n');

    // Add mindmap context if available
    if (this.currentMindmapContext) {
      const contextPrompt = this.createMindmapContextPrompt(remainingContext);
      return [basePrompt, '', contextPrompt].join('\n');
    }

    return basePrompt;
  }

  private createErrorHandling(): string {
    return [
      "If unclear:",
      "- Return empty changes: {\"changes\": []}",
      "- Do not ask questions, just return JSON"
    ].join('\n');
  }

  private createRoleDefinition(): string {
    return this.config.customRole || DEFAULT_MINDMAP_ROLE;
  }

  private createGoalSpecification(): string {
    return `You modify mindmaps by creating, updating, or deleting nodes. Return ONLY valid JSON with changes array.`;
  }

  private createMindmapSpecificCapabilities(): string {
    return [
      "Your capabilities:",
      "- Create new nodes with text, notes, and sources",
      "- Update existing node content",
      "- Delete nodes when requested",
      "- Work with the full mindmap context provided",
      "- Sources are OPTIONAL - only include when you can provide specific, relevant sources",
      "- Source types: 'url' (web links), 'file' (local files), 'document' (PDFs/docs), 'reference' (citations)",
      "- Each source needs: id, name, directory (description/path), type",
      "- Examples of good sources: official documentation URLs, specific file paths, academic papers, tutorial links",
      "- Avoid generic or placeholder sources - better to have no sources than irrelevant ones",
      "",
      "MARKDOWN CAPABILITIES FOR NOTES:",
      "- Full markdown syntax supported (headers, lists, links, emphasis, etc.)",
      "- Code blocks with syntax highlighting: ```language\\ncode\\n```",
      "- Supported languages: javascript, typescript, python, java, css, html, json, yaml, bash, sql, c, cpp, go, rust, etc.",
      "- Math equations: $inline math$ or $$block math$$ (KaTeX rendering)",
      "- Mermaid diagrams: ```mermaid\\ndiagram code\\n``` with many types:",
      "  • flowchart TD/LR (process flows), sequenceDiagram (interactions)",
      "  • stateDiagram-v2 (state machines), classDiagram (UML classes)",
      "  • gantt (project timelines), pie (data charts), gitgraph (git flows)",
      "  • journey (user journeys), erDiagram (database schemas)",
      "- Tables, blockquotes, horizontal rules, and all standard markdown features"
    ].join('\n');
  }

  private createStepByStepInstructions(): string {
    return [
      "Process:",
      "1. Read the user's request",
      "2. Decide what nodes to create/update/delete", 
      "3. Return ONLY valid JSON with changes array"
    ].join('\n');
  }

  private createOutputRequirements(): string {
    return [
      "CRITICAL - Response format:",
      "Return ONLY valid JSON in this exact format:",
      "",
      "{",
      '  "changes": [',
      '    {"action": "create", "nodeId": "[[GENERATE_NODE_ID]]", "parentId": "parent-id", "text": "Node Title", "notes": "## Overview\\n\\nDetailed explanation with **bold** and *italic* text.\\n\\n- List item 1\\n- List item 2\\n\\n```javascript\\nconst example = \\"code\\";\\n```", "sources": []},',
      '    {"action": "create", "nodeId": "[[GENERATE_NODE_ID]]", "parentId": "parent-id", "text": "Process Flow", "notes": "## Workflow\\n\\n```mermaid\\nflowchart TD\\n    A[Start] --> B[Process]\\n    B --> C[End]\\n```\\n\\n## Sequence Example\\n\\n```mermaid\\nsequenceDiagram\\n    Alice->>Bob: Hello\\n    Bob-->>Alice: Hi!\\n```", "sources": []},',
      '    {"action": "create", "nodeId": "[[GENERATE_NODE_ID]]", "parentId": "parent-id", "text": "Math Concept", "notes": "Formula: $E = mc^2$\\n\\nBlock equation:\\n\\n$$\\\\int_0^\\\\infty e^{-x} dx = 1$$", "sources": [{"id": "[[GENERATE_SOURCE_ID]]", "name": "Physics Reference", "directory": "https://physics.example.com", "type": "url"}]}',
      '  ]',
      "}",
      "",
      "CRITICAL CONSTRAINTS:",
      "- Start immediately with { and end with }",
      "- No text before or after the JSON",
      "- Use 'create', 'update', or 'delete' for action",
      "- For new nodes, use nodeId: [[GENERATE_NODE_ID]]",
      "- Sources are OPTIONAL - use empty array [] if no relevant sources",
      "- When adding sources, use id: [[GENERATE_SOURCE_ID]]",
      "- Source types: 'url', 'file', 'document', 'reference'",
      "- Only include sources if they are specific and relevant to the node content",
      "- Use rich markdown in notes: headers, lists, code blocks, math equations, mermaid diagrams, emphasis",
      "- Mermaid diagrams: flowcharts, sequences, state, class, gantt, pie charts",
      "- Examples: ```mermaid\\nflowchart TD\\n    A --> B\\n``` or ```mermaid\\nsequenceDiagram\\n    A->>B: msg\\n```",
      "- CRITICAL: ALL newlines in JSON string values MUST be escaped as \\n",
      "- CRITICAL: ALL quotes in JSON string values MUST be escaped as \\\"",
      "- CRITICAL: ALL backslashes in JSON string values MUST be escaped as \\\\",
      "- CRITICAL: Use compact JSON formatting - no pretty printing or actual line breaks in the output",
      "- CRITICAL: Validate your JSON is syntactically correct before responding"
    ].join('\n');
  }

  private createOutputRequirementsWithLimit(maxCharacters: number): string {
    return [
      "CRITICAL - Response format:",
      "Return ONLY valid JSON in this exact format:",
      "",
      "{",
      '  "changes": [',
      '    {"action": "create", "nodeId": "[[GENERATE_NODE_ID]]", "parentId": "parent-id", "text": "Node Title", "notes": "Brief notes", "sources": []}',
      '  ]',
      "}",
      "",
      "CRITICAL CONSTRAINTS:",
      "- Start immediately with { and end with }",
      "- No text before or after the JSON",
      `- Keep entire response under ${maxCharacters} characters`,
      "- Use 'create', 'update', or 'delete' for action",
      "- For new nodes, use nodeId: [[GENERATE_NODE_ID]]",
      "- Sources are OPTIONAL - use empty array [] if no relevant sources",
      "- When adding sources, use id: [[GENERATE_SOURCE_ID]]",
      "- Source types: 'url', 'file', 'document', 'reference'",
      "- Due to character limit, prioritize node content over sources",
      "- Use markdown in notes but keep it concise due to character limits",
      "- Mermaid diagrams: flowcharts, sequences, state, class, gantt, pie charts",
      "- Examples: ```mermaid\\nflowchart TD\\n    A --> B\\n``` or ```mermaid\\nsequenceDiagram\\n    A->>B: msg\\n```",
      "- CRITICAL: ALL newlines in JSON string values MUST be escaped as \\n",
      "- CRITICAL: ALL quotes in JSON string values MUST be escaped as \\\"",
      "- CRITICAL: Use compact JSON formatting - no pretty printing or actual line breaks",
      "- CRITICAL: Validate your JSON is syntactically correct before responding"
    ].join('\n');
  }

  // Mindmap context management
  
  /**
   * Set the current mindmap context for the agent
   */
  async setMindmapContext(mindMapId: string, selectedNodeId?: string): Promise<void> {
    try {
      const mindMapData = await this.loadMindmapData(mindMapId);
      if (!mindMapData) {
        throw new Error(`Mindmap with ID ${mindMapId} not found`);
      }

      const selectedNode = selectedNodeId ? this.findNodeById(mindMapData.root, selectedNodeId) : undefined;

      this.currentMindmapContext = {
        mindMapId,
        mindMapData,
        selectedNodeId,
        selectedNode
      };

      // Update system prompt with new context
      this.systemPrompt = this.createSystemPrompt();
      
      // Update the system message in the current conversation
      const messages = this.store.getState().messages;
      const systemMessage = messages.find(msg => msg.role === 'system');
      if (systemMessage) {
        this.store.getState().updateMessage(systemMessage.id, {
          content: this.systemPrompt
        });
        logger.info('Updated system message with context', { 
          systemMessageLength: systemMessage.content.length,
          includesContext: systemMessage.content.includes('MINDMAP CONTEXT')
        });
      }

      logger.info('Mindmap context set:', { 
        mindMapId, 
        selectedNodeId, 
        hasSelectedNode: !!selectedNode,
        mindmapDataExists: !!mindMapData,
        rootNodeExists: !!mindMapData?.root,
        systemPromptLength: this.systemPrompt.length
      });
      
      // Log the actual context being sent to debug content issues
      if (this.currentMindmapContext) {
        const contextPrompt = this.createMindmapContextPrompt();
        logger.info('Actual mindmap context being sent to LLM:', {
          contextLength: contextPrompt.length,
          contextPreview: contextPrompt.substring(0, 500) + '...'
        });
      }
    } catch (error) {
      logger.error('Failed to set mindmap context:', error);
      throw error;
    }
  }

  /**
   * Load mindmap data from storage
   */
  private async loadMindmapData(mindMapId: string): Promise<MindMapData | null> {
    try {
      const fs = await import('fs/promises');
      const mindMapsPath = path.join(this.config.workspaceRoot, 'mindstrike-mindmaps.json');
      
      const data = await fs.readFile(mindMapsPath, 'utf-8');
      if (!data.trim()) {
        return null;
      }
      
      const mindMaps = JSON.parse(data);
      const mindMap = mindMaps.find((m: any) => m.id === mindMapId);
      
      return mindMap ? mindMap.mindmapData : null;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Find a node by ID in the mindmap tree
   */
  private findNodeById(node: MindMapNode, nodeId: string): MindMapNode | undefined {
    if (node.id === nodeId) {
      return node;
    }
    
    if (node.children) {
      for (const child of node.children) {
        const found = this.findNodeById(child, nodeId);
        if (found) return found;
      }
    }
    
    return undefined;
  }

  /**
   * Create mindmap context prompt
   */
  private createMindmapContextPrompt(maxCharacters?: number): string {
    if (!this.currentMindmapContext) {
      return '';
    }

    const { mindMapData, selectedNode } = this.currentMindmapContext;
    const mindmapStructure = this.serializeMindmapStructure(mindMapData.root);
    
    const contextParts = [
      "=== CURRENT MINDMAP CONTEXT ===",
      `Mindmap ID: ${this.currentMindmapContext.mindMapId}`,
      `Layout: ${mindMapData.root.layout}`,
      "",
      "MINDMAP STRUCTURE:",
      mindmapStructure
    ];

    if (selectedNode) {
      contextParts.push(
        "",
        "=== SELECTED NODE ===",
        `Selected Node ID: ${selectedNode.id}`,
        `Selected Node Text: "${selectedNode.text}"`,
        selectedNode.notes ? `Selected Node Notes: "${selectedNode.notes}"` : "Selected Node Notes: None",
        `Selected Node Children: ${selectedNode.children ? selectedNode.children.length : 0}`,
        selectedNode.sources && selectedNode.sources.length > 0 ? 
          `Selected Node Sources: ${selectedNode.sources.length} source(s) - ${selectedNode.sources.map(s => s.title || s.url || 'Untitled').join(', ')}` : 
          "Selected Node Sources: None",
        selectedNode.chatId ? `Selected Node Chat ID: ${selectedNode.chatId}` : "Selected Node Chat ID: None"
      );
    }

    const characterLimit = maxCharacters || 2000;
    contextParts.push(
      "",
      "=== INSTRUCTIONS ===",
      "- Return ONLY valid JSON, no other text",
      `- Keep entire response under ${characterLimit} characters to fit remaining context`,
      "- Format: {\"changes\": [{\"action\": \"create\", \"nodeId\": \"[[GENERATE_NODE_ID]]\", \"parentId\": \"parent-id\", \"text\": \"Title\", \"notes\": \"Rich **markdown** notes with\\n\\n- Lists\\n- Code blocks\\n- Math: $x^2$\\n\\n```mermaid\\nsequenceDiagram\\n    User->>API: Request\\n    API-->>User: Response\\n```\", \"sources\": []}]}",
      "- IMPORTANT: The above example shows ESCAPED newlines (\\n) - your actual JSON must have these escapes, not real line breaks",
      "- Example with source: {\"sources\": [{\"id\": \"[[GENERATE_SOURCE_ID]]\", \"name\": \"React Docs\", \"directory\": \"https://react.dev/learn\", \"type\": \"url\"}]}",
      "- Source guidelines: Only include if you can provide specific, relevant sources like documentation URLs, file paths, or citations",
      "- Markdown features: headers (## Title), lists (- item), code (```lang), math ($formula$), mermaid (```mermaid), emphasis (**bold**, *italic*)"
    );

    return contextParts.join('\n');
  }

  /**
   * Serialize mindmap structure for context
   */
  private serializeMindmapStructure(node: MindMapNode, level: number = 0): string {
    const indent = '  '.repeat(level);
    let result = `${indent}- [${node.id}] "${node.text}"`;
    
    if (node.notes) {
      result += `\n${indent}  Notes: "${node.notes.length > 200 ? node.notes.substring(0, 200) + '...' : node.notes}"`;
    }
    
    if (node.sources && node.sources.length > 0) {
      result += `\n${indent}  Sources: ${node.sources.length} source(s)`;
      node.sources.forEach((source, idx) => {
        if (idx < 3) { // Show first 3 sources
          result += `\n${indent}    - ${source.title || source.url || 'Untitled source'}`;
        }
      });
      if (node.sources.length > 3) {
        result += `\n${indent}    - ... and ${node.sources.length - 3} more`;
      }
    }
    
    if (node.chatId) {
      result += `\n${indent}  Chat ID: ${node.chatId}`;
    }
    
    if (node.children && node.children.length > 0) {
      result += '\n' + node.children.map(child => 
        this.serializeMindmapStructure(child, level + 1)
      ).join('\n');
    }
    
    return result;
  }

  /**
   * Get current mindmap context
   */
  getCurrentMindmapContext(): MindmapContext | null {
    return this.currentMindmapContext;
  }

  /**
   * Clear mindmap context
   */
  clearMindmapContext(): void {
    this.currentMindmapContext = null;
    this.systemPrompt = this.createSystemPrompt();
    
    // Update the system message in the current conversation
    const messages = this.store.getState().messages;
    const systemMessage = messages.find(msg => msg.role === 'system');
    if (systemMessage) {
      this.store.getState().updateMessage(systemMessage.id, {
        content: this.systemPrompt
      });
    }
  }

  /**
   * Override processMessage to use dynamic context-aware system prompt
   */
  async processMessage(userMessage: string, images?: any[], notes?: any[], onUpdate?: (message: any) => void): Promise<any> {
    // Update system prompt with current context limits before processing
    try {
      const dynamicSystemPrompt = await this.createSystemPromptWithContext();
      
      // Update the system message in the conversation
      const messages = this.store.getState().messages;
      const systemMessage = messages.find(msg => msg.role === 'system');
      if (systemMessage) {
        this.store.getState().updateMessage(systemMessage.id, {
          content: dynamicSystemPrompt
        });
        logger.info('Updated existing system message with context', { 
          systemMessageLength: dynamicSystemPrompt.length,
          includesContext: dynamicSystemPrompt.includes('MINDMAP CONTEXT')
        });
      } else {
        // Add system message if none exists
        this.store.getState().addMessage({
          role: 'system',
          content: dynamicSystemPrompt,
          status: 'completed'
        });
        logger.info('Added new system message with context', { 
          systemMessageLength: dynamicSystemPrompt.length,
          includesContext: dynamicSystemPrompt.includes('MINDMAP CONTEXT')
        });
      }
      
      // Update the systemPrompt property
      this.systemPrompt = dynamicSystemPrompt;
      
    } catch (error) {
      logger.error('Failed to update system prompt with context limits:', error);
      // Fall back to regular system prompt
    }
    
    // Call the parent's processMessage method first
    const response = await super.processMessage(userMessage, images, notes, onUpdate);
    
    // Post-process the response content to extract clean JSON for mindmap changes
    const cleanedResponse = this.cleanMindmapResponse(response.content);
    
    return {
      ...response,
      content: cleanedResponse
    };
  }

  /**
   * Process message using agentic workflow with task decomposition and iterative updates
   */
  async processMessageAgentic(userMessage: string, images?: any[], notes?: any[], onUpdate?: (message: any) => void, workflowId?: string): Promise<any> {
    logger.info('Starting agentic workflow for mindmap modification', { userMessage, workflowId });

    // Generate workflow ID if not provided
    const finalWorkflowId = workflowId || `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;



    try {
      // Broadcast workflow start
      broadcastTaskUpdate(finalWorkflowId, {
        type: 'workflow_started',
        workflowId: finalWorkflowId,
        originalQuery: userMessage,
        contextId: this.currentMindmapContext?.mindMapId
      });

      // Step 1: Task Decomposition
      const tasks = await this.decomposeUserQuery(userMessage);
      
      // Initialize workflow state
      this.workflowState = {
        originalQuery: userMessage,
        tasks,
        currentTaskIndex: 0,
        updatedMindmapData: this.currentMindmapContext ? 
          JSON.parse(JSON.stringify(this.currentMindmapContext.mindMapData)) : undefined,
        progressHistory: []
      };

      // Broadcast tasks planned
      broadcastTaskUpdate(finalWorkflowId, {
        type: 'tasks_planned',
        workflowId: finalWorkflowId,
        tasks: tasks.map(t => ({
          id: t.id,
          type: t.type,
          description: t.description,
          priority: t.priority,
          status: t.status,
          createdAt: new Date()
        }))
      });

      // Step 2: Send initial progress update with TODO list
      if (onUpdate) {
        onUpdate({
          type: 'progress_update',
          data: {
            message: 'Task decomposition complete. Starting execution...',
            tasks: tasks.map(t => ({
              id: t.id,
              description: t.description,
              status: t.status,
              priority: t.priority
            }))
          }
        });
      }

      // Step 3: Execute tasks iteratively
      const allChanges: any[] = [];
      
      for (let i = 0; i < tasks.length; i++) {
        this.workflowState.currentTaskIndex = i;
        const task = tasks[i];
        
        // Update task status to in-progress
        task.status = 'in-progress';
        
        // Broadcast task progress
        broadcastTaskUpdate(finalWorkflowId, {
          type: 'task_progress',
          workflowId: finalWorkflowId,
          taskId: task.id,
          description: task.description,
          status: 'in-progress',
          currentIndex: i,
          totalTasks: tasks.length
        });

        // Send progress update
        if (onUpdate) {
          onUpdate({
            type: 'task_progress',
            data: {
              taskId: task.id,
              description: task.description,
              status: 'in-progress',
              currentIndex: i,
              totalTasks: tasks.length
            }
          });
        }

        try {
          // Execute individual task
          const taskResult = await this.executeIndividualTask(task);
          
          if (taskResult.changes && taskResult.changes.length > 0) {
            allChanges.push(...taskResult.changes);
            
            // Update the mindmap data with changes for next iteration
            if (this.workflowState.updatedMindmapData) {
              this.applyChangesToMindmapData(this.workflowState.updatedMindmapData, taskResult.changes);
            }
          }

          // Mark task as completed
          task.status = 'completed';
          task.result = taskResult;
          
          // Record progress
          this.workflowState.progressHistory.push({
            taskId: task.id,
            timestamp: new Date(),
            status: 'completed',
            changes: taskResult.changes
          });

          // Broadcast task completion
          broadcastTaskUpdate(finalWorkflowId, {
            type: 'task_completed',
            workflowId: finalWorkflowId,
            taskId: task.id,
            description: task.description,
            status: 'completed',
            changes: taskResult.changes,
            result: taskResult
          });

          // Send completion update
          if (onUpdate) {
            onUpdate({
              type: 'task_completed',
              data: {
                taskId: task.id,
                description: task.description,
                status: 'completed',
                changes: taskResult.changes
              }
            });
          }

        } catch (error) {
          logger.error('Task execution failed:', { taskId: task.id, error });
          
          // Mark task as failed
          task.status = 'failed';
          task.error = error instanceof Error ? error.message : String(error);
          
          // Record failure
          this.workflowState.progressHistory.push({
            taskId: task.id,
            timestamp: new Date(),
            status: 'failed'
          });

          // Broadcast task failure
          broadcastTaskUpdate(finalWorkflowId, {
            type: 'task_failed',
            workflowId: finalWorkflowId,
            taskId: task.id,
            description: task.description,
            status: 'failed',
            error: task.error
          });

          // Send failure update
          if (onUpdate) {
            onUpdate({
              type: 'task_failed',
              data: {
                taskId: task.id,
                description: task.description,
                status: 'failed',
                error: task.error
              }
            });
          }
        }
      }

      // Step 4: Return final result
      const finalResult = {
        content: JSON.stringify({
          changes: allChanges,
          workflow: {
            id: finalWorkflowId,
            originalQuery: userMessage,
            tasksCompleted: tasks.filter(t => t.status === 'completed').length,
            tasksFailed: tasks.filter(t => t.status === 'failed').length,
            totalTasks: tasks.length
          }
        }),
        id: this.generateId(),
        role: 'assistant' as const,
        timestamp: new Date()
      };

      // Broadcast workflow completion
      broadcastTaskUpdate(finalWorkflowId, {
        type: 'workflow_completed',
        workflowId: finalWorkflowId,
        message: 'Agentic workflow completed successfully',
        tasksCompleted: tasks.filter(t => t.status === 'completed').length,
        tasksFailed: tasks.filter(t => t.status === 'failed').length,
        totalTasks: tasks.length,
        totalChanges: allChanges.length
      });

      // Send final completion update
      if (onUpdate) {
        onUpdate({
          type: 'workflow_completed',
          data: {
            message: 'Agentic workflow completed successfully',
            tasksCompleted: tasks.filter(t => t.status === 'completed').length,
            tasksFailed: tasks.filter(t => t.status === 'failed').length,
            totalTasks: tasks.length,
            totalChanges: allChanges.length
          }
        });
      }

      return finalResult;

    } catch (error) {
      logger.error('Agentic workflow failed:', error);
      
      // Broadcast workflow failure
      broadcastTaskUpdate(finalWorkflowId, {
        type: 'workflow_failed',
        workflowId: finalWorkflowId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      if (onUpdate) {
        onUpdate({
          type: 'workflow_error',
          data: {
            message: 'Agentic workflow encountered an error',
            error: error instanceof Error ? error.message : String(error)
          }
        });
      }

      // Fall back to regular processing
      return this.processMessage(userMessage, images, notes, onUpdate);
    }
  }

  // Agentic Workflow Methods

  /**
   * Decompose user query into individual mindmap tasks using ReAct methodology
   */
  public async decomposeUserQuery(userMessage: string): Promise<MindmapTask[]> {
    logger.info('Decomposing user query into tasks', { userMessage });

    const decompositionPrompt = `You are a task decomposition expert for mindmap operations. Your job is to break down a user's mindmap request into specific, actionable tasks.

CURRENT MINDMAP CONTEXT:
${this.currentMindmapContext ? this.createMindmapContextPrompt(1000) : 'No mindmap context available'}

USER REQUEST: "${userMessage}"

Break this down into individual tasks. Each task should be one of these types:
- "create": Add new nodes, topics, or subtopics
- "update": Modify existing node content, notes, or structure  
- "delete": Remove nodes or content
- "analyze": Analyze content to determine what to add/change

For each task, provide:
1. A clear, specific description
2. The task type
3. Priority level (high/medium/low)
4. Any relevant details (parent node, content focus, etc.)

Return ONLY a JSON array of tasks in this format:
[
  {
    "type": "create",
    "description": "Add main topic node for machine learning concepts",
    "priority": "high",
    "parentId": "root",
    "details": {
      "content": "machine learning",
      "focus": "main topic creation"
    }
  },
  {
    "type": "create", 
    "description": "Add subtopic for supervised learning under machine learning",
    "priority": "medium",
    "parentId": "machine-learning-node",
    "details": {
      "content": "supervised learning",
      "focus": "subtopic with examples"
    }
  }
]

IMPORTANT: Return ONLY the JSON array, no other text.`;

    try {
      // Use a temporary conversation for task decomposition  
      const decompositionResponse = await this.processMessage(decompositionPrompt);
      const cleanedResponse = this.cleanJsonResponse(decompositionResponse.content);
      
      logger.info('Raw decomposition response:', { response: cleanedResponse });

      const tasksArray = JSON.parse(cleanedResponse);
      
      if (!Array.isArray(tasksArray)) {
        throw new Error('Decomposition did not return an array');
      }

      // Convert to MindmapTask objects with generated IDs
      const tasks: MindmapTask[] = tasksArray.map((task, index) => ({
        id: `task-${Date.now()}-${index}`,
        type: task.type,
        description: task.description,
        priority: task.priority || 'medium',
        status: 'todo' as const,
        parentId: task.parentId,
        details: task.details || {},
        nodeId: task.nodeId
      }));

      logger.info('Decomposed user query into tasks', { 
        originalQuery: userMessage,
        taskCount: tasks.length,
        tasks: tasks.map(t => ({ id: t.id, type: t.type, description: t.description }))
      });

      return tasks;

    } catch (error) {
      logger.error('Failed to decompose user query:', error);
      
      // Fallback: create a single general task
      return [{
        id: `task-${Date.now()}-0`,
        type: 'create',
        description: `Process user request: ${userMessage}`,
        priority: 'high',
        status: 'todo',
        details: { originalQuery: userMessage }
      }];
    }
  }

  /**
   * Execute an individual task
   */
  public async executeIndividualTask(task: MindmapTask): Promise<{ changes: any[] }> {
    logger.info('Executing individual task', { taskId: task.id, type: task.type, description: task.description });

    // Create a focused prompt for this specific task
    const taskPrompt = this.createTaskSpecificPrompt(task);
    
    try {
      // Execute the task using the focused prompt
      const response = await this.processMessage(taskPrompt);
      const cleanedResponse = this.cleanMindmapResponse(response.content);
      
      // Parse the response
      const result = JSON.parse(cleanedResponse);
      
      if (!result.changes || !Array.isArray(result.changes)) {
        logger.warn('Task response missing changes array', { taskId: task.id, result });
        return { changes: [] };
      }

      logger.info('Task executed successfully', { 
        taskId: task.id, 
        changesCount: result.changes.length 
      });

      return { changes: result.changes };

    } catch (error) {
      logger.error('Task execution failed', { taskId: task.id, error });
      throw error;
    }
  }

  /**
   * Create task-specific prompt for focused execution
   */
  private createTaskSpecificPrompt(task: MindmapTask): string {
    const contextInfo = this.workflowState?.updatedMindmapData ? 
      this.serializeMindmapStructure(this.workflowState.updatedMindmapData.root) :
      (this.currentMindmapContext ? this.createMindmapContextPrompt(800) : 'No mindmap context');

    const basePrompt = `You are executing a specific mindmap task. Focus ONLY on this task, do not add extra content.

CURRENT MINDMAP STATE:
${contextInfo}

TASK TO EXECUTE:
- Type: ${task.type}
- Description: ${task.description}
- Priority: ${task.priority}
${task.parentId ? `- Parent Node ID: ${task.parentId}` : ''}
${task.nodeId ? `- Target Node ID: ${task.nodeId}` : ''}

TASK DETAILS:
${JSON.stringify(task.details, null, 2)}

Execute ONLY this specific task. Return valid JSON with changes array.

For notes content, you can use rich markdown including:
- Headers: ## Title
- Lists: - item
- Code blocks: \`\`\`javascript\\ncode\\n\`\`\`
- Math: $formula$ or $$block formula$$
- Mermaid diagrams: \`\`\`mermaid\\nflowchart TD\\n    A --> B\\n\`\`\`

CRITICAL CONSTRAINTS:
- Return ONLY valid JSON starting with { and ending with }
- Focus on the specific task described above
- Use nodeId: [[GENERATE_NODE_ID]] for new nodes
- Use id: [[GENERATE_SOURCE_ID]] for new sources  
- Escape newlines in JSON strings as \\n
- Keep content focused and relevant to the task`;

    return basePrompt;
  }

  /**
   * Apply changes to mindmap data for iterative updates
   */
  private applyChangesToMindmapData(mindmapData: MindMapData, changes: any[]): void {
    for (const change of changes) {
      try {
        switch (change.action) {
          case 'create':
            this.applyCreateChange(mindmapData, change);
            break;
          case 'update':
            this.applyUpdateChange(mindmapData, change);
            break;
          case 'delete':
            this.applyDeleteChange(mindmapData, change);
            break;
        }
      } catch (error) {
        logger.error('Failed to apply change to mindmap data', { change, error });
      }
    }
  }

  /**
   * Apply create change to mindmap data
   */
  private applyCreateChange(mindmapData: MindMapData, change: any): void {
    const parentNode = change.parentId === 'root' ? mindmapData.root : 
      this.findNodeById(mindmapData.root, change.parentId);
    
    if (!parentNode) {
      logger.warn('Parent node not found for create change', { parentId: change.parentId });
      return;
    }

    const newNode: MindMapNode = {
      id: change.nodeId,
      text: change.text,
      notes: change.notes || null,
      sources: change.sources || [],
      children: []
    };

    if (!parentNode.children) {
      parentNode.children = [];
    }
    
    parentNode.children.push(newNode);
    logger.info('Applied create change', { nodeId: change.nodeId, parentId: change.parentId });
  }

  /**
   * Apply update change to mindmap data
   */
  private applyUpdateChange(mindmapData: MindMapData, change: any): void {
    const targetNode = this.findNodeById(mindmapData.root, change.nodeId);
    
    if (!targetNode) {
      logger.warn('Target node not found for update change', { nodeId: change.nodeId });
      return;
    }

    if (change.text !== undefined) targetNode.text = change.text;
    if (change.notes !== undefined) targetNode.notes = change.notes;
    if (change.sources !== undefined) targetNode.sources = change.sources;
    
    logger.info('Applied update change', { nodeId: change.nodeId });
  }

  /**
   * Apply delete change to mindmap data
   */
  private applyDeleteChange(mindmapData: MindMapData, change: any): void {
    // Find parent and remove the node
    const removeFromParent = (node: MindMapNode): boolean => {
      if (node.children) {
        const index = node.children.findIndex(child => child.id === change.nodeId);
        if (index >= 0) {
          node.children.splice(index, 1);
          logger.info('Applied delete change', { nodeId: change.nodeId });
          return true;
        }
        
        // Recursively search children
        for (const child of node.children) {
          if (removeFromParent(child)) return true;
        }
      }
      return false;
    };

    if (!removeFromParent(mindmapData.root)) {
      logger.warn('Node to delete not found', { nodeId: change.nodeId });
    }
  }

  /**
   * Clean JSON response from LLM
   */
  private cleanJsonResponse(response: string): string {
    let cleaned = response.trim();
    
    // Remove markdown code block markers
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    // Extract JSON if there's text before/after
    const jsonStart = cleaned.indexOf('[');
    const jsonEnd = cleaned.lastIndexOf(']');
    
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    }
    
    return cleaned.trim();
  }

  // Mindmap-specific helper methods
  
  /**
   * Clean and extract JSON from mindmap response
   */
  private cleanMindmapResponse(responseContent: string): string {
    if (!responseContent) return responseContent;
    
    let cleanedContent = responseContent;
    
    // Handle local LLM responses - extract first JSON object if multiple responses
    if (this.config.llmConfig.type === 'local') {
      const originalContent = cleanedContent;
      
      // First, remove content after chat tokens
      if (cleanedContent.includes('<|im_start|>')) {
        const firstJsonEnd = cleanedContent.indexOf('<|im_start|>');
        if (firstJsonEnd > 0) {
          cleanedContent = cleanedContent.substring(0, firstJsonEnd).trim();
        }
      }
      
      // Extract the first complete JSON object
      const jsonStartIndex = cleanedContent.indexOf('{');
      if (jsonStartIndex >= 0) {
        let braceCount = 0;
        let jsonEndIndex = -1;
        
        for (let i = jsonStartIndex; i < cleanedContent.length; i++) {
          if (cleanedContent[i] === '{') braceCount++;
          else if (cleanedContent[i] === '}') braceCount--;
          
          if (braceCount === 0) {
            jsonEndIndex = i;
            break;
          }
        }
        
        if (jsonEndIndex > jsonStartIndex) {
          cleanedContent = cleanedContent.substring(jsonStartIndex, jsonEndIndex + 1);
          // Removed verbose logging
        }
      }
    }
    
    // Handle external LLM responses - remove MINDMAP_CHANGES prefix
    if (cleanedContent.includes('MINDMAP_CHANGES:')) {
      const mindmapChangesIndex = cleanedContent.indexOf('MINDMAP_CHANGES:');
      cleanedContent = cleanedContent.substring(mindmapChangesIndex + 'MINDMAP_CHANGES:'.length).trim();
      logger.info('Removed MINDMAP_CHANGES prefix from external LLM response');
    }
    
    // Fix malformed JSON by escaping control characters
    cleanedContent = this.fixMalformedJson(cleanedContent);
    
    // Replace ID placeholders with actual unique IDs
    cleanedContent = this.replacePlaceholderIds(cleanedContent);
    
    // Validate that we have valid JSON
    try {
      const parsed = JSON.parse(cleanedContent);
      if (parsed.changes && Array.isArray(parsed.changes)) {
        // Removed verbose logging
        return cleanedContent;
      } else {
        logger.warn('Cleaned response is not valid mindmap format', { 
          parsedKeys: Object.keys(parsed) 
        });
        return cleanedContent;
      }
    } catch (error) {
      logger.error('Failed to parse cleaned mindmap response as JSON', { 
        error: error instanceof Error ? error.message : String(error),
        content: cleanedContent.substring(0, 200) + '...'
      });
      return cleanedContent;
    }
  }

  /**
   * Fix malformed JSON by properly escaping control characters
   */
  private fixMalformedJson(jsonString: string): string {
    try {
      // First try to parse as-is
      JSON.parse(jsonString);
      return jsonString; // Already valid
    } catch (error) {
      logger.info('Attempting to fix malformed JSON by escaping control characters');
      
      // Parse the JSON structure manually to fix string values
      let fixed = jsonString;
      let inString = false;
      let escaped = false;
      let result = '';
      
      for (let i = 0; i < fixed.length; i++) {
        const char = fixed[i];
        const prevChar = i > 0 ? fixed[i - 1] : '';
        
        if (!inString && char === '"') {
          inString = true;
          result += char;
        } else if (inString && char === '"' && !escaped) {
          inString = false;
          result += char;
        } else if (inString) {
          // Inside a string, escape control characters
          if (char === '\n' && !escaped) {
            result += '\\n';
          } else if (char === '\r' && !escaped) {
            result += '\\r';
          } else if (char === '\t' && !escaped) {
            result += '\\t';
          } else if (char === '\\' && !escaped) {
            result += '\\\\';
          } else {
            result += char;
          }
        } else {
          result += char;
        }
        
        escaped = (char === '\\' && !escaped);
      }
      
      try {
        JSON.parse(result);
        logger.info('Successfully fixed malformed JSON');
        return result;
      } catch (fixError) {
        logger.warn('Failed to fix malformed JSON, returning original');
        return jsonString;
      }
    }
  }
  
  /**
   * Replace placeholder IDs with actual unique IDs
   */
  private replacePlaceholderIds(content: string): string {
    let result = content;
    const timestamp = Date.now();
    let counter = 0;
    
    // Replace node ID placeholders
    const nodeIdRegex = /\[\[GENERATE_NODE_ID\]\]/g;
    const nodeMatches = content.match(nodeIdRegex);
    if (nodeMatches) {
      const generatedIds: string[] = [];
      result = result.replace(nodeIdRegex, () => {
        const newId = `node-${timestamp}-${counter++}`;
        generatedIds.push(newId);
        return newId;
      });
      logger.info('Replaced node ID placeholders', { 
        count: nodeMatches.length,
        generatedIds
      });
    }
    
    // Reset counter for source IDs
    counter = 0;
    
    // Replace source ID placeholders
    const sourceIdRegex = /\[\[GENERATE_SOURCE_ID\]\]/g;
    const sourceMatches = content.match(sourceIdRegex);
    if (sourceMatches) {
      const generatedIds: string[] = [];
      result = result.replace(sourceIdRegex, () => {
        const newId = `src-${timestamp}-${counter++}`;
        generatedIds.push(newId);
        return newId;
      });
      logger.info('Replaced source ID placeholders', { 
        count: sourceMatches.length,
        generatedIds
      });
    }
    
    return result;
  }
  
  /**
   * Analyze text content and suggest a mindmap structure
   */
  analyzeMindmapStructure(content: string): {
    mainConcepts: string[];
    suggestedHierarchy: any;
    connections: Array<{from: string, to: string, relationship: string}>;
  } {
    // This is a placeholder for mindmap-specific analysis logic
    // You can implement more sophisticated content analysis here
    return {
      mainConcepts: [],
      suggestedHierarchy: {},
      connections: []
    };
  }

  /**
   * Create a new node with proper structure including notes and sources
   */
  createNodeStructure(text: string, notes?: string, sources?: any[], parentId?: string): Partial<MindMapNode> {
    return {
      id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text,
      notes: notes || null,
      sources: sources || [],
      children: []
    };
  }

  /**
   * Extract relevant information from node for context
   */
  extractNodeContext(node: MindMapNode): string {
    let context = `Node: "${node.text}"`;
    
    if (node.notes) {
      context += `\nNotes: ${node.notes}`;
    }
    
    if (node.sources && node.sources.length > 0) {
      context += `\nSources: ${node.sources.map(s => s.title || s.url || 'Untitled').join(', ')}`;
    }
    
    if (node.children && node.children.length > 0) {
      context += `\nChild nodes: ${node.children.map(c => c.text).join(', ')}`;
    }
    
    return context;
  }

  /**
   * Get all nodes in the mindmap as a flat array
   */
  getAllNodes(node?: MindMapNode): MindMapNode[] {
    if (!node) {
      node = this.currentMindmapContext?.mindMapData.root;
    }
    if (!node) return [];
    
    const nodes = [node];
    if (node.children) {
      for (const child of node.children) {
        nodes.push(...this.getAllNodes(child));
      }
    }
    return nodes;
  }

  /**
   * Search for nodes containing specific text in title, notes, or sources
   */
  searchNodes(query: string, searchInNotes: boolean = true, searchInSources: boolean = true): MindMapNode[] {
    if (!this.currentMindmapContext) return [];
    
    const allNodes = this.getAllNodes();
    const lowerQuery = query.toLowerCase();
    
    return allNodes.filter(node => {
      // Search in text
      if (node.text.toLowerCase().includes(lowerQuery)) return true;
      
      // Search in notes
      if (searchInNotes && node.notes && node.notes.toLowerCase().includes(lowerQuery)) return true;
      
      // Search in sources
      if (searchInSources && node.sources) {
        return node.sources.some(source => 
          (source.title && source.title.toLowerCase().includes(lowerQuery)) ||
          (source.url && source.url.toLowerCase().includes(lowerQuery)) ||
          (source.text && source.text.toLowerCase().includes(lowerQuery))
        );
      }
      
      return false;
    });
  }
}
