# MindStrike - AI Knowledge Assistant Platform

## Project Overview

MindStrike is a comprehensive AI knowledge assistant platform built as a modern desktop and web application. It combines multi-threaded conversational AI, interactive mind mapping, workspace management, and real-time agent workflows in a unified interface.

## Technical Architecture

### Tech Stack

**Frontend**

- React 18 + TypeScript
- Vite (build tooling)
- Tailwind CSS (styling)
- Zustand (state management)
- ReactFlow (mind maps)
- Monaco Editor (code editing)
- Lucide React (icons)

**Backend**

- Node.js + Express
- TypeScript
- LangChain (AI orchestration)
- Model Context Protocol (MCP) for tools
- Winston (logging)

**Desktop**

- Electron
- Cross-platform packaging (DMG, NSIS, AppImage)

**Real-time**

- Server-Sent Events (SSE)
- WebSocket fallback support

### Directory Structure

```
mindstrike/
├── src/                      # Frontend React application
│   ├── App.tsx              # Main app component with 5-panel layout
│   ├── chat/                # Chat system components
│   │   ├── components/      # ChatView, ChatPanel, MessageList, etc.
│   │   └── hooks/          # useThreadsRefactored, useMessages
│   ├── mindmaps/           # Mind mapping system
│   │   ├── components/     # MindMapsView, MindMapNode
│   │   ├── hooks/         # useMindMaps, useMindMapLayout
│   │   └── types/         # MindMap type definitions
│   ├── workspace/          # File management
│   │   ├── components/     # WorkspaceView, FileExplorer, CodeEditor
│   │   └── hooks/         # useWorkspace
│   ├── settings/           # Configuration UI
│   │   └── components/     # SettingsView, ModelSelector, PromptsModal
│   ├── components/         # Shared UI components
│   │   └── shared/        # Dialogs, modals, common widgets
│   ├── store/             # Zustand state stores
│   │   ├── useAppStore.ts         # Global app state
│   │   ├── useThreadsStore.ts     # Thread management
│   │   ├── useMindMapStore.ts     # Mind map state
│   │   ├── useModelsStore.ts      # LLM configurations
│   │   └── useTaskStore.ts        # Background tasks
│   ├── services/          # Frontend services
│   │   ├── responseValidator.ts   # Response validation
│   │   └── metadata-extractor.ts  # Music metadata
│   ├── hooks/             # Global React hooks
│   └── utils/             # Utilities and helpers
│       ├── sseEventBus.ts # SSE connection management
│       └── workspace-initializer.ts

├── server/                 # Backend Express server
│   ├── index.ts           # Main server entry point
│   ├── agents/            # AI agent implementations
│   │   ├── base-agent.ts  # Abstract base class
│   │   ├── chat-agent.ts  # Standard chat
│   │   ├── workflow-agent.ts      # Multi-step workflows
│   │   └── mindmap-agent-iterative.ts  # Mind map generation
│   ├── routes/            # API route handlers
│   │   ├── local-llm.ts   # Local model management
│   │   ├── model-scan.ts  # Model discovery
│   │   └── tasks.ts       # Task tracking
│   ├── utils/             # Server utilities
│   │   ├── async-handler.ts       # Express error handling
│   │   ├── content-filter.ts      # Content sanitization
│   │   └── command-resolver.ts    # Command resolution
│   ├── conversation-manager.ts    # Thread persistence
│   ├── llm-config-manager.ts      # Model configuration
│   ├── llm-scanner.ts             # Model discovery
│   ├── mcp-manager.ts             # MCP tool integration
│   ├── sse-manager.ts             # SSE broadcasting
│   ├── local-llm-manager.ts       # Local model loading
│   └── logger.ts                  # Winston logging

├── electron/              # Desktop app
│   ├── main.js           # Electron main process
│   └── preload.js        # Preload script

└── public/               # Static assets
```

## Core Systems

### State Management

#### Zustand Stores

- `useAppStore` - Global settings, workspace config
- `useThreadsStore` - Active threads, selection
- `useChatThreadStore` - Per-thread messages
- `useMindMapStore` - Mind map data and operations
- `useModelsStore` - Available LLM configurations
- `useTaskStore` - Background task tracking
- `useDebugStore` - Development debugging

#### Persistence

- Zustand persist middleware for local storage
- Server-side file persistence for threads/mindmaps
- Automatic state synchronization

#### Immer middleware

- Using Immer for undo/redo functionality as Zustand middleware

### Real-time Communication

#### SSE Architecture

- Single persistent EventSource connection
- Topic-based message routing
- Automatic reconnection with exponential backoff
- Large content chunking and reference storage

### Coding Standards

#### TypeScript Rules (Strict Enforcement)

- **Strict Mode**: All TypeScript strict checks enabled
- **No `any` Types**: Complete type safety required - use proper types always
- **Interface Over Type**: Use `interface` for object definitions, not `type`
- **Readonly Properties**: Use `readonly` where immutability is expected
- **Null Safety**: Strict null checks enabled - handle undefined/null explicitly

#### Import & Module Rules

- **ES6 Imports Only**: Never use `require()` - always use `import`
- **File Extensions**: Always use `.js` extension for local module imports (ES modules)
- **Consistent Type Imports**: Use `import type` for type-only imports
- **Explicit Imports**: Prefer explicit imports over star imports

#### Code Quality Requirements

- **Error Handling**: Comprehensive try/catch patterns for async operations
- **Async/Await**: Always await thenable expressions - no floating promises
- **Promise Handling**: All promises must be properly handled or explicitly ignored
- **Function Purity**: Prefer pure functions and immutable data structures

#### Linting Rules (ESLint)

- **Curly Braces**: Required for all control statements
- **Const Preference**: Use `const` over `let`/`var` where possible
- **No Unused Variables**: All declared variables must be used
- **Strict Equality**: Use `===` and `!==` instead of `==` and `!=`
- **No Console**: Console statements discouraged (except in server/test files)

#### Naming Conventions

- **Files**: `kebab-case.tsx` for components, `use-kebab-case.ts` for hooks
- **Components**: `PascalCase` for React components
- **Hooks**: `useCamelCase` for custom hooks
- **CSS**: `kebab-case` for class names
- **Constants**: `UPPER_SNAKE_CASE` for global constants
- **Interfaces**: `IPascalCase` or just `PascalCase` for TypeScript interfaces

#### React Best Practices

- **Functional Components**: Always use functional components with hooks
- **Component Size**: Keep components focused and small (< 200 lines)
- **Hook Extraction**: Extract complex logic to custom hooks
- **Memo Usage**: Use React.memo for expensive components
- **Prop Types**: TypeScript interfaces for all component props
- **State Management**: Zustand for global state, useState for local state

#### Development Workflow

##### Before Starting Development

1. **Understanding**: Review relevant source files in the module you're working on
2. **Testing**: Run existing tests to ensure baseline functionality
3. **Linting**: Ensure code passes all linting rules before making changes
4. **Typechecking**: Ensure all code typechecking works

##### During Development

1. **Type Safety**: Write code that satisfies TypeScript strict mode
2. **Testing**: Write tests for new functionality (unit and integration as appropriate)
3. **Error Handling**: Implement proper error handling for all async operations
4. **Documentation**: Update code comments for complex logic
