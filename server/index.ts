import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Agent, AgentConfig } from './agent.js';

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
const workspaceRoot = process.cwd();
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

app.post('/api/conversation/clear', (req, res) => {
  agent.clearConversation();
  res.json({ success: true });
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

app.get('/api/workspace/files', async (req, res) => {
  try {
    const result = await (agent as any)['toolSystem'].executeTool('list_directory', {});
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
  console.log(`Server running on port ${PORT}`);
  console.log(`Workspace: ${workspaceRoot}`);
  console.log(`LLM: ${agentConfig.llmConfig.baseURL} (${agentConfig.llmConfig.model})`);
});

export default app;
