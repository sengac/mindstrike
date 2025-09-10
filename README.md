# MindStrike

An Agentic AI coding assistant built with TypeScript, React, Vite and Express.

## Prerequisites

1. **Node.js 22+** - Required for the server and build tools
2. **Local LLM** - One of:
   - [Ollama](https://ollama.ai/) (recommended) - Run `ollama serve` and `ollama pull codellama:7b`
   - [LM Studio](https://lmstudio.ai/) with OpenAI-compatible server
   - Any OpenAI-compatible API endpoint

## Quick Start

1. **Clone and install dependencies:**
   ```bash
   git clone <repo-url>
   cd mindstrike
   npm install
   ```

2. **Configure your LLM:**
   ```bash
   cp .env.exle .env
   # Edit .env with your LLM settings
   ```

3. **Start the development servers:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   - Visit http://localhost:5173
   - Start chatting with your local AI coding assistant!

## Configuration

### LLM Settings (.env)

```bash
# For Ollama (default)
LLM_BASE_URL=http://localhost:11434
LLM_MODEL=codellama:7b

# For LM Studio
LLM_BASE_URL=http://localhost:1234
LLM_MODEL=your-model-name

# For OpenAI-compatible APIs with authentication
LLM_BASE_URL=https://api.your-provider.com
LLM_MODEL=gpt-4
LLM_API_KEY=your-api-key
```

### Recommended Models

- **devstral:latest**: Ideal for agentic tasks

## Architecture

```
mindstrike/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── hooks/             # React hooks for API calls
│   └── types.ts           # TypeScript types
├── server/                # Node.js backend
│   ├── agent.ts           # Core AI agent logic
│   ├── llm-client.ts      # LLM API client
│   ├── tools.ts           # Tool system implementation
│   └── index.ts           # Express server
└── dist/                  # Built files
```

## Available Tools

The agent has access to these tools for interacting with your codebase:

- **File Operations**: `read_file`, `create_file`, `edit_file`, `format_file`, `undo_edit`
- **Directory Operations**: `list_directory`
- **Search**: `glob` (file patterns), `grep` (text search), `web_search`
- **Terminal**: `bash` (execute shell commands)
- **Code Quality**: `get_diagnostics` (errors/warnings)
- **Task Management**: `todo_write`, `todo_read`
- **Visualization**: `mermaid` (render diagrams)

## Development

### Scripts

```bash
npm run dev          # Start both frontend and backend in development
npm run dev:client   # Start only the React frontend
npm run dev:server   # Start only the Node.js backend
npm run build        # Build for production
npm run typecheck    # Type checking
```

### Project Structure

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript
- **Build Tool**: Vite for fast development and builds
- **Communication**: REST + SSE API between frontend and backend

## Production Deployment

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Set environment variables:**
   ```bash
   export NODE_ENV=production
   export LLM_BASE_URL=your-llm-url
   export LLM_MODEL=your-model
   ```

3. **Start the production server:**
   ```bash
   node dist/server/index.js
   ```

