import type { AgentConfig } from './baseAgent';
import { BaseAgent } from './baseAgent';

const DEFAULT_CHAT_ROLE = `You are a helpful assistant.`;

export class ChatAgent extends BaseAgent {
  constructor(config: AgentConfig) {
    super(config);
  }

  getDefaultPrompt(): string {
    return DEFAULT_CHAT_ROLE;
  }

  createSystemPrompt(): string {
    return this.config.customPrompt ?? DEFAULT_CHAT_ROLE;
  }
}
