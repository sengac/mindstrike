import type {
  ConversationMessage,
  ImageAttachment,
  NotesAttachment,
} from '../../../../types';

// Message fixtures
export const createMockMessage = (
  overrides: Partial<ConversationMessage> = {}
): ConversationMessage => ({
  id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  role: 'user',
  content: 'Test message content',
  timestamp: new Date(),
  ...overrides,
});

export const mockUserMessage: ConversationMessage = {
  id: 'user-msg-1',
  role: 'user',
  content: 'Hello, how are you?',
  timestamp: new Date('2024-01-01T10:00:00Z'),
};

export const mockAssistantMessage: ConversationMessage = {
  id: 'assistant-msg-1',
  role: 'assistant',
  content: 'I am doing well, thank you for asking!',
  timestamp: new Date('2024-01-01T10:00:30Z'),
  status: 'completed',
  model: 'gpt-4',
};

export const mockStreamingMessage: ConversationMessage = {
  id: 'assistant-msg-2',
  role: 'assistant',
  content: 'This is a streaming',
  timestamp: new Date('2024-01-01T10:01:00Z'),
  status: 'processing',
  model: 'gpt-4',
};

export const mockMessageWithTools: ConversationMessage = {
  id: 'assistant-msg-3',
  role: 'assistant',
  content: 'I will help you with that calculation.',
  timestamp: new Date('2024-01-01T10:02:00Z'),
  status: 'completed',
  model: 'gpt-4',
  toolCalls: [
    {
      id: 'tool-1',
      name: 'calculator',
      parameters: { expression: '2 + 2' },
    },
  ],
  toolResults: [
    {
      name: 'calculator',
      result: { answer: 4 },
    },
  ],
};

// Attachment fixtures
export const mockImageAttachment: ImageAttachment = {
  id: 'img-1',
  filename: 'test-image.png',
  filepath: '/path/to/test-image.png',
  mimeType: 'image/png',
  size: 1024,
  thumbnail: 'data:image/png;base64,thumbnail',
  fullImage: 'data:image/png;base64,fullimage',
  uploadedAt: new Date('2024-01-01T10:00:00Z'),
};

export const mockNotesAttachment: NotesAttachment = {
  id: 'notes-1',
  title: 'Test Notes',
  content: 'These are test notes',
  attachedAt: new Date('2024-01-01T10:00:00Z'),
};

// Thread fixtures
export const mockThreadId = 'thread-123';
export const mockThreadId2 = 'thread-456';

// SSE Event fixtures
export const mockSSEChunkEvent = {
  type: 'content-chunk',
  threadId: mockThreadId,
  data: {
    chunk: ' response',
    messageId: 'assistant-msg-2',
  },
};

export const mockSSEMessageEvent = {
  type: 'message-update',
  threadId: mockThreadId,
  data: {
    message: {
      id: 'assistant-msg-2',
      content: 'This is a streaming response',
      timestamp: new Date('2024-01-01T10:01:00Z').toISOString(),
      status: 'processing',
      model: 'gpt-4',
    },
  },
};

export const mockSSECompletedEvent = {
  type: 'completed',
  threadId: mockThreadId,
  data: {
    message: {
      id: 'assistant-msg-2',
      content: 'This is a streaming response completed',
      timestamp: new Date('2024-01-01T10:01:00Z').toISOString(),
      status: 'completed',
      model: 'gpt-4',
    },
  },
};

export const mockSSECancelledEvent = {
  type: 'cancelled',
  threadId: mockThreadId,
  data: {
    messageId: 'assistant-msg-2',
  },
};

export const mockSSEMessagesDeletedEvent = {
  type: 'messages-deleted',
  threadId: mockThreadId,
  data: {
    messageIds: ['assistant-msg-1', 'user-msg-1'],
  },
};

// Response fixtures
export const mockTitleResponse = {
  title: 'Chat about greetings',
};

export const mockMessageResponse = {
  id: 'assistant-msg-new',
  content: 'This is the response',
  timestamp: new Date().toISOString(),
  model: 'gpt-4',
};

// Error fixtures
export const mockNetworkError = new Error('Network error');
export const mockAPIError = { error: 'API rate limit exceeded' };
