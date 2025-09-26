import { Injectable, Logger } from '@nestjs/common';
import { ConversationMessage } from '../../chat/types/conversation.types';
import { ChatAgentService } from './chat-agent.service';
import type { AgentConfig } from './base-agent.service';
import { BaseAgentService } from './base-agent.service';
import { McpManagerService } from '../../mcp/services/mcp-manager.service';
import { SseService } from '../../events/services/sse.service';
import { LfsService } from '../../content/services/lfs.service';
import { getWorkspaceRoot } from '../../../shared/utils/settings-directory';

export interface LLMConfig {
  baseURL: string;
  model: string;
  displayName?: string;
  apiKey?: string;
  type?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ImageAttachment {
  id: string;
  filename: string;
  filepath: string;
  mimeType: string;
  size: number;
  thumbnail: string;
  fullImage: string;
  uploadedAt: Date;
}

export interface NotesAttachment {
  id: string;
  title: string;
  content: string;
  nodeLabel?: string;
  attachedAt: Date;
}

export interface ProcessMessageOptions {
  images?: ImageAttachment[];
  notes?: NotesAttachment[];
  onUpdate?: (message: ConversationMessage) => Promise<void>;
  userMessageId?: string;
  signal?: AbortSignal;
}

export interface Agent {
  getConversation(threadId: string): ConversationMessage[];
  updateLLMConfig(newLlmConfig: LLMConfig): void;
  updateWorkspaceRoot(newWorkspaceRoot: string): void;
  processMessage(
    threadId: string,
    message: string,
    options: ProcessMessageOptions
  ): Promise<ConversationMessage>;
}

@Injectable()
export class AgentPoolService {
  private readonly logger = new Logger(AgentPoolService.name);
  private readonly agents: Map<string, BaseAgentService> = new Map();
  private currentThreadId = 'default';
  private currentLlmConfig: LLMConfig = {
    baseURL: '',
    model: 'gpt-4',
    displayName: 'GPT-4',
    type: 'openai',
  };
  private workspaceRoot = process.cwd();

  constructor(
    private readonly mcpManagerService: McpManagerService,
    private readonly sseService: SseService,
    private readonly lfsService: LfsService
  ) {
    this.initializeWorkspaceRoot().catch(error => {
      this.logger.error('Failed to initialize workspace root:', error);
    });
  }

  private async initializeWorkspaceRoot(): Promise<void> {
    const root = await getWorkspaceRoot();
    if (root) {
      this.workspaceRoot = root;
    }
  }

  async setCurrentThread(threadId: string): Promise<void> {
    this.currentThreadId = threadId;
    this.logger.debug(`Set current thread to: ${threadId}`);
  }

  getCurrentThreadId(): string {
    return this.currentThreadId;
  }

  getCurrentAgent(): BaseAgentService {
    return this.getOrCreateAgent(this.currentThreadId);
  }

  private getOrCreateAgent(threadId: string): BaseAgentService {
    if (!this.agents.has(threadId)) {
      const agent = new ChatAgentService(
        this.mcpManagerService,
        this.sseService,
        this.lfsService
      );

      // Initialize the agent
      const agentConfig: AgentConfig = {
        workspaceRoot: this.workspaceRoot,
        llmConfig: this.currentLlmConfig,
      };
      agent.initializeAgent(agentConfig).catch(error => {
        this.logger.error(
          `Failed to initialize agent for thread ${threadId}:`,
          error
        );
      });
      this.agents.set(threadId, agent);
      this.logger.debug(`Created new agent for thread: ${threadId}`);
    }
    return this.agents.get(threadId)!;
  }

  getAgent(threadId: string): BaseAgentService {
    return this.getOrCreateAgent(threadId);
  }

  clearAllAgents(): void {
    this.agents.clear();
    this.logger.log('Cleared all agents');
  }

  getActiveAgents(): BaseAgentService[] {
    return Array.from(this.agents.values());
  }

  async updateAllAgentsLLMConfig(
    newLlmConfig: Partial<LLMConfig>
  ): Promise<void> {
    this.currentLlmConfig = { ...this.currentLlmConfig, ...newLlmConfig };
    for (const agent of this.agents.values()) {
      agent.updateLLMConfig(this.currentLlmConfig);
    }
    this.logger.log('Updated LLM config for all agents');
  }

  updateAllAgentsWorkspace(newWorkspaceRoot: string): void {
    this.workspaceRoot = newWorkspaceRoot;
    for (const agent of this.agents.values()) {
      agent.updateWorkspaceRoot(newWorkspaceRoot);
    }
    this.logger.log(
      `Updated workspace root for all agents: ${newWorkspaceRoot}`
    );
  }

  setCurrentLlmConfig(config: Partial<LLMConfig>): void {
    this.currentLlmConfig = { ...this.currentLlmConfig, ...config };
    this.updateAllAgentsLLMConfig(config).catch(error => {
      this.logger.error('Failed to update LLM config:', error);
    });
  }

  async syncCurrentAgentWithThread(threadId: string): Promise<void> {
    try {
      const currentAgent = this.getCurrentAgent();

      // Check if llmConfig exists and has required properties
      if (currentAgent.llmConfig) {
        // Use dynamic imports to avoid circular dependency
        const { SessionService } = await import(
          '../../chat/services/session.service'
        );
        const { ConversationService } = await import(
          '../../chat/services/conversation.service'
        );

        const sessionService = new SessionService(this.sseService);
        const conversationService = new ConversationService();

        // Load the conversation for this thread to get messages
        await conversationService.load();
        const conversations = conversationService.getConversations();
        const thread = conversations.find(t => t.id === threadId);
        const messages = thread?.messages ?? [];

        // Update session history for the current model and thread
        await sessionService.updateSessionHistory(
          currentAgent.llmConfig.type ?? 'openai',
          currentAgent.llmConfig.model ?? 'gpt-4',
          threadId,
          messages
        );

        this.logger.debug(
          `Synced agent with thread ${threadId} for ${currentAgent.llmConfig.type} model ${currentAgent.llmConfig.model}`
        );
      }
    } catch (error) {
      this.logger.error(`Failed to sync agent with thread ${threadId}:`, error);
    }
  }
}
