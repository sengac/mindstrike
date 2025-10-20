/**
 * CLI Module
 *
 * Provides HTTP API endpoints for CLI commands
 */

import { Module } from '@nestjs/common';
import { CliController } from './cli.controller';
import { CliService } from './services/cli.service';
import { EventsModule } from '../events/events.module';
import { MindmapModule } from '../mindmap/mindmap.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [EventsModule, MindmapModule, ChatModule],
  controllers: [CliController],
  providers: [CliService],
  exports: [CliService]
})
export class CliModule {}
