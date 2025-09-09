import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Agent, AgentConfig } from './agent.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client')));
}

// Initialize agent
let workspaceRoot = process.cwd();
let currentWorkingDirectory = workspaceRoot;
const agentConfig: AgentConfig = {
  workspaceRoot,
  llmConfig: {
    baseURL: process.env.LLM_BASE_URL || 'http://localhost:11434',
    model: process.env.LLM_MODEL || 'devstral:latest',
    apiKey: process.env.LLM_API_KEY
  }
};

const agent = new Agent(agentConfig);

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', workspace: workspaceRoot });
});

app.get('/api/conversation', (req, res) => {
  res.json(agent.getConversation());
});

app.post('/api/message', async (req: any, res: any) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await agent.processMessage(message);
    res.json(response);
  } catch (error: any) {
    console.error('Error processing message:', error);
    res.status(500).json({ error: error.message });
  }
});

// SSE endpoint for real-time message processing
app.post('/api/message/stream', async (req: any, res: any) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection event
    res.write('data: {"type": "connected"}\n\n');
    if (res.flush) res.flush();

    // Process message with real-time updates
    const response = await agent.processMessage(message, (updatedMessage) => {
      // Send message update via SSE
      console.log('📡 Sending SSE message-update - Status:', updatedMessage.status, 'Tool calls:', updatedMessage.toolCalls?.length || 0);
      res.write(`data: ${JSON.stringify({
        type: 'message-update',
        message: updatedMessage
      })}\n\n`);
      if (res.flush) res.flush(); // Ensure data is sent immediately
    });

    // Send final completion event
    res.write(`data: ${JSON.stringify({
      type: 'completed',
      message: response
    })}\n\n`);

    // Close the connection
    res.end();

  } catch (error: any) {
    console.error('Error processing message stream:', error);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: error.message
    })}\n\n`);
    res.end();
  }
});

app.post('/api/conversation/clear', (req, res) => {
  agent.clearConversation();
  res.json({ success: true });
});

app.post('/api/load-thread/:threadId', async (req: any, res: any) => {
  try {
    const { threadId } = req.params;
    if (!threadId) {
      return res.status(400).json({ error: 'Thread ID is required' });
    }

    const fs = await import('fs/promises');
    const conversationsPath = path.join(workspaceRoot, 'CONVERSATIONS.json');
    
    try {
      const data = await fs.readFile(conversationsPath, 'utf-8');
      const conversations = JSON.parse(data);
      const thread = conversations.find((t: any) => t.id === threadId);
      
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }
      
      // Load the thread's messages into the agent's conversation context
      agent.loadConversation(thread.messages);
      res.json({ success: true });
      
    } catch (error) {
      // File doesn't exist or thread not found
      agent.clearConversation();
      res.json({ success: true });
    }
  } catch (error: any) {
    console.error('Error loading thread into agent:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/message/cancel', (req: any, res: any) => {
  const { messageId } = req.body;
  if (!messageId) {
    return res.status(400).json({ error: 'Message ID is required' });
  }

  const cancelled = agent.cancelMessage(messageId);
  if (cancelled) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Message not found or not processing' });
  }
});

app.delete('/api/message/:messageId', (req: any, res: any) => {
  const { messageId } = req.params;
  if (!messageId) {
    return res.status(400).json({ error: 'Message ID is required' });
  }

  const deleted = agent.deleteMessage(messageId);
  if (deleted) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Message not found' });
  }
});

// Conversations (threads) API
app.get('/api/conversations', async (req, res) => {
  try {
    const fs = await import('fs/promises');
    const conversationsPath = path.join(workspaceRoot, 'CONVERSATIONS.json');
    
    try {
      const data = await fs.readFile(conversationsPath, 'utf-8');
      const conversations = JSON.parse(data);
      res.json(conversations);
    } catch (error) {
      // File doesn't exist or is invalid, return empty array
      res.json([]);
    }
  } catch (error: any) {
    console.error('Error loading conversations:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/conversations', async (req, res) => {
  try {
    const fs = await import('fs/promises');
    const conversations = req.body;
    const conversationsPath = path.join(workspaceRoot, 'CONVERSATIONS.json');
    
    await fs.writeFile(conversationsPath, JSON.stringify(conversations, null, 2));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error saving conversations:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-title', async (req: any, res: any) => {
  try {
    const { context } = req.body;
    
    if (!context) {
      return res.status(400).json({ error: 'Context is required' });
    }

    // Create a prompt to generate a short title
    const prompt = `Based on this conversation context, generate a brief, descriptive title (maximum 5 words) that captures the main topic or purpose of the discussion:

${context}

Respond with only the title, no other text.`;

    const response = await agent.processMessage(prompt);
    const title = response.content.trim();
    
    res.json({ title });
  } catch (error: any) {
    console.error('Error generating title:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get current working directory
app.get('/api/workspace/directory', (req, res) => {
  try {
    res.json({ currentDirectory: currentWorkingDirectory, absolutePath: currentWorkingDirectory });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Set current working directory
app.post('/api/workspace/directory', (req: any, res: any) => {
  try {
    const { path: newPath } = req.body;
    if (!newPath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    // Allow both absolute and relative paths
    let fullPath;
    if (path.isAbsolute(newPath)) {
      fullPath = newPath;
    } else {
      fullPath = path.resolve(currentWorkingDirectory, newPath);
    }
    
    // Check if the path exists and is a directory
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Directory does not exist' });
    }
    
    const stats = fs.statSync(fullPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    currentWorkingDirectory = fullPath;
    res.json({ currentDirectory: currentWorkingDirectory, absolutePath: currentWorkingDirectory });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Set workspace root
app.post('/api/workspace/root', (req: any, res: any) => {
  try {
    const { path: newPath } = req.body;
    if (!newPath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    // Resolve path - can be relative to current working directory or absolute
    let fullPath;
    if (path.isAbsolute(newPath)) {
      fullPath = newPath;
    } else {
      fullPath = path.resolve(currentWorkingDirectory, newPath);
    }
    
    // Check if the path exists and is a directory
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Directory does not exist' });
    }
    
    const stats = fs.statSync(fullPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    // Update workspace root and reset current directory to the new root
    workspaceRoot = fullPath;
    currentWorkingDirectory = workspaceRoot;
    
    // Update agent's workspace root
    (agent as any).toolSystem.workspaceRoot = workspaceRoot;
    
    // Update agent configuration
    const newAgentConfig: AgentConfig = {
      workspaceRoot,
      llmConfig: agentConfig.llmConfig
    };
    
    // Reinitialize agent with new workspace
    (agent as any).config = newAgentConfig;
    
    logger.info(`Workspace root changed to: ${workspaceRoot}`);
    
    res.json({ 
      workspaceRoot: workspaceRoot, 
      currentDirectory: '.',
      message: 'Workspace root changed successfully' 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/workspace/files', async (req, res) => {
  try {
    // If we're outside the workspace, use absolute path directly
    let pathToList;
    if (currentWorkingDirectory.startsWith(workspaceRoot)) {
      pathToList = path.relative(workspaceRoot, currentWorkingDirectory) || '.';
    } else {
      // When outside workspace, we need to temporarily change the workspace root for this operation
      const originalRoot = (agent as any).toolSystem.workspaceRoot;
      (agent as any).toolSystem.workspaceRoot = currentWorkingDirectory;
      pathToList = '.';
      
      const result = await (agent as any)['toolSystem'].executeTool('list_directory', { path: pathToList });
      
      // Restore original workspace root
      (agent as any).toolSystem.workspaceRoot = originalRoot;
      
      if (result.success) {
        const files = result.output?.split('\n').filter((f: string) => f) || [];
        res.json(files);
      } else {
        res.status(500).json({ error: result.error });
      }
      return;
    }
    
    const result = await (agent as any)['toolSystem'].executeTool('list_directory', { path: pathToList });
    if (result.success) {
      const files = result.output?.split('\n').filter((f: string) => f) || [];
      res.json(files);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/workspace/file/:path(*)', async (req, res) => {
  try {
    const filePath = req.params.path;
    // Use raw content for file editor (no line numbers)
    const result = await (agent as any)['toolSystem'].readFileRaw(filePath);
    
    if (result.success) {
      res.json({ content: result.output });
    } else {
      res.status(404).json({ error: result.error });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/workspace/save', async (req: any, res: any) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: 'Path and content are required' });
    }

    const result = await (agent as any)['toolSystem'].executeTool('create_file', { 
      path: filePath, 
      content 
    });
    
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/workspace/delete', async (req: any, res: any) => {
  try {
    const { path: filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const result = await (agent as any)['toolSystem'].executeTool('delete_file', { 
      path: filePath
    });
    
    if (result.success) {
      res.json({ success: true, message: result.output });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Serve React app in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
  });
}

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Workspace: ${workspaceRoot}`);
  logger.info(`LLM: ${agentConfig.llmConfig.baseURL} (${agentConfig.llmConfig.model})`);
});

export default app;
