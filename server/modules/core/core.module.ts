import { Module, Global } from '@nestjs/common';
import { ConversationService } from '../chat/services/conversation.service';
import {
  SessionService,
  LocalLLMSessionManager,
  StatelessLLMSessionManager,
  OllamaSessionManager,
  SessionManagerFactory,
  GlobalSessionManager,
} from '../chat/services/session.service';
import { SseService } from '../events/services/sse.service';
import { AgentPoolService } from '../agents/services/agent-pool.service';
import { McpManagerService } from '../mcp/services/mcp-manager.service';
import { LfsService } from '../content/services/lfs.service';
import { LlmModule } from '../llm/llm.module';
import { GlobalLlmConfigService } from '../shared/services/global-llm-config.service';
import { GlobalConfigService } from '../shared/services/global-config.service';

@Global()
@Module({
  imports: [LlmModule],
  providers: [
    ConversationService,
    LocalLLMSessionManager,
    StatelessLLMSessionManager,
    OllamaSessionManager,
    SessionManagerFactory,
    GlobalSessionManager,
    SessionService,
    SseService,
    AgentPoolService,
    McpManagerService,
    LfsService,
    GlobalLlmConfigService,
    GlobalConfigService,
  ],
  exports: [
    ConversationService,
    SessionService,
    GlobalSessionManager,
    SseService,
    AgentPoolService,
    McpManagerService,
    LfsService,
    GlobalLlmConfigService,
    GlobalConfigService,
  ],
})
export class CoreModule {}
