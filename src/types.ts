// App view types
export type AppView =
  | 'chat'
  | 'workspace'
  | 'agents'
  | 'mindmaps'
  | 'settings'
  | 'application-logs';

// Font scheme types
export type FontScheme =
  | 'system'
  | 'inter'
  | 'serif'
  | 'monospace'
  | 'academic';

// SSE Event types
export enum SSEEventType {
  // Connection events
  CONNECTED = 'connected',

  // Chat/messaging events
  CONTENT_CHUNK = 'content-chunk',
  MESSAGE_UPDATE = 'message-update',
  COMPLETED = 'completed',
  COMPLETE = 'complete',

  // Tool events
  TOOL_CALL = 'tool-call',
  TOOL_RESULT = 'tool-result',

  // Error events
  ERROR = 'error',
  LOCAL_MODEL_NOT_LOADED = 'local-model-not-loaded',

  // Workflow events
  WORKFLOW_STARTED = 'workflow_started',
  TASKS_PLANNED = 'tasks_planned',
  TASK_PROGRESS = 'task_progress',
  TASK_COMPLETED = 'task_completed',
  WORKFLOW_COMPLETED = 'workflow_completed',
  WORKFLOW_FAILED = 'workflow_failed',

  // Debug events
  DEBUG_ENTRY = 'debug-entry',
  TOKEN_STATS = 'token-stats',
  GENERATION_STATUS = 'generation-status',

  // MCP events
  MCP_LOG = 'mcp-log',
  MCP_PROCESS_INFO = 'mcp-process-info',
  MCP_STDOUT_LOG = 'mcp-stdout-log',
  MCP_STDERR_LOG = 'mcp-stderr-log',
  MCP_SERVER_CONNECTED = 'mcp-server-connected',
  MCP_SERVER_DISCONNECTED = 'mcp-server-disconnected',
  MCP_TOOLS_UPDATED = 'mcp-tools-updated',
  MCP_SERVER_STARTED = 'mcp-server-started',
  MCP_SERVER_STOPPED = 'mcp-server-stopped',
  MCP_SERVER_ERROR = 'mcp-server-error',

  // Mindmap events
  MINDMAP_CHANGE = 'mindmap_change',

  // Model events
  MODELS_UPDATED = 'models-updated',
  SCAN_PROGRESS = 'scan-progress',

  // Workspace events
  WORKSPACE_ROOT_CHANGED = 'workspace_root_changed',
  MUSIC_ROOT_CHANGED = 'music_root_changed',

  // Special events
  ALL = '*',
}

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
  citations?: string[]; // URL citations for assistant messages (Perplexity)
  // Required for assistant messages with status 'completed'
  medianTokensPerSecond?: number; // Median token generation rate
  totalTokens?: number; // Total tokens generated for this message
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
