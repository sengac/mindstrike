# NestJS Migration - EXACT Code Porting Map

## CRITICAL: Copy EXACT code from Express to NestJS - NO FAKE IMPLEMENTATIONS!

---

## 1. AUDIO/MUSIC ROUTES

### GET /audio/\* - Static audio file serving

**FROM:** `/server/index.ts` lines 317-335
**TO:** `/server/modules/music/audio.controller.ts` @Get('audio/\*')
**STATUS:** ✅ IMPLEMENTED - Full range request support, proper MIME types, security checks
**TESTS:** ✅ PASSING - 5 tests in audio.controller.spec.ts (fixed memory leak with vi.hoisted)

### GET /api/audio/files - List audio files

**FROM:** `/server/index.ts` lines 1563-1738
**TO:** `/server/modules/music/audio.controller.ts` @Get('api/audio/files')
**STATUS:** ✅ IMPLEMENTED - Recursive scanning, metadata extraction, cover art support
**TESTS:** ✅ PASSING - Included in audio.controller.spec.ts

### GET /api/music/root - Get music root

**FROM:** `/server/index.ts` lines 3789-3800
**TO:** `/server/modules/music/music.controller.ts` @Get('root')
**STATUS:** ✅ IMPLEMENTED - Returns current music root with exists/writable flags

### POST /api/music/root - Set music root

**FROM:** `/server/index.ts` lines 3802-3879
**TO:** `/server/modules/music/music.controller.ts` @Post('root')
**STATUS:** ✅ IMPLEMENTED - Full path resolution, validation, persistence via setMusicRoot()

---

## 2. PLAYLIST ROUTES

### POST /api/playlists/save

**FROM:** `/server/index.ts` lines 768-818
**TO:** `/server-nest/src/modules/music/playlist.controller.ts` @Post('save')
**STATUS:** ✅ IMPLEMENTED - File persistence to getMindstrikeDirectory()/playlists
**TESTS:** ✅ PASSING - 10 tests in playlist.controller.spec.ts

### GET /api/playlists/load

**FROM:** `/server/index.ts` lines 820-894
**TO:** `/server-nest/src/modules/music/playlist.controller.ts` @Get('load')
**STATUS:** ✅ IMPLEMENTED - File reading with auto-creation if missing
**TESTS:** ✅ PASSING - Included in playlist.controller.spec.ts

### GET /api/playlists/:id

**FROM:** `/server/index.ts` lines 896-953
**TO:** `/server-nest/src/modules/music/playlist.controller.ts` @Get(':id')
**STATUS:** ✅ IMPLEMENTED - Playlist lookup by ID with error handling
**TESTS:** ✅ PASSING - Included in playlist.controller.spec.ts

### DELETE /api/playlists/:id

**FROM:** `/server/index.ts` lines 955-1019
**TO:** `/server-nest/src/modules/music/playlist.controller.ts` @Delete(':id')
**STATUS:** ✅ IMPLEMENTED - Playlist deletion with file persistence
**TESTS:** ✅ PASSING - Included in playlist.controller.spec.ts

---

## 3. LLM CONFIG ROUTES (Central Configuration)

### GET /api/llm/default-model

**FROM:** `/server/index.ts` lines 1056-1062 (uses llmConfigManager.getDefaultModel())
**TO:** `/server/modules/llm/llm-config.controller.ts` @Get('default-model')
**STATUS:** ✅ IMPLEMENTED - Uses real LLMConfigManager.getDefaultModel()

### POST /api/llm/default-model

**FROM:** `/server/index.ts` lines 1101-1127 (uses llmConfigManager.setDefaultModel())
**TO:** `/server/modules/llm/llm-config.controller.ts` @Post('default-model')
**STATUS:** ✅ IMPLEMENTED - Uses real LLMConfigManager.setDefaultModel()

---

## 4. LOCAL LLM ROUTES (Direct Model Management)

**NOTE:** Express routes are mounted at `/api/local-llm` via `/server/routes/localLlm.ts` (line 188 in index.ts)

### GET /api/local-llm/models

**FROM:** `/server/routes/localLlm.ts` lines 30-41 (uses llmManager.getLocalModels())
**TO:** `/server/modules/llm/llm.controller.ts` @Get('models')
**STATUS:** ✅ IMPLEMENTED - Uses real LocalLLMManager.getLocalModels()

### GET /api/local-llm/available-models

**FROM:** `/server/routes/localLlm.ts` lines 138-149 (uses llmManager.getAvailableModels())
**TO:** `/server/modules/llm/llm.controller.ts` @Get('available-models')
**STATUS:** ✅ IMPLEMENTED - Uses real LocalLLMManager.getAvailableModels()

### GET /api/local-llm/available-models-cached

**FROM:** `/server/routes/localLlm.ts` lines 46-58 (uses modelFetcher.getCachedModels())
**TO:** `/server/modules/llm/llm.controller.ts` @Get('available-models-cached')
**STATUS:** ✅ IMPLEMENTED - Uses ModelDiscoveryService.getCachedModels()
**IMPLEMENTATION:** `/server/modules/llm/services/model-discovery.service.ts` lines 162-167

### POST /api/local-llm/check-model-updates

**FROM:** `/server/routes/localLlm.ts` lines 63-112 (uses modelFetcher.getModelsById())
**TO:** `/server/modules/llm/llm.controller.ts` @Post('check-model-updates')
**STATUS:** ✅ IMPLEMENTED - Uses ModelDiscoveryService.checkModelUpdates()
**IMPLEMENTATION:** `/server/modules/llm/services/model-discovery.service.ts` lines 190-217

### POST /api/local-llm/retry-vram-fetch

**FROM:** `/server/routes/localLlm.ts` lines 117-133 (uses modelFetcher.retryVramFetching())
**TO:** `/server/modules/llm/llm.controller.ts` @Post('retry-vram-fetch')
**STATUS:** ✅ IMPLEMENTED - Uses ModelDiscoveryService.retryVramFetch()
**IMPLEMENTATION:** `/server/modules/llm/services/model-discovery.service.ts` lines 224-274

### GET /api/local-llm/models/:modelId/status

**FROM:** `/server/routes/localLlm.ts` lines 758-775 (uses llmManager.getModelStatus())
**TO:** `/server/modules/llm/llm.controller.ts` @Get('models/:modelId/status')
**STATUS:** ✅ IMPLEMENTED - Uses LocalLlmService.getModelStatus()

### POST /api/local-llm/models/:modelId/load

**FROM:** `/server/routes/localLlm.ts` lines 703-725 (uses llmManager.loadModel())
**TO:** `/server/modules/llm/llm.controller.ts` @Post('models/:modelId/load')
**STATUS:** ✅ IMPLEMENTED - Uses LocalLlmService.loadModel()

### POST /api/local-llm/models/:modelId/unload

**FROM:** `/server/routes/localLlm.ts` lines 730-753 (uses llmManager.unloadModel())
**TO:** `/server/modules/llm/llm.controller.ts` @Post('models/:modelId/unload')
**STATUS:** ✅ IMPLEMENTED - Uses LocalLlmService.unloadModel()

### DELETE /api/local-llm/models/:modelId

**FROM:** `/server/routes/localLlm.ts` lines 670-698 (uses llmManager.deleteModel())
**TO:** `/server/modules/llm/llm.controller.ts` @Delete('models/:modelId')
**STATUS:** ✅ IMPLEMENTED - Uses LocalLlmService.deleteModel()

### POST /api/local-llm/download

**FROM:** `/server/routes/localLlm.ts` lines 494-641 (uses llmManager.downloadModel())
**TO:** `/server/modules/llm/llm.controller.ts` @Post('download')
**STATUS:** ✅ IMPLEMENTED - Uses ModelDownloadService.downloadModel()

### GET /api/local-llm/models/:modelId/settings

**FROM:** `/server/routes/localLlm.ts` lines 804-822 (uses llmManager.getModelSettings())
**TO:** `/server/modules/llm/llm.controller.ts` @Get('models/:modelId/settings')
**STATUS:** ✅ IMPLEMENTED - Uses LocalLlmService.getModelSettings()

### PUT /api/local-llm/models/:modelId/settings

**FROM:** `/server/routes/localLlm.ts` lines 780-799 (uses llmManager.setModelSettings())
**TO:** `/server/modules/llm/llm.controller.ts` @Put('models/:modelId/settings')
**STATUS:** ✅ IMPLEMENTED - Uses LocalLlmService.setModelSettings()

### POST /api/local-llm/models/:modelId/generate

**FROM:** `/server/routes/localLlm.ts` lines 872-908 (uses llmManager.generateResponse())
**TO:** `/server/modules/llm/llm.controller.ts` @Post('models/:modelId/generate')
**STATUS:** ✅ IMPLEMENTED - Uses LocalLlmService.generateResponse()

---

## 5. LLM CONFIG ROUTES CONTINUED

### POST /api/llm/rescan

**FROM:** `/server/index.ts` lines 1129-1215
**TO:** `/server/modules/llm/llm-config.controller.ts` @Post('rescan')
**STATUS:** ✅ IMPLEMENTED - Full service scanning with auto-add/remove
**TESTS:** ✅ PASSING - 5 tests in llm-config.rescan.spec.ts

---

## 6. WORKSPACE ROUTES

### GET /api/workspace/directory

**FROM:** `/server/index.ts` lines 3611-3625 (uses currentWorkingDirectory)
**TO:** `/server/modules/workspace/workspace.controller.ts` @Get('directory')
**STATUS:** ✅ IMPLEMENTED - Uses local workspace state

### POST /api/workspace/directory

**FROM:** `/server/index.ts` lines 3660-3696 (uses currentWorkingDirectory, path validation)
**TO:** `/server/modules/workspace/workspace.controller.ts` @Post('directory')
**STATUS:** ✅ IMPLEMENTED - Uses local workspace state with validation

### GET /api/workspace/root

**FROM:** `/server/index.ts` lines 3719-3729 (uses workspaceRoot, currentWorkingDirectory)
**TO:** `/server/modules/workspace/workspace.controller.ts` @Get('root')
**STATUS:** ✅ IMPLEMENTED - Uses local workspace state

### POST /api/workspace/root

**FROM:** `/server/index.ts` lines 3733-3784 (uses workspaceRoot, agentPool.updateAllAgentsWorkspace)
**TO:** `/server/modules/workspace/workspace.controller.ts` @Post('root')
**STATUS:** ✅ IMPLEMENTED - Uses AgentPoolService.updateAllAgentsWorkspace()

### GET /api/workspace/files

**FROM:** `/server/index.ts` lines 3881-3905 (uses fs.readdir, currentWorkingDirectory)
**TO:** `/server/modules/workspace/workspace-file.controller.ts` @Get('files')
**STATUS:** ✅ FULLY IMPLEMENTED - Uses WorkspaceFileService.listFiles()
**IMPLEMENTATION:** `/server/modules/workspace/workspace-file.controller.ts` lines 29-33
**TESTS:** ✅ PASSING - workspace-file.controller.spec.ts lines 62-90

### GET /api/workspace/file/:path(\*)

**FROM:** `/server/index.ts` lines 3907-3919 (uses fs.readFile, workspaceRoot)
**TO:** `/server/modules/workspace/workspace-file.controller.ts` @Get('file/\*')
**STATUS:** ✅ FULLY IMPLEMENTED - Fixed route pattern to use wildcard
**IMPLEMENTATION:** `/server/modules/workspace/workspace-file.controller.ts` lines 35-44
**TESTS:** ✅ PASSING - workspace-file.controller.spec.ts lines 92-116

### POST /api/workspace/save

**FROM:** `/server/index.ts` lines 3921-3938 (uses fs.writeFile, workspaceRoot)
**TO:** `/server/modules/workspace/workspace-file.controller.ts` @Post('save')
**STATUS:** ✅ FULLY IMPLEMENTED - Uses WorkspaceFileService.saveFile()
**IMPLEMENTATION:** `/server/modules/workspace/workspace-file.controller.ts` lines 46-54
**TESTS:** ✅ PASSING - workspace-file.controller.spec.ts lines 118-146

### POST /api/workspace/delete

**FROM:** `/server/index.ts` lines 3940-3965 (uses fs.unlink, workspaceRoot)
**TO:** `/server/modules/workspace/workspace-file.controller.ts` @Post('delete')
**STATUS:** ✅ FULLY IMPLEMENTED - Uses WorkspaceFileService.deleteFile()
**IMPLEMENTATION:** `/server/modules/workspace/workspace-file.controller.ts` lines 56-67
**TESTS:** ✅ PASSING - workspace-file.controller.spec.ts lines 148-177

---

## 7. LFS (LARGE FILE STORAGE) ROUTES

### GET /api/lfs/stats

**FROM:** `/server/index.ts` lines 1500-1503 (uses lfsManager.getStats())
**TO:** `/server/modules/content/lfs.controller.ts` @Get('stats')
**STATUS:** ✅ IMPLEMENTED - Route ordering fixed, uses real LfsService.getStats()

### GET /api/lfs/:lfsId

**FROM:** `/server/index.ts` lines 1488-1497 (uses lfsManager.retrieveContent())
**TO:** `/server/modules/content/lfs.controller.ts` @Get(':lfsId')
**STATUS:** ✅ IMPLEMENTED - Uses real LfsService.retrieveContent() with proper error handling

### GET /api/lfs/:lfsId/summary

**FROM:** `/server/index.ts` lines 1506-1515 (uses lfsManager.getSummary())
**TO:** `/server/modules/content/lfs.controller.ts` @Get(':lfsId/summary')
**STATUS:** ✅ IMPLEMENTED - Uses real LfsService.getSummaryByReference() with proper error handling

---

## 8. DEBUG ROUTES

### POST /api/debug-fix

**FROM:** `/server/index.ts` lines 2252-2406 (uses agentPool.getCurrentAgent(), generateDebugFixPrompt)
**TO:** `/server/modules/events/debug.controller.ts` @Post('debug-fix')
**STATUS:** ✅ IMPLEMENTED - Uses AgentPoolService.getCurrentAgent() with full debugging logic

---

## 9. UTILITY ROUTES

### POST /api/generate-title

**FROM:** `/server/index.ts` lines 3449-3493 (uses ChatAgent, currentLlmConfig)
**TO:** `/server/modules/utils/utility.controller.ts` @Post('generate-title')
**STATUS:** ✅ IMPLEMENTED - Route path fixed, moved to UtilityController to match Express exactly

### POST /api/generate-prompt

**FROM:** `/server/index.ts` lines 3495-3543 (uses agentPool.getCurrentAgent())
**TO:** `/server/modules/utils/utility.controller.ts` @Post('generate-prompt')
**STATUS:** ✅ IMPLEMENTED - Route path fixed, moved to UtilityController to match Express exactly

---

## 10. LLM CONFIG ROUTES CONTINUED

### GET /api/llm/custom-services

**FROM:** `/server/index.ts` lines 1217-1225
**TO:** `/server-nest/src/modules/llm/llm-config.controller.ts` @Get('custom-services')
**STATUS:** ✅ IMPLEMENTED - Uses real LLMConfigManager

### POST /api/llm/custom-services

**FROM:** `/server/index.ts` lines 1227-1251
**TO:** `/server-nest/src/modules/llm/llm-config.controller.ts` @Post('custom-services')
**STATUS:** ✅ IMPLEMENTED - Uses real LLMConfigManager

### PUT /api/llm/custom-services/:id

**FROM:** `/server/index.ts` lines 1253-1268
**TO:** `/server-nest/src/modules/llm/llm-config.controller.ts` @Put('custom-services/:id')
**STATUS:** ✅ IMPLEMENTED - Uses real LLMConfigManager

### DELETE /api/llm/custom-services/:id

**FROM:** `/server/index.ts` lines 1270-1284
**TO:** `/server-nest/src/modules/llm/llm-config.controller.ts` @Delete('custom-services/:id')
**STATUS:** ✅ IMPLEMENTED - Uses real LLMConfigManager

### POST /api/llm/test-service

**FROM:** `/server/index.ts` lines 1286-1425 (tests LLM service connectivity)
**TO:** `/server/modules/llm/llm-config.controller.ts` @Post('test-service')
**STATUS:** ✅ IMPLEMENTED - Full implementation in LlmConfigService.testService() with 5s timeout
**TESTS:** ✅ PASSING - 12 tests in llm-config.test-service.spec.ts

### LLM Manager Core Implementation

**FROM:** `/server/localLlmManager.ts` lines 1-92 (LocalLLMManager class)
**FROM:** `/server/llm/localLlmOrchestrator.ts` lines 1-183 (orchestrator)
**FROM:** `/server/llm/modelLoader.ts` (entire file)
**FROM:** `/server/llm/responseGenerator.ts` (entire file)
**TO:** `/server-nest/src/modules/llm/services/llm.service.ts`
**STATUS:** ✅ IMPLEMENTED - Uses real LocalLLMManager with proper streaming

---

## 4. CONVERSATION/MESSAGE ROUTES

### ConversationService Implementation

**FROM:** `/server/conversationManager.ts` lines 1-298 (ConversationManager class)
**TO:** `/server/modules/chat/services/conversation.service.ts`
**STATUS:** ✅ CORRECTLY IMPLEMENTED - Exact port of Express ConversationManager
**TESTS:** ✅ FIXED - Tests now match actual Express implementation

### GET /api/conversation/:threadId

**FROM:** `/server/index.ts` lines 1741-1768 (uses agentPool to get conversation)
**TO:** `/server-nest/src/modules/chat/conversation.controller.ts` @Get(':threadId')
**STATUS:** ✅ CORRECTLY IMPLEMENTED - Uses AgentPoolService.getCurrentAgent().getConversation()

### POST /api/conversation/:threadId/clear

**FROM:** `/server/index.ts` lines 2231-2249 (clears conversation using agentPool)
**TO:** `/server/modules/chat/conversation.controller.ts` @Post(':threadId/clear')
**STATUS:** ✅ IMPLEMENTED - Uses AgentPoolService to temporarily set thread and clear conversation
**TESTS:** ✅ PASSING - 5 tests in conversation.getConversation.spec.ts

### POST /api/message (non-streaming)

**FROM:** `/server/index.ts` lines 1770-2032 (COMPLEX - uses agents, LLM, etc.)
**TO:** `/server-nest/src/modules/chat/message.controller.ts` @Post('message')
**STATUS:** ✅ IMPLEMENTED - Full MessageService.processMessage() with agent integration

### POST /api/message/stream

**FROM:** `/server/index.ts` lines 2034-2229 (streaming with SSE)
**TO:** `/server-nest/src/modules/chat/message.controller.ts` @Post('message/stream')
**STATUS:** ✅ IMPLEMENTED - MessageService.streamMessage() with SSE response

### POST /api/message/cancel

**FROM:** `/server/index.ts` lines 2460-2497
**TO:** `/server-nest/src/modules/chat/message.controller.ts` @Post('message/cancel')
**STATUS:** ✅ IMPLEMENTED - MessageService.cancelMessage() with CancellationManager

### DELETE /api/message/:messageId

**FROM:** `/server/index.ts` lines 2499-2556
**TO:** `/server-nest/src/modules/chat/message.controller.ts` @Delete('message/:messageId')
**STATUS:** ✅ IMPLEMENTED - MessageService.deleteMessage() with deleteMessageFromAllThreads

### POST /api/load-thread/:threadId

**FROM:** `/server/index.ts` lines 2408-2458
**TO:** `/server-nest/src/modules/chat/message.controller.ts` @Post('load-thread/:threadId')
**STATUS:** ✅ IMPLEMENTED - MessageService.loadThread() with agent conversation loading

---

## 5. THREAD ROUTES

### GET /api/threads

**FROM:** `/server/index.ts` lines 2607-2675
**TO:** `/server/modules/agents/threads.controller.ts` @Get()
**STATUS:** ✅ IMPLEMENTED - Uses ConversationService.getThreadList()
**TESTS:** ✅ PASSING - Tested in threads.controller.spec.ts

### GET /api/threads/:threadId

**FROM:** `/server/index.ts` lines 2677-2729
**TO:** `/server/modules/agents/threads.controller.ts` @Get(':threadId')
**STATUS:** ✅ IMPLEMENTED - Uses ConversationService.getThread()
**TESTS:** ✅ PASSING - Includes NotFoundException handling

### POST /api/threads

**FROM:** `/server/index.ts` lines 2731-2755
**TO:** `/server/modules/agents/threads.controller.ts` @Post()
**STATUS:** ✅ IMPLEMENTED - Uses ConversationService.createThread()
**TESTS:** ✅ PASSING - Tests thread creation and custom prompt

### DELETE /api/threads/:threadId

**FROM:** `/server/index.ts` lines 2757-2786
**TO:** `/server/modules/agents/threads.controller.ts` @Delete(':threadId')
**STATUS:** ✅ IMPLEMENTED - Uses ConversationService.deleteThread() with timeout handling
**TESTS:** ✅ PASSING - Includes timeout and not found tests

### PUT /api/threads/:threadId

**FROM:** `/server/index.ts` lines 2788-2813
**TO:** `/server/modules/agents/threads.controller.ts` @Put(':threadId')
**STATUS:** ✅ IMPLEMENTED - Uses ConversationService.renameThread() and updateThreadPrompt()
**TESTS:** ✅ PASSING - Tests both title and prompt updates

### POST /api/threads/:threadId/fork

**NOTE:** This endpoint doesn't exist in Express server
**TO:** `/server/modules/agents/threads.controller.ts` @Post(':threadId/fork')
**STATUS:** ✅ STUB IMPLEMENTED - Returns placeholder since Express doesn't have this

### POST /api/threads/:threadId/clear

**FROM:** `/server/index.ts` lines 2816-2834
**TO:** `/server/modules/agents/threads.controller.ts` @Post(':threadId/clear')
**STATUS:** ✅ IMPLEMENTED - Uses ConversationService.clearThread()
**TESTS:** ✅ PASSING - Tests clear and not found scenarios

---

## 6. MINDMAP ROUTES

### GET /api/mindmaps

**FROM:** `/server/index.ts` lines 2871-2931
**TO:** `/server/modules/mindmap/mindmap.controller.ts` @Get('mindmaps')
**STATUS:** ✅ ROUTE CORRECT - Implementation needs MindmapService completion

### POST /api/mindmaps

**FROM:** `/server/index.ts` lines 2933-3049
**TO:** `/server/modules/mindmap/mindmap.controller.ts` @Post('mindmaps')
**STATUS:** ✅ ROUTE CORRECT - Uses MindmapService.createMindmap()

### GET /api/mindmaps/:mindmapId

**FROM:** `/server/index.ts` lines 3051-3123
**TO:** `/server/modules/mindmap/mindmap.controller.ts` @Get('mindmaps/:mindmapId')
**STATUS:** ✅ ROUTE CORRECT - Currently stubbed, needs file system implementation

### POST /api/mindmaps/:mindmapId

**FROM:** `/server/index.ts` lines 3125-3182
**TO:** `/server/modules/mindmap/mindmap.controller.ts` @Post('mindmaps/:mindmapId')
**STATUS:** ✅ IMPLEMENTED - Uses MindmapService.updateMindmap()

### POST /api/mindmaps/:mindmapId/add-node

**FROM:** `/server/index.ts` lines 3184-3205
**TO:** `/server/modules/mindmap/mindmap.controller.ts` @Post('mindmaps/:mindmapId/add-node')
**STATUS:** ✅ ROUTE CORRECT - Currently stubbed

### POST /api/mindmaps/:mindmapId/generate-children

**FROM:** `/server/index.ts` lines 3207-3375
**TO:** `/server/modules/mindmap/mindmap.controller.ts` @Post('mindmaps/:mindmapId/generate-children')
**STATUS:** ✅ ROUTE CORRECT - Needs MindmapAgentIterative integration

### POST /api/mindmaps/:mindmapId/auto-save

**FROM:** `/server/index.ts` lines 3377-3447
**TO:** `/server/modules/mindmap/mindmap.controller.ts` @Post('mindmaps/:mindmapId/auto-save')
**STATUS:** ✅ ROUTE CORRECT - Currently stubbed

---

## 7. ROLE/AGENT ROUTES (Actually PROMPT Management)

### GET /api/role/:threadId?

**FROM:** `/server/index.ts` lines 3545-3562 (gets agent prompts using agentPool.getAgent())
**TO:** `/server/modules/agents/roles.controller.ts` @Get(':threadId')
**STATUS:** ✅ IMPLEMENTED - Uses AgentPoolService.getAgent() to retrieve real prompts
**TESTS:** ✅ PASSING - 7 tests in roles.controller.spec.ts

### POST /api/role/:threadId?

**FROM:** `/server/index.ts` lines 3564-3587 (updates agent prompts using agentPool.getAgent().updatePrompt())
**TO:** `/server/modules/agents/roles.controller.ts` @Post(':threadId')
**STATUS:** ✅ IMPLEMENTED - Uses AgentPoolService.getAgent().updatePrompt() with threadPrompts Map
**TESTS:** ✅ PASSING - 7 tests in roles.controller.spec.ts

---

## 8. WORKSPACE ROUTES

### GET /api/workspace/directory

**FROM:** `/server/index.ts` lines 3611-3622 (returns currentDirectory, absolutePath)
**TO:** `/server/modules/workspace/workspace.controller.ts` @Get('directory')
**STATUS:** ✅ IMPLEMENTED - Returns correct structure (currentDirectory, absolutePath)
**TESTS:** ✅ PASSING - 1 test in workspace.controller.spec.ts

### POST /api/workspace/directory

**FROM:** `/server/index.ts` lines 3660-3695 (sets currentWorkingDirectory with path validation)
**TO:** `/server/modules/workspace/workspace.controller.ts` @Post('directory')
**STATUS:** ✅ IMPLEMENTED - Full path validation, absolute/relative path support, directory existence checks
**TESTS:** ✅ PASSING - 5 tests in workspace.controller.spec.ts

### GET /api/workspace/root

**FROM:** `/server/index.ts` lines 3719-3730 (returns workspaceRoot and currentDirectory)
**TO:** `/server/modules/workspace/workspace.controller.ts` @Get('root')
**STATUS:** ✅ IMPLEMENTED - Returns correct structure (workspaceRoot, currentDirectory)
**TESTS:** ✅ PASSING - 1 test in workspace.controller.spec.ts

### POST /api/workspace/root

**FROM:** `/server/index.ts` lines 3733-3786 (updates workspaceRoot, agentPool, conversationManager)
**TO:** `/server/modules/workspace/workspace.controller.ts` @Post('root')
**STATUS:** ✅ IMPLEMENTED - Calls updateAllAgentsWorkspace(), updateWorkspaceRoot(), setWorkspaceRoot()
**TESTS:** ✅ PASSING - 7 tests in workspace.controller.spec.ts

### GET /api/workspace/files

**FROM:** `/server/index.ts` lines 3881-3905
**TO:** `/server-nest/src/modules/workspace/workspace-file.controller.ts` @Get('files')
**STATUS:** ❓ CHECK

### GET /api/workspace/file/:path(\*)

**FROM:** `/server/index.ts` lines 3907-3919
**TO:** `/server-nest/src/modules/workspace/workspace-file.controller.ts` @Get('file/\*')
**STATUS:** ❓ CHECK

### POST /api/workspace/save

**FROM:** `/server/index.ts` lines 3921-3938
**TO:** `/server-nest/src/modules/workspace/workspace-file.controller.ts` @Post('save')
**STATUS:** ❓ CHECK

### POST /api/workspace/delete

**FROM:** `/server/index.ts` lines 3940-4001
**TO:** `/server-nest/src/modules/workspace/workspace-file.controller.ts` @Post('delete')
**STATUS:** ❓ CHECK

---

## 9. MCP ROUTES - CRITICAL BROKEN SECTION

### GET /api/mcp/servers

**FROM:** `/server/index.ts` lines 4003-4045 (uses mcpManager.getServerConfigs())
**TO:** `/server-nest/src/modules/mcp/mcp.controller.ts` @Get('servers')
**STATUS:** ✅ IMPLEMENTED - Uses real MCPManager via McpManagerService

### POST /api/mcp/servers

**FROM:** `/server/index.ts` lines 4099-4115 (uses mcpManager.addServerConfig())
**TO:** `/server-nest/src/modules/mcp/mcp.controller.ts` @Post('servers')
**STATUS:** ✅ IMPLEMENTED - Uses real MCPManager.addServerConfig()

### GET /api/mcp/tools

**FROM:** `/server/index.ts` lines 4047-4097 (uses mcpManager.getAvailableTools())
**TO:** `/server-nest/src/modules/mcp/mcp.controller.ts` @Get('tools')
**STATUS:** ✅ IMPLEMENTED - Uses real MCPManager.getAvailableTools()

### MCP Manager Core Implementation

**FROM:** `/server/mcpManager.ts` lines 1-1159 (ENTIRE MCPManager class)
**TO:** `/server-nest/src/modules/mcp/services/mcp-manager.service.ts`
**STATUS:** ✅ IMPLEMENTED - Using real MCPManager from Express server with proper event handling

### Additional MCP Routes

- GET /api/mcp/config (lines 4221-4242) - ✅ IMPLEMENTED
- POST /api/mcp/config (lines 4244-4281) - ✅ IMPLEMENTED
- POST /api/mcp/refresh (lines 4283-4327) - ✅ IMPLEMENTED
- GET /api/mcp/server-logs (lines 4206-4219) - ✅ IMPLEMENTED
- PUT /api/mcp/servers/:id - ✅ IMPLEMENTED
- DELETE /api/mcp/servers/:id - ✅ IMPLEMENTED
- GET /api/mcp/status - ✅ IMPLEMENTED
- GET /api/mcp/logs - ✅ IMPLEMENTED
- GET /api/mcp/diagnostics - ✅ IMPLEMENTED
- POST /api/mcp/refresh-cache - ✅ IMPLEMENTED
- GET /api/mcp/processes - ✅ IMPLEMENTED

**TESTS:** ✅ ALL 32 MCP controller tests PASSING

---

## 10. UTILITY ROUTES

### POST /api/generate-title

**FROM:** `/server/index.ts` lines 3449-3493
**TO:** `/server-nest/src/modules/chat/chat.controller.ts` @Post('generate-title')
**STATUS:** ❓ CHECK - Likely broken without real LLM

### POST /api/generate-prompt

**FROM:** `/server/index.ts` lines 3495-3543
**TO:** `/server-nest/src/modules/chat/chat.controller.ts` @Post('generate-prompt')
**STATUS:** ❓ CHECK - Likely broken without real LLM

### POST /api/debug-fix

**FROM:** `/server/index.ts` lines 2252-2406
**TO:** `/server-nest/src/modules/events/debug.controller.ts` @Post('debug-fix')
**STATUS:** ❌ NOT IMPLEMENTED

### GET /api/debug/stream

**FROM:** `/server/index.ts` lines 1443-1474 (uses sseManager.addClient with 'debug' topic)
**TO:** `/server/modules/events/events.controller.ts` @Get('debug/stream')
**STATUS:** ✅ FULLY IMPLEMENTED - Uses SseService.addClient() with debug topic
**IMPLEMENTATION:** `/server/modules/events/events.controller.ts` lines 57-59

### GET /api/events/stream (Main SSE)

**FROM:** `/server/index.ts` lines 2558-2605 (uses sseManager.addClient with 'unified-events' topic)
**TO:** `/server/modules/events/events.controller.ts` @Get('events/stream')
**STATUS:** ✅ FULLY IMPLEMENTED - Uses SseService.addClient() with unified-events topic
**IMPLEMENTATION:** `/server/modules/events/events.controller.ts` lines 29-40

### GET /api/large-content/:contentId

**FROM:** `/server/index.ts` lines 1476-1486 (uses sseManager.getLargeContent())
**TO:** `/server/modules/content/content.controller.ts` @Get('large-content/:contentId')
**STATUS:** ✅ FULLY IMPLEMENTED - Uses SseService.getLargeContent()
**IMPLEMENTATION:** `/server/modules/content/content.controller.ts` lines 28-34

### GET /api/lfs/:lfsId

**FROM:** `/server/index.ts` lines 1488-1498 (uses lfsManager.retrieveContent())
**TO:** `/server-nest/src/modules/content/lfs.controller.ts` @Get(':lfsId')
**STATUS:** ✅ READY TO IMPLEMENT - LfsService created

### GET /api/lfs/stats

**FROM:** `/server/index.ts` lines 1500-1504 (uses lfsManager.getStats())
**TO:** `/server-nest/src/modules/content/lfs.controller.ts` @Get('stats')
**STATUS:** ✅ READY TO IMPLEMENT - LfsService has getStats()

### GET /api/lfs/:lfsId/summary

**FROM:** `/server/index.ts` lines 1506-1561 (uses lfsManager.retrieveContent())
**TO:** `/server-nest/src/modules/content/lfs.controller.ts` @Get(':lfsId/summary')
**STATUS:** ✅ READY TO IMPLEMENT - LfsService has getSummaryByReference()

---

## 11. AGENT IMPLEMENTATIONS

### Base Agent

**FROM:** `/server/baseAgent.ts` lines 1-459 (BaseAgent class)
**TO:** `/server/modules/agents/services/base-agent.service.ts`
**STATUS:** ✅ IMPLEMENTED - Full BaseAgentService with LangChain integration

### Chat Agent

**FROM:** `/server/agents/chatAgent.ts` lines 1-84 (ChatAgent class)
**TO:** `/server/modules/agents/services/chat-agent.service.ts`
**STATUS:** ✅ IMPLEMENTED - ChatAgentService extending BaseAgentService

### Workflow Agent

**FROM:** `/server/agents/workflowAgent.ts` lines 1-375
**TO:** `/server/modules/agents/services/workflow-agent.service.ts`
**STATUS:** ✅ IMPLEMENTED - Full WorkflowAgentService with LangGraph state machine
**TESTS:** ✅ PASSING - 11 tests in workflow-agent.service.spec.ts

### Mindmap Agent Iterative

**FROM:** `/server/agents/mindmapAgentIterative.ts` lines 1-823 (BaseAgent extension with iterative reasoning)
**TO:** `/server/modules/agents/services/mindmap-agent-iterative.service.ts`
**STATUS:** ✅ FULLY IMPLEMENTED - Complete NestJS service with iterative workflow
**IMPLEMENTATION:** `/server/modules/agents/services/mindmap-agent-iterative.service.ts` lines 1-583
**TESTS:** ✅ PASSING - 13 tests in mindmap-agent-iterative.service.spec.ts

### Chat Local LLM

**FROM:** `/server/agents/chatLocalLlm.ts`
**TO:** `/server/modules/agents/services/chat-local-llm.service.ts`
**STATUS:** ✅ IMPLEMENTED - ChatLocalLlmService for local model support

### NOTE: Non-Existent Agents

The following agents were incorrectly listed but don't exist in the Express codebase:

- ❌ Code Analysis Agent - DOES NOT EXIST
- ❌ Task Agent - DOES NOT EXIST
- ❌ Web Search Agent - DOES NOT EXIST
- ❌ Regular Mindmap Agent - DOES NOT EXIST (only mindmapAgentIterative exists)

---

## 12. SESSION MANAGER - PARTIALLY PORTED

### SessionManager Implementation

**FROM:** `/server/sessionManager.ts` lines 1-240 (SessionManager class)
**TO:** `/server-nest/src/modules/chat/services/session.service.ts` (partial)
**STATUS:** ⚠️ PARTIAL - Basic SessionService created but missing Express functionality
**MISSING:**

- Session tracking for agent responses
- Session cleanup logic
- Thread-session mapping
  **TESTS:** ✅ ALL 23 SessionService tests PASSING (created from scratch)

---

## 13. SSE MANAGER - CHECK IF PROPERLY PORTED

**FROM:** `/server/sseManager.ts` lines 1-268 (SSEManager class)
**TO:** `/server-nest/src/modules/events/services/sse.service.ts`
**STATUS:** ❓ CHECK - Verify chunking, LFS integration

---

## 14. LFS MANAGER - PORTED

**FROM:** `/server/lfsManager.ts` lines 1-141 (LFSManager class)
**TO:** `/server-nest/src/modules/content/services/lfs.service.ts`
**STATUS:** ✅ IMPLEMENTED - Full LfsService with memory/disk storage

---

## 15. MODEL FETCHER - FULLY PORTED

**FROM:** `/server/modelFetcher.ts` lines 1-1762 (ModelFetcher class with HuggingFace integration)
**TO:** `/server/modules/llm/services/model-discovery.service.ts`
**STATUS:** ✅ FULLY IMPLEMENTED - Complete ModelDiscoveryService with all core functionality
**IMPLEMENTATION:**

- Main service: `/server/modules/llm/services/model-discovery.service.ts` lines 1-417
- Methods implemented:
  - getCachedModels() - lines 162-167
  - getModelsById() - lines 171-187
  - checkModelUpdates() - lines 190-217
  - retryVramFetch() - lines 224-274
  - clearCache() - lines 367-375
  - getOllamaModels() - lines 380-395
  - scanForModels() - lines 400-416
  - setHuggingFaceToken() - lines 344-349
  - setProgressCallback() - lines 360-362
    **TESTS:** ✅ PASSING - 12 comprehensive tests in model-discovery.service.spec.ts
