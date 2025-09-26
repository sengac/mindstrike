import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { SseService } from './services/sse.service';

@Module({
  controllers: [EventsController],
  providers: [EventsService, SseService],
  exports: [EventsService, SseService],
})
export class EventsModule {}
