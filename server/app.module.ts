import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ServeStaticModule } from '@nestjs/serve-static';
import { dirname } from 'path';
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
import { CliModule } from './modules/cli/cli.module';

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

      // Everything is in the same directory - dist/
      // server.js and frontend files are all together
      let staticPath = __dirname;

      // If we're in ASAR, files need to be unpacked
      if (__dirname.includes('app.asar')) {
        staticPath = __dirname.replace('app.asar', 'app.asar.unpacked');
      }

      console.log('Serving static files from:', staticPath);

      // Serve static files in production OR when running in Electron
      const shouldServeStatic =
        process.env.NODE_ENV === 'production' ||
        (process.versions && process.versions.electron);

      return shouldServeStatic
        ? [
            ServeStaticModule.forRoot({
              rootPath: staticPath,
              exclude: [
                '/api/*path',
                '/audio/*path',
                '/sse/*path',
                '/events/*path',
              ],
              serveRoot: '/',
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
    CliModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
