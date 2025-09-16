import { BaseAgent, AgentConfig, ConversationMessage, ImageAttachment, NotesAttachment } from './base-agent.js';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { StateGraph, MessagesAnnotation, Annotation, START, END } from '@langchain/langgraph';
import { logger } from '../logger.js';
import { sseManager } from '../sse-manager.js';

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
  taskResults: Annotation<Record<string, any>>({
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
  private workflowGraph: any;
  private chatTopic?: string;

  constructor(config: AgentConfig, agentId?: string) {
    super(config, agentId);
    this.workflowGraph = this.createWorkflowGraph();
  }
  
  setChatTopic(chatTopic: string) {
    this.chatTopic = chatTopic;
  }
  
  private broadcastWorkflowEvent(event: any) {    
    // Always broadcast to the workflow topic
    sseManager.broadcast('workflow', event);
    
    // Also broadcast to the chat topic if available
    if (this.chatTopic) {
      sseManager.broadcast(this.chatTopic, event);
    }
  }
  
  // Override processMessage to use workflow instead of AgentExecutor
  async processMessage(userMessage: string, images?: ImageAttachment[], notes?: NotesAttachment[], onUpdate?: (message: ConversationMessage) => void): Promise<ConversationMessage> {
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
        maxIterations: 10
      };
      
      // Run the workflow
      const result = await this.workflowGraph.invoke(initialState);
      
      // Add user message to store
      const userMsgId = this.store.getState().addMessage({
        role: 'user',
        content: userMessage,
        status: 'completed',
        images: images || [],
        notes: notes || []
      });

      // Add assistant message to store
      const content = result.messages[result.messages.length - 1]?.content || 'Workflow completed';
      const assistantMsgId = this.store.getState().addMessage({
        role: 'assistant',
        content: content.toString(),
        status: 'completed',
        model: this.config.llmConfig.displayName || this.config.llmConfig.model
      });

      // Get the message from store and convert to ConversationMessage
      const assistantMessage = this.store.getState().messages.find(m => m.id === assistantMsgId);
      if (!assistantMessage) {
        throw new Error('Failed to retrieve assistant message');
      }

      const conversationMessage = this.convertToConversationMessage(assistantMessage);
      
      if (onUpdate) {
        onUpdate(conversationMessage);
      }
      
      return conversationMessage;
    } catch (error: any) {
      logger.error(`[WorkflowAgent] Error in workflow: ${error.message}`, { error });
      
      // Broadcast workflow failure
      this.broadcastWorkflowEvent({
        type: 'workflow_failed',
        workflowId,
        error: error.message
      });
      
      // Add error message to store
      const errorMsgId = this.store.getState().addMessage({
        role: 'assistant',
        content: `I encountered an error while processing your request: ${error.message}`,
        status: 'cancelled',
        model: this.config.llmConfig.displayName || this.config.llmConfig.model
      });

      const errorMessage = this.store.getState().messages.find(m => m.id === errorMsgId);
      if (!errorMessage) {
        throw error;
      }

      const conversationMessage = this.convertToConversationMessage(errorMessage);
      
      if (onUpdate) {
        onUpdate(conversationMessage);
      }
      
      return conversationMessage;
    }
  }

  getDefaultRole(): string {
    return DEFAULT_WORKFLOW_ROLE;
  }

  createSystemPrompt(): string {
    return [
      this.createRoleDefinition(),
      '',
      this.createReActInstructions(),
      '',
      this.createToolDescriptions(),
      '',
      this.createOutputRequirements(),
    ].join('\n');
  }

  private createRoleDefinition(): string {
    return this.config.customRole || DEFAULT_WORKFLOW_ROLE;
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

  private createOutputRequirements(): string {
    return `**Communication Standards:**

    - Always explain your reasoning before taking action
    - Provide clear updates on task progress
    - Format code with proper syntax highlighting
    - Use structured output for complex results
    - Report both successes and failures transparently
    - Summarize key findings and next steps`;
  }

  private createWorkflowGraph() {
    const workflow = new StateGraph(WorkflowState)
      .addNode("analyze", this.reasoningNode.bind(this))
      .addNode("design", this.planningNode.bind(this))
      .addNode("execute", this.actionNode.bind(this))
      .addNode("review", this.observationNode.bind(this))
      .addNode("summarize", this.finalizationNode.bind(this))
      .addEdge(START, "analyze")
      .addEdge("analyze", "design")
      .addEdge("design", "execute")
      .addEdge("execute", "review")
      .addConditionalEdges("review", this.shouldContinue.bind(this), {
        continue: "execute",
        finalize: "summarize"
      })
      .addEdge("summarize", END);

    return workflow.compile();
  }

  private shouldContinue(state: WorkflowStateType): "continue" | "finalize" {
    // Continue if there are more tasks and we haven't exceeded max iterations
    if (state.iteration < state.plan.length && state.iteration < state.maxIterations) {
      return "continue";
    }
    return "finalize";
  }

  private async reasoningNode(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {    
    // Broadcast workflow start (only on first reasoning phase)
    if (state.iteration === 0) {
      const lastUserMessage = state.messages
        .filter(msg => msg instanceof HumanMessage)
        .pop()?.content || '';
      
      this.broadcastWorkflowEvent({
        type: 'workflow_started',
        workflowId: state.workflowId,
        originalQuery: lastUserMessage
      });
    }
    
    // Broadcast reasoning start
    this.broadcastWorkflowEvent({
      type: 'task_progress',
      workflowId: state.workflowId,
      task: {
        id: 'reasoning',
        description: 'Analyzing request and determining approach',
        status: 'in-progress',
        priority: 'high'
      }
    });

    const lastUserMessage = state.messages
      .filter(msg => msg instanceof HumanMessage)
      .pop()?.content || '';

    const reasoningPrompt = `
    **REASONING PHASE**
    
    User Request: ${lastUserMessage}
    
    Please analyze this request and provide:
    1. Core objectives - What is the user trying to accomplish?
    2. Key constraints - What limitations or requirements should be considered?
    3. Approach analysis - What are the different ways this could be solved?
    4. Recommended strategy - Which approach would be most effective and why?
    
    Be thorough but concise in your reasoning.
    `;

    const reasoningResponse = await this.chatModel.invoke([
      new HumanMessage(reasoningPrompt)
    ]);

    const reasoning = reasoningResponse.content.toString();
    
    // Broadcast reasoning completion
    this.broadcastWorkflowEvent({
      type: 'task_completed',
      workflowId: state.workflowId,
      task: {
        id: 'reasoning',
        description: 'Analyzed request and determined approach',
        status: 'completed',
        priority: 'high'
      }
    });

    return { reasoning };
  }

  private async planningNode(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
    // Broadcast planning start
    this.broadcastWorkflowEvent({
      type: 'task_progress',
      workflowId: state.workflowId,
      task: {
        id: 'planning',
        description: 'Creating detailed execution plan',
        status: 'in-progress',
        priority: 'high'
      }
    });

    const planningPrompt = `
    **PLANNING PHASE**
    
    Based on the reasoning: ${state.reasoning}
    
    Create a detailed step-by-step plan to accomplish the user's goal.
    
    IMPORTANT: Respond with ONLY a JSON array containing the tasks. No other text or formatting.
    
    Example format:
    ["Task 1 description", "Task 2 description", "Task 3 description"]
    
    Keep task descriptions concise (1-2 sentences) and actionable.
    `;

    const planningResponse = await this.chatModel.invoke([
      new HumanMessage(planningPrompt)
    ]);

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
    } catch (error: any) {
      logger.warn(`[WorkflowAgent] Failed to parse JSON plan: ${error.message}`);
      // Simple fallback: split by newlines and filter non-empty lines
      plan = planText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#') && !line.startsWith('*'));
    }

    // Broadcast tasks planned
    this.broadcastWorkflowEvent({
      type: 'tasks_planned',
      workflowId: state.workflowId,
      tasks: plan.map((task: any, index: any) => ({
        id: `task-${index + 1}`,
        description: task.split('\n')[0], // First line as description
        status: 'todo',
        priority: 'medium'
      }))
    });

    // Broadcast planning completion
    this.broadcastWorkflowEvent({
      type: 'task_completed',
      workflowId: state.workflowId,
      task: {
        id: 'planning',
        description: 'Created detailed execution plan',
        status: 'completed',
        priority: 'high'
      }
    });

    return { plan };
  }

  private async actionNode(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
    const currentTaskIndex = state.iteration;
    const currentTask = state.plan[currentTaskIndex];
    
    if (!currentTask) {
      logger.warn(`[WorkflowAgent] No task found at iteration ${currentTaskIndex}, plan: ${JSON.stringify(state.plan)}`);
      return {};
    }
    
    // Broadcast task start
    this.broadcastWorkflowEvent({
      type: 'task_progress',
      workflowId: state.workflowId,
      task: {
        id: `task-${currentTaskIndex + 1}`,
        description: currentTask.split('\n')[0],
        status: 'in-progress',
        priority: 'medium'
      }
    });

    const actionPrompt = `
    **ACTION PHASE**
    
    Current Task: ${currentTask}
    
    Previous Results: ${JSON.stringify(state.taskResults, null, 2)}
    
    Execute this specific task. Use appropriate tools if needed and provide a clear result.
    Focus only on this task - don't try to complete multiple tasks at once.
    `;

    // Use direct chat model call to avoid system message conflicts
    const response = await this.chatModel.invoke([
      new HumanMessage(actionPrompt)
    ]);
    const actionResult = response.content.toString();

    // Store the result
    const taskKey = `task-${currentTaskIndex + 1}`;
    const taskResults = {
      [taskKey]: {
        description: currentTask,
        result: actionResult,
        timestamp: new Date().toISOString()
      }
    };

    // Broadcast task completion
    this.broadcastWorkflowEvent({
      type: 'task_completed',
      workflowId: state.workflowId,
      task: {
        id: taskKey,
        description: currentTask.split('\n')[0],
        status: 'completed',
        priority: 'medium'
      }
    });

    return {
      currentTask,
      taskResults,
      iteration: currentTaskIndex + 1
    };
  }

  private async observationNode(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
    const observationPrompt = `
    **OBSERVATION PHASE**
    
    Review the results of the current task:
    Task: ${state.currentTask || 'No task set'}
    Result: ${JSON.stringify(state.taskResults[`task-${state.iteration}`] || 'No results available', null, 2)}
    
    Current iteration: ${state.iteration}
    Total planned tasks: ${state.plan.length}
    Plan: ${JSON.stringify(state.plan, null, 2)}
    
    Analyze:
    1. Was the task completed successfully?
    2. Are there any issues or errors that need addressing?
    3. How does this result contribute to the overall goal?
    4. What should be done next?
    
    Provide a brief assessment.
    `;

    const observationResponse = await this.chatModel.invoke([
      new SystemMessage(this.systemPrompt),
      new HumanMessage(observationPrompt)
    ]);

    const observation = observationResponse.content.toString();

    return {};
  }



  private async finalizationNode(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {    
    // Broadcast finalization start
    this.broadcastWorkflowEvent({
      type: 'task_progress',
      workflowId: state.workflowId,
      task: {
        id: 'finalization',
        description: 'Generating comprehensive summary and recommendations',
        status: 'in-progress',
        priority: 'high'
      }
    });

    const finalizationPrompt = `
    **FINALIZATION PHASE**
    
    Summarize the completed workflow:
    
    Original Request: ${state.messages.filter(msg => msg instanceof HumanMessage).pop()?.content || ''}
    
    Reasoning: ${state.reasoning}
    
    Completed Tasks: ${Object.entries(state.taskResults).map(([key, result]) => 
      `${key}: ${(result as any).description} -> ${(result as any).result}`
    ).join('\n')}
    
    Provide a comprehensive summary of what was accomplished, any key findings, and actionable next steps for the user.
    `;

    const finalizationResponse = await this.chatModel.invoke([
      new SystemMessage(this.systemPrompt),
      new HumanMessage(finalizationPrompt)
    ]);

    const summary = finalizationResponse.content.toString();
    
    // Broadcast finalization completion
    this.broadcastWorkflowEvent({
      type: 'task_completed',
      workflowId: state.workflowId,
      task: {
        id: 'finalization',
        description: 'Generating comprehensive summary and recommendations',
        status: 'completed',
        priority: 'high',
        result: 'Summary and recommendations generated successfully'
      }
    });
    
    // Broadcast workflow completion
    this.broadcastWorkflowEvent({
      type: 'workflow_completed',
      workflowId: state.workflowId,
      totalChanges: Object.keys(state.taskResults).length
    });
    
    return {
      messages: [new AIMessage(summary)]
    };
  }
}
