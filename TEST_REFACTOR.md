# MindStrike Chat Code Test Refactor

## Chat Code Review Summary

### UI Components

#### 1. **AttachmentsPopup.tsx**

- **File/Image Attachment Management**: Provides UI for attaching images to chat messages
- **State Management**: Manages popup open/close state, file upload handling
- **Accessibility**: Handles click-outside-to-close, keyboard navigation
- **Validation**: Checks for local model compatibility, prevents attachments for unsupported models

#### 2. **ChatMessage.tsx** (967 lines - Complex Component)

- **Message Rendering**: Displays user/assistant messages with proper formatting
- **Markdown Processing**: Renders markdown with syntax highlighting, LaTeX math, Mermaid diagrams
- **Interactive Features**: Edit, delete, regenerate messages, copy to notes
- **Tool Call Display**: Shows tool executions and results with collapsible UI
- **Image/Notes Display**: Renders attached images and notes in messages
- **Code Block Features**: Syntax highlighting, copy button, language detection
- **Thinking Blocks**: Special rendering for AI thinking content

#### 3. **ChatOptionsPopup.tsx**

- **Chat Settings Management**: Clear conversation, customize prompts, toggle agent mode
- **Visual Feedback**: Shows active states, custom prompt indicators
- **Popup Management**: Click-outside handling, keyboard navigation

#### 4. **ChatPanel.tsx** (777 lines - Main Chat Container)

- **Message Display Container**: Manages the full chat interface including messages and input
- **Input Handling**: Text input with multiline support, Enter to send, Shift+Enter for newlines
- **Attachment Management**: Image preview, notes preview, attachment removal
- **Auto-scrolling**: Smart scrolling to bottom, Mermaid diagram render handling
- **Background Effects**: Music visualization integration
- **Model Error Handling**: Local model loading dialogs
- **Validation Notifications**: Response validation status display

#### 5. **ChatView.tsx**

- **Layout Container**: Combines ThreadsPanel and ChatPanel in the main chat view
- **Props Forwarding**: Passes callbacks and state between child components
- **App Bar Integration**: Displays chat header with consistent styling

#### 6. **ModelSelectionPopup.tsx**

- **Model Selection UI**: Dropdown for switching between available LLMs
- **Model Information Display**: Shows context window sizes, model types
- **Auto-selection Logic**: Selects first model if none selected
- **Model Rescanning**: Trigger model discovery/refresh

#### 7. **ThreadsPanel.tsx**

- **Thread List Display**: Shows all chat conversations using ListPanel
- **Thread Management UI**: Create, rename, delete thread buttons
- **Custom Prompt Indicators**: Visual indicator for threads with custom prompts
- **Active Thread Highlighting**: Shows currently selected thread

#### 8. **TypingIndicator.tsx**

- **Loading State Display**: Animated dots showing AI is typing
- **Visual Consistency**: Matches ChatMessage avatar styling

#### 9. **WorkflowProgress.tsx**

- **Agent Mode UI**: Displays multi-step workflow execution progress
- **Task Status Display**: Shows individual task states, progress bars
- **Real-time Updates**: Updates as workflow progresses
- **Error Display**: Shows task failures and error messages

### Specialized Chat Components

#### 10. **InferenceChatContent.tsx**

- **Mind Map Node Chat**: Embedded chat for mind map nodes
- **Context-Aware Prompting**: Automatically includes node context in prompts
- **Standalone Chat Logic**: Independent message handling for node exploration

#### 11. **InferenceChatPopup.tsx**

- **Popup Chat Interface**: Floating chat window for mind map nodes
- **Smart Positioning**: Calculates position to avoid viewport edges
- **Escape/Click-outside Handling**: Proper popup dismissal
- **Animation Support**: Smooth open/close transitions

### React Hooks

#### 12. **useChatRefactored.ts** (752 lines - Core Chat Logic)

- **Message State Management**: Add, update, remove messages
- **SSE Event Handling**: Real-time streaming via Server-Sent Events
- **API Communication**: Send messages, handle responses
- **Thread Title Generation**: Auto-generate thread names from first message
- **Message Validation**: Integrate response validation system
- **Error Handling**: Local model errors, network errors
- **Message Operations**: Edit, regenerate, cancel streaming
- **Tool Call Management**: Handle tool execution cancellation

#### 13. **useThreadsRefactored.ts**

- **Thread Operations**: Create, select, delete, rename threads
- **Thread State Coordination**: Sync thread selection with message loading
- **Active Thread Management**: Track and update current thread
- **Custom Prompt Management**: Update thread-specific prompts

## Key Responsibilities by Category

### State Management

- Per-thread message state (useChatThreadStore)
- Global thread list state (useThreadsStore)
- SSE event subscriptions and real-time updates
- Attachment state (images, notes)

### User Interactions

- Message sending with attachments
- Message editing and regeneration
- Thread management (CRUD operations)
- Model selection and configuration
- Agent mode toggling

### Real-time Features

- Character-by-character streaming
- Tool call progress updates
- Workflow execution tracking
- Message status updates

### Content Processing

- Markdown rendering with extensions
- LaTeX math formula rendering
- Mermaid diagram generation
- Syntax highlighting for code
- Image thumbnail generation

### Error Handling

- Network error recovery
- Local model loading errors
- Validation failures
- Tool execution failures

### Accessibility

- Keyboard navigation
- Focus management
- Screen reader support
- Escape key handling

## Untested Areas

All chat components currently lack test coverage. Critical areas needing tests include:

1. **Message streaming and SSE handling** - Real-time event processing, character streaming, connection management
2. **Thread state synchronization** - Multi-store coordination, active thread switching
3. **Attachment upload and preview** - Image processing, file validation, preview generation
4. **Message validation integration** - Content validation, auto-correction flows
5. **Error recovery flows** - Network failures, model errors, retry mechanisms
6. **Agent mode workflow execution** - Multi-step task execution, progress tracking

## Testing Priority

1. Message streaming and SSE handling (Core functionality)
2. Thread state synchronization (State management foundation)
3. Error recovery flows (Reliability)
4. Message validation integration (Data integrity)
5. Attachment upload and preview (Feature completeness)
6. Agent mode workflow execution (Advanced features)
