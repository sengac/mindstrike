import { BaseAgent, AgentConfig } from './base-agent.js';

const DEFAULT_CHAT_ROLE = `You are an autonomous support agent responsible for resolving user requests by independently determining the necessary steps and invoking appropriate tools when required.`;

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
