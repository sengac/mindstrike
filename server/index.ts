import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, statSync, createReadStream, stat } from 'fs';
import { musicMetadataCache } from './music-metadata-cache.js';
import { Stats } from 'fs';

import { fileURLToPath } from 'url';
// NOTE: .js extensions are required for ES modules in Node.js/Electron
// Without them, we get ERR_MODULE_NOT_FOUND errors in the packaged app
import { Agent, AgentConfig } from './agent.js';
import { logger } from './logger.js';
import { cleanContentForLLM } from './utils/content-filter.js';
import { LLMScanner } from './llm-scanner.js';
import { LLMConfigManager } from './llm-config-manager.js';
import { mcpManager } from './mcp-manager.js';
import { lfsManager } from './lfs-manager.js';
import {
  getHomeDirectory,
  getWorkspaceRoot,
  getMusicRoot,
  setWorkspaceRoot,
  setMusicRoot,
} from './utils/settings-directory.js';
import { sseManager } from './sse-manager.js';
import {
  getLocalLLMManager,
  cleanup as cleanupLLMWorker,
} from './local-llm-singleton.js';
import { LocalModelInfo } from './local-llm-manager.js';
import localLlmRoutes from './routes/local-llm.js';
import modelScanRoutes from './routes/model-scan.js';
import { MindmapAgentIterative } from './agents/mindmap-agent-iterative.js';
import { WorkflowAgent } from './agents/workflow-agent.js';
import { ConversationManager } from './conversation-manager.js';
import { asyncHandler } from './utils/async-handler.js';
import {
  ImageAttachment,
  NotesAttachment,
  SSEEventType,
} from '../src/types.js';
import { systemInfoManager } from './system-info-manager.js';
import { ChatAgent } from './agents/chat-agent.js';

// Cancellation system for ongoing message processing
class MessageCancellationManager {
  private activeTasks = new Map<string, AbortController>();

  startTask(threadId: string): AbortController {
    // Cancel any existing task for this thread
    this.cancelTask(threadId);

    const controller = new AbortController();
    this.activeTasks.set(threadId, controller);
    return controller;
  }

  cancelTask(threadId: string): boolean {
    const controller = this.activeTasks.get(threadId);
    if (controller) {
      controller.abort();
      this.activeTasks.delete(threadId);
      return true;
    }
    return false;
  }

  isTaskActive(threadId: string): boolean {
    return this.activeTasks.has(threadId);
  }

  cleanup() {
    for (const controller of this.activeTasks.values()) {
      controller.abort();
    }
    this.activeTasks.clear();
  }
}

// Type definitions
interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
}

interface ToolResult {
  name: string;
  result: unknown;
}

interface MessageWithTools {
  id: string;
  content: string;
  timestamp: Date;
  status?: 'completed' | 'cancelled' | 'processing';
  model?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  images?: ImageAttachment[];
  notes?: NotesAttachment[];
}

interface _MindMapData {
  id: string;
  mindmapData?: Record<string, unknown>;
  [key: string]: unknown;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize cancellation manager
const cancellationManager = new MessageCancellationManager();

// Helper function to sync current agent with thread history
async function syncCurrentAgentWithThread(threadId: string): Promise<void> {
  const { globalSessionManager } = await import('./session-manager.js');
  const currentAgent = agentPool.getCurrentAgent();

  await globalSessionManager.switchToThread(
    currentAgent.llmConfig.type || 'openai',
    currentAgent.llmConfig.model || 'gpt-4',
    threadId
  );
}

// Increase max listeners for development
process.setMaxListeners(200);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Handle OPTIONS requests explicitly
app.options('*', (req: Request, res: Response) => {
  res.status(200).end();
});

// Mount local LLM routes
app.use('/api/local-llm', localLlmRoutes);

// Mount model scan routes
app.use('/api/model-scan', modelScanRoutes);

// System information endpoint
app.get(
  '/api/system/info',
  asyncHandler(async (req: Request, res: Response) => {
    const systemInfo = await systemInfoManager.getSystemInfo();
    res.json(systemInfo);
  })
);

// Serve static files from the built client (only when not in development mode)
// In development, Vite serves the frontend
if (process.env.NODE_ENV !== 'development') {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // When built, server is at dist/server/server/index.js
  // Client files are at dist/client/
  // So from server location: ../../client
  const clientPath = path.join(__dirname, '../../client');

  if (existsSync(clientPath)) {
    logger.info(`Serving static files from: ${clientPath}`);
    app.use(express.static(clientPath));
  } else {
    logger.error(`Client directory not found: ${clientPath}`);
  }
}

// Audio streaming endpoint with range request support
app.get('/audio/*', (req: Request, res: Response) => {
  const audioPath = req.params[0];
  const fullPath = path.resolve(musicRoot, audioPath);

  // Security check - ensure the path is within music root
  if (!fullPath.startsWith(path.resolve(musicRoot))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Check if file exists
  stat(fullPath, (err: NodeJS.ErrnoException | null, stats: Stats) => {
    if (err) {
      console.error('Audio file not found:', fullPath);
      return res.status(404).json({ error: 'Audio file not found' });
    }

    const range = req.headers.range;
    const fileSize = stats.size;

    // Set proper MIME type based on file extension
    const ext = path.extname(fullPath).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.flac': 'audio/flac',
      '.webm': 'audio/webm',
    };
    const contentType = mimeTypes[ext] || 'audio/mpeg';

    if (range) {
      // Parse range header
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;

      // Validate range
      if (start >= fileSize || end >= fileSize) {
        res.status(416).set({
          'Content-Range': `bytes */${fileSize}`,
        });
        return res.end();
      }

      const headers = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      };

      res.writeHead(206, headers);
      const stream = createReadStream(fullPath, { start, end });
      stream.pipe(res);
    } else {
      // No range requested, serve entire file
      const headers = {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      };

      res.writeHead(200, headers);
      createReadStream(fullPath).pipe(res);
    }
  });
});

// Home directory function moved to utils/settings-directory.ts

// Initialize workspace, music and agent configuration
// Default to home directory if no working root is set
const defaultWorkspaceRoot = process.env.WORKSPACE_ROOT || getHomeDirectory();
let workspaceRoot = defaultWorkspaceRoot;
const defaultMusicRoot = process.env.MUSIC_ROOT || getHomeDirectory();
let musicRoot = defaultMusicRoot;
let currentWorkingDirectory = workspaceRoot;

// Load actual workspace/music roots from persistent storage at startup
async function loadWorkspaceSettings() {
  const persistedWorkspaceRoot = await getWorkspaceRoot();
  const persistedMusicRoot = await getMusicRoot();

  if (persistedWorkspaceRoot) {
    workspaceRoot = persistedWorkspaceRoot;
    currentWorkingDirectory = workspaceRoot;
  }

  if (persistedMusicRoot) {
    musicRoot = persistedMusicRoot;
  }
}
let currentLlmConfig = {
  baseURL: 'http://localhost:11434',
  model: '',
  displayName: undefined as string | undefined,
  apiKey: undefined as string | undefined,
  type: undefined as
    | 'ollama'
    | 'vllm'
    | 'openai-compatible'
    | 'openai'
    | 'anthropic'
    | 'perplexity'
    | 'google'
    | 'local'
    | undefined,
  contextLength: undefined as number | undefined,
};

// Store custom prompts per thread
const threadPrompts = new Map<string, string>();

// Initialize conversation manager after loading workspace settings
let conversationManager: ConversationManager;

async function initializeConversationManager() {
  await loadWorkspaceSettings();
  conversationManager = new ConversationManager(workspaceRoot);
  await conversationManager.load();
}

const getAgentConfig = (threadId?: string): AgentConfig => ({
  workspaceRoot,
  llmConfig: currentLlmConfig,
  customPrompt: threadId ? threadPrompts.get(threadId) : undefined,
});

// Thread-aware agent pool
class AgentPool {
  private agents: Map<string, Agent> = new Map();
  private workflowAgents: Map<string, WorkflowAgent> = new Map();
  private currentThreadId: string = 'default';

  async setCurrentThread(threadId: string): Promise<void> {
    this.currentThreadId = threadId;
    // Sync current agent with new thread's chat history
    await syncCurrentAgentWithThread(threadId);
  }

  getCurrentAgent(): Agent {
    return this.getOrCreateAgent(this.currentThreadId);
  }

  private getOrCreateAgent(threadId: string): Agent {
    if (!this.agents.has(threadId)) {
      this.agents.set(threadId, new Agent(getAgentConfig(threadId)));
    }
    return this.agents.get(threadId)!;
  }

  clearAllAgents(): void {
    this.agents.clear();
    this.workflowAgents.clear();
  }

  getActiveAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  async updateAllAgentsLLMConfig(
    newLlmConfig: AgentConfig['llmConfig']
  ): Promise<void> {
    for (const agent of this.agents.values()) {
      agent.updateLLMConfig(newLlmConfig);
    }
    for (const workflowAgent of this.workflowAgents.values()) {
      workflowAgent.updateLLMConfig(newLlmConfig);
    }

    // Sync current agent with current thread after model change
    await syncCurrentAgentWithThread(this.currentThreadId);
  }

  getAgent(threadId: string): Agent {
    return this.getOrCreateAgent(threadId);
  }

  getWorkflowAgent(threadId: string): WorkflowAgent {
    return this.getOrCreateWorkflowAgent(threadId);
  }

  private getOrCreateWorkflowAgent(threadId: string): WorkflowAgent {
    if (!this.workflowAgents.has(threadId)) {
      this.workflowAgents.set(
        threadId,
        new WorkflowAgent(getAgentConfig(threadId), threadId)
      );
    }
    return this.workflowAgents.get(threadId)!;
  }

  updateAllAgentsWorkspace(newWorkspaceRoot: string): void {
    try {
      // Update global workspace root
      workspaceRoot = newWorkspaceRoot;

      // Update MCP manager workspace root
      mcpManager.setWorkspaceRoot(newWorkspaceRoot);

      for (const agent of this.agents.values()) {
        if (agent) {
          agent.updateWorkspaceRoot(newWorkspaceRoot);
        }
      }
      for (const workflowAgent of this.workflowAgents.values()) {
        if (workflowAgent) {
          workflowAgent.updateWorkspaceRoot(newWorkspaceRoot);
        }
      }
    } catch (error) {
      logger.error('Error updating agents workspace:', error);
    }
  }

  async refreshAllAgentsTools(): Promise<void> {
    try {
      // Refresh tools for all regular agents
      for (const agent of this.agents.values()) {
        if (agent) {
          await agent.refreshTools();
        }
      }
      // Refresh tools for all workflow agents
      for (const workflowAgent of this.workflowAgents.values()) {
        if (workflowAgent) {
          await workflowAgent.refreshTools();
        }
      }
    } catch (error) {
      logger.error('Error refreshing agents tools:', error);
    }
  }

  async clearThread(threadId: string): Promise<void> {
    if (this.agents.has(threadId)) {
      await this.agents.get(threadId)!.clearConversation(threadId);
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
  } catch (error) {
    logger.error('Failed to initialize LLM configuration manager:', error);
  }
}

// Scan for available LLM services on startup and refresh models
async function initializeLLMServices() {
  try {
    await initializeLLMConfig();

    // Initialize model fetcher
    try {
      const { modelFetcher } = await import('./model-fetcher.js');
      await modelFetcher.initialize();
    } catch (error) {
      logger.warn('Failed to initialize model fetcher:', error);
    }

    await llmScanner.scanAvailableServices();
    await refreshModelList();
  } catch (error) {
    logger.error('Error initializing LLM services:', error);
  }
}

// Refresh the model list from all sources
async function refreshModelList() {
  try {
    const detectedServices = llmScanner.getAvailableServices();

    // Get local models directly from the manager
    let localModels: LocalModelInfo[] = [];
    try {
      const localLlmManager = getLocalLLMManager();
      localModels = await localLlmManager.getLocalModels();
    } catch (error) {
      logger.debug('Local LLM manager not available:', error);
    }

    await llmConfigManager.refreshModels(detectedServices, localModels);

    // Load default model into currentLlmConfig if available and not already set
    if (!currentLlmConfig.model || currentLlmConfig.model.trim() === '') {
      try {
        const defaultModel = await llmConfigManager.getDefaultModel();
        if (defaultModel) {
          currentLlmConfig.baseURL = defaultModel.baseURL;
          currentLlmConfig.model = defaultModel.model;
          currentLlmConfig.displayName = defaultModel.displayName;
          currentLlmConfig.apiKey = defaultModel.apiKey;
          currentLlmConfig.type = defaultModel.type;
          currentLlmConfig.contextLength = defaultModel.contextLength;

          // Update existing agents with new LLM config
          await agentPool.updateAllAgentsLLMConfig(currentLlmConfig);
        } else {
          // If no default model is set, try to auto-select the first available model
          const models = await llmConfigManager.getModels();
          const firstAvailableModel = models.find(m => m.available);

          if (firstAvailableModel) {
            await llmConfigManager.setDefaultModel(firstAvailableModel.id);

            currentLlmConfig.baseURL = firstAvailableModel.baseURL;
            currentLlmConfig.model = firstAvailableModel.model;
            currentLlmConfig.displayName = firstAvailableModel.displayName;
            currentLlmConfig.apiKey = firstAvailableModel.apiKey;
            currentLlmConfig.type = firstAvailableModel.type;
            currentLlmConfig.contextLength = firstAvailableModel.contextLength;

            // Update existing agents with new LLM config
            await agentPool.updateAllAgentsLLMConfig(currentLlmConfig);
          }
        }
      } catch {
        // No default model available
      }
    }

    // Broadcast model updates to connected clients
    sseManager.broadcast('unified-events', {
      type: SSEEventType.MODELS_UPDATED,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Error refreshing model list:', error);
  }
}

// Initialize services with proper error handling
initializeLLMServices().catch(error => {
  logger.error('Failed to initialize LLM services:', error);
});

// Initialize conversation manager and load workspace settings
initializeConversationManager().catch(error => {
  logger.error('Failed to initialize conversation manager:', error);
});

// API Routes
// Health monitoring
setInterval(() => {
  sseManager.broadcast('unified-events', {
    type: 'health',
    status: 'connected',
    timestamp: Date.now(),
  });
}, 30000); // Every 30 seconds

// Playlist file operation queue to prevent race conditions
class PlaylistFileQueue {
  private queue: Array<() => Promise<void>> = [];
  private isProcessing = false;

  async add<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const operation = this.queue.shift()!;
      await operation();
    }

    this.isProcessing = false;
  }
}

const playlistFileQueue = new PlaylistFileQueue();

// Playlist API endpoints
app.post('/api/playlists/save', async (req: Request, res: Response) => {
  try {
    const result = await playlistFileQueue.add(async () => {
      const { getMindstrikeDirectory } = await import(
        './utils/settings-directory.js'
      );
      const playlists = req.body;

      const playlistsDir = path.join(getMindstrikeDirectory(), 'playlists');
      await fs.mkdir(playlistsDir, { recursive: true });

      const playlistsFile = path.join(playlistsDir, 'playlists.json');
      await fs.writeFile(playlistsFile, JSON.stringify(playlists, null, 2));

      return { success: true };
    });

    res.json(result);
  } catch (error) {
    console.error('Error saving playlists:', error);
    res.status(500).json({ error: 'Failed to save playlists' });
  }
});

app.get('/api/playlists/load', async (req: Request, res: Response) => {
  try {
    const result = await playlistFileQueue.add(async () => {
      const { getMindstrikeDirectory } = await import(
        './utils/settings-directory.js'
      );
      const playlistsDir = path.join(getMindstrikeDirectory(), 'playlists');
      const playlistsFile = path.join(playlistsDir, 'playlists.json');

      try {
        const data = await fs.readFile(playlistsFile, 'utf8');
        try {
          const playlists = JSON.parse(data);
          return playlists;
        } catch (parseError) {
          // Invalid JSON, create empty playlists file and return empty array
          console.warn(
            'Invalid JSON in playlists file, creating new empty playlists file'
          );
          await fs.mkdir(playlistsDir, { recursive: true });
          await fs.writeFile(playlistsFile, JSON.stringify([], null, 2));
          return [];
        }
      } catch (error) {
        // File doesn't exist, create empty playlists file and return empty array
        console.log(
          'Playlists file does not exist, creating new empty playlists file'
        );
        await fs.mkdir(playlistsDir, { recursive: true });
        await fs.writeFile(playlistsFile, JSON.stringify([], null, 2));
        return [];
      }
    });

    res.json(result);
  } catch (error) {
    console.error('Error loading playlists:', error);
    res.status(500).json({ error: 'Failed to load playlists' });
  }
});

app.get('/api/playlists/:id', async (req: Request, res: Response) => {
  try {
    const { getMindstrikeDirectory } = await import(
      './utils/settings-directory.js'
    );
    const playlistsDir = path.join(getMindstrikeDirectory(), 'playlists');
    const playlistsFile = path.join(playlistsDir, 'playlists.json');

    const data = await fs.readFile(playlistsFile, 'utf8');
    let playlists;
    try {
      playlists = JSON.parse(data);
    } catch (parseError) {
      console.warn('Invalid JSON in playlists file');
      return res.status(500).json({ error: 'Invalid playlists file format' });
    }
    const playlist = playlists.find((p: any) => p.id === req.params.id);

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    res.json(playlist);
  } catch (error) {
    console.error('Error loading playlist:', error);
    res.status(500).json({ error: 'Failed to load playlist' });
  }
});

app.delete('/api/playlists/:id', async (req: Request, res: Response) => {
  try {
    const { getMindstrikeDirectory } = await import(
      './utils/settings-directory.js'
    );
    const playlistsDir = path.join(getMindstrikeDirectory(), 'playlists');
    const playlistsFile = path.join(playlistsDir, 'playlists.json');

    const data = await fs.readFile(playlistsFile, 'utf8');
    let playlists;
    try {
      playlists = JSON.parse(data);
    } catch (parseError) {
      console.warn('Invalid JSON in playlists file');
      return res.status(500).json({ error: 'Invalid playlists file format' });
    }
    const filteredPlaylists = playlists.filter(
      (p: any) => p.id !== req.params.id
    );

    await fs.writeFile(
      playlistsFile,
      JSON.stringify(filteredPlaylists, null, 2)
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting playlist:', error);
    res.status(500).json({ error: 'Failed to delete playlist' });
  }
});

// Get all available models from server-side configuration
app.get(
  '/api/llm/models',
  asyncHandler(async (req: Request, res: Response) => {
    const models = await llmConfigManager.getModels();
    res.json(models);
  })
);

// Get current default model
app.get(
  '/api/llm/default-model',
  asyncHandler(async (req: Request, res: Response) => {
    const defaultModel = await llmConfigManager.getDefaultModel();
    res.json(defaultModel);
  })
);

// Set default model
app.post(
  '/api/llm/default-model',
  asyncHandler(async (req: Request, res: Response) => {
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
      currentLlmConfig.contextLength = defaultModel.contextLength;

      // Update existing agents with new LLM config
      await agentPool.updateAllAgentsLLMConfig(currentLlmConfig);
    }

    res.json({ success: true });
  })
);

app.post('/api/llm/rescan', async (req: Request, res: Response) => {
  try {
    const services = await llmScanner.rescanServices();

    // Get existing custom services
    const existingServices = await llmConfigManager.getCustomServices();
    const existingBaseURLs = new Set(existingServices.map(s => s.baseURL));
    const availableBaseURLs = new Set(
      services
        .filter(s => s.available && s.models.length > 0)
        .map(s => s.baseURL)
    );

    // Auto-add discovered local services as custom services
    const availableServices = services.filter(
      s => s.available && s.models.length > 0
    );
    const addedServices = [];

    for (const service of availableServices) {
      if (!existingBaseURLs.has(service.baseURL)) {
        try {
          const newService = await llmConfigManager.addCustomService({
            name: service.name,
            baseURL: service.baseURL,
            type: service.type,
            enabled: true,
          });
          addedServices.push(newService);
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
      if (
        localServiceTypes.includes(existingService.type) &&
        existingService.baseURL.includes('localhost') &&
        !availableBaseURLs.has(existingService.baseURL)
      ) {
        try {
          await llmConfigManager.removeCustomService(existingService.id);
          removedServices.push(existingService);
        } catch (error) {
          logger.warn(
            `Failed to auto-remove service ${existingService.name}:`,
            error
          );
        }
      }
    }

    // Get local models directly from the manager
    let localModels: LocalModelInfo[] = [];
    try {
      const localLlmManager = getLocalLLMManager();
      localModels = await localLlmManager.getLocalModels();
    } catch (error) {
      logger.debug('Local LLM manager not available:', error);
    }

    // Refresh the unified model list with fresh scanned services
    await llmConfigManager.refreshModels(services, localModels);

    // Broadcast model updates to connected clients
    sseManager.broadcast('unified-events', {
      type: SSEEventType.MODELS_UPDATED,
      timestamp: Date.now(),
    });

    res.json({
      scannedServices: services,
      addedServices: addedServices.length > 0 ? addedServices : undefined,
      removedServices: removedServices.length > 0 ? removedServices : undefined,
    });
  } catch (error) {
    logger.error('Error rescanning LLM services:', error);
    res.status(500).json({ error: 'Failed to rescan LLM services' });
  }
});

// Custom LLM Services Management
app.get('/api/llm/custom-services', async (req: Request, res: Response) => {
  try {
    const customServices = await llmConfigManager.getCustomServices();
    res.json(customServices);
  } catch (error) {
    logger.error('Error getting custom LLM services:', error);
    res.status(500).json({ error: 'Failed to get custom LLM services' });
  }
});

app.post('/api/llm/custom-services', async (req: Request, res: Response) => {
  try {
    const { name, baseURL, type, apiKey, enabled } = req.body;

    if (!name || !baseURL || !type) {
      return res
        .status(400)
        .json({ error: 'name, baseURL, and type are required' });
    }

    const newService = await llmConfigManager.addCustomService({
      name,
      baseURL,
      type,
      apiKey,
      enabled: enabled !== false, // Default to true
    });

    await refreshModelList(); // Refresh model list after adding service
    res.json(newService);
  } catch (error) {
    logger.error('Error adding custom LLM service:', error);
    res.status(500).json({ error: 'Failed to add custom LLM service' });
  }
});

app.put('/api/llm/custom-services/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const updatedService = await llmConfigManager.updateCustomService(
      id,
      updates
    );
    await refreshModelList(); // Refresh model list after updating service
    res.json(updatedService);
  } catch (error) {
    logger.error('Error updating custom LLM service:', error);
    res.status(500).json({ error: 'Failed to update custom LLM service' });
  }
});

app.delete(
  '/api/llm/custom-services/:id',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await llmConfigManager.removeCustomService(id);
      await refreshModelList(); // Refresh model list after removing service
      res.json({ success: true });
    } catch (error) {
      logger.error('Error removing custom LLM service:', error);
      res.status(500).json({ error: 'Failed to remove custom LLM service' });
    }
  }
);

// Test a custom LLM service
app.post('/api/llm/test-service', async (req: Request, res: Response) => {
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
      case 'perplexity':
        // Return known Perplexity models
        return res.json(['sonar-pro', 'sonar', 'sonar-deep-research']);
      case 'google':
        // Return known Google models
        return res.json([
          'gemini-1.5-pro',
          'gemini-1.5-flash',
          'gemini-2.5-pro',
          'gemini-2.5-flash',
          'gemini-pro',
        ]);
      default:
        return res.status(400).json({ error: `Unknown service type: ${type}` });
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (apiKey && (type === 'openai' || type === 'openai-compatible')) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    if (apiKey && type === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    if (apiKey && type === 'perplexity') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    if (apiKey && type === 'google') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${baseURL}${endpoint}`, {
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return res.json({
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      const data = await response.json();

      let models: string[] = [];
      interface ModelResponse {
        id?: string;
        name?: string;
        model?: string;
      }

      interface OllamaResponse {
        models?: ModelResponse[];
      }

      interface OpenAIResponse {
        data?: ModelResponse[];
      }

      if (type === 'ollama') {
        const ollamaData = data as OllamaResponse;
        models =
          ollamaData?.models
            ?.map((m: ModelResponse) => m.name || m.model || '')
            .filter(Boolean) || [];
      } else if (type === 'anthropic') {
        const anthropicData = data as OpenAIResponse;
        models =
          anthropicData?.data
            ?.map((m: ModelResponse) => m.id || m.name || '')
            .filter(Boolean) || [];
      } else if (type === 'perplexity') {
        // This shouldn't be reached since we return early for perplexity, but just in case
        models = ['sonar-pro', 'sonar', 'sonar-deep-research'];
      } else if (type === 'google') {
        // This shouldn't be reached since we return early for google, but just in case
        models = [
          'gemini-1.5-pro',
          'gemini-1.5-flash',
          'gemini-2.5-pro',
          'gemini-2.5-flash',
          'gemini-pro',
        ];
      } else {
        const openaiData = data as OpenAIResponse;
        models =
          openaiData?.data
            ?.map((m: ModelResponse) => m.id || m.model || '')
            .filter(Boolean) || [];
      }

      res.json({ success: true, models });
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        res.json({ success: false, error: 'Request timeout' });
      } else {
        res.json({
          success: false,
          error: error instanceof Error ? error.message : 'Connection failed',
        });
      }
    }
  } catch (error) {
    logger.error('Error testing LLM service:', error);
    res.status(500).json({ error: 'Failed to test LLM service' });
  }
});

// Debug logging
app.get('/api/debug/stream', (req: Request, res: Response) => {
  const clientId = `debug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  sseManager.addClient(clientId, res, 'debug');
});

// Endpoint to fetch large content by ID
app.get('/api/large-content/:contentId', (req: Request, res: Response) => {
  const { contentId } = req.params;
  const content = sseManager.getLargeContent(contentId);

  if (content) {
    res.json({ content });
  } else {
    res.status(404).json({ error: 'Content not found' });
  }
});

// Endpoint to fetch LFS content by ID
app.get('/api/lfs/:lfsId', (req: Request, res: Response) => {
  const { lfsId } = req.params;
  const content = lfsManager.retrieveContent(`[LFS:${lfsId}]`);

  if (content) {
    res.json({ content });
  } else {
    res.status(404).json({ error: 'LFS content not found' });
  }
});

// Endpoint to get LFS statistics
app.get('/api/lfs/stats', (req: Request, res: Response) => {
  const stats = lfsManager.getStats();
  res.json(stats);
});

// Endpoint to get LFS summary by ID
app.get('/api/lfs/:lfsId/summary', (req: Request, res: Response) => {
  const { lfsId } = req.params;
  const summary = lfsManager.getSummary(lfsId);

  if (summary) {
    res.json(summary);
  } else {
    res.status(404).json({ error: 'LFS summary not found' });
  }
});

// Generation streaming, task progress, and workflow updates now handled by unified SSE event bus

// Audio files discovery endpoint
app.get('/api/audio/files', async (req: Request, res: Response) => {
  try {
    const supportedExtensions = [
      'mp3',
      'mpeg',
      'opus',
      'ogg',
      'oga',
      'wav',
      'aac',
      'caf',
      'm4a',
      'mp4',
      'weba',
      'webm',
      'flac',
    ];

    const audioFiles: Array<{
      id: number;
      title: string;
      artist: string;
      album?: string;
      genre?: string[];
      year?: number;
      duration: string;
      url: string;
      path: string;
      size: number;
      metadata?: {
        common: {
          title?: string;
          artist?: string;
          album?: string;
          genre?: string[];
          year?: number;
          [key: string]: unknown;
        };
        format: {
          duration?: number;
          bitrate?: number;
          sampleRate?: number;
          numberOfChannels?: number;
          [key: string]: unknown;
        };
      };
      coverArtUrl?: string;
      isActive: boolean;
    }> = [];

    async function scanDirectory(dirPath: string): Promise<void> {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          if (entry.isDirectory()) {
            const skipDirs = [
              'node_modules',
              '.git',
              'dist',
              '.vscode',
              'electron',
              'AppData',
              '.cache',
              '.npm',
              '.config',
              'System Volume Information',
              '$Recycle.Bin',
              'Recovery',
              'ProgramData',
              'Windows',
              'Program Files',
              'Program Files (x86)',
              '.ssh',
              '.aws',
              '.docker',
            ];

            const shouldSkip = skipDirs.some(
              skipDir =>
                entry.name === skipDir || entry.name.startsWith(skipDir)
            );

            if (!shouldSkip) {
              try {
                await scanDirectory(fullPath);
              } catch {
                // Silently skip directories we can't access
              }
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase().slice(1);
            if (supportedExtensions.includes(ext)) {
              try {
                const stats = statSync(fullPath);
                const relativePath = path.relative(musicRoot, fullPath);
                const fileName = path.basename(
                  entry.name,
                  path.extname(entry.name)
                );
                const normalizedPath = relativePath.replace(/\\/g, '/');
                const fileUrl = `/audio/${normalizedPath}`;

                // Extract metadata using cache
                let metadata: (typeof audioFiles)[0]['metadata'] = undefined;
                let title: string;
                let artist: string;
                let album: string | undefined;
                let genre: string[] | undefined;
                let year: number | undefined;
                let coverArtUrl: string | undefined;
                let duration: string;

                try {
                  const cachedMetadata =
                    await musicMetadataCache.getMetadata(fullPath);
                  metadata = cachedMetadata.metadata;
                  title = cachedMetadata.title;
                  artist = cachedMetadata.artist;
                  album = cachedMetadata.album;
                  genre = cachedMetadata.genre;
                  year = cachedMetadata.year;
                  duration = cachedMetadata.duration;
                  coverArtUrl = cachedMetadata.coverArtUrl;
                } catch (error) {
                  // If metadata extraction fails, use file name as fallback
                  console.log(
                    `Failed to extract metadata for ${fullPath}:`,
                    error
                  );
                  title = fileName
                    .replace(/[-_]/g, ' ')
                    .replace(/\b\w/g, l => l.toUpperCase());
                  artist = 'Unknown Artist';
                  duration = '0:00';
                }

                audioFiles.push({
                  id: audioFiles.length + 1,
                  title,
                  artist,
                  album,
                  genre,
                  year,
                  duration,
                  url: fileUrl,
                  path: relativePath,
                  size: stats.size,
                  metadata,
                  coverArtUrl,
                  isActive: false,
                });
              } catch (error) {
                logger.warn(`Error processing audio file ${fullPath}:`, error);
              }
            }
          }
        }
      } catch (error) {
        logger.warn(`Error scanning directory ${dirPath}:`, error);
      }
    }

    await scanDirectory(musicRoot);
    audioFiles.sort((a, b) => a.title.localeCompare(b.title));

    // Save metadata cache after scanning all files
    await musicMetadataCache.saveCache();

    res.json(audioFiles);
  } catch (error) {
    logger.error('Error scanning for audio files:', error);
    res.status(500).json({ error: 'Failed to scan for audio files' });
  }
});

app.get('/api/conversation/:threadId', async (req: Request, res: Response) => {
  const { threadId } = req.params;
  if (!threadId) {
    return res.status(400).json({ error: 'Thread ID is required' });
  }

  // Temporarily set the thread to get its conversation
  const previousThreadId = agentPool['currentThreadId'];
  await agentPool.setCurrentThread(threadId);
  const conversation = agentPool.getCurrentAgent().getConversation(threadId);

  // Restore the previous thread
  await agentPool.setCurrentThread(previousThreadId);

  res.json(conversation);
});

app.post('/api/message', async (req: Request, res: Response) => {
  try {
    const { message, messageId, threadId, images, notes, isAgentMode } =
      req.body;
    if (!message && (!images || images.length === 0)) {
      return res.status(400).json({ error: 'Message or images are required' });
    }

    // Check if LLM model is configured
    if (!currentLlmConfig.model || currentLlmConfig.model.trim() === '') {
      return res.status(400).json({
        error:
          'No LLM model configured. Please select a model from the available options.',
      });
    }

    // Set current thread if provided
    if (threadId) {
      await agentPool.setCurrentThread(threadId);
    }

    // Persist the user message
    await conversationManager.load();
    const userMessage = {
      id:
        messageId ||
        `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'user' as const,
      content: message,
      timestamp: new Date(),
      status: 'completed' as const,
      images: images || [],
      notes: notes || [],
    };
    await conversationManager.addMessage(threadId || 'default', userMessage);

    // Create a streaming callback that sends SSE events
    let assistantMessage: MessageWithTools | null = null;
    let lastContentLength = 0;

    const streamingCallback = async (updatedMessage: MessageWithTools) => {
      // For the first update, create the assistant message
      if (!assistantMessage) {
        assistantMessage = updatedMessage;

        // Persist the new assistant message
        await conversationManager.load();
        await conversationManager.addMessage(threadId || 'default', {
          id: updatedMessage.id,
          role: 'assistant',
          content: updatedMessage.content,
          timestamp: updatedMessage.timestamp,
          status: updatedMessage.status,
          model: updatedMessage.model,
          toolCalls: updatedMessage.toolCalls,
          toolResults: updatedMessage.toolResults,
          images: updatedMessage.images || [],
          notes: updatedMessage.notes || [],
        });

        sseManager.broadcast('unified-events', {
          type: SSEEventType.MESSAGE_UPDATE,
          message: updatedMessage,
        });
        lastContentLength = updatedMessage.content.length;
        return;
      }

      // Check if content has grown (new characters added)
      if (updatedMessage.content.length > lastContentLength) {
        const newContent = updatedMessage.content.slice(lastContentLength);
        if (newContent) {
          // Send the new content as a chunk
          sseManager.broadcast('unified-events', {
            type: SSEEventType.CONTENT_CHUNK,
            chunk: newContent,
            threadId: threadId || 'default',
          });
          lastContentLength = updatedMessage.content.length;
        }
      }

      // Always send the full message update for status changes
      assistantMessage = updatedMessage;

      // Update the persisted message
      await conversationManager.load();
      await conversationManager.updateMessage(
        threadId || 'default',
        updatedMessage.id,
        {
          content: updatedMessage.content,
          status: updatedMessage.status,
          model: updatedMessage.model,
          toolCalls: updatedMessage.toolCalls,
          toolResults: updatedMessage.toolResults,
          timestamp: updatedMessage.timestamp,
        }
      );

      sseManager.broadcast('unified-events', {
        type: SSEEventType.MESSAGE_UPDATE,
        message: updatedMessage,
        threadId: threadId || 'default',
      });
    };

    // Process message in background - response will stream via SSE
    setImmediate(async () => {
      const abortController = cancellationManager.startTask(
        threadId || 'default'
      );

      try {
        const agent = isAgentMode
          ? agentPool.getWorkflowAgent(threadId || 'default')
          : agentPool.getCurrentAgent();

        const response = await agent.processMessage(
          threadId || 'default',
          message,
          {
            images,
            notes,
            onUpdate: streamingCallback,
            userMessageId: messageId,
            signal: abortController.signal, // Pass abort signal for cancellation
          }
        );

        // Persist the final completed message
        await conversationManager.load();
        await conversationManager.updateMessage(
          threadId || 'default',
          response.id,
          {
            content: response.content,
            status: 'completed',
            model: response.model,
            toolCalls: response.toolCalls,
            toolResults: response.toolResults,
            timestamp: response.timestamp,
          }
        );

        // Send final completion event
        sseManager.broadcast('unified-events', {
          type: SSEEventType.COMPLETED,
          message: response,
          threadId: threadId || 'default',
        });

        // Clean up successful task
        cancellationManager.cancelTask(threadId || 'default');
      } catch (processingError: unknown) {
        // Clean up failed task
        cancellationManager.cancelTask(threadId || 'default');

        // Check if this was a cancellation
        if (
          processingError instanceof Error &&
          processingError.name === 'AbortError'
        ) {
          sseManager.broadcast('unified-events', {
            type: 'cancelled',
            threadId: threadId || 'default',
          });
          return;
        }
        // Check if this is a local model not loaded error
        if (
          processingError instanceof Error &&
          processingError.message === 'LOCAL_MODEL_NOT_LOADED'
        ) {
          sseManager.broadcast('unified-events', {
            type: SSEEventType.LOCAL_MODEL_NOT_LOADED,
            error:
              (processingError as Error & { originalMessage?: string })
                .originalMessage ||
              'Model not loaded. Please load the model first.',
            modelId: (processingError as Error & { modelId?: string }).modelId,
          });
        } else {
          const errorMessage =
            processingError instanceof Error
              ? processingError.message
              : 'Unknown error';
          sseManager.broadcast('unified-events', {
            type: SSEEventType.ERROR,
            error: errorMessage,
          });
        }
      }
    });

    // Return immediately - streaming will happen via SSE
    res.json({ status: 'processing' });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

// SSE endpoint for real-time message processing
app.post('/api/message/stream', async (req: Request, res: Response) => {
  try {
    const { message, messageId, threadId, images, notes, isAgentMode } =
      req.body;
    if (!message && (!images || images.length === 0)) {
      return res.status(400).json({ error: 'Message or images are required' });
    }

    // Check if LLM model is configured
    if (!currentLlmConfig.model || currentLlmConfig.model.trim() === '') {
      return res.status(400).json({
        error:
          'No LLM model configured. Please select a model from the available options.',
      });
    }

    // Set current thread if provided
    if (threadId) {
      await agentPool.setCurrentThread(threadId);
    }

    // Generate unique client ID for this streaming session
    const clientId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Add client to unified events topic
    sseManager.addClient(clientId, res, 'unified-events');

    // Process message with real-time streaming using thread-specific agent or workflow agent
    const agent = isAgentMode
      ? agentPool.getWorkflowAgent(threadId || 'default')
      : agentPool.getCurrentAgent();

    // All agents now use unified events topic

    // Persist the user message
    await conversationManager.load();
    const userMessage = {
      id:
        messageId ||
        `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'user' as const,
      content: message,
      timestamp: new Date(),
      status: 'completed' as const,
      images: images || [],
      notes: notes || [],
    };
    await conversationManager.addMessage(threadId || 'default', userMessage);

    // Create a custom streaming callback that sends character-by-character updates
    let assistantMessage: MessageWithTools | null = null;
    let lastContentLength = 0;

    const streamingCallback = async (updatedMessage: MessageWithTools) => {
      // For the first update, create the assistant message
      if (!assistantMessage) {
        assistantMessage = updatedMessage;

        // Persist the new assistant message
        await conversationManager.load();
        await conversationManager.addMessage(threadId || 'default', {
          id: updatedMessage.id,
          role: 'assistant',
          content: updatedMessage.content,
          timestamp: updatedMessage.timestamp,
          status: updatedMessage.status,
          model: updatedMessage.model,
          toolCalls: updatedMessage.toolCalls,
          toolResults: updatedMessage.toolResults,
          images: updatedMessage.images || [],
          notes: updatedMessage.notes || [],
        });

        sseManager.broadcast('unified-events', {
          type: SSEEventType.MESSAGE_UPDATE,
          message: updatedMessage,
        });
        lastContentLength = updatedMessage.content.length;
        return;
      }

      // Check if content has grown (new characters added)
      if (updatedMessage.content.length > lastContentLength) {
        const newContent = updatedMessage.content.slice(lastContentLength);
        if (newContent) {
          // Send the new content as a chunk
          sseManager.broadcast('unified-events', {
            type: SSEEventType.CONTENT_CHUNK,
            chunk: newContent,
            threadId: threadId || 'default',
          });
          lastContentLength = updatedMessage.content.length;
        }
      }

      // Always send the full message update for status changes
      assistantMessage = updatedMessage;

      // Update the persisted message
      await conversationManager.load();
      await conversationManager.updateMessage(
        threadId || 'default',
        updatedMessage.id,
        {
          content: updatedMessage.content,
          status: updatedMessage.status,
          model: updatedMessage.model,
          toolCalls: updatedMessage.toolCalls,
          toolResults: updatedMessage.toolResults,
          timestamp: updatedMessage.timestamp,
        }
      );

      sseManager.broadcast('unified-events', {
        type: SSEEventType.MESSAGE_UPDATE,
        message: updatedMessage,
        threadId: threadId || 'default',
      });
    };

    try {
      // Use the standard processMessage method with streaming callback
      const response = await agent.processMessage(
        threadId || 'default',
        message,
        {
          images,
          notes,
          onUpdate: streamingCallback,
          userMessageId: messageId,
        }
      );

      // Persist the final completed message
      await conversationManager.load();
      await conversationManager.updateMessage(
        threadId || 'default',
        response.id,
        {
          content: response.content,
          status: 'completed',
          model: response.model,
          toolCalls: response.toolCalls,
          toolResults: response.toolResults,
          timestamp: response.timestamp,
        }
      );

      // Send final completion event
      sseManager.broadcast('unified-events', {
        type: SSEEventType.COMPLETED,
        message: response,
      });

      // Close the response stream to signal completion to the client
      setTimeout(() => {
        res.end();
        sseManager.removeClient(clientId);
      }, 100); // Small delay to ensure the completion event is sent
    } catch (processingError: unknown) {
      // Check if this is a local model not loaded error
      if (
        processingError instanceof Error &&
        processingError.message === 'LOCAL_MODEL_NOT_LOADED'
      ) {
        sseManager.broadcast('unified-events', {
          type: SSEEventType.LOCAL_MODEL_NOT_LOADED,
          error:
            (processingError as Error & { originalMessage?: string })
              .originalMessage ||
            'Model not loaded. Please load the model first.',
          modelId: (processingError as Error & { modelId?: string }).modelId,
        });
      } else {
        const errorMessage =
          processingError instanceof Error
            ? processingError.message
            : 'Unknown error';
        sseManager.broadcast('unified-events', {
          type: SSEEventType.ERROR,
          error: errorMessage,
        });
      }

      // Close the response stream on error too
      setTimeout(() => {
        res.end();
        sseManager.removeClient(clientId);
      }, 100);
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

app.post(
  '/api/conversation/:threadId/clear',
  async (req: Request, res: Response) => {
    const { threadId } = req.params;
    if (!threadId) {
      return res.status(400).json({ error: 'Thread ID is required' });
    }

    // Temporarily set the thread to clear its conversation
    const previousThreadId = agentPool['currentThreadId'];
    await agentPool.setCurrentThread(threadId);
    await agentPool.getCurrentAgent().clearConversation(threadId);

    // Restore the previous thread
    await agentPool.setCurrentThread(previousThreadId);

    res.json({ success: true });
  }
);

// Debug LLM endpoint for fixing rendering errors
app.post('/api/debug-fix', async (req: Request, res: Response) => {
  try {
    const { request, retryCount = 0 } = req.body;

    if (!request) {
      return res.status(400).json({ error: 'Debug request is required' });
    }

    const { contentType, language } = request;

    // Generate fix prompt
    const fixPrompt = generateDebugFixPrompt(request);

    // Create a simple agent instance for debugging
    const agent = agentPool.getCurrentAgent();

    // Send request to LLM with debugging context
    const debugThreadId = `debug-${Date.now()}`;
    const result = await agent.processMessage(debugThreadId, fixPrompt);

    // Extract the fixed content from the response
    const fixedContent = extractFixedContent(
      result.content,
      contentType,
      language
    );

    if (fixedContent) {
      res.json({
        success: true,
        fixedContent,
        explanation: 'Content has been automatically corrected',
        retryCount,
      });
    } else {
      res.json({
        success: false,
        error: 'Failed to extract valid fixed content from LLM response',
        retryCount,
      });
    }
  } catch (error) {
    logger.error('Debug fix request failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      retryCount: req.body.retryCount || 0,
    });
  }
});

function generateDebugFixPrompt(request: {
  contentType: string;
  language?: string;
  errorMessage: string;
  originalContent: string;
}): string {
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
      return (
        basePrompt +
        `

Common Mermaid issues to check:
- Syntax errors in node definitions
- Missing arrows or connections
- Invalid characters in node names
- Incorrect diagram type declarations
- Missing quotes around labels with spaces

Respond with only the corrected Mermaid diagram:
\`\`\`mermaid
[corrected diagram here]
\`\`\``
      );

    case 'latex':
      return (
        basePrompt +
        `

Common LaTeX issues to check:
- Unmatched braces or brackets
- Invalid command syntax
- Missing required packages/commands
- Incorrect mathematical notation
- Invalid escape sequences

Respond with only the corrected LaTeX:
\`\`\`latex
[corrected LaTeX here]
\`\`\``
      );

    case 'code':
      return (
        basePrompt +
        `

Common ${request.language || 'code'} issues to check:
- Syntax errors
- Missing brackets, parentheses, or quotes
- Invalid indentation
- Typos in keywords or function names
- Missing semicolons or other required punctuation

Respond with only the corrected code:
\`\`\`${request.language || 'text'}
[corrected code here]
\`\`\``
      );

    default:
      return basePrompt;
  }
}

function extractFixedContent(
  llmResponse: string,
  contentType: string,
  language?: string
): string | null {
  const codeBlockRegex = new RegExp(
    `\`\`\`${language || contentType}\\n([\\s\\S]*?)\\n\`\`\``,
    'i'
  );
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

app.post('/api/load-thread/:threadId', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    if (!threadId) {
      return res.status(400).json({ error: 'Thread ID is required' });
    }

    // Set the current thread in the agent pool
    await agentPool.setCurrentThread(threadId);

    const fs = await import('fs/promises');
    const conversationsPath = path.join(workspaceRoot, 'mindstrike-chats.json');

    try {
      const data = await fs.readFile(conversationsPath, 'utf-8');
      const conversations = JSON.parse(data);
      const thread = conversations.find(
        (t: { id: string }) => t.id === threadId
      );

      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      // Load the thread's messages into the thread-specific agent's conversation context
      await agentPool
        .getCurrentAgent()
        .loadConversation(threadId, thread.messages);

      // Set the custom prompt if it exists in the thread
      if (thread.customPrompt) {
        threadPrompts.set(threadId, thread.customPrompt);
        await agentPool
          .getCurrentAgent()
          .updatePrompt(threadId, thread.customPrompt);
      } else {
        threadPrompts.delete(threadId);
        await agentPool.getCurrentAgent().updatePrompt(threadId, undefined);
      }
      res.json({ success: true });
    } catch {
      // File doesn't exist or thread not found
      await agentPool.getCurrentAgent().clearConversation(threadId);
      res.json({ success: true });
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/message/cancel', async (req: Request, res: Response) => {
  const { messageId, threadId } = req.body;
  if (!messageId) {
    return res.status(400).json({ error: 'Message ID is required' });
  }
  if (!threadId) {
    return res.status(400).json({ error: 'Thread ID is required' });
  }

  // Cancel the active task for this thread
  const cancelled = cancellationManager.cancelTask(threadId);

  if (cancelled) {
    // Also update the message status in conversation manager
    try {
      const conversationManager = new ConversationManager(workspaceRoot);
      await conversationManager.load();
      await conversationManager.updateMessage(threadId, messageId, {
        status: 'cancelled',
      });

      // Broadcast cancellation event
      sseManager.broadcast('unified-events', {
        type: 'cancelled',
        threadId: threadId,
        messageId: messageId,
      });
    } catch (error) {
      logger.error('Error updating cancelled message:', error);
    }

    res.json({ success: true });
  } else {
    res
      .status(404)
      .json({ error: 'No active processing found for this thread' });
  }
});

app.delete('/api/message/:messageId', async (req: Request, res: Response) => {
  const { messageId } = req.params;
  if (!messageId) {
    return res.status(400).json({ error: 'Message ID is required' });
  }

  try {
    await conversationManager.load();
    const result =
      await conversationManager.deleteMessageFromAllThreads(messageId);
    const { deletedMessageIds, affectedThreadIds } = result;

    if (deletedMessageIds.length > 0) {
      await conversationManager.save();

      // Sync current agent with updated thread history after message deletion
      for (const threadId of affectedThreadIds) {
        if (threadId === agentPool['currentThreadId']) {
          await syncCurrentAgentWithThread(threadId);
        }
      }

      // Broadcast update to all clients with ALL deleted message IDs
      sseManager.broadcast('unified-events', {
        type: 'messages-deleted',
        messageIds: deletedMessageIds,
      });

      res.json({ success: true, deletedMessageIds });
    } else {
      res.status(404).json({ error: 'Message not found' });
    }
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Single unified SSE endpoint for all events
app.get('/api/events/stream', (req: Request, res: Response) => {
  const clientId = `events-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  sseManager.addClient(clientId, res, 'unified-events');

  // Send a test event after connection to verify it's working
  setTimeout(() => {
    sseManager.broadcast('unified-events', {
      type: 'connection-test',
      message: 'Unified SSE connection working',
      timestamp: Date.now(),
    });
  }, 100);
});

// New Thread-based API
app.get('/api/threads', async (req: Request, res: Response) => {
  try {
    // Add timeout to conversation manager load
    await Promise.race([
      conversationManager.load(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Conversation manager load timeout in API')),
          3000
        )
      ),
    ]);

    const threads = conversationManager.getThreadList();
    res.json(threads);
  } catch (error: unknown) {
    // If timeout or other error, return empty threads array
    if (error instanceof Error && error.message.includes('timeout')) {
      res.json([]);
    } else {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  }
});

app.get(
  '/api/threads/:threadId/messages',
  async (req: Request, res: Response) => {
    try {
      const { threadId } = req.params;
      await conversationManager.load();
      const messages = conversationManager.getThreadMessages(threadId);
      res.json(messages);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  }
);

app.post('/api/threads', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    await Promise.race([
      conversationManager.load(),
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error('Conversation manager load timeout in create thread')
            ),
          10000
        )
      ),
    ]);

    const thread = await conversationManager.createThread(name);
    res.json(thread);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

app.delete('/api/threads/:threadId', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;

    await Promise.race([
      conversationManager.load(),
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error('Conversation manager load timeout in delete thread')
            ),
          3000
        )
      ),
    ]);

    const deleted = await conversationManager.deleteThread(threadId);
    if (deleted) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Thread not found' });
    }
  } catch (error: unknown) {
    console.error('Error deleting thread:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

app.put('/api/threads/:threadId', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const { name, customPrompt } = req.body;
    await conversationManager.load();

    if (name !== undefined) {
      await conversationManager.renameThread(threadId, name);
    }
    if ('customPrompt' in req.body) {
      await conversationManager.updateThreadPrompt(threadId, customPrompt);
      if (customPrompt && customPrompt !== null) {
        threadPrompts.set(threadId, customPrompt);
      } else {
        threadPrompts.delete(threadId);
      }
    }

    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Error updating thread:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

app.post(
  '/api/threads/:threadId/clear',
  async (req: Request, res: Response) => {
    try {
      const { threadId } = req.params;
      await conversationManager.load();
      const cleared = await conversationManager.clearThread(threadId);
      if (cleared) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Thread not found' });
      }
    } catch (error: unknown) {
      console.error('Error clearing thread:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// MindMaps API
app.get('/api/mindmaps', async (req: Request, res: Response) => {
  try {
    const fs = await import('fs/promises');
    const mindMapsPath = path.join(workspaceRoot, 'mindstrike-mindmaps.json');

    try {
      const data = await fs.readFile(mindMapsPath, 'utf-8');
      const mindMaps = JSON.parse(data);
      res.json(mindMaps);
    } catch {
      // File doesn't exist or is invalid, return empty array
      res.json([]);
    }
  } catch (error: unknown) {
    console.error('Error loading mindmaps:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/mindmaps', async (req: Request, res: Response) => {
  try {
    const fs = await import('fs/promises');
    const mindMaps = req.body;
    const mindMapsPath = path.join(workspaceRoot, 'mindstrike-mindmaps.json');

    // Read existing data to preserve mindmap data
    let existingMindMaps = [];
    try {
      const existingData = await fs.readFile(mindMapsPath, 'utf-8');
      existingMindMaps = JSON.parse(existingData);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, that's fine
    }

    // Create a map of existing mindmap data
    const existingMindmapData = new Map<string, unknown>();
    existingMindMaps.forEach(
      (mindMap: { id: string; mindmapData?: unknown }) => {
        if (mindMap.mindmapData) {
          existingMindmapData.set(mindMap.id, mindMap.mindmapData);
        }
      }
    );

    // Merge new mindmaps with existing mindmap data
    const mergedMindMaps = mindMaps.map((mindMap: Record<string, unknown>) => {
      const existingMindmap = existingMindmapData.get(mindMap.id as string);
      if (existingMindmap) {
        return { ...mindMap, mindmapData: existingMindmap };
      } else {
        // Initialize new mindmaps with default mindmapData structure containing root node
        const initialMindmapData = {
          root: {
            id: `node-${Date.now()}-${mindMap.id}`,
            text: 'Central Idea',
            notes: null,
            layout: 'graph-right',
          },
        };
        return { ...mindMap, mindmapData: initialMindmapData };
      }
    });

    await fs.writeFile(mindMapsPath, JSON.stringify(mergedMindMaps, null, 2));
    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Error saving mindmaps:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

// MindMap data API for MindMaps
app.get(
  '/api/mindmaps/:mindMapId/mindmap',
  async (req: Request, res: Response) => {
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
          return mindMaps.find((m: { id: string }) => m.id === mindMapId);
        } catch (error: unknown) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
          } else if (error instanceof SyntaxError) {
            logger.warn(
              `Corrupted mindmaps file detected during read: ${error.message}`
            );
            return null;
          }
          throw error;
        }
      });

      if (!result) {
        return res.status(404).json({ error: 'Mindmap data not found' });
      }

      res.json(result.mindmapData);
    } catch (error: unknown) {
      console.error('Error loading mindmap data:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// In-memory lock to prevent concurrent file operations
const fileLocks = new Map<string, Promise<unknown>>();

async function withFileLock<T>(
  filePath: string,
  operation: () => Promise<T>
): Promise<T> {
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

app.post(
  '/api/mindmaps/:mindMapId/mindmap',
  async (req: Request, res: Response) => {
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
        } catch (error: unknown) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            // File doesn't exist, start with empty array
            mindMaps = [];
          } else if (error instanceof SyntaxError) {
            // Corrupted JSON, log and start fresh
            logger.warn(
              `Corrupted mindmaps file detected, recreating: ${error.message}`
            );
            mindMaps = [];
          } else {
            throw error;
          }
        }

        const existingMindMapIndex = mindMaps.findIndex(
          (m: { id: string }) => m.id === mindMapId
        );
        if (existingMindMapIndex >= 0) {
          mindMaps[existingMindMapIndex].mindmapData = mindmapData;
          mindMaps[existingMindMapIndex].updatedAt = new Date().toISOString();
        } else {
          mindMaps.push({
            id: mindMapId,
            mindmapData,
            updatedAt: new Date().toISOString(),
          });
        }

        await fs.writeFile(mindMapsPath, JSON.stringify(mindMaps, null, 2));
      });

      res.json({ success: true });
    } catch (error: unknown) {
      logger.error('Error saving mindmap data:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// Cancel Mindmap Generation API
app.post(
  '/api/mindmaps/cancel/:workflowId',
  async (req: Request, res: Response) => {
    try {
      const { workflowId } = req.params;

      // Import and call the cancel function
      const { cancelWorkflow } = await import(
        './agents/mindmap-agent-iterative'
      );
      const cancelled = cancelWorkflow(workflowId);

      res.json({
        success: true,
        cancelled: cancelled,
        workflowId,
      });
    } catch (error) {
      console.error('❌ Failed to cancel workflow:', error);
      res.status(500).json({ error: 'Failed to cancel generation' });
    }
  }
);

// Mindmap Generation API
app.post(
  '/api/mindmaps/:mindMapId/generate',
  async (req: Request, res: Response) => {
    try {
      const { mindMapId } = req.params;
      const {
        prompt,
        selectedNodeId,
        stream,
        useAgenticWorkflow = true,
      } = req.body;

      if (!prompt || !prompt.trim()) {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      // Check if LLM model is configured
      if (!currentLlmConfig.model || currentLlmConfig.model.trim() === '') {
        return res.status(400).json({
          error:
            'No LLM model configured. Please select a model from the available options.',
        });
      }

      // If streaming is requested, set up SSE
      if (stream) {
        const streamId = `mindmap-${mindMapId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Generate workflow ID for agentic processing
        const workflowId = useAgenticWorkflow
          ? `workflow-${mindMapId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          : undefined;

        // Start the generation process in the background
        setImmediate(async () => {
          try {
            // Create mindmap agent with current config
            const mindmapAgent = new MindmapAgentIterative({
              workspaceRoot,
              llmConfig: currentLlmConfig,
            });

            // Set mindmap context
            await mindmapAgent.setMindmapContext(mindMapId, selectedNodeId);

            // Process with streaming callback
            sseManager.broadcast('unified-events', {
              type: 'progress',
              status: 'Starting generation...',
              streamId: streamId, // Include streamId in data for filtering
            });

            // Real token stats and workflow events will be broadcast by the mindmap agent directly

            // Use iterative reasoning workflow if enabled, otherwise use regular processing
            let response;

            if (useAgenticWorkflow && workflowId) {
              response = await mindmapAgent.processMessageIterative(
                prompt,
                [], // images
                [], // notes
                undefined, // onUpdate callback - not used in streaming mode
                workflowId,
                streamId // Pass streamId for real-time SSE updates
              );
            } else {
              response = await mindmapAgent.processMessage(mindMapId, prompt);
            }

            // Parse the response content to extract changes and workflow info
            let parsedResponse;
            try {
              parsedResponse = JSON.parse(response.content);
            } catch (error) {
              logger.error(
                'Failed to parse streaming response content:',
                error
              );
              parsedResponse = { changes: [], workflow: {} };
            }

            // Broadcast completion
            sseManager.broadcast('unified-events', {
              type: SSEEventType.COMPLETE,
              streamId: streamId,
              result: {
                success: true,
                changes: parsedResponse.changes || [],
                workflow: parsedResponse.workflow || {},
                response: response.content,
                toolCalls:
                  'toolCalls' in response ? response.toolCalls : undefined,
                toolResults:
                  'toolResults' in response ? response.toolResults : undefined,
              },
            });
          } catch (error: unknown) {
            logger.error('Error in streaming mindmap generation:', error);
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            sseManager.broadcast('unified-events', {
              type: SSEEventType.ERROR,
              streamId: streamId,
              error: errorMessage,
            });
          }
        });

        // Return stream ID and workflow ID immediately
        return res.json({
          streamId,
          workflowId: workflowId || null,
        });
      }

      // Non-streaming fallback (original implementation)
      // Create mindmap agent with current config
      const mindmapAgent = new MindmapAgentIterative({
        workspaceRoot,
        llmConfig: currentLlmConfig,
      });

      // Set mindmap context
      await mindmapAgent.setMindmapContext(mindMapId, selectedNodeId);

      let response;
      if (useAgenticWorkflow) {
        // Generate workflow ID for task tracking
        const workflowId = `workflow-${mindMapId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        response = await mindmapAgent.processMessageIterative(
          prompt,
          [], // images
          [], // notes
          undefined, // onUpdate callback
          workflowId
        );
      } else {
        response = await mindmapAgent.processMessage(mindMapId, prompt);
      }

      // Parse the response content to extract changes and workflow info
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(response.content);
      } catch (error) {
        logger.error('Failed to parse response content:', error);
        parsedResponse = { changes: [], workflow: {} };
      }

      res.json({
        success: true,
        changes: parsedResponse.changes || [],
        workflow: parsedResponse.workflow || {},
        response: response.content,
        toolCalls: 'toolCalls' in response ? response.toolCalls : undefined,
        toolResults:
          'toolResults' in response ? response.toolResults : undefined,
      });
    } catch (error: unknown) {
      logger.error('Error in mindmap generation:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// New Task-Based Mindmap Generation API
app.post(
  '/api/mindmaps/:mindMapId/plan-tasks',
  async (req: Request, res: Response) => {
    try {
      const { prompt } = req.body;

      if (!prompt || !prompt.trim()) {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      // Check if LLM model is configured
      if (!currentLlmConfig.model || currentLlmConfig.model.trim() === '') {
        return res.status(400).json({
          error:
            'No LLM model configured. Please select a model from the available options.',
        });
      }

      // Task planning is no longer needed with iterative reasoning
      // The new system decides what to do step-by-step during execution

      res.json({
        success: true,
        message:
          'Task planning is no longer used. The iterative reasoning system decides actions dynamically during execution.',
        tasks: [],
        workflowId: null,
      });
    } catch (error: unknown) {
      logger.error('Error planning mindmap tasks:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  }
);

app.post('/api/generate-title', async (req: Request, res: Response) => {
  try {
    const { context } = req.body;

    if (!context) {
      return res.status(400).json({ error: 'Context is required' });
    }

    // Check if LLM model is configured
    if (!currentLlmConfig.model || currentLlmConfig.model.trim() === '') {
      return res.status(400).json({
        error:
          'No LLM model configured. Please select a model from the available options.',
      });
    }

    // Create a prompt to generate a short title (filter out think tags from context)
    const cleanContext = cleanContentForLLM(context);
    const prompt = `Based on this conversation context, generate a brief, descriptive title (maximum 5 words) that captures the main topic or purpose of the discussion:

${cleanContext}

Respond with only the title, no other text.`;

    // Create a clean agent instance with no chat history, no system prompt, and no tools
    const titleAgent = new ChatAgent({
      workspaceRoot,
      llmConfig: currentLlmConfig,
      customPrompt: undefined, // No custom system prompt
      disableFunctions: true,
      disableChatHistory: true,
    });

    // Use direct LLM call without chat history or tools
    const response = await titleAgent.getChatModel().invoke(prompt);
    const title = cleanContentForLLM(response.content as string).trim();

    res.json({ title });
  } catch (error: unknown) {
    console.error('Error generating title:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/generate-prompt', async (req: Request, res: Response) => {
  try {
    const { personality } = req.body;

    if (!personality) {
      return res.status(400).json({ error: 'Prompt description is required' });
    }

    // Check if LLM model is configured
    if (!currentLlmConfig.model || currentLlmConfig.model.trim() === '') {
      return res.status(400).json({
        error:
          'No LLM model configured. Please select a model from the available options.',
      });
    }

    // Create a prompt to generate a role definition based on the prompt description
    const systemPrompt = `Create a role definition for an AI assistant based on the user's description. Use their exact words and phrasing as much as possible while making it a proper role definition.

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

    // Create a temporary thread for role generation
    const roleThreadId = `role-${Date.now()}`;
    const response = await agentPool
      .getCurrentAgent()
      .processMessage(roleThreadId, systemPrompt);
    const generatedPrompt = cleanContentForLLM(response.content).trim();

    res.json({ prompt: generatedPrompt });
  } catch (error: unknown) {
    console.error('Error generating prompt:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/api/role/:threadId?', (req: Request, res: Response) => {
  try {
    const threadId = req.params.threadId || 'default';
    const agent = agentPool.getAgent(threadId);

    res.json({
      currentPrompt: agent.getCurrentPrompt(),
      defaultPrompt: agent.getDefaultPrompt(),
      isDefault: agent.getCurrentPrompt() === agent.getDefaultPrompt(),
      hasCustomPrompt: threadPrompts.has(threadId),
    });
  } catch (error: unknown) {
    console.error('Error getting prompt:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/role/:threadId?', (req: Request, res: Response) => {
  try {
    const threadId = req.params.threadId || 'default';
    const { customPrompt } = req.body;

    // Store the custom prompt for the thread
    if (customPrompt) {
      threadPrompts.set(threadId, customPrompt);
    } else {
      threadPrompts.delete(threadId);
    }

    // Update the agent's prompt
    const agent = agentPool.getAgent(threadId);
    agent.updatePrompt(customPrompt);

    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Error updating prompt:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

// Get current working directory
app.get('/api/workspace/directory', (req: Request, res: Response) => {
  try {
    res.json({
      currentDirectory: currentWorkingDirectory,
      absolutePath: currentWorkingDirectory,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

// Set current working directory
app.post('/api/workspace/directory', (req: Request, res: Response) => {
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
    if (!existsSync(fullPath)) {
      return res.status(404).json({ error: 'Directory does not exist' });
    }

    const stats = statSync(fullPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    currentWorkingDirectory = fullPath;
    res.json({
      currentDirectory: currentWorkingDirectory,
      absolutePath: currentWorkingDirectory,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

// Get workspace root
app.get('/api/workspace/root', (req: Request, res: Response) => {
  try {
    res.json({
      workspaceRoot: workspaceRoot,
      currentDirectory: currentWorkingDirectory,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

// Set workspace root
app.post('/api/workspace/root', async (req: Request, res: Response) => {
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
    if (!existsSync(fullPath)) {
      return res.status(404).json({ error: 'Directory does not exist' });
    }

    const stats = statSync(fullPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    // Only update and log if workspace root actually changed
    if (workspaceRoot !== fullPath) {
      // Update workspace root and reset current directory to the new root
      workspaceRoot = fullPath;
      currentWorkingDirectory = workspaceRoot;

      // Update workspace root for all agents in the pool
      agentPool.updateAllAgentsWorkspace(workspaceRoot);

      // Update conversation manager workspace
      conversationManager.updateWorkspaceRoot(workspaceRoot);

      // Save workspace root to persistent storage
      await setWorkspaceRoot(workspaceRoot);

      logger.info(`Workspace root changed to: ${workspaceRoot}`);
    }

    res.json({
      workspaceRoot: workspaceRoot,
      currentDirectory: currentWorkingDirectory,
      message: 'Workspace root changed successfully',
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

// Get music root
app.get('/api/music/root', (req: Request, res: Response) => {
  try {
    res.json({
      musicRoot: musicRoot,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

// Set music root
app.post('/api/music/root', async (req: Request, res: Response) => {
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
    if (!existsSync(fullPath)) {
      return res.status(404).json({ error: 'Directory does not exist' });
    }

    const stats = statSync(fullPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    // Only update and log if music root actually changed
    if (musicRoot !== fullPath) {
      // Update music root
      musicRoot = fullPath;

      // Save music root to persistent storage
      await setMusicRoot(musicRoot);

      logger.info(`Music root changed to: ${musicRoot}`);
    }

    res.json({
      musicRoot: musicRoot,
      message: 'Music root changed successfully',
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to set music root' });
  }
});

app.get('/api/workspace/files', async (req: Request, res: Response) => {
  try {
    const targetDir = currentWorkingDirectory;
    const entries = await fs.readdir(targetDir, { withFileTypes: true });

    const files = entries
      .sort((a, b) => {
        // Directories first, then files
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      })
      .map(entry => (entry.isDirectory() ? `${entry.name}/` : entry.name));

    res.json(files);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/api/workspace/file/:path(*)', async (req: Request, res: Response) => {
  try {
    const filePath = req.params.path;
    const fullPath = path.resolve(workspaceRoot, filePath);

    const content = await fs.readFile(fullPath, 'utf-8');
    res.json({ content });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(404).json({ error: errorMessage });
  }
});

app.post('/api/workspace/save', async (req: Request, res: Response) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: 'Path and content are required' });
    }

    const fullPath = path.resolve(workspaceRoot, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');

    res.json({ success: true });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/workspace/delete', async (req: Request, res: Response) => {
  const { path: filePath } = req.body;
  try {
    if (!filePath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const fullPath = path.resolve(workspaceRoot, filePath);
    await fs.unlink(fullPath);

    res.json({
      success: true,
      message: `Successfully deleted file: ${filePath}`,
    });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      res.status(404).json({ error: `File not found: ${filePath}` });
    } else {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  }
});

// MCP API Routes
app.get('/api/mcp/servers', async (req: Request, res: Response) => {
  try {
    const servers = mcpManager.getServerConfigs();
    res.json({ servers });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/api/mcp/tools', async (req: Request, res: Response) => {
  try {
    const tools = mcpManager.getAvailableTools();
    res.json({ tools });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/mcp/servers', async (req: Request, res: Response) => {
  try {
    const config = req.body;
    if (!config.id || !config.name || !config.command) {
      return res
        .status(400)
        .json({ error: 'Missing required fields: id, name, command' });
    }

    await mcpManager.addServerConfig(config);
    res.json({ success: true });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

app.put('/api/mcp/servers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    await mcpManager.updateServerConfig(id, updates);
    res.json({ success: true });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

app.delete('/api/mcp/servers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await mcpManager.removeServerConfig(id);
    res.json({ success: true });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/api/mcp/status', async (req: Request, res: Response) => {
  try {
    const connectedServers = mcpManager.getConnectedServers();
    const totalServers = mcpManager.getServerConfigs().length;
    const tools = mcpManager.getAvailableTools();

    res.json({
      connectedServers: connectedServers.length,
      totalServers,
      totalTools: tools.length,
      servers: connectedServers,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/api/mcp/logs', async (req: Request, res: Response) => {
  try {
    const logs = mcpManager.getLogs();
    res.json({ logs });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/api/mcp/diagnostics', async (req: Request, res: Response) => {
  try {
    const diagnostics = await mcpManager.getDiagnostics();
    res.json(diagnostics);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/mcp/refresh-cache', async (req: Request, res: Response) => {
  try {
    mcpManager.refreshCommandCache();
    res.json({ success: true, message: 'Command cache refreshed' });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/api/mcp/processes', async (req: Request, res: Response) => {
  try {
    const processInfo = mcpManager.getServerProcessInfo();
    res.json({ processes: processInfo });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/api/mcp/server-logs', async (req: Request, res: Response) => {
  try {
    const serverId = req.query.serverId as string | undefined;
    const stderrOnly = req.query.stderrOnly === 'true';
    const logs = mcpManager.getServerLogs(serverId, stderrOnly);
    res.json({ logs });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

// MCP logs now handled by unified SSE event bus

app.get('/api/mcp/config', async (req: Request, res: Response) => {
  try {
    const { getMindstrikeDirectory } = await import(
      './utils/settings-directory.js'
    );
    const configPath = path.join(getMindstrikeDirectory(), 'mcp-config.json');
    const configData = await fs.readFile(configPath, 'utf-8');
    res.json({ config: configData });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // Return default config if file doesn't exist
      const defaultConfig = {
        mcpServers: {},
      };
      res.json({ config: JSON.stringify(defaultConfig, null, 2) });
    } else {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  }
});

app.post('/api/mcp/config', async (req: Request, res: Response) => {
  try {
    const { config } = req.body;
    if (typeof config !== 'string') {
      return res.status(400).json({ error: 'Config must be a string' });
    }

    // Validate JSON
    try {
      const parsed = JSON.parse(config);
      if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
        return res
          .status(400)
          .json({ error: 'Config must contain mcpServers object' });
      }
    } catch {
      return res.status(400).json({ error: 'Invalid JSON format' });
    }

    const { getMindstrikeDirectory } = await import(
      './utils/settings-directory.js'
    );
    const configPath = path.join(getMindstrikeDirectory(), 'mcp-config.json');

    // Ensure directory exists
    await fs.mkdir(getMindstrikeDirectory(), { recursive: true });
    await fs.writeFile(configPath, config, 'utf-8');

    // Reload MCP manager with new config
    await mcpManager.reload();

    res.json({ success: true });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/mcp/refresh', async (req: Request, res: Response) => {
  try {
    await mcpManager.reload();
    res.json({ success: true });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

// Initialize MCP manager - always needed whether run directly or imported
mcpManager.setWorkspaceRoot(workspaceRoot);
mcpManager
  .initialize()
  .then(() => {
    logger.info('MCP Manager initialized');
  })
  .catch(error => {
    logger.error('Failed to initialize MCP Manager:', error);
  });

// Listen for MCP tool changes and refresh agent tools
mcpManager.on('toolsChanged', async () => {
  logger.info('MCP tools changed, refreshing agent tools...');
  await agentPool.refreshAllAgentsTools();
});

// Listen for MCP config reload and refresh agent tools
mcpManager.on('configReloaded', async () => {
  logger.info('MCP config reloaded, refreshing agent tools...');
  await agentPool.refreshAllAgentsTools();
});

// SPA catch-all route (must be AFTER all API routes)
if (process.env.NODE_ENV !== 'development') {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const clientPath = path.join(__dirname, '../../client');

  if (existsSync(clientPath)) {
    app.get('*', (req: Request, res: Response) => {
      // This should only catch non-API routes since all API routes are defined above
      const indexPath = path.join(clientPath, 'index.html');
      if (existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Application not found');
      }
    });
  }
}

// Export the app for use in Electron or direct startup
export default app;

// Cleanup handlers
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, cleaning up...');
  cleanupLLMWorker();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, cleaning up...');
  cleanupLLMWorker();
  process.exit(0);
});

// Only start the server if not running in Electron
if (typeof window === 'undefined' && !process.versions.electron) {
  (async () => {
    // Load workspace settings before starting the server
    await loadWorkspaceSettings();

    app.listen(PORT, () => {
      console.log('\n🚀 MindStrike Server Started Successfully!');
      console.log('━'.repeat(50));
      console.log(`📍 Server URL: http://localhost:${PORT}`);
      console.log(`🌐 Port: ${PORT}`);
      console.log(`📁 Workspace: ${workspaceRoot}`);
      console.log(`📂 Working Dir: ${currentWorkingDirectory}`);
      console.log(
        `🧠 LLM Model: ${currentLlmConfig.displayName || currentLlmConfig.model || 'None selected'}`
      );
      if (currentLlmConfig.model) {
        console.log(`🔗 LLM URL: ${currentLlmConfig.baseURL}`);
        console.log(`⚙️  LLM Type: ${currentLlmConfig.type || 'unknown'}`);
      }
      console.log('━'.repeat(50));
      console.log('✅ Server ready to accept connections\n');

      logger.info(`Server running on port ${PORT}`);
      logger.info(`Workspace: ${workspaceRoot}`);
      logger.info(
        `LLM: ${currentLlmConfig.baseURL} (${currentLlmConfig.model})`
      );
    });
  })();
}
