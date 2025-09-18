# AGENT.md - MindStrike Application Architecture

## Overview

MindStrike is an agentic AI knowledge assistant built with a modern tech stack featuring reactive state management, real-time streaming, and sophisticated workflow management.

## Application Architecture

### Core Technologies

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **State Management**: Zustand with middleware (persist, immer, subscribeWithSelector)
- **AI Integration**: LangChain for LLM orchestration
- **Real-time Updates**: Server-Sent Events (SSE)
- **UI Components**: Tailwind CSS + Lucide React
- **Specialized Libraries**: ReactFlow (mindmaps), Mermaid (diagrams), KaTeX (math)

### Key Design Principles

- **Reactive Architecture**: Zustand stores automatically update UI via SSE events
- **Agentic Workflows**: LangChain-powered agents with task decomposition
- **Real-time Transparency**: Users see live progress via SSE streaming
- **Centralized State**: Business logic in Zustand stores, not components

## Server Architecture

### Core Components

- **LangChain Integration**: Extensive use of LangChain for LLM interactions
- **SSE Manager**: Central hub for real-time updates via Server-Sent Events
- **Agent System**: LangChain-based agents for different tasks
- **Workflow Management**: Agentic task decomposition with ReAct methodology

### Key Files

- `server/index.ts` - Main Express server with all API routes
- `server/sse-manager.ts` - SSE broadcasting system
- `server/agents/base-agent.ts` - LangChain AgentExecutor implementation
- `server/agents/mindmap-agent.ts` - Mindmap-specific agent with agentic workflows
- `server/agents/chat-local-llm.ts` - Custom LangChain chat model for local LLMs

### API Endpoints

- **Chat**: `/api/message`, `/api/message/stream`
- **Mindmaps**: `/api/mindmaps/:id/generate`, `/api/mindmaps/:id/mindmap`
- **SSE Streams**: `/api/generate/stream/:streamId`, `/api/tasks/stream/:workflowId`
- **Models**: `/api/llm/models`, `/api/llm/default-model`

## Frontend Architecture

### Zustand Store System

All business logic and state management is handled through Zustand stores:

#### Core Application Stores

- **`useAppStore`**: Global app configuration with localStorage persistence
- **`useMindMapStore`**: Complex mindmap state with history, SSE integration
- **`useAgentStore`**: Factory pattern for multi-agent conversation management
- **`useTaskStore`**: Workflow and task progress management

#### Model Management Stores

- **`useModelsStore`**: Global model registry with SSE updates
- **`useLocalModelsStore`**: Local model lifecycle management
- **`useDownloadStore`**: Model download progress via SSE
- **`useDebugStore`**: Real-time LLM debugging and monitoring

### SSE Integration Pattern

Zustand stores connect to SSE streams for reactive updates:

```typescript
// Example: Models store auto-refreshes on SSE events
useEffect(() => {
  const eventSource = new EventSource('/api/llm/model-updates');
  eventSource.onmessage = () => fetchModels();
  return () => eventSource.close();
}, []);
```

### Component Structure

```
src/
├── store/              # Zustand stores (business logic)
├── components/         # Reusable UI components
├── chat/              # Chat interface
├── mindmaps/          # Mindmap interface
├── settings/          # Configuration UI
├── workflows/         # Workflow management
└── workspace/         # Workspace management
```

## Agentic Workflow System

### Task Decomposition (ReAct Pattern)

1. **Reasoning**: Analyze user query and current context
2. **Planning**: Break down into specific, actionable tasks
3. **Acting**: Execute each task with focused prompts
4. **Reflection**: Use results to inform subsequent tasks

### Real-time Progress Tracking

- **SSE Events**: `workflow_started`, `tasks_planned`, `task_progress`, `task_completed`
- **UI Updates**: Live task list with status icons (⏳🔄✅❌)
- **Progress Bar**: Visual completion percentage
- **Transparent Execution**: Users see exactly what the AI is working on

### Workflow Integration

```typescript
// Server broadcasts task updates
broadcastTaskUpdate(workflowId, {
  type: 'task_progress',
  task: { id, description, status, priority },
});

// Frontend stores react to updates
useMindMapStore.getState().applyMindmapChanges(changes);
```

## Response Validation System

### Automatic Error Correction

- **Off-screen Validation**: Hidden DOM elements test rendering
- **Debug LLM Service**: Separate LLM connection for fixing errors
- **Content Types**: Mermaid diagrams, LaTeX expressions, code blocks
- **User Transparency**: Real-time notifications during correction

## State Management Patterns

### Zustand Best Practices

- **Selective Subscriptions**: Components only re-render when relevant state changes
- **Middleware Stack**: `persist` + `immer` + `subscribeWithSelector`
- **Action-based Updates**: All mutations through store actions
- **SSE Integration**: Automatic state updates from server events

### Store Examples

```typescript
// Reactive store with SSE
const useMindMapStore = create<MindMapState>()(
  subscribeWithSelector(
    immer((set, get) => ({
      nodes: [],
      edges: [],
      addNode: node =>
        set(state => {
          state.nodes.push(node);
        }),
      // SSE handler
      applyMindmapChanges: changes =>
        set(state => {
          // Apply changes reactively
        }),
    }))
  )
);
```

## Development Commands

### Development

```bash
npm run dev                 # Start both client and server
npm run dev:debug          # Start with debug logging
npm run dev:client         # Frontend only (Vite)
npm run dev:server         # Backend only (tsx watch)
```

### Build & Deploy

```bash
npm run build              # Build both client and server
npm run typecheck          # TypeScript checking
npm run start              # Production server
```

### Electron Desktop App

```bash
npm run electron:dev       # Development electron app
npm run package           # Build desktop app
npm run package:mac:arm64  # macOS ARM64 build
```

## Code Conventions

### TypeScript

- **Strict Mode**: Full type safety throughout
- **Interface Definitions**: Clear contracts between components
- **Generic Types**: Reusable type patterns

### State Management

- **Zustand Actions**: All state mutations through actions
- **SSE Reactivity**: Automatic UI updates from server events
- **Immutable Updates**: Using immer for clean state updates

### Component Patterns

- **Functional Components**: React hooks throughout
- **Custom Hooks**: Extract business logic from components
- **Store Subscriptions**: Selective state subscriptions for performance

## File Structure

### Backend

```
server/
├── agents/           # LangChain agents
├── routes/           # API route handlers
├── utils/            # Utility functions
├── workers/          # Background workers
├── sse-manager.ts    # SSE broadcasting
├── llm-config-manager.ts  # LLM configuration
└── index.ts          # Main server
```

### Frontend

```
src/
├── store/            # Zustand stores (business logic)
├── components/       # Reusable UI components
├── chat/            # Chat interface
├── mindmaps/        # Mindmap interface
├── settings/        # Configuration UI
├── workflows/       # Workflow management
├── workspace/       # Workspace management
└── types/           # TypeScript definitions
```

## Key Features

### Mindmap System

- **Reactive State**: Zustand-powered with real-time updates
- **Agentic Generation**: Task-based content creation
- **Visual Interface**: ReactFlow-based interactive mindmaps
- **History Management**: Undo/redo with state snapshots

### Chat System

- **Multi-agent Support**: Factory pattern for agent management
- **Streaming Responses**: Real-time SSE updates
- **Tool Integration**: LangChain tools for enhanced capabilities
- **Message History**: Persistent conversation storage

### Model Management

- **Local & Remote**: Support for both local and cloud LLMs
- **Auto-switching**: Automatic model management
- **Progress Tracking**: Real-time download and loading progress
- **Configuration**: Flexible model settings per provider

## Testing & Debugging

### Debug Features

- **Real-time Logs**: SSE streaming of debug information
- **Token Tracking**: Monitor LLM usage and performance
- **Workflow Visibility**: Complete task execution transparency
- **Error Handling**: Graceful degradation with user feedback

### Development Tools

- **Hot Reload**: Instant updates during development
- **TypeScript**: Compile-time error checking
- **Console Logging**: Structured logging with Winston
- **Browser DevTools**: Zustand state inspection

## Performance Considerations

### State Management

- **Selective Re-renders**: Components only update when subscribed state changes
- **Batched Updates**: Multiple state changes in single render cycle
- **Memory Management**: Automatic cleanup of unused stores

### SSE Optimization

- **Topic-based Broadcasting**: Targeted updates to relevant connections
- **Connection Management**: Automatic cleanup and reconnection
- **Backpressure Handling**: Prevent memory leaks from slow clients

## Future Enhancements

### Planned Features

- **LangGraph Integration**: Replace custom workflow system with LangGraph
- **Collaborative Editing**: Real-time multi-user mindmap editing
- **Advanced Analytics**: Performance metrics and usage tracking
- **Plugin System**: Extensible architecture for custom tools

### Technical Improvements

- **Micro-frontends**: Modular UI architecture
- **Worker Threads**: Offload heavy processing
- **Caching Layer**: Improve response times
- **Error Boundaries**: Better error isolation and recovery

---

_This architecture enables a responsive, transparent, and powerful AI-assisted knowledge management system with real-time collaboration capabilities._
