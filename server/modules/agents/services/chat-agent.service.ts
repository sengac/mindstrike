import { Injectable } from '@nestjs/common';
import type { AgentConfig } from './base-agent.service';
import { BaseAgentService } from './base-agent.service';
import { McpManagerService } from '../../mcp/services/mcp-manager.service';
import { SseService } from '../../events/services/sse.service';
import { LfsService } from '../../content/services/lfs.service';

const DEFAULT_CHAT_ROLE = `You are a helpful assistant.`;

@Injectable()
export class ChatAgentService extends BaseAgentService {
  constructor(
    protected readonly mcpManagerService: McpManagerService,
    protected readonly sseService: SseService,
    protected readonly lfsService: LfsService
  ) {
    super(mcpManagerService, sseService, lfsService);
  }

  async initializeAgent(config: AgentConfig): Promise<void> {
    await this.initialize(config);
  }

  getDefaultPrompt(): string {
    return DEFAULT_CHAT_ROLE;
  }

  createSystemPrompt(): string {
    return this.config?.customPrompt ?? DEFAULT_CHAT_ROLE;
  }
}
