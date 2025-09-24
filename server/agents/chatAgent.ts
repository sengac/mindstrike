import type { AgentConfig } from './baseAgent.js';
import { BaseAgent } from './baseAgent.js';

const DEFAULT_CHAT_ROLE = `You are a helpful assistant.`;

export class ChatAgent extends BaseAgent {
  constructor(config: AgentConfig) {
    super(config);
  }

  getDefaultPrompt(): string {
    return DEFAULT_CHAT_ROLE;
  }

  createSystemPrompt(): string {
    return this.config.customPrompt || DEFAULT_CHAT_ROLE;
  }
}
