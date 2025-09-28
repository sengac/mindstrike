import { Injectable } from '@nestjs/common';
import type { AgentConfig } from './base-agent.service';
import { BaseAgentService } from './base-agent.service';
import { McpManagerService } from '../../mcp/services/mcp-manager.service';
import { SseService } from '../../events/services/sse.service';
import { LfsService } from '../../content/services/lfs.service';
import { ConversationService } from '../../chat/services/conversation.service';

const DEFAULT_CHAT_ROLE = `You are a helpful assistant.`;

@Injectable()
export class ChatAgentService extends BaseAgentService {
  constructor(
    protected readonly mcpManagerService: McpManagerService,
    protected readonly sseService: SseService,
    protected readonly lfsService: LfsService,
    protected readonly conversationService: ConversationService
  ) {
    super(mcpManagerService, sseService, lfsService, conversationService);
  }

  async initializeAgent(config: AgentConfig): Promise<void> {
    this.logger.debug(`[NEST] ChatAgentService.initializeAgent called`);
    this.logger.debug(`[NEST] Config:`, config);
    try {
      await this.initialize(config);
      this.logger.debug(`[NEST] ChatAgentService.initialize completed`);
    } catch (error) {
      this.logger.error(`[NEST] ChatAgentService.initialize failed:`, error);
      throw error;
    }
  }

  getDefaultPrompt(): string {
    return DEFAULT_CHAT_ROLE;
  }

  createSystemPrompt(): string {
    this.logger.debug(`[NEST] ChatAgentService.createSystemPrompt called`);
    this.logger.debug(`[NEST] this.config:`, this.config);
    const prompt = this.config?.customPrompt ?? DEFAULT_CHAT_ROLE;
    this.logger.debug(`[NEST] Returning prompt: ${prompt}`);
    return prompt;
  }
}
