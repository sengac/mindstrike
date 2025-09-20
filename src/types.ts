export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  toolResults?: Array<{ name: string; result: unknown }>;
  status?: 'processing' | 'completed' | 'cancelled';
  model?: string; // LLM model used for assistant messages
  images?: ImageAttachment[]; // Image attachments for user messages
  notes?: NotesAttachment[]; // Notes attachments for user messages
}

export interface ImageAttachment {
  id: string;
  filename: string;
  filepath: string;
  mimeType: string;
  size: number;
  thumbnail: string; // base64 encoded thumbnail for UI display
  fullImage: string; // base64 encoded full-size image for LLM
  uploadedAt: Date;
}

export interface NotesAttachment {
  id: string;
  title: string;
  content: string;
  nodeLabel?: string; // Optional label of the source node
  attachedAt: Date;
}

export interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
}

export interface Thread {
  id: string;
  name: string;
  summary?: string;
  messages: ConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
  customPrompt?: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}
