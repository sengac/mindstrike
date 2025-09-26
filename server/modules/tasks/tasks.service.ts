import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';

export interface TaskUpdate {
  workflowId: string;
  taskId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  message?: string;
  data?: Record<string, unknown>;
  timestamp?: Date;
}

export interface Task {
  taskId: string;
  workflowId: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface Workflow {
  workflowId: string;
  name: string;
  description?: string;
  tasks: Task[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  totalProgress: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  private workflows: Map<string, Workflow> = new Map();
  private tasks: Map<string, Task> = new Map();
  private activeSubscriptions: Map<string, NodeJS.Timeout> = new Map();

  constructor(private eventEmitter: EventEmitter2) {}

  /**
   * Create a new workflow
   */
  async createWorkflow(name: string, description?: string): Promise<Workflow> {
    const workflow: Workflow = {
      workflowId: uuidv4(),
      name,
      description,
      tasks: [],
      status: 'pending',
      totalProgress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    };

    this.workflows.set(workflow.workflowId, workflow);
    this.logger.log(`Created workflow: ${workflow.workflowId}`);

    // Emit workflow created event
    this.eventEmitter.emit('workflow.created', workflow);

    return workflow;
  }

  /**
   * Create a new task within a workflow
   */
  async createTask(
    workflowId: string,
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<Task> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      // Create workflow if it doesn't exist
      await this.createWorkflow('Auto-created workflow');
    }

    const task: Task = {
      taskId: uuidv4(),
      workflowId,
      description,
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata,
    };

    this.tasks.set(task.taskId, task);

    // Add task to workflow
    const updatedWorkflow = this.workflows.get(workflowId);
    if (updatedWorkflow) {
      updatedWorkflow.tasks.push(task);
      updatedWorkflow.updatedAt = new Date();
    }

    this.logger.log(`Created task: ${task.taskId} for workflow: ${workflowId}`);

    // Broadcast task creation
    this.broadcastTaskUpdate({
      workflowId,
      taskId: task.taskId,
      status: 'pending',
      message: `Task created: ${description}`,
      timestamp: new Date(),
    });

    return task;
  }

  /**
   * Start a task
   */
  async startTask(taskId: string): Promise<Task> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.status = 'running';
    task.startedAt = new Date();
    task.updatedAt = new Date();

    // Update workflow status
    const workflow = this.workflows.get(task.workflowId);
    if (workflow && workflow.status === 'pending') {
      workflow.status = 'running';
      workflow.startedAt = new Date();
      workflow.updatedAt = new Date();
    }

    this.logger.log(`Started task: ${taskId}`);

    this.broadcastTaskUpdate({
      workflowId: task.workflowId,
      taskId,
      status: 'running',
      message: `Task started: ${task.description}`,
      timestamp: new Date(),
    });

    return task;
  }

  /**
   * Update task progress
   */
  async updateTaskProgress(
    taskId: string,
    progress: number,
    message?: string
  ): Promise<TaskUpdate> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.progress = Math.min(100, Math.max(0, progress));
    task.updatedAt = new Date();

    // Update workflow total progress
    const workflow = this.workflows.get(task.workflowId);
    if (workflow) {
      const totalProgress =
        workflow.tasks.reduce(
          (sum, t) => sum + (this.tasks.get(t.taskId)?.progress || 0),
          0
        ) / workflow.tasks.length;
      workflow.totalProgress = totalProgress;
      workflow.updatedAt = new Date();
    }

    const update: TaskUpdate = {
      workflowId: task.workflowId,
      taskId,
      status: task.status,
      progress: task.progress,
      message: message || `Progress: ${progress}%`,
      timestamp: new Date(),
    };

    this.broadcastTaskUpdate(update);
    return update;
  }

  /**
   * Complete a task
   */
  async completeTask(
    taskId: string,
    result?: Record<string, unknown>
  ): Promise<Task> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.status = 'completed';
    task.progress = 100;
    task.completedAt = new Date();
    task.updatedAt = new Date();
    task.result = result;

    // Check if all tasks in workflow are completed
    const workflow = this.workflows.get(task.workflowId);
    if (workflow) {
      const allCompleted = workflow.tasks.every(
        t => this.tasks.get(t.taskId)?.status === 'completed'
      );

      if (allCompleted) {
        workflow.status = 'completed';
        workflow.totalProgress = 100;
        workflow.completedAt = new Date();
        workflow.updatedAt = new Date();

        this.eventEmitter.emit('workflow.completed', workflow);
      }
    }

    this.logger.log(`Completed task: ${taskId}`);

    this.broadcastTaskUpdate({
      workflowId: task.workflowId,
      taskId,
      status: 'completed',
      progress: 100,
      message: `Task completed: ${task.description}`,
      data: result,
      timestamp: new Date(),
    });

    return task;
  }

  /**
   * Fail a task
   */
  async failTask(taskId: string, error: string): Promise<Task> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.status = 'failed';
    task.error = error;
    task.completedAt = new Date();
    task.updatedAt = new Date();

    // Update workflow status
    const workflow = this.workflows.get(task.workflowId);
    if (workflow) {
      workflow.status = 'failed';
      workflow.updatedAt = new Date();

      this.eventEmitter.emit('workflow.failed', { workflow, error });
    }

    this.logger.error(`Task failed: ${taskId} - ${error}`);

    this.broadcastTaskUpdate({
      workflowId: task.workflowId,
      taskId,
      status: 'failed',
      message: `Task failed: ${error}`,
      timestamp: new Date(),
    });

    return task;
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<Task> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status === 'completed' || task.status === 'failed') {
      throw new Error(`Cannot cancel task in ${task.status} state`);
    }

    task.status = 'cancelled';
    task.completedAt = new Date();
    task.updatedAt = new Date();

    this.logger.log(`Cancelled task: ${taskId}`);

    this.broadcastTaskUpdate({
      workflowId: task.workflowId,
      taskId,
      status: 'cancelled',
      message: `Task cancelled: ${task.description}`,
      timestamp: new Date(),
    });

    return task;
  }

  /**
   * Cancel a workflow and all its tasks
   */
  async cancelWorkflow(workflowId: string): Promise<Workflow> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Cancel all pending/running tasks
    for (const task of workflow.tasks) {
      const taskObj = this.tasks.get(task.taskId);
      if (
        taskObj &&
        (taskObj.status === 'pending' || taskObj.status === 'running')
      ) {
        await this.cancelTask(task.taskId);
      }
    }

    workflow.status = 'cancelled';
    workflow.updatedAt = new Date();

    this.eventEmitter.emit('workflow.cancelled', workflow);
    this.logger.log(`Cancelled workflow: ${workflowId}`);

    return workflow;
  }

  /**
   * Get workflow by ID
   */
  async getWorkflow(workflowId: string): Promise<Workflow | undefined> {
    return this.workflows.get(workflowId);
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<Task | undefined> {
    return this.tasks.get(taskId);
  }

  /**
   * Get all workflows
   */
  async getAllWorkflows(): Promise<Workflow[]> {
    return Array.from(this.workflows.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  /**
   * Get tasks for a workflow
   */
  async getWorkflowTasks(workflowId: string): Promise<Task[]> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      return [];
    }

    return workflow.tasks
      .map(t => this.tasks.get(t.taskId))
      .filter((t): t is Task => t !== undefined);
  }

  /**
   * Broadcast task update via SSE
   */
  broadcastTaskUpdate(update: TaskUpdate): void {
    // Emit event for SSE service to pick up
    this.eventEmitter.emit('task.update', update);

    // Log the update
    this.logger.debug(
      `Task update broadcast: ${update.workflowId}/${update.taskId} - ${update.status}`
    );
  }

  /**
   * Subscribe to workflow updates (for SSE)
   */
  subscribeToWorkflow(
    workflowId: string,
    callback: (update: TaskUpdate) => void
  ): () => void {
    const listener = (update: TaskUpdate) => {
      if (update.workflowId === workflowId) {
        callback(update);
      }
    };

    this.eventEmitter.on('task.update', listener);

    // Return unsubscribe function
    return () => {
      this.eventEmitter.off('task.update', listener);
    };
  }

  /**
   * Clean up completed/failed workflows older than specified hours
   */
  async cleanupOldWorkflows(hoursOld: number = 24): Promise<number> {
    const cutoffTime = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [workflowId, workflow] of this.workflows.entries()) {
      if (
        (workflow.status === 'completed' || workflow.status === 'failed') &&
        workflow.updatedAt < cutoffTime
      ) {
        // Remove tasks
        for (const task of workflow.tasks) {
          this.tasks.delete(task.taskId);
        }

        // Remove workflow
        this.workflows.delete(workflowId);
        cleanedCount++;

        this.logger.log(`Cleaned up old workflow: ${workflowId}`);
      }
    }

    return cleanedCount;
  }
}
