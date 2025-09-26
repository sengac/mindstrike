import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { CoreModule } from './modules/core/core.module';
import { ChatModule } from './modules/chat/chat.module';
import { MindmapModule } from './modules/mindmap/mindmap.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { MusicModule } from './modules/music/music.module';
import { AgentsModule } from './modules/agents/agents.module';
import { LlmModule } from './modules/llm/llm.module';
import { McpModule } from './modules/mcp/mcp.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { EventsModule } from './modules/events/events.module';
import { ContentModule } from './modules/content/content.module';
import { UtilityModule } from './modules/utils/utility.module';
import { ModelScanModule } from './modules/model-scan/model-scan.module';
import { SystemModule } from './modules/system/system.module';

@Module({
  imports: [
    // Global configuration (from NestJS)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.nest', '.env'],
      cache: true,
    }),

    // Event emitter for inter-module communication
    EventEmitterModule.forRoot(),

    // Serve static files in production
    ...(() => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const clientPath = join(__dirname, '..', 'client');
      return process.env.NODE_ENV === 'production' && existsSync(clientPath)
        ? [
            ServeStaticModule.forRoot({
              rootPath: clientPath,
              exclude: ['/api/*', '/audio/*', '/sse', '/events'],
            }),
          ]
        : [];
    })(),

    // Core module with shared services
    CoreModule,

    WorkspaceModule,
    ChatModule,
    MindmapModule,
    TasksModule,
    EventsModule,
    MusicModule,
    ContentModule,
    LlmModule,
    McpModule,
    AgentsModule,
    UtilityModule,
    ModelScanModule,
    SystemModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
