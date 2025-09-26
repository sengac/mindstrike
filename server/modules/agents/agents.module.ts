import { Module } from '@nestjs/common';
import { ThreadsController } from './threads.controller';
import { RolesController } from './roles.controller';
import { DebugController } from '../events/debug.controller';
import { AgentsService } from './agents.service';
import { AgentPoolService } from './services/agent-pool.service';
import { ChatAgentService } from './services/chat-agent.service';
import { MindmapAgentIterativeService } from './services/mindmap-agent-iterative.service';
import { EventsService } from '../events/events.service';
import { McpModule } from '../mcp/mcp.module';
import { ContentModule } from '../content/content.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [McpModule, ContentModule, EventsModule],
  controllers: [ThreadsController, RolesController, DebugController],
  providers: [
    AgentsService,
    AgentPoolService,
    ChatAgentService,
    MindmapAgentIterativeService,
    EventsService,
  ],
  exports: [AgentsService, AgentPoolService, MindmapAgentIterativeService],
})
export class AgentsModule {}
