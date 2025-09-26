export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  toolResults?: Array<{ name: string; result: unknown }>;
  status?: 'processing' | 'completed' | 'cancelled';
  model?: string;
  images?: ImageAttachment[];
  notes?: NotesAttachment[];
}

export interface ImageAttachment {
  id: string;
  filename: string;
  filepath: string;
  mimeType: string;
  size: number;
  thumbnail: string;
  fullImage: string;
  uploadedAt: Date;
}

export interface NotesAttachment {
  id: string;
  title: string;
  content: string;
  nodeLabel?: string;
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

export interface ThreadMetadata {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  customPrompt?: string;
}
