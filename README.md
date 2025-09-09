# PowerAgent

An Agentic AI coding assistant built with TypeScript, React, Vite and Express.

## Features

- 🤖 **Local LLM Integration**: Works with Ollama, LM Studio, or any OpenAI-compatible API
- 🛠️ **Comprehensive Tool System**: File operations, terminal commands, code search, and more
- 💬 **Chat Interface**: Clean, modern web-based chat interface
- 📁 **File Explorer**: Browse, view, and edit workspace files with syntax highlighting
- 🔧 **Tool Execution**: See real-time tool calls and results
- 📝 **Code Editor**: Monaco Editor with syntax highlighting for 20+ languages
- 📋 **Task Management**: Built-in todo system for tracking work
- 🌐 **Web Search**: Search the web for information
- 📊 **Mermaid Diagrams**: Render diagrams from code
- 🔍 **Diagnostics**: Get TypeScript/ESLint errors and warnings
- ✨ **Code Formatting**: Format files with Prettier
- 🚀 **Fast Development**: Built with Vite for instant hot reloading

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
   cd poweragent
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
poweragent/
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
- **Communication**: REST API between frontend and backend

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

## Troubleshooting

### Common Issues

1. **LLM Connection Failed**
   - Ensure your LLM server is running
   - Check the `LLM_BASE_URL` in your `.env` file
   - Verify the model name is correct

2. **Tool Execution Errors**
   - Check file permissions in your workspace
   - Ensure the server has access to the workspace directory

3. **Build Errors**
   - Clear `node_modules` and reinstall: `rm -rf node_modules package-lock.json && npm install`
   - Check Node.js version (requires 22+)

