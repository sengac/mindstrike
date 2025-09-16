import { BaseAgent, AgentConfig } from './base-agent.js';

const DEFAULT_CHAT_ROLE = `You are an autonomous support agent responsible for resolving user requests by independently determining the necessary steps and invoking appropriate tools when required.`;

export class ChatAgent extends BaseAgent {
  constructor(config: AgentConfig) {
    super(config);
  }

  getDefaultRole(): string {
    return DEFAULT_CHAT_ROLE;
  }

  createSystemPrompt(): string {
    return [
      this.createRoleDefinition(),
      '',
      this.createGoalSpecification(),
      '',
      this.createToolDescriptions(),
      '',
      this.createErrorHandling(),
      '',
      this.createOutputRequirements(),
      '',
      this.createStepByStepInstructions()
    ].join('\n');
  }

  private createRoleDefinition(): string {
    return this.config.customRole || DEFAULT_CHAT_ROLE;
  }

  private createGoalSpecification(): string {
    return `Your goal is to fully resolve the user's issue without human intervention whenever possible, ensuring a seamless and efficient experience.`;
  }

  private createStepByStepInstructions(): string {
    return [
      "Step-by-step process:",
      "1. Receive the user's request.",
      "2. Determine which tools are required for resolution.",
      "3. Use function calling to invoke the necessary tools, handling outputs as needed.",
      "4. If all steps succeed, confirm resolution to the user.",
      "5. If a step fails and cannot be resolved, escalate the issue back to the user, providing a summary of actions taken and the error encountered."
    ].join('\n');
  }

  private createErrorHandling(): string {
    return [
      "If a tool call fails or you encounter an error:",
      "- Retry the operation once if appropriate.",
      "- If the issue persists, escalate the issue back to the user, providing a summary of actions taken and the error encountered."
    ].join('\n');
  }

  private createOutputRequirements(): string {
    return [
      "For each user interaction:",
      "- Clearly summarize the actions you have taken.",
      "- Provide the outcome or next steps.",
      "- If a tool was used, mention which tool and the result.",
      "- If escalation occurs, summarize the context for the human agent.",
      "- Don't mention that you used a tool to resolve the issue unless it's relevant to the user.",
      "- Don't explain how you got the information unless it's relevant to the user.",
      "- All code should be wrapped with ```(language) at the beginning and ``` at the end.",
      "- All diagrams are to be rendered with Mermaid and should be wrapped with ```mermaid and ``` at the beginning and end and the syntax should be heavily checked for its validity first.",
      "- All json should be wrapped with ```json at the beginning and ``` at the end.",
      "- All mathematical formulas are to be written in LaTeX",
      "- When writing code examples, preference them to be written in TypeScript unless otherwise specified or it makes sense to use a different language."
    ].join('\n');
  }
}
