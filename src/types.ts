export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timest: Date;
  toolCalls?: ToolCall[];
  toolResults?: Array<{ name: string; result: any }>;
}

export interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, any>;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}
