import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConversationService } from '../chat/services/conversation.service';
import { v4 as uuidv4 } from 'uuid';

export interface AgentConfig {
  id: string;
  name: string;
  type: 'chat' | 'workflow' | 'mindmap' | 'custom';
  role?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentRole {
  name: string;
  description?: string;
  systemPrompt: string;
  capabilities?: string[];
  constraints?: string[];
  examples?: string[];
}

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);
  private agents: Map<string, AgentConfig> = new Map();
  private roles: Map<string, AgentRole> = new Map();
  private threadAgents: Map<string, string> = new Map(); // threadId -> agentId mapping
  private threadPrompts: Map<string, string> = new Map(); // threadId -> customPrompt mapping
  private defaultRole: AgentRole;

  constructor(
    private configService: ConfigService,
    private conversationService: ConversationService
  ) {
    this.initializeDefaultRoles();
    this.defaultRole = this.roles.get('assistant')!;
  }

  /**
   * Initialize default agent roles
   */
  private initializeDefaultRoles(): void {
    const defaultRoles: AgentRole[] = [
      {
        name: 'assistant',
        description: 'A helpful AI assistant',
        systemPrompt:
          'You are a helpful AI assistant. Provide clear, accurate, and helpful responses.',
        capabilities: ['general-knowledge', 'problem-solving', 'conversation'],
      },
      {
        name: 'coder',
        description: 'Expert programming assistant',
        systemPrompt:
          'You are an expert programming assistant. Help with code, debugging, and software development best practices.',
        capabilities: ['coding', 'debugging', 'architecture', 'testing'],
      },
      {
        name: 'researcher',
        description: 'Research and analysis specialist',
        systemPrompt:
          'You are a research specialist. Help analyze information, find patterns, and provide detailed insights.',
        capabilities: [
          'research',
          'analysis',
          'fact-checking',
          'summarization',
        ],
      },
      {
        name: 'creative',
        description: 'Creative writing and ideation assistant',
        systemPrompt:
          'You are a creative assistant. Help with writing, brainstorming, and creative problem-solving.',
        capabilities: ['writing', 'brainstorming', 'storytelling', 'ideation'],
      },
    ];

    for (const role of defaultRoles) {
      this.roles.set(role.name, role);
    }
  }

  /**
   * Get all threads (delegated to ConversationService)
   */
  async getAllThreads(
    type?: string,
    limit?: number,
    offset?: number
  ): Promise<Array<Record<string, unknown>>> {
    const threads = await this.conversationService.getThreadList();

    // Apply filters
    let filtered = threads;
    if (type) {
      // Filter by agent type if needed
      filtered = threads.filter(t => {
        const agentId = this.threadAgents.get(t.id);
        const agent = agentId ? this.agents.get(agentId) : undefined;
        return agent?.type === type;
      });
    }

    // Apply pagination
    const start = offset || 0;
    const end = limit ? start + limit : undefined;

    return filtered.slice(start, end);
  }

  /**
   * Get thread details
   */
  async getThread(threadId: string): Promise<Record<string, unknown>> {
    const thread = await this.conversationService.getThread(threadId);
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`);
    }

    const agentId = this.threadAgents.get(threadId);
    const agent = agentId ? this.agents.get(agentId) : undefined;

    return {
      id: thread.id,
      title: thread.name,
      type: agent?.type || 'chat',
      agent: agent || null,
      messageCount: thread.messages.length,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      metadata: {
        customPrompt: thread.customPrompt,
        ...thread.metadata,
      },
    };
  }

  /**
   * Create a new thread with optional agent
   */
  async createThread(
    title: string,
    type?: string
  ): Promise<Record<string, unknown>> {
    const thread = await this.conversationService.createThread(title);

    // Create an agent for this thread if type specified
    if (type && type !== 'chat') {
      const agent = await this.createAgent({
        name: `${type}-agent-${thread.id}`,
        type: type as AgentConfig['type'],
        role: this.defaultRole.name,
      });
      this.threadAgents.set(thread.id, agent.id);
    }

    return {
      id: thread.id,
      title: thread.name,
      type: type || 'chat',
    };
  }

  /**
   * Update thread
   */
  async updateThread(
    threadId: string,
    updates: { title?: string; metadata?: Record<string, unknown> }
  ): Promise<Record<string, unknown>> {
    if (updates.title) {
      await this.conversationService.renameThread(threadId, updates.title);
    }

    // Handle metadata updates if needed
    const thread = await this.conversationService.getThread(threadId);

    return {
      id: threadId,
      title: thread?.name,
      ...updates,
    };
  }

  /**
   * Delete thread
   */
  async deleteThread(threadId: string): Promise<{ success: boolean }> {
    // Remove agent association
    const agentId = this.threadAgents.get(threadId);
    if (agentId) {
      this.agents.delete(agentId);
      this.threadAgents.delete(threadId);
    }

    const success = await this.conversationService.deleteThread(threadId);
    return { success };
  }

  /**
   * Set thread custom prompt
   */
  setThreadPrompt(threadId: string, customPrompt: string): void {
    this.threadPrompts.set(threadId, customPrompt);
  }

  /**
   * Delete thread custom prompt
   */
  deleteThreadPrompt(threadId: string): void {
    this.threadPrompts.delete(threadId);
  }

  /**
   * Get thread custom prompt
   */
  getThreadPrompt(threadId: string): string | undefined {
    return this.threadPrompts.get(threadId);
  }

  /**
   * Duplicate thread
   */
  async duplicateThread(threadId: string): Promise<Record<string, unknown>> {
    const originalThread = await this.conversationService.getThread(threadId);
    if (!originalThread) {
      throw new Error(`Thread ${threadId} not found`);
    }

    // Create new thread
    const newThread = await this.conversationService.createThread(
      `${originalThread.name} (Copy)`
    );

    // Copy messages
    for (const message of originalThread.messages) {
      await this.conversationService.addMessage(newThread.id, {
        ...message,
        id: uuidv4(),
        timestamp: new Date(),
      });
    }

    // Copy agent if exists
    const agentId = this.threadAgents.get(threadId);
    if (agentId) {
      const originalAgent = this.agents.get(agentId);
      if (originalAgent) {
        const newAgent = await this.createAgent({
          ...originalAgent,
          name: `${originalAgent.name}-copy`,
        });
        this.threadAgents.set(newThread.id, newAgent.id);
      }
    }

    return {
      id: newThread.id,
      originalId: threadId,
      title: newThread.name,
    };
  }

  /**
   * Get role for thread or default
   */
  async getRole(threadId?: string): Promise<Record<string, unknown>> {
    if (threadId) {
      const agentId = this.threadAgents.get(threadId);
      const agent = agentId ? this.agents.get(agentId) : undefined;

      if (agent?.role) {
        const role = this.roles.get(agent.role);
        if (role) {
          return {
            role: role.name,
            description: role.description,
            systemPrompt: role.systemPrompt,
            config: {
              capabilities: role.capabilities,
              constraints: role.constraints,
            },
          };
        }
      }
    }

    return {
      role: this.defaultRole.name,
      description: this.defaultRole.description,
      systemPrompt: this.defaultRole.systemPrompt,
      config: {
        capabilities: this.defaultRole.capabilities,
        constraints: this.defaultRole.constraints,
      },
    };
  }

  /**
   * Set role for thread or global
   */
  async setRole(
    roleName: string,
    config?: Record<string, unknown>,
    threadId?: string
  ): Promise<{ success: boolean }> {
    const role = this.roles.get(roleName);
    if (!role && !config) {
      throw new Error(`Role ${roleName} not found and no config provided`);
    }

    if (threadId) {
      // Set role for specific thread
      const agentId = this.threadAgents.get(threadId);
      let agent = agentId ? this.agents.get(agentId) : undefined;

      if (!agent) {
        // Create agent for this thread
        agent = await this.createAgent({
          name: `agent-${threadId}`,
          type: 'chat',
          role: roleName,
        });
        this.threadAgents.set(threadId, agent.id);
      } else {
        // Update existing agent
        agent.role = roleName;
        agent.updatedAt = new Date();
        if (config) {
          agent.metadata = { ...agent.metadata, ...config };
        }
      }
    } else {
      // Set as default role
      if (role) {
        this.defaultRole = role;
      } else if (config) {
        // Create custom role
        const customRole: AgentRole = {
          name: roleName,
          systemPrompt: (config.systemPrompt as string) || '',
          description: config.description as string,
          capabilities: config.capabilities as string[],
          constraints: config.constraints as string[],
        };
        this.roles.set(roleName, customRole);
        this.defaultRole = customRole;
      }
    }

    return { success: true };
  }

  /**
   * Create a new agent
   */
  private async createAgent(
    config: Partial<AgentConfig> & { name: string; type: AgentConfig['type'] }
  ): Promise<AgentConfig> {
    const agent: AgentConfig = {
      id: uuidv4(),
      name: config.name,
      type: config.type,
      role: config.role || this.defaultRole.name,
      systemPrompt: config.systemPrompt,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      model: config.model,
      metadata: config.metadata || {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.agents.set(agent.id, agent);
    this.logger.log(`Created agent: ${agent.id} (${agent.type})`);

    return agent;
  }

  /**
   * Get all available roles
   */
  async getAllRoles(): Promise<AgentRole[]> {
    return Array.from(this.roles.values());
  }

  /**
   * Get all agents
   */
  async getAllAgents(): Promise<AgentConfig[]> {
    return Array.from(this.agents.values());
  }

  /**
   * Get agent by ID
   */
  async getAgent(agentId: string): Promise<AgentConfig | undefined> {
    return this.agents.get(agentId);
  }

  /**
   * Update agent configuration
   */
  async updateAgent(
    agentId: string,
    updates: Partial<AgentConfig>
  ): Promise<AgentConfig> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    Object.assign(agent, updates, {
      id: agentId, // Preserve ID
      updatedAt: new Date(),
    });

    this.logger.log(`Updated agent: ${agentId}`);
    return agent;
  }

  /**
   * Delete agent
   */
  async deleteAgent(agentId: string): Promise<{ success: boolean }> {
    const deleted = this.agents.delete(agentId);

    // Remove thread associations
    for (const [threadId, id] of this.threadAgents.entries()) {
      if (id === agentId) {
        this.threadAgents.delete(threadId);
      }
    }

    this.logger.log(`Deleted agent: ${agentId}`);
    return { success: deleted };
  }
}
