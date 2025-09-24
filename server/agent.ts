import { ChatAgent } from './agents/chatAgent';

// Re-export types and interfaces for backward compatibility
export type {
  AgentConfig,
  ImageAttachment,
  NotesAttachment,
  ConversationMessage,
} from './agents/baseAgent';

// Agent class is now an alias for ChatAgent to maintain backward compatibility
export class Agent extends ChatAgent {}
