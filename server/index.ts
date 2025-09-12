import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { Agent, AgentConfig } from './agent.js';
import { logger } from './logger.js';
import { cleanContentForLLM } from './utils/content-filter.js';
import { LLMScanner } from './llm-scanner.js';
import { LLMConfigManager } from './llm-config-manager.js';
import { getHomeDirectory } from './utils/settings-directory.js';
import { sseManager } from './sse-manager.js';
import { getLocalLLMManager } from './local-llm-singleton.js';
import localLlmRoutes from './routes/local-llm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Check for debug flag
const DEBUG_MODE = process.argv.includes('--debug');
if (DEBUG_MODE) {
  console.log('🐛 Debug mode enabled - verbose image logging active');
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Mount local LLM routes
app.use('/api/local-llm', localLlmRoutes);

// Serve static files from the built client
app.use(express.static(path.join(__dirname, '../client')));

// Home directory function moved to utils/settings-directory.ts

// Initialize workspace and agent configuration
// Default to home directory if no working root is set
const defaultWorkspaceRoot = process.env.WORKSPACE_ROOT || getHomeDirectory();
let workspaceRoot = defaultWorkspaceRoot;
let currentWorkingDirectory = workspaceRoot;
let currentLlmConfig = {
  baseURL: 'http://localhost:11434',
  model: '',
  displayName: undefined as string | undefined,
  apiKey: undefined as string | undefined,
  type: undefined as 'ollama' | 'vllm' | 'openai-compatible' | 'openai' | 'anthropic' | 'local' | undefined,
  debug: DEBUG_MODE
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
let llmConfigManager: LLMConfigManager;

// Initialize LLM configuration manager
async function initializeLLMConfig() {
  llmConfigManager = new LLMConfigManager();
  try {
    await llmConfigManager.loadConfiguration();
    logger.info('LLM configuration manager initialized');
  } catch (error) {
    logger.error('Failed to initialize LLM configuration manager:', error);
  }
}

// Scan for available LLM services on startup and refresh models
async function initializeLLMServices() {
  try {
    await initializeLLMConfig();
    await llmScanner.scanAvailableServices();
    await refreshModelList();
    logger.info('LLM services initialized');
  } catch (error) {
    logger.error('Error initializing LLM services:', error);
  }
}

// Refresh the model list from all sources
async function refreshModelList() {
  try {
    const detectedServices = llmScanner.getAvailableServices();
    
    // Get local models directly from the manager
    let localModels: any[] = [];
    try {
      const localLlmManager = getLocalLLMManager();
      localModels = await localLlmManager.getLocalModels();
    } catch (error) {
      logger.debug('Local LLM manager not available:', error);
    }

    await llmConfigManager.refreshModels(detectedServices, localModels);
    
    // Broadcast model updates to connected clients
    sseManager.broadcast('model-updates', {
      type: 'models-updated',
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error refreshing model list:', error);
  }
}

initializeLLMServices();

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', workspace: workspaceRoot });
});

// Legacy LLM configuration endpoints removed - now handled by server-side model management

// Get all available models from server-side configuration
app.get('/api/llm/models', async (req, res) => {
  try {
    const models = await llmConfigManager.getModels();
    res.json(models);
  } catch (error) {
    logger.error('Error getting LLM models:', error);
    res.status(500).json({ error: 'Failed to get LLM models' });
  }
});

// Get current default model
app.get('/api/llm/default-model', async (req, res) => {
  try {
    const defaultModel = await llmConfigManager.getDefaultModel();
    res.json(defaultModel);
  } catch (error) {
    logger.error('Error getting default LLM model:', error);
    res.status(500).json({ error: 'Failed to get default LLM model' });
  }
});

// Set default model
app.post('/api/llm/default-model', async (req: any, res: any) => {
  try {
    const { modelId } = req.body;
    if (!modelId) {
      return res.status(400).json({ error: 'Model ID is required' });
    }

    await llmConfigManager.setDefaultModel(modelId);
    
    // Update current LLM config for immediate use
    const defaultModel = await llmConfigManager.getDefaultModel();
    if (defaultModel) {
      currentLlmConfig.baseURL = defaultModel.baseURL;
      currentLlmConfig.model = defaultModel.model;
      currentLlmConfig.displayName = defaultModel.displayName;
      currentLlmConfig.apiKey = defaultModel.apiKey;
      currentLlmConfig.type = defaultModel.type;
      
      // Update existing agents with new LLM config
      agentPool.updateAllAgentsLLMConfig(currentLlmConfig);
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error setting default LLM model:', error);
    res.status(500).json({ error: 'Failed to set default LLM model' });
  }
});

// Legacy endpoint removed - models now managed server-side

app.post('/api/llm/rescan', async (req, res) => {
  try {
    const services = await llmScanner.rescanServices();
    
    // Get existing custom services
    const existingServices = await llmConfigManager.getCustomServices();
    const existingBaseURLs = new Set(existingServices.map(s => s.baseURL));
    const availableBaseURLs = new Set(services.filter(s => s.available && s.models.length > 0).map(s => s.baseURL));
    
    // Auto-add discovered local services as custom services
    const availableServices = services.filter(s => s.available && s.models.length > 0);
    const addedServices = [];
    
    for (const service of availableServices) {
      if (!existingBaseURLs.has(service.baseURL)) {
        try {
          const newService = await llmConfigManager.addCustomService({
            name: service.name,
            baseURL: service.baseURL,
            type: service.type,
            enabled: true
          });
          addedServices.push(newService);
          logger.info(`Auto-added local service: ${service.name}`);
        } catch (error) {
          logger.warn(`Failed to auto-add service ${service.name}:`, error);
        }
      }
    }
    
    // Remove existing custom services that are no longer available (only local services)
    const removedServices = [];
    const localServiceTypes = ['ollama', 'vllm', 'openai-compatible'];
    
    for (const existingService of existingServices) {
      // Only remove local services that were likely auto-added
      if (localServiceTypes.includes(existingService.type) && 
          existingService.baseURL.includes('localhost') &&
          !availableBaseURLs.has(existingService.baseURL)) {
        try {
          await llmConfigManager.removeCustomService(existingService.id);
          removedServices.push(existingService);
          logger.info(`Auto-removed unavailable local service: ${existingService.name}`);
        } catch (error) {
          logger.warn(`Failed to auto-remove service ${existingService.name}:`, error);
        }
      }
    }
    
    // Get local models directly from the manager
    let localModels: any[] = [];
    try {
      const localLlmManager = getLocalLLMManager();
      localModels = await localLlmManager.getLocalModels();
    } catch (error) {
      logger.debug('Local LLM manager not available:', error);
    }

    // Refresh the unified model list with fresh scanned services
    await llmConfigManager.refreshModels(services, localModels);
    
    // Broadcast model updates to connected clients
    sseManager.broadcast('model-updates', {
      type: 'models-updated',
      timestamp: Date.now()
    });
    
    res.json({ 
      scannedServices: services,
      addedServices: addedServices.length > 0 ? addedServices : undefined,
      removedServices: removedServices.length > 0 ? removedServices : undefined
    });
  } catch (error) {
    logger.error('Error rescanning LLM services:', error);
    res.status(500).json({ error: 'Failed to rescan LLM services' });
  }
});

// Custom LLM Services Management
app.get('/api/llm/custom-services', async (req, res) => {
  try {
    const customServices = await llmConfigManager.getCustomServices();
    res.json(customServices);
  } catch (error) {
    logger.error('Error getting custom LLM services:', error);
    res.status(500).json({ error: 'Failed to get custom LLM services' });
  }
});

app.post('/api/llm/custom-services', async (req: any, res: any) => {
  try {
    const { name, baseURL, type, apiKey, enabled } = req.body;
    
    if (!name || !baseURL || !type) {
      return res.status(400).json({ error: 'name, baseURL, and type are required' });
    }

    const newService = await llmConfigManager.addCustomService({
      name,
      baseURL,
      type,
      apiKey,
      enabled: enabled !== false // Default to true
    });

    await refreshModelList(); // Refresh model list after adding service
    res.json(newService);
  } catch (error) {
    logger.error('Error adding custom LLM service:', error);
    res.status(500).json({ error: 'Failed to add custom LLM service' });
  }
});

app.put('/api/llm/custom-services/:id', async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const updatedService = await llmConfigManager.updateCustomService(id, updates);
    await refreshModelList(); // Refresh model list after updating service
    res.json(updatedService);
  } catch (error) {
    logger.error('Error updating custom LLM service:', error);
    res.status(500).json({ error: 'Failed to update custom LLM service' });
  }
});

app.delete('/api/llm/custom-services/:id', async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await llmConfigManager.removeCustomService(id);
    await refreshModelList(); // Refresh model list after removing service
    res.json({ success: true });
  } catch (error) {
    logger.error('Error removing custom LLM service:', error);
    res.status(500).json({ error: 'Failed to remove custom LLM service' });
  }
});

// Test a custom LLM service
app.post('/api/llm/test-service', async (req: any, res: any) => {
  try {
    const { baseURL, type, apiKey } = req.body;
    
    if (!baseURL || !type) {
      return res.status(400).json({ error: 'baseURL and type are required' });
    }

    let endpoint: string;
    switch (type) {
      case 'ollama':
        endpoint = '/api/tags';
        break;
      case 'vllm':
      case 'openai-compatible':
      case 'openai':
      case 'anthropic':
        endpoint = '/v1/models';
        break;
      default:
        return res.status(400).json({ error: `Unknown service type: ${type}` });
    }

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    
    if (apiKey && (type === 'openai' || type === 'openai-compatible')) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    if (apiKey && type === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${baseURL}${endpoint}`, {
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return res.json({ 
          success: false, 
          error: `HTTP ${response.status}: ${response.statusText}` 
        });
      }

      const data = await response.json();
      
      let models: string[] = [];
      if (type === 'ollama') {
        models = data?.models?.map((m: any) => m.name || m.model || '').filter(Boolean) || [];
      } else if (type === 'anthropic') {
        models = data?.data?.map((m: any) => m.id || m.name || '').filter(Boolean) || [];
      } else {
        models = data?.data?.map((m: any) => m.id || m.model || '').filter(Boolean) || [];
      }

      res.json({ success: true, models });
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        res.json({ success: false, error: 'Request timeout' });
      } else {
        res.json({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Connection failed' 
        });
      }
    }
  } catch (error) {
    logger.error('Error testing LLM service:', error);
    res.status(500).json({ error: 'Failed to test LLM service' });
  }
});

// Server-Sent Events endpoint for real-time model updates
app.get('/api/llm/model-updates', (req, res) => {
  const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  sseManager.addClient(clientId, res, 'model-updates');
});

app.get('/api/conversation', (req, res) => {
  res.json(agentPool.getCurrentAgent().getConversation());
});



app.post('/api/message', async (req: any, res: any) => {
  try {
    const { message, threadId, images } = req.body;
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

    const response = await agentPool.getCurrentAgent().processMessage(message, images);
    res.json(response);
  } catch (error: any) {
    console.error('Error processing message:', error);
    res.status(500).json({ error: error.message });
  }
});

// SSE endpoint for real-time message processing
app.post('/api/message/stream', async (req: any, res: any) => {
  try {
    const { message, threadId, images } = req.body;
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
    const response = await agentPool.getCurrentAgent().processMessage(message, images, (updatedMessage: any) => {
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
    
    // Check if this is a local model not loaded error
    if (error.message === 'LOCAL_MODEL_NOT_LOADED') {
      res.write(`data: ${JSON.stringify({
        type: 'local-model-not-loaded',
        error: error.originalMessage || 'Model not loaded. Please load the model first.',
        modelId: error.modelId
      })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: error.message
      })}\n\n`);
    }
    res.end();
  }
});

app.post('/api/conversation/clear', (req, res) => {
  agentPool.getCurrentAgent().clearConversation();
  res.json({ success: true });
});

// Debug LLM endpoint for fixing rendering errors
app.post('/api/debug-fix', async (req: any, res: any) => {
  try {
    const { request, retryCount = 0 } = req.body;
    
    if (!request) {
      return res.status(400).json({ error: 'Debug request is required' });
    }
    
    const { originalContent, errorMessage, contentType, language } = request;
    
    // Generate fix prompt
    const fixPrompt = generateDebugFixPrompt(request);
    
    // Create a simple agent instance for debugging
    const agent = agentPool.getCurrentAgent();
    
    // Send request to LLM with debugging context
    const result = await agent.processMessage(fixPrompt);
    
    // Extract the fixed content from the response
    const fixedContent = extractFixedContent(result.content, contentType, language);
    
    if (fixedContent) {
      res.json({
        success: true,
        fixedContent,
        explanation: 'Content has been automatically corrected',
        retryCount
      });
    } else {
      res.json({
        success: false,
        error: 'Failed to extract valid fixed content from LLM response',
        retryCount
      });
    }
    
  } catch (error) {
    logger.error('Debug fix request failed:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      retryCount: req.body.retryCount || 0
    });
  }
});

function generateDebugFixPrompt(request: any): string {
  const basePrompt = `You are a debugging assistant helping to fix rendering errors in content. A piece of ${request.contentType} content failed to render with the following error:

ERROR: ${request.errorMessage}

ORIGINAL CONTENT:
\`\`\`${request.language || request.contentType}
${request.originalContent}
\`\`\`

Please analyze the error and provide a corrected version of the content. Focus only on fixing the specific issue mentioned in the error while preserving the original intent and structure as much as possible.

Your response should contain ONLY the corrected content within a code block of the same type. Do not include explanations, comments, or additional text outside the code block.`;

  switch (request.contentType) {
    case 'mermaid':
      return basePrompt + `

Common Mermaid issues to check:
- Syntax errors in node definitions
- Missing arrows or connections
- Invalid characters in node names
- Incorrect diagram type declarations
- Missing quotes around labels with spaces

Respond with only the corrected Mermaid diagram:
\`\`\`mermaid
[corrected diagram here]
\`\`\``;

    case 'latex':
      return basePrompt + `

Common LaTeX issues to check:
- Unmatched braces or brackets
- Invalid command syntax
- Missing required packages/commands
- Incorrect mathematical notation
- Invalid escape sequences

Respond with only the corrected LaTeX:
\`\`\`latex
[corrected LaTeX here]
\`\`\``;

    case 'code':
      return basePrompt + `

Common ${request.language || 'code'} issues to check:
- Syntax errors
- Missing brackets, parentheses, or quotes
- Invalid indentation
- Typos in keywords or function names
- Missing semicolons or other required punctuation

Respond with only the corrected code:
\`\`\`${request.language || 'text'}
[corrected code here]
\`\`\``;

    default:
      return basePrompt;
  }
}

function extractFixedContent(llmResponse: string, contentType: string, language?: string): string | null {
  const codeBlockRegex = new RegExp(`\`\`\`${language || contentType}\\n([\\s\\S]*?)\\n\`\`\``, 'i');
  const match = llmResponse.match(codeBlockRegex);
  
  if (match && match[1]) {
    return match[1].trim();
  }
  
  // Fallback: try to extract any code block
  const anyCodeBlockRegex = /```[\w]*\n([\s\S]*?)\n```/;
  const fallbackMatch = llmResponse.match(anyCodeBlockRegex);
  
  if (fallbackMatch && fallbackMatch[1]) {
    return fallbackMatch[1].trim();
  }
  
  return null;
}

app.post('/api/load-thread/:threadId', async (req: any, res: any) => {
  try {
    const { threadId } = req.params;
    if (!threadId) {
      return res.status(400).json({ error: 'Thread ID is required' });
    }

    // Set the current thread in the agent pool
    agentPool.setCurrentThread(threadId);

    const fs = await import('fs/promises');
    const conversationsPath = path.join(workspaceRoot, 'mindstrike-chats.json');
    
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
    const conversationsPath = path.join(workspaceRoot, 'mindstrike-chats.json');
    
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
    const conversationsPath = path.join(workspaceRoot, 'mindstrike-chats.json');
    
    await fs.writeFile(conversationsPath, JSON.stringify(conversations, null, 2));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error saving conversations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Workflows API
app.get('/api/workflows', async (req, res) => {
  try {
    const fs = await import('fs/promises');
    const workflowsPath = path.join(workspaceRoot, 'mindstrike-workflows.json');
    
    try {
      const data = await fs.readFile(workflowsPath, 'utf-8');
      const workflows = JSON.parse(data);
      res.json(workflows);
    } catch (error) {
      // File doesn't exist or is invalid, return empty array
      res.json([]);
    }
  } catch (error: any) {
    console.error('Error loading workflows:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/workflows', async (req, res) => {
  try {
    const fs = await import('fs/promises');
    const workflows = req.body;
    const workflowsPath = path.join(workspaceRoot, 'mindstrike-workflows.json');
    
    await fs.writeFile(workflowsPath, JSON.stringify(workflows, null, 2));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error saving workflows:', error);
    res.status(500).json({ error: error.message });
  }
});

// MindMaps API
app.get('/api/mindmaps', async (req, res) => {
  try {
    const fs = await import('fs/promises');
    const mindMapsPath = path.join(workspaceRoot, 'mindstrike-mindmaps.json');
    
    try {
      const data = await fs.readFile(mindMapsPath, 'utf-8');
      const mindMaps = JSON.parse(data);
      res.json(mindMaps);
    } catch (error) {
      // File doesn't exist or is invalid, return empty array
      res.json([]);
    }
  } catch (error: any) {
    console.error('Error loading mindmaps:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/mindmaps', async (req, res) => {
  try {
    const fs = await import('fs/promises');
    const mindMaps = req.body;
    const mindMapsPath = path.join(workspaceRoot, 'mindstrike-mindmaps.json');
    
    // Read existing data to preserve mindmap data
    let existingMindMaps = [];
    try {
      const existingData = await fs.readFile(mindMapsPath, 'utf-8');
      existingMindMaps = JSON.parse(existingData);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, that's fine
    }
    
    // Create a map of existing mindmap data
    const existingMindmapData = new Map();
    existingMindMaps.forEach((mindMap: any) => {
      if (mindMap.mindmapData) {
        existingMindmapData.set(mindMap.id, mindMap.mindmapData);
      }
    });
    
    // Merge new mindmaps with existing mindmap data
    const mergedMindMaps = mindMaps.map((mindMap: any) => {
      const existingMindmap = existingMindmapData.get(mindMap.id);
      if (existingMindmap) {
        return { ...mindMap, mindmapData: existingMindmap };
      } else {
        // Initialize new mindmaps with default mindmapData structure containing root node
        const initialMindmapData = {
          root: {
            id: `node-${Date.now()}-${mindMap.id}`,
            text: 'Central Idea',
            notes: null,
            layout: 'graph-right'
          }
        };
        return { ...mindMap, mindmapData: initialMindmapData };
      }
    });
    
    await fs.writeFile(mindMapsPath, JSON.stringify(mergedMindMaps, null, 2));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error saving mindmaps:', error);
    res.status(500).json({ error: error.message });
  }
});

// MindMap data API for MindMaps
app.get('/api/mindmaps/:mindMapId/mindmap', async (req: Request, res: Response) => {
  try {
    const { mindMapId } = req.params;
    const fs = await import('fs/promises');
    const mindMapsPath = path.join(workspaceRoot, 'mindstrike-mindmaps.json');
    
    const result = await withFileLock(mindMapsPath, async () => {
      try {
        const data = await fs.readFile(mindMapsPath, 'utf-8');
        if (!data.trim()) {
          return null;
        }
        const mindMaps = JSON.parse(data);
        return mindMaps.find((m: any) => m.id === mindMapId);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          return null;
        } else if (error instanceof SyntaxError) {
          logger.warn(`Corrupted mindmaps file detected during read: ${error.message}`);
          return null;
        }
        throw error;
      }
    });
    
    if (!result) {
      return res.status(404).json({ error: 'Mindmap data not found' });
    }
    
    res.json(result.mindmapData);
  } catch (error: any) {
    console.error('Error loading mindmap data:', error);
    res.status(500).json({ error: error.message });
  }
});

// In-memory lock to prevent concurrent file operations
const fileLocks = new Map<string, Promise<any>>();

async function withFileLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  const existingLock = fileLocks.get(filePath);
  
  const lockPromise = existingLock 
    ? existingLock.then(() => operation()).catch(() => operation())
    : operation();
  
  fileLocks.set(filePath, lockPromise);
  
  try {
    const result = await lockPromise;
    // Clean up completed lock
    if (fileLocks.get(filePath) === lockPromise) {
      fileLocks.delete(filePath);
    }
    return result;
  } catch (error) {
    // Clean up failed lock
    if (fileLocks.get(filePath) === lockPromise) {
      fileLocks.delete(filePath);
    }
    throw error;
  }
}

app.post('/api/mindmaps/:mindMapId/mindmap', async (req: Request, res: Response) => {
  try {
    const { mindMapId } = req.params;
    const mindmapData = req.body;
    const fs = await import('fs/promises');
    const mindMapsPath = path.join(workspaceRoot, 'mindstrike-mindmaps.json');
    
    await withFileLock(mindMapsPath, async () => {
      let mindMaps = [];
      try {
        const data = await fs.readFile(mindMapsPath, 'utf-8');
        if (data.trim()) {
          mindMaps = JSON.parse(data);
        }
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          // File doesn't exist, start with empty array
          mindMaps = [];
        } else if (error instanceof SyntaxError) {
          // Corrupted JSON, log and start fresh
          logger.warn(`Corrupted mindmaps file detected, recreating: ${error.message}`);
          mindMaps = [];
        } else {
          throw error;
        }
      }
      
      const existingMindMapIndex = mindMaps.findIndex((m: any) => m.id === mindMapId);
      if (existingMindMapIndex >= 0) {
        mindMaps[existingMindMapIndex].mindmapData = mindmapData;
      } else {
        mindMaps.push({ id: mindMapId, mindmapData });
      }
      
      await fs.writeFile(mindMapsPath, JSON.stringify(mindMaps, null, 2));
    });

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error saving mindmap data:', error);
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

Example transformation:
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

// Serve React app for all non-API routes (SPA catch-all)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Only start the server if this file is run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Workspace: ${workspaceRoot}`);
    logger.info(`LLM: ${currentLlmConfig.baseURL} (${currentLlmConfig.model})`);
  });
}

export default app;
