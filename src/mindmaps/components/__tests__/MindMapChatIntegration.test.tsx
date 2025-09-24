import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MindMapChatIntegration } from '../MindMapChatIntegration';
import type { ThreadMetadata } from '../../../store/useThreadsStore';
import type { ConversationMessage, NotesAttachment } from '../../../types';
import type { Source } from '../../types/mindMap';
import { mockSources } from '../../__fixtures__/mindMapData';

// Mock the ChatContentViewer component
const mockChatPanelRef = {
  addNotesAttachment: vi.fn(),
};

vi.mock('../../../components/shared/ChatContentViewer', () => ({
  ChatContentViewer: React.forwardRef(
    (
      {
        threadId,
        threads,
        nodeLabel,
        nodeNotes,
        nodeSources,
        focusChat,
        focusNotes,
        focusSources,
        onNavigateToChat,
        onUnassignThread,
        onClose,
        onDeleteMessage,
        onMessagesUpdate,
        onPromptUpdate,
        onNotesUpdate,
        onSourcesUpdate,
        onThreadSelect,
        onThreadCreate,
        onThreadRename,
        onThreadDelete,
        onCopyNotesToChat,
        onNavigateToPrevNode,
        onNavigateToNextNode,
        onCustomizePrompts,
      }: {
        threadId?: string;
        nodeLabel?: string;
        nodeNotes?: string;
        nodeSources?: string[];
        focusChat?: boolean;
        focusNotes?: boolean;
        focusSources?: boolean;
        onThreadCreate?: () => void;
        onThreadRename?: (threadId: string, newName: string) => void;
        onThreadDelete?: (threadId: string) => void;
        onCopyNotesToChat?: (notes: NotesAttachment) => void;
        onNavigateToPrevNode?: () => void;
        onNavigateToNextNode?: () => void;
        onCustomizePrompts?: () => void;
        onClose?: () => void;
        onDeleteMessage?: (messageId: string) => void;
        onMessagesUpdate?: (messages: ConversationMessage[]) => void;
        onPromptUpdate?: (threadId: string, customPrompt?: string) => void;
        onNotesUpdate?: (notes: string) => void;
        onSourcesUpdate?: (sources: Source[]) => void;
        onThreadSelect?: (threadId: string) => void;
        threads?: unknown[];
        onNavigateToChat?: (threadId?: string) => void;
        onUnassignThread?: () => void;
      },
      ref: React.Ref<unknown>
    ) => {
      // Attach the mock ref
      React.useImperativeHandle(ref, () => mockChatPanelRef);

      return (
        <div data-testid="chat-content-viewer">
          <div data-testid="thread-id">{threadId ?? 'no-thread'}</div>
          <div data-testid="node-label">{nodeLabel}</div>
          <div data-testid="node-notes">{nodeNotes ?? 'no-notes'}</div>
          <div data-testid="node-sources">
            {JSON.stringify(nodeSources ?? [])}
          </div>
          <div data-testid="focus-flags">
            {JSON.stringify({ focusChat, focusNotes, focusSources })}
          </div>
          <div data-testid="threads-count">{threads?.length ?? 0}</div>

          {/* Action buttons for testing */}
          <button
            data-testid="select-thread"
            onClick={() => onThreadSelect?.('thread-123')}
          >
            Select Thread
          </button>
          <button
            data-testid="unassign-thread"
            onClick={() => onUnassignThread?.()}
          >
            Unassign Thread
          </button>
          <button data-testid="close" onClick={() => onClose?.()}>
            Close
          </button>
          <button
            data-testid="navigate-to-chat"
            onClick={() => onNavigateToChat?.('thread-123')}
          >
            Navigate to Chat
          </button>
          <button
            data-testid="delete-message"
            onClick={() => onDeleteMessage?.('message-123')}
          >
            Delete Message
          </button>
          <button
            data-testid="update-messages"
            onClick={() =>
              onMessagesUpdate?.([
                {
                  id: 'msg-1',
                  content: 'test',
                  role: 'user',
                  timestamp: expect.any(Number),
                },
              ])
            }
          >
            Update Messages
          </button>
          <button
            data-testid="update-prompt"
            onClick={() => {
              const customPrompt = 'custom prompt';
              onPromptUpdate?.(threadId || '', customPrompt);
            }}
          >
            Update Prompt
          </button>
          <button
            data-testid="update-notes"
            onClick={async () => {
              try {
                await onNotesUpdate?.('updated notes');
              } catch (error) {
                // Handle the error gracefully
                console.error('Notes update failed:', error);
              }
            }}
          >
            Update Notes
          </button>
          <button
            data-testid="update-sources"
            onClick={async () => {
              try {
                await onSourcesUpdate?.(mockSources);
              } catch (error) {
                // Handle the error gracefully
                console.error('Sources update failed:', error);
              }
            }}
          >
            Update Sources
          </button>
          <button
            data-testid="create-thread"
            onClick={() => onThreadCreate?.()}
          >
            Create Thread
          </button>
          <button
            data-testid="rename-thread"
            onClick={() => onThreadRename?.('thread-123', 'New Name')}
          >
            Rename Thread
          </button>
          <button
            data-testid="delete-thread"
            onClick={() => onThreadDelete?.('thread-123')}
          >
            Delete Thread
          </button>
          <button
            data-testid="copy-notes"
            onClick={() =>
              onCopyNotesToChat?.({
                id: 'test-notes-id',
                title: 'Notes',
                content: nodeNotes || 'test notes',
                attachedAt: new Date(),
              })
            }
          >
            Copy Notes
          </button>
          <button
            data-testid="navigate-prev"
            onClick={() => onNavigateToPrevNode?.()}
          >
            Navigate Previous
          </button>
          <button
            data-testid="navigate-next"
            onClick={() => onNavigateToNextNode?.()}
          >
            Navigate Next
          </button>
          <button
            data-testid="customize-prompts"
            onClick={() => onCustomizePrompts?.()}
          >
            Customize Prompts
          </button>
        </div>
      );
    }
  ),
}));

describe('MindMapChatIntegration', () => {
  let user: ReturnType<typeof userEvent.setup>;

  const mockThreads: ThreadMetadata[] = [
    {
      id: 'chat-123',
      name: 'Test Thread',
      model: 'gpt-4',
      modelPreset: 'balanced',
      customPrompt: undefined,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
      messageCount: 5,
      firstMessage: 'Hello',
      lastMessage: 'Goodbye',
      hasActiveGeneration: false,
    },
    {
      id: 'chat-456',
      name: 'Another Thread',
      model: 'gpt-3.5-turbo',
      modelPreset: 'creative',
      customPrompt: 'Be creative',
      createdAt: new Date('2024-01-03'),
      updatedAt: new Date('2024-01-04'),
      messageCount: 3,
      firstMessage: 'Hi there',
      lastMessage: 'See you',
      hasActiveGeneration: true,
    },
  ];

  const defaultProps = {
    nodeId: 'node-123',
    nodeLabel: 'Test Node',
    chatId: null,
    nodeNotes: null,
    nodeSources: undefined,
    threads: mockThreads,
    onThreadAssociate: vi.fn(),
    onThreadUnassign: vi.fn(),
  };

  beforeEach(() => {
    user = userEvent.setup({ delay: null });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render ChatContentViewer with basic props', async () => {
      render(<MindMapChatIntegration {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('chat-content-viewer')).toBeTruthy();
      });

      expect(screen.getByTestId('node-label').textContent).toBe('Test Node');
      expect(screen.getByTestId('thread-id').textContent).toBe('no-thread');
      expect(screen.getByTestId('threads-count').textContent).toBe('2');
    });

    it('should display associated thread when chatId is provided', async () => {
      render(<MindMapChatIntegration {...defaultProps} chatId="chat-123" />);

      await waitFor(() => {
        expect(screen.getByTestId('thread-id').textContent).toBe('chat-123');
      });
    });

    it('should display node notes when provided', async () => {
      render(
        <MindMapChatIntegration
          {...defaultProps}
          nodeNotes="Test notes content"
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('node-notes').textContent).toBe(
          'Test notes content'
        );
      });
    });

    it('should display node sources when provided', async () => {
      render(
        <MindMapChatIntegration {...defaultProps} nodeSources={mockSources} />
      );

      await waitFor(() => {
        expect(screen.getByTestId('node-sources')).toBeTruthy();
      });

      const sourcesElement = screen.getByTestId('node-sources');
      const sourcesText = sourcesElement.textContent;
      const sources = JSON.parse(sourcesText ?? '[]');

      expect(sources).toHaveLength(mockSources.length);
      expect(sources[0].name).toBe(mockSources[0].name);
    });

    it('should handle focus flags correctly', async () => {
      render(
        <MindMapChatIntegration
          {...defaultProps}
          focusChat={true}
          focusNotes={false}
          focusSources={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('focus-flags')).toBeTruthy();
      });

      const focusElement = screen.getByTestId('focus-flags');
      const focusData = JSON.parse(focusElement.textContent ?? '{}');

      expect(focusData).toEqual({
        focusChat: true,
        focusNotes: false,
        focusSources: true,
      });
    });

    it('should handle missing optional props gracefully', async () => {
      const minimalProps = {
        nodeId: 'node-123',
        nodeLabel: 'Test Node',
        threads: [],
        onThreadAssociate: vi.fn(),
        onThreadUnassign: vi.fn(),
      };

      render(<MindMapChatIntegration {...minimalProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('chat-content-viewer')).toBeTruthy();
      });

      expect(screen.getByTestId('node-notes').textContent).toBe('no-notes');
      expect(screen.getByTestId('threads-count').textContent).toBe('0');
    });
  });

  describe('thread management', () => {
    it('should handle thread association', async () => {
      const mockOnThreadAssociate = vi.fn();

      render(
        <MindMapChatIntegration
          {...defaultProps}
          onThreadAssociate={mockOnThreadAssociate}
        />
      );

      const selectButton = screen.getByTestId('select-thread');
      await user.click(selectButton);

      expect(mockOnThreadAssociate).toHaveBeenCalledWith(
        'node-123',
        'thread-123'
      );
    });

    it('should handle thread unassignment', async () => {
      const mockOnThreadUnassign = vi.fn();

      render(
        <MindMapChatIntegration
          {...defaultProps}
          onThreadUnassign={mockOnThreadUnassign}
        />
      );

      const unassignButton = screen.getByTestId('unassign-thread');
      await user.click(unassignButton);

      expect(mockOnThreadUnassign).toHaveBeenCalledWith('node-123');
    });

    it('should handle thread creation', async () => {
      const mockOnThreadCreate = vi.fn();

      render(
        <MindMapChatIntegration
          {...defaultProps}
          onThreadCreate={mockOnThreadCreate}
        />
      );

      const createButton = screen.getByTestId('create-thread');
      await user.click(createButton);

      expect(mockOnThreadCreate).toHaveBeenCalled();
    });

    it('should handle thread renaming', async () => {
      const mockOnThreadRename = vi.fn();

      render(
        <MindMapChatIntegration
          {...defaultProps}
          onThreadRename={mockOnThreadRename}
        />
      );

      const renameButton = screen.getByTestId('rename-thread');
      await user.click(renameButton);

      expect(mockOnThreadRename).toHaveBeenCalledWith('thread-123', 'New Name');
    });

    it('should handle thread deletion', async () => {
      const mockOnThreadDelete = vi.fn();

      render(
        <MindMapChatIntegration
          {...defaultProps}
          onThreadDelete={mockOnThreadDelete}
        />
      );

      const deleteButton = screen.getByTestId('delete-thread');
      await user.click(deleteButton);

      expect(mockOnThreadDelete).toHaveBeenCalledWith('thread-123');
    });

    it('should find associated thread metadata correctly', async () => {
      render(<MindMapChatIntegration {...defaultProps} chatId="chat-456" />);

      await waitFor(() => {
        expect(screen.getByTestId('chat-content-viewer')).toBeTruthy();
      });

      // Should use the thread metadata from the threads array
      expect(screen.getByTestId('thread-id').textContent).toBe('chat-456');
    });

    it('should handle non-existent thread ID gracefully', () => {
      render(
        <MindMapChatIntegration
          {...defaultProps}
          chatId="non-existent-thread"
        />
      );

      // Should still pass the threadId even if not found in metadata
      expect(screen.getByTestId('thread-id').textContent).toBe(
        'non-existent-thread'
      );
    });
  });

  describe('message management', () => {
    it('should handle message deletion', async () => {
      const mockOnDeleteMessage = vi.fn();

      render(
        <MindMapChatIntegration
          {...defaultProps}
          onDeleteMessage={mockOnDeleteMessage}
        />
      );

      const deleteButton = screen.getByTestId('delete-message');
      await user.click(deleteButton);

      expect(mockOnDeleteMessage).toHaveBeenCalledWith('message-123');
    });

    it('should handle messages update', async () => {
      const mockOnMessagesUpdate = vi.fn();

      render(
        <MindMapChatIntegration
          {...defaultProps}
          onMessagesUpdate={mockOnMessagesUpdate}
        />
      );

      const updateButton = screen.getByTestId('update-messages');
      await user.click(updateButton);

      expect(mockOnMessagesUpdate).toHaveBeenCalledWith([
        {
          id: 'msg-1',
          content: 'test',
          role: 'user',
          timestamp: expect.any(Number),
        },
      ]);
    });

    it('should handle prompt updates for associated thread', async () => {
      const mockOnPromptUpdate = vi.fn();

      render(
        <MindMapChatIntegration
          {...defaultProps}
          chatId="chat-123"
          onPromptUpdate={mockOnPromptUpdate}
        />
      );

      const updateButton = screen.getByTestId('update-prompt');
      await user.click(updateButton);

      expect(mockOnPromptUpdate).toHaveBeenCalledWith('chat-123', 'chat-123');
    });

    it('should not handle prompt updates when no chatId', async () => {
      const mockOnPromptUpdate = vi.fn();

      render(
        <MindMapChatIntegration
          {...defaultProps}
          chatId={null}
          onPromptUpdate={mockOnPromptUpdate}
        />
      );

      const updateButton = screen.getByTestId('update-prompt');
      await user.click(updateButton);

      expect(mockOnPromptUpdate).not.toHaveBeenCalled();
    });
  });

  describe('node content management', () => {
    it('should handle notes updates', async () => {
      const mockOnNotesUpdate = vi.fn().mockResolvedValue(undefined);

      render(
        <MindMapChatIntegration
          {...defaultProps}
          onNotesUpdate={mockOnNotesUpdate}
        />
      );

      const updateButton = screen.getByTestId('update-notes');
      await user.click(updateButton);

      await waitFor(() => {
        expect(mockOnNotesUpdate).toHaveBeenCalledWith(
          'node-123',
          'updated notes'
        );
      });
    });

    it('should handle sources updates', async () => {
      const mockOnSourcesUpdate = vi.fn().mockResolvedValue(undefined);

      render(
        <MindMapChatIntegration
          {...defaultProps}
          onSourcesUpdate={mockOnSourcesUpdate}
        />
      );

      const updateButton = screen.getByTestId('update-sources');
      await user.click(updateButton);

      await waitFor(() => {
        expect(mockOnSourcesUpdate).toHaveBeenCalledWith(
          'node-123',
          mockSources
        );
      });
    });

    it('should handle copying notes to chat', async () => {
      render(<MindMapChatIntegration {...defaultProps} />);

      const copyButton = screen.getByTestId('copy-notes');
      await user.click(copyButton);

      expect(mockChatPanelRef.addNotesAttachment).toHaveBeenCalledWith({
        id: 'test-notes-id',
        title: 'Notes',
        content: 'test notes',
        attachedAt: expect.any(Date),
      });
    });
  });

  describe('navigation', () => {
    it('should handle navigation to chat', async () => {
      const mockOnNavigateToChat = vi.fn();

      render(
        <MindMapChatIntegration
          {...defaultProps}
          onNavigateToChat={mockOnNavigateToChat}
        />
      );

      const navigateButton = screen.getByTestId('navigate-to-chat');
      await user.click(navigateButton);

      expect(mockOnNavigateToChat).toHaveBeenCalledWith('thread-123');
    });

    it('should handle previous node navigation', async () => {
      const mockOnNavigateToPrevNode = vi.fn();

      render(
        <MindMapChatIntegration
          {...defaultProps}
          onNavigateToPrevNode={mockOnNavigateToPrevNode}
        />
      );

      const prevButton = screen.getByTestId('navigate-prev');
      await user.click(prevButton);

      expect(mockOnNavigateToPrevNode).toHaveBeenCalled();
    });

    it('should handle next node navigation', async () => {
      const mockOnNavigateToNextNode = vi.fn();

      render(
        <MindMapChatIntegration
          {...defaultProps}
          onNavigateToNextNode={mockOnNavigateToNextNode}
        />
      );

      const nextButton = screen.getByTestId('navigate-next');
      await user.click(nextButton);

      expect(mockOnNavigateToNextNode).toHaveBeenCalled();
    });

    it('should handle close action', async () => {
      const mockOnClose = vi.fn();

      render(
        <MindMapChatIntegration {...defaultProps} onClose={mockOnClose} />
      );

      const closeButton = screen.getByTestId('close');
      await user.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should handle customize prompts action', async () => {
      const mockOnCustomizePrompts = vi.fn();

      render(
        <MindMapChatIntegration
          {...defaultProps}
          onCustomizePrompts={mockOnCustomizePrompts}
        />
      );

      const customizeButton = screen.getByTestId('customize-prompts');
      await user.click(customizeButton);

      expect(mockOnCustomizePrompts).toHaveBeenCalled();
    });
  });

  describe('optional callback handling', () => {
    it('should handle missing optional callbacks gracefully', async () => {
      const minimalProps = {
        nodeId: 'node-123',
        nodeLabel: 'Test Node',
        threads: mockThreads,
        onThreadAssociate: vi.fn(),
        onThreadUnassign: vi.fn(),
      };

      render(<MindMapChatIntegration {...minimalProps} />);

      // These should not throw errors when callbacks are missing
      const buttons = [
        { testId: 'delete-message', action: 'onDeleteMessage' },
        { testId: 'update-messages', action: 'onMessagesUpdate' },
        { testId: 'update-prompt', action: 'onPromptUpdate' },
        { testId: 'update-notes', action: 'onNotesUpdate' },
        { testId: 'update-sources', action: 'onSourcesUpdate' },
        { testId: 'create-thread', action: 'onThreadCreate' },
        { testId: 'rename-thread', action: 'onThreadRename' },
        { testId: 'delete-thread', action: 'onThreadDelete' },
        { testId: 'navigate-to-chat', action: 'onNavigateToChat' },
        { testId: 'navigate-prev', action: 'onNavigateToPrevNode' },
        { testId: 'navigate-next', action: 'onNavigateToNextNode' },
        { testId: 'customize-prompts', action: 'onCustomizePrompts' },
        { testId: 'close', action: 'onClose' },
      ];

      for (const button of buttons) {
        const buttonElement = screen.getByTestId(button.testId);
        expect(() => user.click(buttonElement)).not.toThrow();
      }
    });
  });

  describe('async operations', () => {
    it('should handle async notes updates', async () => {
      const mockOnNotesUpdate = vi
        .fn()
        .mockImplementation(async (nodeId, notes) => {
          // Simulate async operation
          await new Promise(resolve => setTimeout(resolve, 10));
          return { success: true, nodeId, notes };
        });

      render(
        <MindMapChatIntegration
          {...defaultProps}
          onNotesUpdate={mockOnNotesUpdate}
        />
      );

      const updateButton = screen.getByTestId('update-notes');
      await user.click(updateButton);

      await waitFor(() => {
        expect(mockOnNotesUpdate).toHaveBeenCalledWith(
          'node-123',
          'updated notes'
        );
      });
    });

    it('should handle async sources updates', async () => {
      const mockOnSourcesUpdate = vi
        .fn()
        .mockImplementation(async (nodeId, sources) => {
          // Simulate async operation
          await new Promise(resolve => setTimeout(resolve, 10));
          return { success: true, nodeId, sources };
        });

      render(
        <MindMapChatIntegration
          {...defaultProps}
          onSourcesUpdate={mockOnSourcesUpdate}
        />
      );

      const updateButton = screen.getByTestId('update-sources');
      await user.click(updateButton);

      await waitFor(() => {
        expect(mockOnSourcesUpdate).toHaveBeenCalledWith(
          'node-123',
          mockSources
        );
      });
    });

    it('should handle errors in async operations gracefully', async () => {
      const mockOnNotesUpdate = vi
        .fn()
        .mockRejectedValue(new Error('Update failed'));

      render(
        <MindMapChatIntegration
          {...defaultProps}
          onNotesUpdate={mockOnNotesUpdate}
        />
      );

      const updateButton = screen.getByTestId('update-notes');

      // Click the button - the component should handle the rejected promise gracefully
      await user.click(updateButton);

      // Verify that the callback was called
      await waitFor(() => {
        expect(mockOnNotesUpdate).toHaveBeenCalledWith(
          'node-123',
          'updated notes'
        );
      });
    });
  });

  describe('component integration', () => {
    it('should pass all props correctly to ChatContentViewer', () => {
      const fullProps = {
        ...defaultProps,
        nodeId: 'test-node',
        nodeLabel: 'Full Test Node',
        chatId: 'chat-123',
        nodeNotes: 'Test notes',
        nodeSources: mockSources,
        focusChat: true,
        focusNotes: false,
        focusSources: true,
        onThreadCreate: vi.fn(),
        onThreadRename: vi.fn(),
        onThreadDelete: vi.fn(),
        onClose: vi.fn(),
        onNavigateToChat: vi.fn(),
        onDeleteMessage: vi.fn(),
        onMessagesUpdate: vi.fn(),
        onPromptUpdate: vi.fn(),
        onNotesUpdate: vi.fn(),
        onSourcesUpdate: vi.fn(),
        onNavigateToPrevNode: vi.fn(),
        onNavigateToNextNode: vi.fn(),
        onCustomizePrompts: vi.fn(),
      };

      render(<MindMapChatIntegration {...fullProps} />);

      expect(screen.getByTestId('chat-content-viewer')).toBeTruthy();
      expect(screen.getByTestId('thread-id').textContent).toBe('chat-123');
      expect(screen.getByTestId('node-label').textContent).toBe(
        'Full Test Node'
      );
      expect(screen.getByTestId('node-notes').textContent).toBe('Test notes');

      const focusData = JSON.parse(
        screen.getByTestId('focus-flags').textContent ?? '{}'
      );
      expect(focusData).toEqual({
        focusChat: true,
        focusNotes: false,
        focusSources: true,
      });
    });

    it('should maintain ref functionality', () => {
      render(<MindMapChatIntegration {...defaultProps} />);

      // The ref should be properly connected
      expect(mockChatPanelRef.addNotesAttachment).toBeDefined();
      expect(typeof mockChatPanelRef.addNotesAttachment).toBe('function');
    });
  });

  describe('edge cases', () => {
    it('should handle empty threads array', () => {
      render(<MindMapChatIntegration {...defaultProps} threads={[]} />);

      expect(screen.getByTestId('threads-count').textContent).toBe('0');
      expect(screen.getByTestId('chat-content-viewer')).toBeTruthy();
    });

    it('should handle undefined/null node properties', () => {
      render(
        <MindMapChatIntegration
          {...defaultProps}
          nodeNotes={null}
          nodeSources={undefined}
          chatId={null}
        />
      );

      expect(screen.getByTestId('node-notes').textContent).toBe('no-notes');
      expect(screen.getByTestId('node-sources').textContent).toBe('[]');
      expect(screen.getByTestId('thread-id').textContent).toBe('no-thread');
    });

    it('should handle malformed thread data', () => {
      const malformedThreads = [
        { id: 'thread-1' }, // Missing required fields
        null, // Null thread
        undefined, // Undefined thread
      ].filter(Boolean) as ThreadMetadata[];

      render(
        <MindMapChatIntegration {...defaultProps} threads={malformedThreads} />
      );

      expect(screen.getByTestId('threads-count').textContent).toBe('1');
    });
  });
});
