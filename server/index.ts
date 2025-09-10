import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { Agent, AgentConfig } from './agent.js';
import { logger } from './logger.js';
import { cleanContentForLLM } from './utils/content-filter.js';
import { LLMScanner } from './llm-scanner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client')));
}

// Get the system home directory cross-platform
function getHomeDirectory(): string {
  // Use environment variables first (most reliable)
  if (process.env.HOME) return process.env.HOME; // Unix/Linux/macOS
  if (process.env.USERPROFILE) return process.env.USERPROFILE; // Windows
  if (process.env.HOMEDRIVE && process.env.HOMEPATH) {
    return path.join(process.env.HOMEDRIVE, process.env.HOMEPATH); // Windows fallback
  }
  
  // Use Node.js os module as fallback
  return os.homedir();
}

// Initialize workspace and agent configuration
// Default to home directory if no working root is set
const defaultWorkspaceRoot = process.env.WORKSPACE_ROOT || getHomeDirectory();
let workspaceRoot = defaultWorkspaceRoot;
let currentWorkingDirectory = workspaceRoot;
let currentLlmConfig = {
  baseURL: 'http://localhost:11434',
  model: '',
  apiKey: undefined
};

// Store custom roles per thread
const threadRoles = new Map<string, string>();

const getAgentConfig = (threadId?: string): AgentConfig => ({
  workspaceRoot,
  llmConfig: currentLlmConfig,
  customRole: threadId ? threadRoles.get(threadId) : undefined
});

// Thread-aware agent pool
class AgentPool {
  private agents: Map<string, Agent> = new Map();
  private currentThreadId: string = 'default';

  setCurrentThread(threadId: string): void {
    this.currentThreadId = threadId;
    if (!this.agents.has(threadId)) {
      this.agents.set(threadId, new Agent(getAgentConfig(threadId)));
    }
  }

  getCurrentAgent(): Agent {
    if (!this.agents.has(this.currentThreadId)) {
      this.agents.set(this.currentThreadId, new Agent(getAgentConfig(this.currentThreadId)));
    }
    return this.agents.get(this.currentThreadId)!;
  }

  clearAllAgents(): void {
    this.agents.clear();
  }

  updateAllAgentsLLMConfig(newLlmConfig: any): void {
    for (const agent of this.agents.values()) {
      agent.updateLLMConfig(newLlmConfig);
    }
  }

  getAgent(threadId: string): Agent {
    if (!this.agents.has(threadId)) {
      this.agents.set(threadId, new Agent(getAgentConfig(threadId)));
    }
    return this.agents.get(threadId)!;
  }

  updateAllAgentsWorkspace(newWorkspaceRoot: string): void {
    try {
      // Update global workspace root
      workspaceRoot = newWorkspaceRoot;
      for (const agent of this.agents.values()) {
        if (agent && (agent as any).toolSystem) {
          (agent as any).toolSystem.workspaceRoot = newWorkspaceRoot;
        }
        if (agent && (agent as any).config) {
          (agent as any).config.workspaceRoot = newWorkspaceRoot;
        }
      }
    } catch (error) {
      logger.error('Error updating agents workspace:', error);
    }
  }

  clearThread(threadId: string): void {
    if (this.agents.has(threadId)) {
      this.agents.get(threadId)!.clearConversation();
    }
  }

  deleteThread(threadId: string): void {
    this.agents.delete(threadId);
  }

  hasAgent(threadId: string): boolean {
    return this.agents.has(threadId);
  }
}

const agentPool = new AgentPool();
const llmScanner = new LLMScanner();

// Scan for available LLM services on startup
llmScanner.scanAvailableServices().catch(error => {
  logger.error('Error scanning LLM services on startup:', error);
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', workspace: workspaceRoot });
});

// LLM Configuration
app.get('/api/llm-config', (req, res) => {
  res.json(currentLlmConfig);
});

app.post('/api/llm-config', (req: any, res: any) => {
  try {
    const { baseURL, model, apiKey } = req.body;
    logger.info('Updating LLM config:', { baseURL, model, apiKey: apiKey ? '[REDACTED]' : undefined });
    
    if (baseURL) currentLlmConfig.baseURL = baseURL;
    if (model) currentLlmConfig.model = model;
    if (apiKey !== undefined) currentLlmConfig.apiKey = apiKey;
    
    logger.info('Updated LLM config:', { 
      baseURL: currentLlmConfig.baseURL, 
      model: currentLlmConfig.model, 
      apiKey: currentLlmConfig.apiKey ? '[REDACTED]' : undefined 
    });
    
    // Update existing agents with new LLM config while preserving conversation history
    agentPool.updateAllAgentsLLMConfig(currentLlmConfig);
    
    res.json({ success: true, config: currentLlmConfig });
  } catch (error) {
    logger.error('Error updating LLM config:', error);
    res.status(500).json({ error: 'Failed to update LLM configuration' });
  }
});

// Available LLM Models
app.get('/api/llm/available', (req, res) => {
  try {
    const services = llmScanner.getAllServices();
    res.json(services);
  } catch (error) {
    logger.error('Error getting available LLM services:', error);
    res.status(500).json({ error: 'Failed to get available LLM services' });
  }
});

// Available LLM Models with metadata
app.get('/api/llm/available-with-metadata', async (req, res) => {
  try {
    const services = llmScanner.getAvailableServices();
    const servicesWithMetadata = [];

    for (const service of services) {
      if (service.type === 'ollama') {
        const modelsWithMetadata = await llmScanner.getAllModelsWithMetadata(service);
        servicesWithMetadata.push({
          ...service,
          modelsWithMetadata
        });
      } else {
        // For non-Ollama services, just return basic model list
        servicesWithMetadata.push({
          ...service,
          modelsWithMetadata: service.models.map(name => ({ name }))
        });
      }
    }

    res.json(servicesWithMetadata);
  } catch (error) {
    logger.error('Error getting available LLM services with metadata:', error);
    res.status(500).json({ error: 'Failed to get available LLM services with metadata' });
  }
});

app.post('/api/llm/rescan', async (req, res) => {
  try {
    const services = await llmScanner.rescanServices();
    res.json(services);
  } catch (error) {
    logger.error('Error rescanning LLM services:', error);
    res.status(500).json({ error: 'Failed to rescan LLM services' });
  }
});

app.get('/api/conversation', (req, res) => {
  res.json(agentPool.getCurrentAgent().getConversation());
});

app.post('/api/message', async (req: any, res: any) => {
  try {
    const { message, threadId } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Check if LLM model is configured
    if (!currentLlmConfig.model || currentLlmConfig.model.trim() === '') {
      return res.status(400).json({ error: 'No LLM model configured. Please select a model from the available options.' });
    }

    // Set current thread if provided
    if (threadId) {
      agentPool.setCurrentThread(threadId);
    }

    const response = await agentPool.getCurrentAgent().processMessage(message);
    res.json(response);
  } catch (error: any) {
    console.error('Error processing message:', error);
    res.status(500).json({ error: error.message });
  }
});

// SSE endpoint for real-time message processing
app.post('/api/message/stream', async (req: any, res: any) => {
  try {
    const { message, threadId } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Check if LLM model is configured
    logger.info('Stream message request received, current LLM config:', { 
      baseURL: currentLlmConfig.baseURL, 
      model: currentLlmConfig.model, 
      apiKey: currentLlmConfig.apiKey ? '[REDACTED]' : undefined 
    });
    
    if (!currentLlmConfig.model || currentLlmConfig.model.trim() === '') {
      return res.status(400).json({ error: 'No LLM model configured. Please select a model from the available options.' });
    }

    // Set current thread if provided
    if (threadId) {
      agentPool.setCurrentThread(threadId);
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

    // Process message with real-time updates using thread-specific agent
    const response = await agentPool.getCurrentAgent().processMessage(message, (updatedMessage: any) => {
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
  agentPool.getCurrentAgent().clearConversation();
  res.json({ success: true });
});

app.post('/api/load-thread/:threadId', async (req: any, res: any) => {
  try {
    const { threadId } = req.params;
    if (!threadId) {
      return res.status(400).json({ error: 'Thread ID is required' });
    }

    // Set the current thread in the agent pool
    agentPool.setCurrentThread(threadId);

    const fs = await import('fs/promises');
    const conversationsPath = path.join(workspaceRoot, 'CONVERSATIONS.json');
    
    try {
      const data = await fs.readFile(conversationsPath, 'utf-8');
      const conversations = JSON.parse(data);
      const thread = conversations.find((t: any) => t.id === threadId);
      
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }
      
      // Load the thread's messages into the thread-specific agent's conversation context
      agentPool.getCurrentAgent().loadConversation(thread.messages);
      
      // Set the custom role if it exists in the thread
      if (thread.customRole) {
        threadRoles.set(threadId, thread.customRole);
        agentPool.getCurrentAgent().updateRole(thread.customRole);
      } else {
        threadRoles.delete(threadId);
        agentPool.getCurrentAgent().updateRole(undefined);
      }
      res.json({ success: true });
      
    } catch (error) {
      // File doesn't exist or thread not found
      agentPool.getCurrentAgent().clearConversation();
      res.json({ success: true });
    }
  } catch (error: any) {
    console.error('Error loading thread into agent:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/message/cancel', (req: any, res: any) => {
  const { messageId, threadId } = req.body;
  if (!messageId) {
    return res.status(400).json({ error: 'Message ID is required' });
  }

  // Set current thread if provided
  if (threadId) {
    agentPool.setCurrentThread(threadId);
  }

  const cancelled = agentPool.getCurrentAgent().cancelMessage(messageId);
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

  const deleted = agentPool.getCurrentAgent().deleteMessage(messageId);
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

    // Check if LLM model is configured
    if (!currentLlmConfig.model || currentLlmConfig.model.trim() === '') {
      return res.status(400).json({ error: 'No LLM model configured. Please select a model from the available options.' });
    }

    // Create a prompt to generate a short title (filter out think tags from context)
    const cleanContext = cleanContentForLLM(context);
    const prompt = `Based on this conversation context, generate a brief, descriptive title (maximum 5 words) that captures the main topic or purpose of the discussion:

${cleanContext}

Respond with only the title, no other text.`;

    const response = await agentPool.getCurrentAgent().processMessage(prompt);
    const title = cleanContentForLLM(response.content).trim();
    
    res.json({ title });
  } catch (error: any) {
    console.error('Error generating title:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-role', async (req: any, res: any) => {
  try {
    const { personality } = req.body;
    
    if (!personality) {
      return res.status(400).json({ error: 'Personality description is required' });
    }

    // Check if LLM model is configured
    if (!currentLlmConfig.model || currentLlmConfig.model.trim() === '') {
      return res.status(400).json({ error: 'No LLM model configured. Please select a model from the available options.' });
    }

    // Create a prompt to generate a role definition based on the personality description
    const prompt = `Create a role definition for an AI assistant based on the user's description. Use their exact words and phrasing as much as possible while making it a proper role definition.

User's Description: "${personality}"

Transform this into a role definition that:
- Preserves the user's specific words, terminology, and meaning
- Incorporates their exact phrasing wherever possible
- Starts with "You are..." format
- Maintains the user's intended tone and characteristics
- Only adds minimal connecting words if needed for grammar

Exle transformation:
User says: "friendly, enthusiastic coding mentor who explains things clearly"
Result: "You are a friendly, enthusiastic coding mentor who explains things clearly and helps users learn through clear guidance."

Generate only the role definition using the user's words as the foundation.`;

    const response = await agentPool.getCurrentAgent().processMessage(prompt);
    const role = cleanContentForLLM(response.content).trim();
    
    res.json({ role });
  } catch (error: any) {
    console.error('Error generating role:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/role/:threadId?', (req, res) => {
  try {
    const threadId = req.params.threadId || 'default';
    const agent = agentPool.getAgent(threadId);
    
    res.json({
      currentRole: agent.getCurrentRole(),
      defaultRole: agent.getDefaultRole(),
      isDefault: agent.getCurrentRole() === agent.getDefaultRole(),
      hasCustomRole: threadRoles.has(threadId)
    });
  } catch (error: any) {
    console.error('Error getting role:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/role/:threadId?', (req: any, res: any) => {
  try {
    const threadId = req.params.threadId || 'default';
    const { customRole } = req.body;
    
    // Store the custom role for the thread
    if (customRole) {
      threadRoles.set(threadId, customRole);
    } else {
      threadRoles.delete(threadId);
    }
    
    // Update the agent's role
    const agent = agentPool.getAgent(threadId);
    agent.updateRole(customRole);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating role:', error);
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
    
    // Update workspace root for all agents in the pool
    agentPool.updateAllAgentsWorkspace(workspaceRoot);
    
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
      const currentAgent = agentPool.getCurrentAgent();
      const originalRoot = (currentAgent as any).toolSystem.workspaceRoot;
      (currentAgent as any).toolSystem.workspaceRoot = currentWorkingDirectory;
      pathToList = '.';
      
      const result = await (currentAgent as any)['toolSystem'].executeTool('list_directory', { path: pathToList });
      
      // Restore original workspace root
      (currentAgent as any).toolSystem.workspaceRoot = originalRoot;
      
      if (result.success) {
        const files = result.output?.split('\n').filter((f: string) => f) || [];
        res.json(files);
      } else {
        res.status(500).json({ error: result.error });
      }
      return;
    }
    
    const result = await (agentPool.getCurrentAgent() as any)['toolSystem'].executeTool('list_directory', { path: pathToList });
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
    const result = await (agentPool.getCurrentAgent() as any)['toolSystem'].readFileRaw(filePath);
    
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

    const result = await (agentPool.getCurrentAgent() as any)['toolSystem'].executeTool('create_file', { 
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

    const result = await (agentPool.getCurrentAgent() as any)['toolSystem'].executeTool('delete_file', { 
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
  logger.info(`LLM: ${currentLlmConfig.baseURL} (${currentLlmConfig.model})`);
});

export default app;
