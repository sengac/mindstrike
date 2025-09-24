# MindStrike™

A comprehensive AI knowledge assistant platform combining multi-threaded conversations, interactive mind mapping, and intelligent workspace management in a modern desktop and web application.

## Features

- **Multi-threaded Chat**: Isolated conversations with persistent history and custom prompts
- **Interactive Mind Maps**: AI-powered knowledge graphs with drag-and-drop interface
- **Integrated Workspace**: File management with Monaco-based code editor
- **Agent System**: Extensible AI agents for chat, workflows, and specialized tasks
- **Real-time Streaming**: Server-Sent Events (SSE) for live response updates
- **Multi-LLM Support**: Ollama, OpenAI, Anthropic, Google, Perplexity, and local models
- **Desktop & Web**: Electron app with cross-platform support (macOS, Windows, Linux)

## Quick Start

### Prerequisites

- **Node.js 22+** - Required for server and build tools
- **npm or yarn** - Package manager
- **Git** - Version control
- **LLM Provider** - At least one of:
  - [Ollama](https://ollama.ai/) (recommended for local models) - `ollama serve` + `ollama pull llama3.2`
  - [LM Studio](https://lmstudio.ai/) - Alternative local model server
  - OpenAI API key - For GPT models
  - Anthropic API key - For Claude models
  - Google API key - For Gemini models
  - Any OpenAI-compatible endpoint

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/yourusername/mindstrike.git
   cd mindstrike
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Start development server:**

   ```bash
   npm run dev
   ```

   This starts both the frontend (http://localhost:5173) and backend (http://localhost:3001) servers.

4. **For desktop development:**

   ```bash
   npm run electron:dev
   ```

### Configuration

The application automatically scans for available LLM providers on startup. To configure:

1. **Via UI:**
   - Open Settings panel (gear icon in sidebar)
   - Add/configure LLM services
   - Set API keys for cloud providers
   - Test connections and select default model

2. **Via Config File:**
   Edit `.mindstrike/llm-config.json` in your workspace:
   ```json
   {
     "providers": {
       "ollama": {
         "baseURL": "http://localhost:11434",
         "models": ["llama3.2", "mistral"]
       },
       "openai": {
         "apiKey": "sk-...",
         "models": ["gpt-4", "gpt-3.5-turbo"]
       }
     }
   }
   ```

## Architecture

### Frontend (React + TypeScript + Vite)

```
src/
├── App.tsx                 # Main application orchestrator
├── chat/                   # Multi-threaded chat system
│   ├── components/        # ChatView, ChatPanel, MessageList
│   └── hooks/            # useThreadsRefactored, useMessages
├── mindmaps/              # Interactive mind mapping
│   ├── components/        # MindMapsView, MindMapNode
│   └── hooks/            # useMindMaps, useMindMapLayout
├── workspace/             # File management
│   ├── components/        # WorkspaceView, FileExplorer, CodeEditor
│   └── hooks/            # useWorkspace
├── settings/              # Configuration UI
├── store/                 # Zustand state management
│   ├── useAppStore.ts    # Global app state
│   ├── useThreadsStore.ts # Thread management
│   └── useMindMapStore.ts # Mind map state
├── services/              # Frontend services
└── utils/                 # Utilities and helpers
```

### Backend (Node.js + Express + TypeScript)

```
server/
├── index.ts               # Express server entry point
├── agents/                # AI agent implementations
│   ├── base-agent.ts     # Abstract base class
│   ├── chat-agent.ts     # Standard chat agent
│   ├── workflow-agent.ts # Multi-step task execution
│   └── mindmap-agent-iterative.ts # Mind map generation
├── routes/                # API route handlers
├── conversation-manager.ts # Thread persistence
├── sse-manager.ts         # SSE broadcasting
├── llm-config-manager.ts  # Model configuration
├── mcp-manager.ts         # MCP tool integration
└── local-llm-manager.ts   # Local model loading
```

## Core Features

### 🗨️ Chat System

- **Multi-threading**: Isolated conversations with persistent history
- **Streaming Responses**: Real-time delivery via Server-Sent Events
- **Agent Modes**: Toggle between standard chat and workflow execution
- **Rich Attachments**: Support for images and contextual notes
- **Message Control**: Edit, delete, and cancel in-progress messages
- **Custom Prompts**: Configure AI behavior per thread

### 🧠 Mind Maps

- **AI Generation**: Automated content creation with iterative refinement
- **Visual Interface**: Drag-and-drop nodes powered by ReactFlow
- **Integrated Chat**: Associate threads with nodes for contextual discussions
- **Knowledge Management**: Add notes and external source links to nodes
- **Layout Options**: Multiple automatic layout algorithms
- **Persistence**: JSON-based storage with workspace organization

### 📁 Workspace

- **File Explorer**: Tree-based directory navigation
- **Code Editor**: Monaco editor with syntax highlighting
- **Tabbed Interface**: Edit multiple files simultaneously
- **Smart Initialization**: Automatic workspace setup
- **Integration**: Seamless connection with chat and mind maps

### 🤖 Agent System

- **Base Architecture**: Extensible agent framework with LangChain
- **Agent Types**:
  - ChatAgent: Standard conversational AI
  - WorkflowAgent: Multi-step task planning and execution
  - MindmapAgentIterative: Specialized content generation
- **Tool Integration**: MCP (Model Context Protocol) for extensible tools
- **Progress Tracking**: Real-time status updates for long-running tasks

## Development

### Commands

```bash
# Development
npm run dev                # Start client + server concurrently
npm run dev:debug          # Debug mode with verbose logging
npm run dev:client         # Frontend only (Vite on :5173)
npm run dev:server         # Backend only (Express on :3001)

# Build & Quality
npm run build              # Production build
npm run typecheck          # TypeScript validation
npm run lint               # ESLint checking
npm run lint:fix           # Auto-fix linting issues
npm run format             # Prettier formatting
npm run check              # Run all checks

# Desktop App
npm run electron:dev       # Electron development
npm run package            # Build for current platform
npm run package:mac:arm64  # macOS ARM64 (M1/M2)
npm run package:mac:x64    # macOS Intel
npm run package:win        # Windows installer
npm run package:linux      # Linux AppImage

# Production
npm run start              # Run production build
```

### Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Zustand
- **Backend**: Node.js 22+, Express, TypeScript, tsx
- **AI/ML**: LangChain, Multiple LLM providers, MCP tools
- **Real-time**: Server-Sent Events (SSE)
- **Desktop**: Electron 36+
- **Editor**: Monaco Editor
- **Visualization**: ReactFlow
- **Icons**: Lucide React
- **Styling**: Tailwind CSS + PostCSS

### Project Standards

- **TypeScript**: Strict mode enabled
- **File Naming**: kebab-case (e.g., `chat-panel.tsx`)
- **Components**: Functional with hooks
- **State**: Zustand stores with actions
- **Styling**: Tailwind utility classes
- **Testing**: Vitest + React Testing Library (planned)
- **Error Handling**: User-friendly notifications

## API Reference

### Chat Endpoints

```typescript
POST   /api/message              // Send message (SSE streaming)
GET    /api/threads              // List all threads
POST   /api/threads              // Create new thread
PUT    /api/threads/:id          // Update thread metadata
DELETE /api/threads/:id          // Delete thread
GET    /api/threads/:id/messages // Get thread messages
DELETE /api/message/:id          // Delete specific message
POST   /api/threads/:id/cancel   // Cancel in-progress generation
```

### Mind Map Endpoints

```typescript
GET    /api/mindmaps             // List all mind maps
POST   /api/mindmaps             // Create new mind map
GET    /api/mindmaps/:id         // Get mind map data
PUT    /api/mindmaps/:id         // Update mind map
DELETE /api/mindmaps/:id         // Delete mind map
POST   /api/mindmaps/:id/generate // AI content generation
```

### Model Management

```typescript
GET / api / llm / models; // List available models
POST / api / llm / scan; // Scan for new models
GET / api / llm / config; // Get LLM configuration
POST / api / llm / config; // Update configuration
POST / api / llm / local / load; // Load local model
POST / api / llm / local / unload; // Unload local model
GET / api / llm / local / status; // Local model status
```

### Workspace Operations

```typescript
GET / api / workspace / files; // List directory contents
POST / api / workspace / file; // Read file content
PUT / api / workspace / file; // Write/update file
DELETE / api / workspace / file; // Delete file
POST / api / workspace / mkdir; // Create directory
GET / api / workspace / root; // Get workspace root
POST / api / workspace / root; // Set workspace root
```

### Real-time Events (SSE)

```typescript
GET / api / events / stream; // SSE event stream
```

**Event Types:**

- `content-chunk` - Streaming message content
- `message-update` - Message state changes
- `thread_updated` - Thread modifications
- `task_progress` - Workflow progress updates
- `model_loaded` - Model availability changes
- `mcp_log` - Tool execution logs
- `error` - Error notifications

## Deployment

### Production Build

```bash
# Build for production
npm run build

# Start production server
NODE_ENV=production node dist/server/server/index.js
```

### Environment Variables

```bash
NODE_ENV=production            # Environment mode
PORT=3001                      # Server port (default: 3001)
WORKSPACE_DIR=./workspace      # Workspace location
VITE_API_URL=http://localhost:3001  # Backend URL for frontend
```

### Desktop Distribution

```bash
# Build for all platforms
npm run package

# Platform-specific builds
npm run package:mac:arm64     # macOS Apple Silicon
npm run package:mac:x64       # macOS Intel
npm run package:win           # Windows (NSIS installer)
npm run package:linux         # Linux (AppImage)
```

### Docker Deployment (Planned)

```dockerfile
# Dockerfile example (coming soon)
FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm ci --production
RUN npm run build
EXPOSE 3001
CMD ["node", "dist/server/server/index.js"]
```

## Workspace Structure

```
workspace/
└── .mindstrike/
    ├── threads/              # Conversation threads (JSON)
    ├── mindmaps/             # Mind map files (JSON)
    ├── uploads/              # User uploaded files
    ├── workspace.json        # Workspace configuration
    ├── llm-config.json       # LLM provider settings
    └── mcp-config.json       # MCP tool configuration
```

## Troubleshooting

### Common Issues

1. **Port Already in Use**

   ```bash
   # Kill process on port 3001
   lsof -ti:3001 | xargs kill -9
   ```

2. **Ollama Connection Failed**
   - Ensure Ollama is running: `ollama serve`
   - Check Ollama is accessible: `curl http://localhost:11434`
   - Verify model is pulled: `ollama list`

3. **Build Errors**
   - Clear node_modules: `rm -rf node_modules && npm install`
   - Clear build cache: `rm -rf dist`
   - Check Node.js version: `node --version` (requires 22+)

4. **SSE Connection Issues**
   - Check for proxy/firewall blocking
   - Ensure CORS is properly configured
   - Try disabling browser extensions

## Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes following our code standards
4. Add tests if applicable
5. Run quality checks: `npm run check`
6. Commit with descriptive message: `git commit -m "feat: add new feature"`
7. Push to your fork: `git push origin feature/your-feature`
8. Open a Pull Request with description of changes

### Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes
- `refactor:` Code refactoring
- `test:` Test additions/changes
- `chore:` Build process/auxiliary changes

## Security

- All LLM API keys are stored locally
- File access is restricted to workspace directory
- No telemetry or usage tracking
- Regular dependency updates for security patches

Report security issues to: security@mindstrike.ai

## License

MIT License - see [LICENSE.txt](LICENSE.txt) for details.

Copyright (c) 2025 MindStrike

---

**MindStrike** - Empowering knowledge work with intelligent AI assistance.

[Website](https://mindstrike.ai) | [Documentation](https://docs.mindstrike.ai) | [Discord](https://discord.gg/mindstrike)
