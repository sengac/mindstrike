import { Module, Global } from '@nestjs/common';
import { ConversationService } from '../chat/services/conversation.service';
import { SessionService } from '../chat/services/session.service';
import { SseService } from '../events/services/sse.service';
import { AgentPoolService } from '../agents/services/agent-pool.service';
import { McpManagerService } from '../mcp/services/mcp-manager.service';
import { LfsService } from '../content/services/lfs.service';

@Global()
@Module({
  imports: [],
  providers: [
    ConversationService,
    SessionService,
    SseService,
    AgentPoolService,
    McpManagerService,
    LfsService,
  ],
  exports: [
    ConversationService,
    SessionService,
    SseService,
    AgentPoolService,
    McpManagerService,
    LfsService,
  ],
})
export class CoreModule {}
