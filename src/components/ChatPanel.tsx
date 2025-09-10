import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Send, Loader2, Github, Youtube, Trash2, User, Paperclip, X } from 'lucide-react';
import { MindStrikeIcon } from './MindStrikeIcon';
import { ChatMessage } from './ChatMessage';
import { PersonalityModal } from './PersonalityModal';
import { ValidationStatusNotification } from './ValidationStatusNotification';

import { useChat } from '../hooks/useChat';
import { useAppStore } from '../store/useAppStore';
import { ConversationMessage, Thread, ImageAttachment } from '../types';

interface ChatPanelProps {
  threadId?: string;
  messages?: ConversationMessage[];
  onMessagesUpdate?: (messages: ConversationMessage[]) => void;
  onFirstMessage?: () => void;
  onDeleteMessage?: (messageId: string) => void;
  activeThread?: Thread | null;
  onRoleUpdate?: (threadId: string, customRole?: string) => void;
  onNavigateToWorkspaces?: () => void;
}

export interface ChatPanelRef {
  clearConversation: () => void;
}

export const ChatPanel = forwardRef<ChatPanelRef, ChatPanelProps>(({ threadId, messages: initialMessages = [], onMessagesUpdate, onFirstMessage, onDeleteMessage, activeThread, onRoleUpdate, onNavigateToWorkspaces }, ref) => {
  const [input, setInput] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showPersonalityModal, setShowPersonalityModal] = useState(false);
  const [defaultRole, setDefaultRole] = useState('');
  const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([]);
  const { fontSize, workspaceRoot, defaultCustomRole } = useAppStore();
  const { messages, isLoading, sendMessage, clearConversation, regenerateMessage, cancelToolCalls, editMessage, validation } = useChat({
    threadId,
    messages: initialMessages,
    onMessagesUpdate,
    onFirstMessage
  });


  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    clearConversation
  }));

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Create truly stable callbacks that don't change on re-renders
  const stableCallbacks = useRef({
    onDelete: onDeleteMessage,
    onRegenerate: regenerateMessage,
    onEdit: editMessage,
    onCancelToolCalls: cancelToolCalls
  });

  // Update refs when the actual functions change
  useEffect(() => {
    stableCallbacks.current = {
      onDelete: onDeleteMessage,
      onRegenerate: regenerateMessage, 
      onEdit: editMessage,
      onCancelToolCalls: cancelToolCalls
    };
  }, [onDeleteMessage, regenerateMessage, editMessage, cancelToolCalls]);

  // Create stable callback functions that never change reference
  const handleDeleteMessage = useCallback((messageId: string) => {
    stableCallbacks.current.onDelete?.(messageId);
  }, []);

  const handleRegenerateMessage = useCallback((messageId: string) => {
    stableCallbacks.current.onRegenerate(messageId);
  }, []);

  const handleEditMessage = useCallback((messageId: string, newContent: string) => {
    stableCallbacks.current.onEdit(messageId, newContent);
  }, []);

  const handleCancelToolCalls = useCallback((messageId: string) => {
    stableCallbacks.current.onCancelToolCalls(messageId);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Scroll to bottom when thread changes (wait for mermaid rendering)
  useEffect(() => {
    if (threadId) {
      const waitForMermaidAndScroll = async () => {
        // Wait for DOM to update first
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Check for mermaid elements and wait for them to render
        const mermaidElements = document.querySelectorAll('.mermaid');
        
        if (mermaidElements.length > 0) {
          // Wait for all mermaid diagrams to render
          const checkInterval = 50;
          const maxWaitTime = 3000; // 3 seconds max wait
          let elapsed = 0;
          
          const waitForRendering = () => {
            const allRendered = Array.from(mermaidElements).every(element => {
              const svg = element.querySelector('svg');
              return svg && svg.children.length > 0;
            });
            
            if (allRendered || elapsed >= maxWaitTime) {
              scrollToBottom();
            } else {
              elapsed += checkInterval;
              setTimeout(waitForRendering, checkInterval);
            }
          };
          
          waitForRendering();
        } else {
          // No mermaid elements, scroll immediately
          scrollToBottom();
        }
      };
      
      waitForMermaidAndScroll();
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
    if ((!input.trim() && attachedImages.length === 0) || isLoading) return;

    const message = input.trim();
    const images = [...attachedImages];
    setInput('');
    setAttachedImages([]);
    await sendMessage(message, images);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        alert('Please select only image files.');
        continue;
      }

      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        alert('Image size must be less than 10MB.');
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
          uploadedAt: new Date()
        };

        setAttachedImages(prev => [...prev, imageAttachment]);
      } catch (error) {
        console.error('Error processing image:', error);
        alert('Error processing image. Please try again.');
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
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
  const currentRole = activeThread?.customRole || defaultCustomRole || defaultRole;

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
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ customRole })
      });

      if (!response.ok) {
        console.error('Failed to update role on server');
      }
    } catch (error) {
      console.error('Failed to update role:', error);
    }
  };



  return (
    <div className="flex flex-col h-full flex-1 relative" key={`chat-panel-${fontSize}`}>
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4 relative" style={{ '--dynamic-font-size': `${fontSize}px` } as React.CSSProperties}>

        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <div className="mb-4">
              <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <MindStrikeIcon className="text-white" size={64} />
              </div>
              <h3 className="text-lg font-medium mb-2">
                Welcome to <a 
                  href="https://mindstrike.ai" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-600 underline"
                >
                  MindStrike
                </a>
              </h3>
              <div className="flex justify-center space-x-4 mb-4">
                <a 
                  href="https://github.com/sengac/mindstrike" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors"
                  title="MindStrike GitHub Repository"
                >
                  <Github size={24} />
                </a>
                <a 
                  href="https://www.youtube.com/@agiledestruction" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  title="MindStrike YouTube Channel"
                >
                  <Youtube size={24} />
                </a>
              </div>
              <p className="text-sm">Start a conversation with your current workspace:</p>
              <div className="flex items-center justify-center gap-3 mt-1">
                <p className="text-xs font-mono text-gray-400">{workspaceRoot || 'No workspace selected'}</p>
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
            <div className="text-left max-w-md mx-auto space-y-2 text-sm">
              <p className="font-medium">Try asking:</p>
              <ul className="space-y-1">
                <li>• "List the files in this directory"</li>
                <li>• "Read the package.json file"</li>
                <li>• "Create a simple React component"</li>
                <li>• "Help me fix this bug in my code"</li>
              </ul>
            </div>
          </div>
        )}
        
        {messages.map((message) => (
          <ChatMessage 
            key={message.id} 
            message={message} 
            fontSize={fontSize}
            onDelete={onDeleteMessage ? handleDeleteMessage : undefined}
            onRegenerate={message.role === 'assistant' ? handleRegenerateMessage : undefined}
            onEdit={message.role === 'user' ? handleEditMessage : undefined}
            onCancelToolCalls={
              message.status === 'processing' && message.toolCalls && message.toolCalls.length > 0 
                ? handleCancelToolCalls 
                : undefined
            }
          />
        ))}
        
        {isLoading && (
          <div className="flex items-center space-x-2 text-gray-400">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">MindStrike is thinking...</span>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-700 p-4">
        {/* Image preview area */}
        {attachedImages.length > 0 && (
          <div className="mb-4 p-3 bg-gray-800 rounded-lg border border-gray-600">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-300">Attached Images ({attachedImages.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {attachedImages.map((image) => (
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
        
        <form onSubmit={handleSubmit} className="flex items-center space-x-4">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask MindStrike anything..."
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 pr-12 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent overflow-y-auto"
              style={{ overflowY: input.includes('\n') ? 'auto' : 'hidden' }}
              rows={1}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={(!input.trim() && attachedImages.length === 0) || isLoading}
              className="absolute right-2 bottom-2 p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              <Send size={16} className="text-white" />
            </button>
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
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="p-2 border border-gray-600 hover:bg-gray-800 disabled:bg-gray-900 disabled:border-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors text-gray-400 hover:text-gray-200 disabled:text-gray-600"
            title="Attach images"
          >
            <Paperclip size={16} />
          </button>
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
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-600 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-white">Clear Conversation</h3>
                <p className="text-sm text-gray-400">This action cannot be undone.</p>
              </div>
            </div>
            
            <p className="text-gray-300 mb-6">
              Are you sure you want to clear the entire conversation? All messages will be permanently deleted.
            </p>
            
            <div className="flex space-x-3 justify-end">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  clearConversation();
                  setShowClearConfirm(false);
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

    </div>
  );
});
