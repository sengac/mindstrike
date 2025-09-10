export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timest: Date;
  toolCalls?: ToolCall[];
  toolResults?: Array<{ name: string; result: any }>;
  status?: 'processing' | 'completed' | 'cancelled';
  model?: string; // LLM model used for assistant messages
}

export interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, any>;
}

export interface Thread {
  id: string;
  name: string;
  summary?: string;
  messages: ConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}
