# MindStrike Agent Architecture

## Overview

MindStrike is an agentic AI knowledge assistant built as a modern desktop application featuring multi-threaded conversations, interactive mind mapping, workspace management, and real-time AI agent workflows.

## Core Architecture

### Technology Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript
- **Desktop**: Electron with cross-platform packaging
- **State Management**: Zustand with persistence and SSE integration
- **AI Integration**: LangChain + Multiple LLM providers
- **Real-time**: Server-Sent Events (SSE) for streaming
- **UI Components**: ReactFlow (mind maps), Monaco Editor (code), Lucide icons

### Application Structure

```
src/
├── App.tsx                 # Main app orchestrator with 5 panels
├── chat/                   # Multi-threaded chat system
├── mindmaps/              # Interactive knowledge visualization
├── workspace/             # File explorer and code editor
├── components/            # Shared UI components
├── settings/              # LLM configuration and management
├── store/                 # Zustand state management
└── types/                 # TypeScript definitions

server/
├── index.ts               # Express server with comprehensive API
├── agents/                # AI agent implementations
├── routes/                # API endpoint handlers
├── conversation-manager.ts # Thread and message persistence
├── sse-manager.ts         # Real-time event broadcasting
├── llm-config-manager.ts  # Model configuration
└── mcp-manager.ts         # Model Context Protocol integration
```

## Core Features

### 1. Multi-threaded Chat System

- **Thread Management**: Persistent conversations with metadata
- **Real-time Streaming**: SSE-powered response streaming
- **Agent Modes**: Standard chat vs. workflow execution
- **Attachments**: Image and note integration
- **Cancellation**: Real-time message cancellation
- **Personalities**: Custom roles per thread

### 2. Interactive Mind Maps

- **AI Generation**: Automated content creation with iterative agents
- **Visual Interface**: ReactFlow-based drag-and-drop nodes
- **Chat Integration**: Contextual discussions within mind maps
- **Persistence**: JSON-based storage with workspace organization
- **Source Linking**: Connect nodes to external references

### 3. Workspace Management

- **File Explorer**: Directory navigation with file operations
- **Code Editor**: Monaco-powered editing with syntax highlighting
- **Tabbed Interface**: Multi-file editing support
- **Workspace Initialization**: Automatic setup and persistence

### 4. Agent System

- **BaseAgent**: Abstract foundation with LLM integration
- **ChatAgent**: Standard conversational AI
- **WorkflowAgent**: Multi-step task execution
- **MindmapAgentIterative**: Specialized mind map generation
- **Thread Isolation**: Agent pool for concurrent conversations

## State Management Architecture

### Zustand Store System

All business logic centralized in reactive stores:

- **`useAppStore`**: Global configuration, workspace, model settings
- **`useChatThreadStore`**: Thread-specific message management
- **`useThreadsStore`**: Thread list and active thread tracking
- **`useMindMapStore`**: Mind map data and operations
- **`useModelsStore`**: Available models and configurations
- **`useTaskStore`**: Background task and workflow tracking
- **`useDebugStore`**: Development debugging and monitoring

### SSE Integration Pattern

```typescript
// Frontend: sseEventBus singleton manages single connection
import { sseEventBus } from '../utils/sseEventBus';

// Stores subscribe to specific event types
useEffect(() => {
  const unsubscribe = sseEventBus.subscribe('thread_updated', event => {
    updateThread(event.data.threadId, event.data.updates);
  });
  return unsubscribe;
}, []);

// Backend: sseManager broadcasts to topic-based clients
sseManager.broadcast('general', {
  type: 'thread_updated',
  threadId: 'abc123',
  updates: { title: 'New Title' },
});
```

## LLM Provider Integration

### Supported Providers

- **Ollama**: Local model hosting
- **OpenAI**: GPT models with streaming
- **Anthropic**: Claude models
- **Google**: Gemini integration
- **Perplexity**: Web-enhanced responses
- **Local Models**: node-llama-cpp integration
- **Custom**: OpenAI-compatible endpoints

### Model Management

- **Auto-detection**: Scan and discover available models
- **Configuration**: Per-provider settings and authentication
- **Switching**: Dynamic model selection per thread
- **Local Loading**: Download and run models locally

## Real-time Communication

### SSE Architecture

- **Frontend**: `sseEventBus` singleton manages single EventSource connection
- **Backend**: `sseManager` handles topic-based client broadcasting
- **Connection Management**: Automatic reconnection with exponential backoff
- **Event Types**: `message_chunk`, `thread_updated`, `task_progress`, `model_loaded`
- **Topic-based Broadcasting**: Targeted updates to relevant client groups
- **Large Content Handling**: Automatic chunking and reference storage

### API Endpoints

```
POST /api/message              # Send chat message with streaming
GET  /api/threads              # List all conversation threads
POST /api/threads              # Create new thread
GET  /api/mindmaps/:id         # Get mind map data
POST /api/mindmaps/:id/generate # Generate mind map content
GET  /api/llm/models           # List available models
POST /api/llm/scan             # Scan for new models
GET  /api/events/stream        # SSE event stream
```

## Agent Workflow System

### Task-based Execution

1. **Planning**: Break down user requests into actionable tasks
2. **Execution**: Process tasks with appropriate tools and context
3. **Progress Tracking**: Real-time updates via SSE
4. **Result Integration**: Merge outputs into conversation or mind map

### Tool Integration (MCP)

- **Filesystem**: File operations and directory navigation
- **GitHub**: Repository access and code analysis
- **Web Search**: External information retrieval
- **Code Analysis**: Syntax checking and diagnostics
- **Custom Tools**: Extensible tool system

## Development Workflow

### Commands

```bash
npm run dev                # Parallel client/server development
npm run dev:debug          # Debug mode with enhanced logging
npm run build              # Production build (client + server)
npm run typecheck          # TypeScript validation
npm run lint               # ESLint checking
npm run electron:dev       # Desktop app development
npm run package:mac:arm64  # macOS ARM64 build
```

### Code Conventions

- **Files**: kebab-case (`chat-panel.tsx`, `use-threads.ts`)
- **Components**: PascalCase functional components with hooks
- **State**: Zustand actions for all mutations
- **Types**: Comprehensive TypeScript interfaces
- **Imports**: External first, then internal grouped by type
- **Error Handling**: Try-catch with user-friendly notifications

## Performance Optimizations

### State Management

- **Selective Subscriptions**: Components only re-render on relevant changes
- **Batched Updates**: Multiple state changes in single cycle
- **Memory Management**: Automatic cleanup of unused resources

### Real-time Updates

- **Connection Pooling**: Efficient SSE connection management
- **Event Filtering**: Targeted updates to relevant clients
- **Backpressure Handling**: Prevent memory leaks from slow clients

## Deployment Architecture

### Development

- **Client**: Vite dev server (localhost:5173)
- **Server**: Node.js with tsx watch (localhost:3001)
- **Hot Reload**: Instant updates during development

### Production

- **Build**: Static client + compiled server
- **Electron**: Cross-platform desktop packaging
- **Distribution**: DMG (macOS), NSIS (Windows), AppImage (Linux)

## Future Enhancements

### Planned Features

- **Collaborative Editing**: Multi-user mind map collaboration
- **Plugin System**: Extensible architecture for custom tools
- **Advanced Analytics**: Usage tracking and performance metrics
- **Mobile Support**: React Native companion app

### Technical Improvements

- **LangGraph Integration**: Replace custom workflow system
- **Worker Threads**: Offload heavy processing
- **Caching Layer**: Improve response times
- **Error Boundaries**: Better error isolation and recovery

---

This architecture enables a responsive, transparent, and powerful AI-assisted knowledge management system with real-time collaboration capabilities and extensible agent workflows.
