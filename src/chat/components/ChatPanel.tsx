import React, {
  useState,
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';
import {
  Send,
  Loader2,
  Github,
  Youtube,
  Trash2,
  User,
  X,
  Square,
  Bot,
  ImageIcon,
} from 'lucide-react';
import { MindStrikeIcon } from '../../components/MindStrikeIcon';
import { DiscordIcon } from '../../components/DiscordIcon';
import { ChatMessage } from './ChatMessage';
import { PersonalityModal } from '../../settings/components/PersonalityModal';
import { ValidationStatusNotification } from '../../components/ValidationStatusNotification';
import { LocalModelLoadDialog } from '../../components/LocalModelLoadDialog';
import { MusicVisualization } from '../../components/MusicVisualization';
import { useDialogAnimation } from '../../hooks/useDialogAnimation';
import toast from 'react-hot-toast';

import { useChatRefactored } from '../hooks/useChatRefactored';
import { useAppStore } from '../../store/useAppStore';
import { useModelsStore } from '../../store/useModelsStore';
import { useTaskStore } from '../../store/useTaskStore';
import { WorkflowProgress } from './WorkflowProgress';
import { TypingIndicator } from './TypingIndicator';
import {
  ConversationMessage,
  Thread,
  ImageAttachment,
  NotesAttachment,
} from '../../types';

interface ChatPanelProps {
  threadId?: string;
  messages?: ConversationMessage[];
  onMessagesUpdate?: (messages: ConversationMessage[]) => void;
  onDeleteMessage?: (messageId: string) => void;
  activeThread?: Thread | null;
  onRoleUpdate?: (threadId: string, customRole?: string) => void;
  onNavigateToWorkspaces?: () => void;
  onCopyToNotes?: (content: string) => void;
}

export interface ChatPanelRef {
  clearConversation: () => void;
  addNotesAttachment: (notes: NotesAttachment) => void;
}

export const ChatPanel = forwardRef<ChatPanelRef, ChatPanelProps>(
  (
    {
      threadId,
      messages: _initialMessages = [],
      onMessagesUpdate: _onMessagesUpdate,
      onDeleteMessage,
      activeThread,
      onRoleUpdate,
      onNavigateToWorkspaces,
      onCopyToNotes,
    },
    ref
  ) => {
    const [input, setInput] = useState('');
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [showPersonalityModal, setShowPersonalityModal] = useState(false);
    const [defaultRole, setDefaultRole] = useState('');
    const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([]);
    const [attachedNotes, setAttachedNotes] = useState<NotesAttachment[]>([]);
    const [chatLoadTime, setChatLoadTime] = useState<number>(0);
    const [isAgentActive, setIsAgentActive] = useState(false);
    const { fontSize, workspaceRoot, defaultCustomRole } = useAppStore();
    const { getDefaultModel } = useModelsStore();
    const { currentWorkflow, workflows } = useTaskStore();
    const currentModel = getDefaultModel();
    const isLocalModel = currentModel?.type === 'local';

    const {
      shouldRender: shouldRenderClearConfirm,
      isVisible: isClearConfirmVisible,
      handleClose: handleCloseClearConfirm,
    } = useDialogAnimation(showClearConfirm, () => setShowClearConfirm(false));
    const {
      messages,
      isLoading,
      isLoadingThread,
      sendMessage,
      clearConversation,
      cancelStreaming,
      regenerateMessage,
      editMessage,
      cancelToolCalls,
      retryLastMessage,
      validation,
      localModelError,
      clearLocalModelError,
    } = useChatRefactored({
      threadId,
      isAgentMode: isAgentActive,
    });

    // console.log('[ChatPanel] ThreadId:', threadId, 'Messages:', messages?.length, 'isLoading:', isLoading);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useImperativeHandle(ref, () => ({
      clearConversation,
      addNotesAttachment: (notes: NotesAttachment) => {
        setAttachedNotes(prev => [...prev, notes]);
      },
    }));

    const scrollToBottom = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const scrollToBottomIfNotRecentLoad = () => {
      const timeSinceLoad = Date.now() - chatLoadTime;
      if (timeSinceLoad < 2000) {
        // Only scroll if less than 2 seconds since chat loaded
        scrollToBottom();
      }
    };

    // Create stable callback functions that never change reference
    const handleDeleteMessage = useCallback(
      (messageId: string) => {
        onDeleteMessage?.(messageId);
      },
      [onDeleteMessage]
    );

    const handleRegenerateMessage = useCallback(
      (messageId: string) => {
        regenerateMessage(messageId);
      },
      [regenerateMessage]
    );

    const handleEditMessage = useCallback(
      (messageId: string, newContent: string) => {
        editMessage(messageId, newContent);
      },
      [editMessage]
    );

    const handleCancelToolCalls = useCallback(
      (messageId: string) => {
        cancelToolCalls(messageId);
      },
      [cancelToolCalls]
    );

    // Set chat load time on mount
    useEffect(() => {
      setChatLoadTime(Date.now());
    }, []);

    useEffect(() => {
      scrollToBottom();
    }, [messages]);

    // Note: Workflow SSE is now connected globally in the TaskStore

    // Listen for mermaid render completion to scroll to bottom
    useEffect(() => {
      const container = messagesContainerRef.current;
      if (!container) return;

      // Only set up listener if there are mermaid code blocks in the messages
      const hasMermaidContent = messages.some(
        message => message.content && message.content.includes('```mermaid')
      );
      if (!hasMermaidContent) return;

      const handleMermaidComplete = (_event: Event) => {
        // Clear any existing timeout to debounce multiple diagram completions
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }

        // Set new timeout to scroll after all diagrams have finished (50ms debounce)
        scrollTimeoutRef.current = setTimeout(() => {
          scrollToBottomIfNotRecentLoad();
        }, 50);
      };

      container.addEventListener(
        'mermaidRenderComplete',
        handleMermaidComplete
      );

      return () => {
        container.removeEventListener(
          'mermaidRenderComplete',
          handleMermaidComplete
        );
        // Clear any pending scroll timeout on cleanup
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
      };
    }, [messages, chatLoadTime]);

    // Scroll to bottom when thread changes and reset load timer
    useEffect(() => {
      if (threadId) {
        scrollToBottom();
        setChatLoadTime(Date.now()); // Reset timer when switching threads
      }
    }, [threadId]);

    // Auto-focus input when loading finishes (response completes)
    useEffect(() => {
      if (!isLoading && textareaRef.current) {
        textareaRef.current.focus();
      }
    }, [isLoading]);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (
        (!input.trim() &&
          attachedImages.length === 0 &&
          attachedNotes.length === 0) ||
        isLoading
      )
        return;

      const message = input.trim();
      const images = [...attachedImages];
      const notes = [...attachedNotes];
      setInput('');
      setAttachedImages([]);
      setAttachedNotes([]);
      await sendMessage(message, images, notes);
    };

    const handleImageUpload = async (
      event: React.ChangeEvent<HTMLInputElement>
    ) => {
      const files = event.target.files;
      if (!files) return;

      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          toast.error('Please select only image files.');
          continue;
        }

        if (file.size > 10 * 1024 * 1024) {
          // 10MB limit
          toast.error('Image size must be less than 10MB.');
          continue;
        }

        try {
          // Create thumbnail for UI display
          const thumbnail = await createThumbnail(file);
          // Create full-size image for LLM (with reasonable max size to avoid huge payloads)
          const fullImage = await createFullSizeImage(file);

          const imageAttachment: ImageAttachment = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            filename: file.name,
            filepath: file.name, // Will be updated when saved to server
            mimeType: file.type,
            size: file.size,
            thumbnail,
            fullImage,
            uploadedAt: new Date(),
          };

          setAttachedImages(prev => [...prev, imageAttachment]);
        } catch (error) {
          console.error('Error processing image:', error);
          toast.error('Error processing image. Please try again.');
        }
      }

      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };

    const createThumbnail = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = () => {
          const maxSize = 400; // Thumbnail size for UI display
          let { width, height } = img;

          // Calculate new dimensions while maintaining aspect ratio
          if (width > height) {
            if (width > maxSize) {
              height = (height * maxSize) / width;
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = (width * maxSize) / height;
              height = maxSize;
            }
          }

          canvas.width = width;
          canvas.height = height;

          // Enable image smoothing for better quality
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
          }

          // Use PNG for better quality (no compression artifacts)
          resolve(canvas.toDataURL('image/png'));
        };

        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
    };

    const createFullSizeImage = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = () => {
          const maxSize = 1920; // High quality for LLM analysis while keeping payload reasonable
          let { width, height } = img;

          // Only resize if image is larger than maxSize
          if (width > maxSize || height > maxSize) {
            if (width > height) {
              if (width > maxSize) {
                height = (height * maxSize) / width;
                width = maxSize;
              }
            } else {
              if (height > maxSize) {
                width = (width * maxSize) / height;
                height = maxSize;
              }
            }
          }

          canvas.width = width;
          canvas.height = height;

          // Enable image smoothing for better quality
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
          }

          // Use JPEG with high quality for better compression on large images
          resolve(canvas.toDataURL('image/jpeg', 0.9));
        };

        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
    };

    const removeImage = (imageId: string) => {
      setAttachedImages(prev => prev.filter(img => img.id !== imageId));
    };

    const removeNotes = (notesId: string) => {
      setAttachedNotes(prev => prev.filter(notes => notes.id !== notesId));
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    };

    const adjustTextareaHeight = () => {
      const textarea = textareaRef.current;
      if (textarea) {
        if (!textarea.value) {
          // Calculate proper baseline height for empty textarea
          const originalValue = textarea.value;
          textarea.value = 'X'; // Single character to measure baseline
          textarea.style.height = 'auto';
          textarea.style.overflowY = 'hidden';
          const baselineHeight = textarea.scrollHeight;
          textarea.value = originalValue; // Restore empty value
          textarea.style.height = baselineHeight + 'px';
        } else {
          textarea.style.height = 'auto';
          textarea.style.overflowY = 'hidden';
          textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
        }
      }
    };

    useEffect(() => {
      adjustTextareaHeight();
    }, [input]);

    // Fetch default role when component mounts or thread changes
    useEffect(() => {
      const fetchDefaultRole = async () => {
        try {
          const response = await fetch(`/api/role/${threadId || 'default'}`);
          if (response.ok) {
            const data = await response.json();
            setDefaultRole(data.defaultRole);
          }
        } catch (error) {
          console.error('Failed to fetch default role:', error);
        }
      };

      fetchDefaultRole();
    }, [threadId]);

    // Get current role from activeThread or fallback to default
    const currentRole =
      activeThread?.customRole || defaultCustomRole || defaultRole;

    const handleRoleChange = async (customRole?: string) => {
      const currentThreadId = threadId || 'default';

      // Update thread data through parent callback
      if (onRoleUpdate) {
        await onRoleUpdate(currentThreadId, customRole);
      }

      // Update server agent
      try {
        const response = await fetch(`/api/role/${currentThreadId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ customRole }),
        });

        if (!response.ok) {
          console.error('Failed to update role on server');
        }
      } catch (error) {
        console.error('Failed to update role:', error);
      }
    };

    return (
      <div
        className="flex flex-col h-full flex-1 relative"
        key={`chat-panel-${fontSize}`}
      >
        {/* Floating Validation Status Notification */}
        <div className="absolute top-4 left-4 right-4 z-20 pointer-events-none">
          <div className="pointer-events-auto">
            <ValidationStatusNotification
              isVisible={validation.showNotification}
              progress={validation.validationProgress}
              onDismiss={validation.dismissNotification}
              onToggleValidation={validation.setValidationEnabled}
              validationEnabled={validation.validationEnabled}
            />
          </div>
        </div>

        {/* Messages */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 relative"
          style={
            { '--dynamic-font-size': `${fontSize}px` } as React.CSSProperties
          }
        >
          {/* Music Visualization Background */}
          <MusicVisualization className="absolute inset-0 w-full h-full pointer-events-none" />
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-2 relative z-10">
              <div className="mb-4">
                <div className="flex items-center justify-center mx-auto">
                  <MindStrikeIcon size={128} />
                </div>
                <h3 className="text-lg font-medium mb-2">
                  Welcome to{' '}
                  <a
                    href="https://mindstrike.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-600 underline"
                  >
                    MindStrike
                  </a>
                  &trade;
                </h3>
                <div className="flex justify-center space-x-4 mb-4">
                  <a
                    href="https://mindstrike.ai/link/github"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-white transition-colors"
                    title="MindStrike GitHub Repository"
                  >
                    <Github size={24} />
                  </a>
                  <a
                    href="https://mindstrike.ai/link/youtube"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    title="MindStrike YouTube Channel"
                  >
                    <Youtube size={24} />
                  </a>
                  <a
                    href="https://mindstrike.ai/link/discord"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-indigo-500 transition-colors"
                    title="MindStrike Discord Server"
                  >
                    <DiscordIcon size={24} />
                  </a>
                </div>
                <p className="text-sm mt-8">
                  Use Agent Mode{' '}
                  <span className="inline-flex items-center mx-1 p-1 border border-gray-600 rounded bg-gray-800">
                    <Bot size={12} className="text-gray-400" />
                  </span>{' '}
                  for complex tasks that need tools and workflows.
                </p>
                <p className="text-sm mt-4">
                  Start a conversation with your current workspace:
                </p>
                <div className="flex items-center justify-center gap-3 mt-1">
                  <p className="text-xs font-mono text-gray-400">
                    {workspaceRoot || 'No workspace selected'}
                  </p>
                  {onNavigateToWorkspaces && (
                    <button
                      onClick={onNavigateToWorkspaces}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors underline"
                    >
                      Change
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {messages.map(message => (
            <div
              key={`message-wrapper-${message.id}`}
              className="relative z-10"
            >
              <ChatMessage
                key={message.id}
                message={message}
                fontSize={fontSize}
                onDelete={onDeleteMessage ? handleDeleteMessage : undefined}
                onRegenerate={
                  message.role === 'assistant'
                    ? handleRegenerateMessage
                    : undefined
                }
                onEdit={message.role === 'user' ? handleEditMessage : undefined}
                onCancelToolCalls={
                  message.status === 'processing' &&
                  message.toolCalls &&
                  message.toolCalls.length > 0
                    ? handleCancelToolCalls
                    : undefined
                }
                onCopyToNotes={
                  message.role === 'assistant' ? onCopyToNotes : undefined
                }
              />
            </div>
          ))}

          {isLoading &&
            !isLoadingThread &&
            !messages.some(
              msg => msg.role === 'assistant' && msg.status === 'processing'
            ) && (
              <div className="relative z-10">
                {isAgentActive ? (
                  (() => {
                    // Show current workflow or most recent completed workflow (within last 10 seconds)
                    const workflowToShow =
                      currentWorkflow ||
                      workflows
                        .filter(
                          w =>
                            w.completedAt &&
                            Date.now() - w.completedAt.getTime() < 10000
                        )
                        .sort(
                          (a, b) =>
                            (b.completedAt?.getTime() || 0) -
                            (a.completedAt?.getTime() || 0)
                        )[0];

                    return workflowToShow ? (
                      <WorkflowProgress
                        workflowId={workflowToShow.id}
                        className="mb-4"
                      />
                    ) : (
                      <div className="p-4 bg-gray-800 rounded-lg border border-gray-700 mb-4">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                          <span className="text-gray-300">
                            Finalizing response...
                          </span>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <TypingIndicator className="mb-4" />
                )}
              </div>
            )}

          <div ref={messagesEndRef} className="relative z-10" />
        </div>

        {/* Input */}
        <div className="border-t border-gray-700 p-4">
          {/* Image preview area */}
          {attachedImages.length > 0 && (
            <div className="mb-4 p-3 bg-gray-800 rounded-lg border border-gray-600">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-300">
                  Attached Images ({attachedImages.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {attachedImages.map(image => (
                  <div key={image.id} className="relative group">
                    <img
                      src={image.thumbnail}
                      alt={image.filename}
                      className="w-16 h-16 object-cover rounded border border-gray-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(image.id)}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={10} className="text-white" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-xs text-white p-1 rounded-b truncate">
                      {image.filename}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes preview area */}
          {attachedNotes.length > 0 && (
            <div className="mb-4 p-3 bg-gray-800 rounded-lg border border-gray-600">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-300">
                  Attached Notes ({attachedNotes.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {attachedNotes.map(note => (
                  <div
                    key={note.id}
                    className="relative group bg-gray-700 rounded p-3 border border-gray-500 max-w-xs"
                  >
                    <button
                      type="button"
                      onClick={() => removeNotes(note.id)}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={10} className="text-white" />
                    </button>
                    <div className="text-xs font-medium text-blue-400 truncate mb-1">
                      {note.title}
                    </div>
                    {note.nodeLabel && (
                      <div className="text-xs text-gray-400 mb-2">
                        From: {note.nodeLabel}
                      </div>
                    )}
                    <div className="text-xs text-gray-300 line-clamp-3">
                      {note.content.slice(0, 100)}
                      {note.content.length > 100 && '...'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex items-center space-x-4">
            <div className="flex-1 flex items-center bg-dark-hover rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask MindStrike anything..."
                className="flex-1 bg-transparent px-4 py-3 text-sm resize-none focus:outline-none overflow-y-auto"
                style={{ overflowY: input.includes('\n') ? 'auto' : 'hidden' }}
                rows={1}
                disabled={isLoading}
              />
              {isLoading ? (
                <button
                  type="button"
                  onClick={cancelStreaming}
                  className="flex-shrink-0 mr-2 p-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                  title="Cancel streaming"
                >
                  <Square size={16} className="text-white" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={
                    !input.trim() &&
                    attachedImages.length === 0 &&
                    attachedNotes.length === 0
                  }
                  className="flex-shrink-0 mr-2 p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  <Send size={16} className="text-white" />
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => setIsAgentActive(!isAgentActive)}
              className={`relative p-2 border rounded-lg transition-all duration-300 ${
                isAgentActive
                  ? 'border-blue-400 bg-blue-900/30 shadow-lg shadow-blue-500/30 text-blue-300'
                  : 'border-gray-600 hover:bg-gray-800 text-gray-400 hover:text-gray-200'
              }`}
              title="Agent Mode"
              data-test-id="agent-mode-button"
            >
              <div
                className={`transition-all duration-300 ${isAgentActive ? 'scale-110' : 'scale-100'}`}
              >
                <Bot
                  size={16}
                  className={`transition-all duration-300 ${
                    isAgentActive
                      ? 'text-blue-300 animate-pulse'
                      : 'text-gray-400'
                  }`}
                />
              </div>
              {isAgentActive && (
                <div className="absolute inset-0 rounded-lg bg-blue-400/20 animate-ping"></div>
              )}
            </button>
            <div className="relative group">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || isLocalModel}
                className="p-2 border border-gray-600 hover:bg-gray-800 disabled:bg-gray-900 disabled:border-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors text-gray-400 hover:text-gray-200 disabled:text-gray-600"
                title={!isLocalModel ? 'Attach images' : undefined}
              >
                <ImageIcon size={16} />
              </button>
              {isLocalModel && (
                <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-900 text-yellow-300 text-sm rounded-lg shadow-lg border border-gray-600 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                  <div className="flex items-center gap-2">
                    <ImageIcon size={12} className="text-yellow-400" />
                    <span>
                      Multimodal support is not available for built-in models
                    </span>
                  </div>
                  <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowPersonalityModal(true)}
              className="relative p-2 border border-gray-600 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-gray-200"
              title="Change personality"
            >
              <User size={16} />
              {activeThread?.customRole && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></div>
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              disabled={messages.length === 0}
              className="p-2 border border-gray-600 hover:bg-gray-800 disabled:bg-gray-900 disabled:border-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors text-gray-400 hover:text-gray-200 disabled:text-gray-600"
              title="Clear conversation"
            >
              <Trash2 size={16} />
            </button>
          </form>
          <p className="text-xs text-gray-500 mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>

        {/* Clear Confirmation Modal */}
        {shouldRenderClearConfirm && (
          <div
            className={`fixed inset-0 bg-black flex items-center justify-center z-50 transition-opacity duration-250 ease-out ${
              isClearConfirmVisible ? 'bg-opacity-50' : 'bg-opacity-0'
            }`}
            onClick={handleCloseClearConfirm}
          >
            <div
              className={`bg-gray-800 border border-gray-600 rounded-lg p-6 max-w-md w-full mx-4 transition-all duration-250 ease-out ${
                isClearConfirmVisible
                  ? 'scale-100 opacity-100'
                  : 'scale-95 opacity-0'
              }`}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 size={20} className="text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-white">
                    Clear Conversation
                  </h3>
                  <p className="text-sm text-gray-400">
                    This action cannot be undone.
                  </p>
                </div>
              </div>

              <p className="text-gray-300 mb-6">
                Are you sure you want to clear the entire conversation? All
                messages will be permanently deleted.
              </p>

              <div className="flex space-x-3 justify-end">
                <button
                  onClick={handleCloseClearConfirm}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    clearConversation();
                    handleCloseClearConfirm();
                  }}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                >
                  Clear Chat
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Personality Modal */}
        {showPersonalityModal && (
          <PersonalityModal
            isOpen={showPersonalityModal}
            onClose={() => setShowPersonalityModal(false)}
            currentRole={currentRole}
            defaultRole={defaultRole}
            onRoleChange={handleRoleChange}
          />
        )}

        {/* Local Model Load Dialog */}
        {localModelError && (
          <LocalModelLoadDialog
            isOpen={!!localModelError}
            onClose={clearLocalModelError}
            targetModelId={localModelError.modelId}
            onModelLoaded={() => {
              clearLocalModelError();
              // Retry the last message without adding it to the chat again
              retryLastMessage();
            }}
          />
        )}
      </div>
    );
  }
);
