import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export interface StreamingMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  status: 'streaming' | 'completed' | 'cancelled' | 'error';
  model?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    parameters: Record<string, unknown>;
  }>;
  toolResults?: Array<{
    name: string;
    result: unknown;
  }>;
  images?: Array<{
    id: string;
    filename: string;
    filepath: string;
    mimeType: string;
    size: number;
    thumbnail: string;
    fullImage: string;
    uploadedAt: Date;
  }>;
  notes?: Array<{
    id: string;
    title: string;
    content: string;
    nodeLabel?: string;
    attachedAt: Date;
  }>;
}

export interface AgentState {
  // Agent Configuration
  agentId: string;
  agentType: string;
  workspaceRoot: string;
  llmConfig: {
    baseURL: string;
    model: string;
    displayName?: string;
    apiKey?: string;
    type?:
      | 'ollama'
      | 'vllm'
      | 'openai-compatible'
      | 'openai'
      | 'anthropic'
      | 'perplexity'
      | 'google'
      | 'local';
  };
  customPrompt?: string;

  // Conversation State
  messages: StreamingMessage[];
  isStreaming: boolean;
  currentStreamingMessageId?: string;

  // Streaming Control
  abortController?: AbortController;

  // Actions
  addMessage: (
    message: Omit<StreamingMessage, 'id' | 'timestamp'>,
    providedId?: string
  ) => string;
  updateMessage: (id: string, updates: Partial<StreamingMessage>) => void;
  appendToMessage: (id: string, content: string) => void;
  deleteMessage: (id: string) => void;
  cancelStreaming: () => void;
  clearConversation: () => void;
  setStreamingStatus: (
    messageId: string,
    status: StreamingMessage['status']
  ) => void;
  setAbortController: (controller: AbortController) => void;

  // Configuration Updates
  updateLLMConfig: (config: AgentState['llmConfig']) => void;
  updateCustomPrompt: (prompt?: string) => void;
}

// Store factory for per-agent stores
const createAgentStore = (
  agentId: string,
  agentType: string,
  workspaceRoot: string
) =>
  create<AgentState>()(
    subscribeWithSelector((set, get) => ({
      // Initial state
      agentId,
      agentType,
      workspaceRoot,
      llmConfig: {
        baseURL: '',
        model: '',
      },
      messages: [],
      isStreaming: false,
      currentStreamingMessageId: undefined,
      abortController: undefined,

      // Actions
      addMessage: (messageData, providedId) => {
        const id =
          providedId ||
          `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const message: StreamingMessage = {
          ...messageData,
          id,
          timestamp: new Date(),
        };

        set(state => ({
          messages: [...state.messages, message],
          ...(message.status === 'streaming' && {
            isStreaming: true,
            currentStreamingMessageId: id,
          }),
        }));

        return id;
      },

      updateMessage: (id, updates) => {
        set(state => ({
          messages: state.messages.map(msg =>
            msg.id === id ? { ...msg, ...updates } : msg
          ),
          ...(updates.status !== 'streaming' &&
            state.currentStreamingMessageId === id && {
              isStreaming: false,
              currentStreamingMessageId: undefined,
            }),
        }));
      },

      appendToMessage: (id, content) => {
        set(state => ({
          messages: state.messages.map(msg =>
            msg.id === id ? { ...msg, content: msg.content + content } : msg
          ),
        }));
      },

      deleteMessage: id => {
        set(state => ({
          messages: state.messages.filter(msg => msg.id !== id),
          ...(state.currentStreamingMessageId === id && {
            isStreaming: false,
            currentStreamingMessageId: undefined,
          }),
        }));
      },

      cancelStreaming: () => {
        const { abortController, currentStreamingMessageId } = get();

        if (abortController) {
          abortController.abort();
        }

        if (currentStreamingMessageId) {
          set(state => ({
            messages: state.messages.map(msg =>
              msg.id === currentStreamingMessageId
                ? { ...msg, status: 'cancelled' as const }
                : msg
            ),
            isStreaming: false,
            currentStreamingMessageId: undefined,
            abortController: undefined,
          }));
        }
      },

      clearConversation: () => {
        const { abortController } = get();
        if (abortController) {
          abortController.abort();
        }

        set({
          messages: [],
          isStreaming: false,
          currentStreamingMessageId: undefined,
          abortController: undefined,
        });
      },

      setStreamingStatus: (messageId, status) => {
        set(state => ({
          messages: state.messages.map(msg =>
            msg.id === messageId ? { ...msg, status } : msg
          ),
          ...(status !== 'streaming' &&
            state.currentStreamingMessageId === messageId && {
              isStreaming: false,
              currentStreamingMessageId: undefined,
            }),
        }));
      },

      setAbortController: controller => {
        set({ abortController: controller });
      },

      // Configuration Updates
      updateLLMConfig: config => {
        set({ llmConfig: config });
      },

      updateCustomPrompt: customPrompt => {
        set({ customPrompt });
      },
    }))
  );

// Global registry of agent stores
const agentStores = new Map<string, ReturnType<typeof createAgentStore>>();

export const useAgentStore = (
  agentId: string,
  agentType: string,
  workspaceRoot: string
) => {
  if (!agentStores.has(agentId)) {
    agentStores.set(
      agentId,
      createAgentStore(agentId, agentType, workspaceRoot)
    );
  }
  return agentStores.get(agentId)!;
};

// Utility function to get store without React hook
export const getAgentStore = (
  agentId: string,
  agentType: string,
  workspaceRoot: string
) => {
  if (!agentStores.has(agentId)) {
    agentStores.set(
      agentId,
      createAgentStore(agentId, agentType, workspaceRoot)
    );
  }
  return agentStores.get(agentId)!;
};

// Clean up stores when agents are removed
export const removeAgentStore = (agentId: string) => {
  const store = agentStores.get(agentId);
  if (store) {
    // Cancel any ongoing streaming
    const state = store.getState();
    if (state.abortController) {
      state.abortController.abort();
    }
    agentStores.delete(agentId);
  }
};

// Get all active agent IDs
export const getActiveAgentIds = () => Array.from(agentStores.keys());
