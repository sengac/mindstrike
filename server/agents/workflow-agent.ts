import type {
  AgentConfig,
  ConversationMessage,
  ImageAttachment,
  NotesAttachment,
} from './base-agent.js';
import { BaseAgent } from './base-agent.js';
import type { BaseMessage } from '@langchain/core/messages';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { logger } from '../logger.js';
import { sseManager } from '../sse-manager.js';
import { serverDebugLogger } from '../debug-logger.js';
import { SSEEventType } from '../../src/types.js';

// Define the workflow state using LangGraph Annotations
const WorkflowState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (existing, update) => existing.concat(update),
    default: () => [],
  }),
  reasoning: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  plan: Annotation<string[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  currentTask: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  taskResults: Annotation<Record<string, unknown>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
  workflowId: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  iteration: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
  maxIterations: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 5,
  }),
});

type WorkflowStateType = typeof WorkflowState.State;

const DEFAULT_WORKFLOW_ROLE = `You are a sophisticated workflow agent that decomposes complex user queries using the ReAct methodology (Reasoning, Acting, Observing). Your role is to:

1. **Reason**: Carefully analyze the user's request and break it down into logical, actionable steps
2. **Plan**: Create a clear sequence of tasks that will accomplish the user's goal
3. **Act**: Execute each task systematically using available tools
4. **Observe**: Analyze results and adjust your approach as needed

You have access to a comprehensive set of tools for file operations, web searches, code analysis, and more. Always provide clear reasoning for your decisions and keep the user informed of your progress.`;

export class WorkflowAgent extends BaseAgent {
  private readonly workflowGraph: {
    invoke: (state: WorkflowStateType) => Promise<WorkflowStateType>;
  };
  private chatTopic?: string;

  constructor(config: AgentConfig, agentId?: string) {
    super(config, agentId);
    this.workflowGraph = this.createWorkflowGraph();
  }

  setChatTopic(chatTopic: string) {
    this.chatTopic = chatTopic;
  }

  // OPTIMIZATION HELPER: Try to execute simple tool calls directly
  private tryDirectToolExecution(
    task: string
  ): { action: string; toolCall: string } | null {
    const taskLower = task.toLowerCase();

    // Pattern matching for common browser actions
    if (taskLower.includes('navigate') && taskLower.includes('google.com')) {
      return {
        action: 'navigate to Google',
        toolCall:
          'Use mcp_playwright_browser_navigate to open https://google.com',
      };
    }

    if (taskLower.includes('search') && taskLower.includes('roland quast')) {
      return {
        action: 'search for Roland Quast',
        toolCall:
          'Use mcp_playwright_browser_type to enter "roland quast" in the search field',
      };
    }

    if (taskLower.includes('click') && taskLower.includes('search')) {
      return {
        action: 'click search',
        toolCall: 'Use mcp_playwright_browser_press_key to press Enter',
      };
    }

    // Add more patterns as needed for common actions
    return null;
  }

  private broadcastWorkflowEvent(event: Record<string, unknown>) {
    // Always broadcast to the workflow topic
    sseManager.broadcast('unified-events', event);

    // Also broadcast to the chat topic if available
    if (this.chatTopic) {
      // Chat topic also uses unified events now
      sseManager.broadcast('unified-events', {
        ...event,
        chatTopic: this.chatTopic,
      });
    }
  }

  // Override processMessage to use workflow instead of AgentExecutor
  async processMessage(
    threadId: string,
    userMessage: string,
    options?: {
      images?: ImageAttachment[];
      notes?: NotesAttachment[];
      onUpdate?: (message: ConversationMessage) => void;
      userMessageId?: string;
      includePriorConversation?: boolean;
    }
  ): Promise<ConversationMessage> {
    // Extract options with defaults (workflow agent defaults to no prior conversation)
    const { images, notes, onUpdate, userMessageId } = options || {};
    const workflowId = this.generateId();
    try {
      // Create initial state
      const initialState: WorkflowStateType = {
        messages: [new HumanMessage(userMessage)],
        reasoning: '',
        plan: [],
        currentTask: '',
        taskResults: {},
        workflowId,
        iteration: 0,
        maxIterations: 10,
      };

      // Run the workflow
      const result = await this.workflowGraph.invoke(initialState);

      // Initialize conversation manager and load existing data
      await this.conversationManager.load();

      // Ensure thread exists, create if needed
      let thread = this.conversationManager.getThread(threadId);
      if (!thread) {
        thread = await this.conversationManager.createThread();
        threadId = thread.id;
      }

      // Add user message to conversation
      const userMsg: ConversationMessage = {
        id: userMessageId || this.generateId(),
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
        images: images || [],
        notes: notes || [],
      };
      this.conversationManager.addMessage(threadId, userMsg);

      // Create assistant response from workflow result
      const content =
        result.messages[result.messages.length - 1]?.content ||
        'Workflow completed';

      const conversationMessage: ConversationMessage = {
        id: this.generateId(),
        role: 'assistant',
        content: content.toString(),
        timestamp: new Date(),
        model: this.config.llmConfig.displayName || this.config.llmConfig.model,
      };

      // Add assistant message to conversation
      this.conversationManager.addMessage(threadId, conversationMessage);

      if (onUpdate) {
        onUpdate(conversationMessage);
      }

      return conversationMessage;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[WorkflowAgent] Error in workflow: ${errorMessage}`, {
        error,
      });

      // Broadcast workflow failure
      this.broadcastWorkflowEvent({
        type: SSEEventType.WORKFLOW_FAILED,
        workflowId,
        error: errorMessage,
      });

      // Create error message
      const conversationMessage: ConversationMessage = {
        id: this.generateId(),
        role: 'assistant',
        content: `I encountered an error while processing your request: ${errorMessage}`,
        timestamp: new Date(),
        model: this.config.llmConfig.displayName || this.config.llmConfig.model,
      };

      // Add error message to conversation if thread exists
      if (threadId) {
        this.conversationManager.addMessage(threadId, conversationMessage);
      }

      if (onUpdate) {
        onUpdate(conversationMessage);
      }

      return conversationMessage;
    }
  }

  getDefaultPrompt(): string {
    return DEFAULT_WORKFLOW_ROLE;
  }

  createSystemPrompt(): string {
    return [
      this.createPromptDefinition(),
      '',
      this.createReActInstructions(),
    ].join('\n');
  }

  private createPromptDefinition(): string {
    return this.config.customPrompt || DEFAULT_WORKFLOW_ROLE;
  }

  private createReActInstructions(): string {
    return `**ReAct Methodology Guidelines:**

    **REASONING Phase:**
    - Analyze the user's request thoroughly
    - Identify the core objectives and constraints
    - Consider multiple approaches to solving the problem
    - Explain your thought process clearly

    **PLANNING Phase:**
    - Break down the task into specific, actionable steps
    - Sequence tasks logically with clear dependencies
    - Identify required tools and resources for each step
    - Estimate effort and potential challenges

    **ACTING Phase:**
    - Execute each planned task systematically
    - Use appropriate tools for each specific need
    - Maintain focus on the current task while keeping the overall goal in mind
    - Adapt your approach based on intermediate results

    **OBSERVING Phase:**
    - Analyze the results of each action
    - Determine if the task was completed successfully
    - Identify any errors or unexpected outcomes
    - Decide on next steps or necessary adjustments`;
  }

  private createWorkflowGraph() {
    const workflow = new StateGraph(WorkflowState)
      .addNode('analyze', this.reasoningNode.bind(this))
      .addNode('design', this.planningNode.bind(this))
      .addNode('execute', this.actionNode.bind(this))
      .addNode('review', this.observationNode.bind(this))
      .addNode('summarize', this.finalizationNode.bind(this))
      .addEdge(START, 'analyze')
      .addEdge('analyze', 'design')
      .addEdge('design', 'execute')
      .addEdge('execute', 'review')
      .addConditionalEdges('review', this.shouldContinue.bind(this), {
        continue: 'execute',
        finalize: 'summarize',
      })
      .addEdge('summarize', END);

    return workflow.compile();
  }

  private shouldContinue(state: WorkflowStateType): 'continue' | 'finalize' {
    // Continue if there are more tasks and we haven't exceeded max iterations
    // Note: iteration is the index of the NEXT task to execute
    if (
      state.iteration < state.plan.length &&
      state.iteration < state.maxIterations
    ) {
      return 'continue';
    }
    return 'finalize';
  }

  private async reasoningNode(
    state: WorkflowStateType
  ): Promise<Partial<WorkflowStateType>> {
    // Broadcast workflow start (only on first reasoning phase)
    if (state.iteration === 0) {
      const lastUserMessage =
        state.messages.filter(msg => msg instanceof HumanMessage).pop()
          ?.content || '';

      this.broadcastWorkflowEvent({
        type: SSEEventType.WORKFLOW_STARTED,
        workflowId: state.workflowId,
        originalQuery: lastUserMessage,
      });
    }

    // Broadcast reasoning start
    this.broadcastWorkflowEvent({
      type: SSEEventType.TASK_PROGRESS,
      workflowId: state.workflowId,
      task: {
        id: 'reasoning',
        description: 'Analyzing request and determining approach',
        status: 'in-progress',
        priority: 'high',
      },
    });

    const lastUserMessage =
      state.messages.filter(msg => msg instanceof HumanMessage).pop()
        ?.content || '';

    const reasoningPrompt = `
    **ANALYSIS AND PLANNING PHASE**
    
    User Request: ${lastUserMessage}
    
    First, analyze this request:
    1. Core objectives - What is the user trying to accomplish?
    2. Key constraints - What limitations or requirements should be considered?
    3. Recommended strategy - Which approach would be most effective and why?
    
    Then create a numbered list of specific tasks to accomplish the goal.
    
    Format your response as:
    ANALYSIS:
    [Your analysis here]
    
    PLAN:
    1. [First task]
    2. [Second task]  
    3. [Third task]
    
    Keep tasks concise and actionable.
    `;

    // Log the request for debugging
    const messages = [new HumanMessage(reasoningPrompt)];
    serverDebugLogger.logRequest(
      `[WorkflowAgent] Reasoning LLM Request: ${this.config.llmConfig.model}`,
      JSON.stringify({
        messages: messages.map(msg => ({
          role: msg._getType(),
          content:
            typeof msg.content === 'string' ? msg.content : '[Complex Content]',
        })),
        model: this.config.llmConfig.model,
        phase: 'reasoning',
      })
    );

    const reasoningResponse = await this.chatModel.invoke(messages);

    // Log the response for debugging
    serverDebugLogger.logResponse(
      `[WorkflowAgent] Reasoning LLM Response: ${this.config.llmConfig.model}`,
      JSON.stringify({
        content: reasoningResponse.content.toString(),
        model: this.config.llmConfig.model,
        phase: 'reasoning',
      })
    );

    const responseText = reasoningResponse.content.toString();

    // Parse analysis and plan
    const analysisPart =
      responseText.match(/ANALYSIS:(.*?)(?=PLAN:|$)/s)?.[1]?.trim() ||
      responseText;
    const planPart = responseText.match(/PLAN:(.*)/s)?.[1]?.trim() || '';

    // Parse plan into array - simplified format
    const plan = planPart
      .split(/\d+\.\s/)
      .filter(task => task.trim().length > 0)
      .map(task => task.trim());

    // Broadcast tasks planned if we have a plan
    if (plan.length > 0) {
      this.broadcastWorkflowEvent({
        type: SSEEventType.TASKS_PLANNED,
        workflowId: state.workflowId,
        tasks: plan.map((task: string, index: number) => ({
          id: `task-${index + 1}`,
          description: task.split('\n')[0], // First line as description
          status: 'todo',
          priority: 'medium',
        })),
      });
    }

    // Broadcast reasoning completion
    this.broadcastWorkflowEvent({
      type: SSEEventType.TASK_COMPLETED,
      workflowId: state.workflowId,
      task: {
        id: 'reasoning',
        description: 'Analyzed request and created plan',
        status: 'completed',
        priority: 'high',
      },
    });

    return { reasoning: analysisPart, plan };
  }

  private async planningNode(
    state: WorkflowStateType
  ): Promise<Partial<WorkflowStateType>> {
    // If we already have a plan from reasoning, skip this step
    if (state.plan && state.plan.length > 0) {
      return { plan: state.plan };
    }

    // Broadcast planning start
    this.broadcastWorkflowEvent({
      type: SSEEventType.TASK_PROGRESS,
      workflowId: state.workflowId,
      task: {
        id: 'planning',
        description: 'Creating detailed execution plan',
        status: 'in-progress',
        priority: 'high',
      },
    });

    const planningPrompt = `
    **PLANNING PHASE**
    
    Based on the reasoning: ${state.reasoning}
    
    Create a detailed step-by-step plan to accomplish the user's goal.
    
    IMPORTANT CONTEXT: You have access to powerful automation tools including:
    - Playwright browser automation (browser_navigate, browser_click, browser_type, browser_take_screenshot, etc.)
    - File system operations (read_file, create_file, list_directory, etc.)
    - Web search capabilities
    - Code execution and analysis tools
    
    Plan tasks that UTILIZE these tools for automation rather than manual instructions.
    For browser tasks, plan to use Playwright tools to actually control the browser.
    
    IMPORTANT: Respond with ONLY a JSON array containing the tasks. No other text or formatting.
    
    Example format:
    ["Use browser_navigate to open google.com", "Use browser_type to enter search term", "Use browser_click to submit search"]
    
    Keep task descriptions concise (1-2 sentences) and tool-focused.
    `;

    // Log the request for debugging
    const planningMessages = [new HumanMessage(planningPrompt)];
    serverDebugLogger.logRequest(
      `[WorkflowAgent] Planning LLM Request: ${this.config.llmConfig.model}`,
      JSON.stringify({
        messages: planningMessages.map(msg => ({
          role: msg._getType(),
          content:
            typeof msg.content === 'string' ? msg.content : '[Complex Content]',
        })),
        model: this.config.llmConfig.model,
        phase: 'planning',
      })
    );

    const planningResponse = await this.chatModel.invoke(planningMessages);

    // Log the response for debugging
    serverDebugLogger.logResponse(
      `[WorkflowAgent] Planning LLM Response: ${this.config.llmConfig.model}`,
      JSON.stringify({
        content: planningResponse.content.toString(),
        model: this.config.llmConfig.model,
        phase: 'planning',
      })
    );

    const planText = planningResponse.content.toString();

    // Parse JSON array of tasks
    let plan: string[] = [];
    try {
      // Try to parse as JSON first
      const jsonMatch = planText.match(/\[.*\]/s);
      if (jsonMatch) {
        plan = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(plan)) {
          throw new Error('Parsed JSON is not an array');
        }
      } else {
        throw new Error('No JSON array found in response');
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`[WorkflowAgent] Failed to parse JSON plan: ${errorMessage}`);
      // Simple fallback: split by newlines and filter non-empty lines
      plan = planText
        .split('\n')
        .map(line => line.trim())
        .filter(
          line =>
            line.length > 0 && !line.startsWith('#') && !line.startsWith('*')
        );
    }

    // Broadcast tasks planned
    this.broadcastWorkflowEvent({
      type: SSEEventType.TASKS_PLANNED,
      workflowId: state.workflowId,
      tasks: plan.map((task: string, index: number) => ({
        id: `task-${index + 1}`,
        description: task.split('\n')[0], // First line as description
        status: 'todo',
        priority: 'medium',
      })),
    });

    // Broadcast planning completion
    this.broadcastWorkflowEvent({
      type: SSEEventType.TASK_COMPLETED,
      workflowId: state.workflowId,
      task: {
        id: 'planning',
        description: 'Created detailed execution plan',
        status: 'completed',
        priority: 'high',
      },
    });

    return { plan };
  }

  private async actionNode(
    state: WorkflowStateType
  ): Promise<Partial<WorkflowStateType>> {
    const currentTaskIndex = state.iteration;
    const currentTask = state.plan[currentTaskIndex];

    if (!currentTask) {
      logger.warn(
        `[WorkflowAgent] No task found at iteration ${currentTaskIndex}, plan: ${JSON.stringify(state.plan)}`
      );
      return { iteration: currentTaskIndex + 1 }; // Still increment to avoid infinite loop
    }

    // Broadcast task start
    this.broadcastWorkflowEvent({
      type: SSEEventType.TASK_PROGRESS,
      workflowId: state.workflowId,
      task: {
        id: `task-${currentTaskIndex + 1}`,
        description: currentTask.split('\n')[0],
        status: 'in-progress',
        priority: 'medium',
      },
    });

    // OPTIMIZATION 1: Smart Action Execution - Skip LLM for direct tool calls
    const directToolMatch = this.tryDirectToolExecution(currentTask);
    let actionResult: string;

    if (directToolMatch && this.agentExecutor) {
      // Execute tool directly without LLM overhead
      try {
        const result = await this.agentExecutor.invoke({
          input: `Execute: ${directToolMatch.toolCall}`,
        });
        actionResult = result.output || `Executed ${directToolMatch.action}`;
      } catch (toolError: unknown) {
        const errorMessage =
          toolError instanceof Error ? toolError.message : 'Unknown error';
        actionResult = `Tool execution failed: ${errorMessage}`;
      }
    } else {
      // Use full LLM reasoning for complex tasks
      const actionPrompt = `
      **ACTION PHASE**
      
      Current Task: ${currentTask}
      
      Previous Results: ${JSON.stringify(state.taskResults, null, 2)}
      
      Execute this specific task. Use appropriate tools if needed and provide a clear result.
      Focus only on this task - don't try to complete multiple tasks at once.
      
      IMPORTANT: You have access to powerful tools including:
      - Playwright tools for browser automation (browser_navigate, browser_click, browser_type, etc.)
      - File system tools for reading/writing files
      - Web search tools
      
      Use these tools to actually perform the task rather than just providing instructions.
      `;

      if (this.agentExecutor) {
        try {
          const result = await this.agentExecutor.invoke({
            input: actionPrompt,
          });
          actionResult = result.output || 'Task completed';
        } catch (toolError: unknown) {
          const errorMessage =
            toolError instanceof Error ? toolError.message : 'Unknown error';
          actionResult = `Tool execution failed: ${errorMessage}`;
        }
      } else {
        const response = await this.chatModel.invoke([
          new HumanMessage(actionPrompt),
        ]);
        actionResult = response.content.toString();
      }
    }

    // Store the result
    const taskKey = `task-${currentTaskIndex + 1}`;
    const taskResults = {
      [taskKey]: {
        description: currentTask,
        result: actionResult,
        timestamp: new Date().toISOString(),
      },
    };

    // Broadcast task completion
    this.broadcastWorkflowEvent({
      type: SSEEventType.TASK_COMPLETED,
      workflowId: state.workflowId,
      task: {
        id: taskKey,
        description: currentTask.split('\n')[0],
        status: 'completed',
        priority: 'medium',
      },
    });

    return {
      currentTask,
      taskResults,
      iteration: currentTaskIndex + 1,
    };
  }

  private async observationNode(
    state: WorkflowStateType
  ): Promise<Partial<WorkflowStateType>> {
    // Get the most recently completed task (iteration was just incremented in actionNode)
    const lastCompletedTaskIndex = state.iteration - 1;
    const lastCompletedTaskKey = `task-${lastCompletedTaskIndex + 1}`;
    const taskResult =
      state.taskResults[lastCompletedTaskKey] || 'No results available';

    const observationPrompt = `
    **OBSERVATION PHASE**
    
    Review the results of the just-completed task:
    Task: ${state.currentTask || 'No task set'}
    Result: ${JSON.stringify(taskResult, null, 2)}
    
    Progress: ${state.iteration}/${state.plan.length} tasks completed
    
    Analyze:
    1. Was this specific task completed successfully?
    2. Are there any immediate issues that need addressing before continuing?
    3. Should we proceed to the next task or finalize?
    
    Provide a brief assessment focused only on this task's outcome.
    `;

    // Log the request for debugging
    const observationMessages = [
      new SystemMessage(this.systemPrompt),
      new HumanMessage(observationPrompt),
    ];
    serverDebugLogger.logRequest(
      `[WorkflowAgent] Observation LLM Request: ${this.config.llmConfig.model}`,
      JSON.stringify({
        messages: observationMessages.map(msg => ({
          role: msg._getType(),
          content:
            typeof msg.content === 'string' ? msg.content : '[Complex Content]',
        })),
        model: this.config.llmConfig.model,
        phase: 'observation',
      })
    );

    const observationResponse =
      await this.chatModel.invoke(observationMessages);

    // Log the response for debugging
    serverDebugLogger.logResponse(
      `[WorkflowAgent] Observation LLM Response: ${this.config.llmConfig.model}`,
      JSON.stringify({
        content: observationResponse.content.toString(),
        model: this.config.llmConfig.model,
        phase: 'observation',
      })
    );

    return {};
  }

  private async finalizationNode(
    state: WorkflowStateType
  ): Promise<Partial<WorkflowStateType>> {
    // Broadcast finalization start
    this.broadcastWorkflowEvent({
      type: SSEEventType.TASK_PROGRESS,
      workflowId: state.workflowId,
      task: {
        id: 'finalization',
        description: 'Generating comprehensive summary and recommendations',
        status: 'in-progress',
        priority: 'high',
      },
    });

    const finalizationPrompt = `
    **FINALIZATION PHASE**
    
    Original Request: ${state.messages.filter(msg => msg instanceof HumanMessage).pop()?.content || ''}
    
    Initial Analysis: ${state.reasoning}
    
    Tasks Completed: ${state.plan.length}
    
    Provide a comprehensive summary of what was accomplished and any actionable next steps for the user. Focus on outcomes rather than technical details of each task execution.
    `;

    // Log the request for debugging
    const finalizationMessages = [
      new SystemMessage(this.systemPrompt),
      new HumanMessage(finalizationPrompt),
    ];
    serverDebugLogger.logRequest(
      `[WorkflowAgent] Finalization LLM Request: ${this.config.llmConfig.model}`,
      JSON.stringify({
        messages: finalizationMessages.map(msg => ({
          role: msg._getType(),
          content:
            typeof msg.content === 'string' ? msg.content : '[Complex Content]',
        })),
        model: this.config.llmConfig.model,
        phase: 'finalization',
      })
    );

    const finalizationResponse =
      await this.chatModel.invoke(finalizationMessages);

    // Log the response for debugging
    serverDebugLogger.logResponse(
      `[WorkflowAgent] Finalization LLM Response: ${this.config.llmConfig.model}`,
      JSON.stringify({
        content: finalizationResponse.content.toString(),
        model: this.config.llmConfig.model,
        phase: 'finalization',
      })
    );

    const summary = finalizationResponse.content.toString();

    // Broadcast finalization completion
    this.broadcastWorkflowEvent({
      type: SSEEventType.TASK_COMPLETED,
      workflowId: state.workflowId,
      task: {
        id: 'finalization',
        description: 'Generating comprehensive summary and recommendations',
        status: 'completed',
        priority: 'high',
        result: 'Summary and recommendations generated successfully',
      },
    });

    // Broadcast workflow completion
    this.broadcastWorkflowEvent({
      type: SSEEventType.WORKFLOW_COMPLETED,
      workflowId: state.workflowId,
      totalChanges: Object.keys(state.taskResults).length,
    });

    return {
      messages: [new AIMessage(summary)],
    };
  }
}
