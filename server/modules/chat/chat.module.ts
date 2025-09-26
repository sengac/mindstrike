import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatController } from './chat.controller';
import { ConversationController } from './conversation.controller';
import { MessageController } from './message.controller';
import { ChatService } from './chat.service';
import { MessageService } from './services/message.service';
import { EventsModule } from '../events/events.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [ConfigModule, EventsModule, LlmModule],
  controllers: [ChatController, ConversationController, MessageController],
  providers: [ChatService, MessageService],
  exports: [ChatService, MessageService],
})
export class ChatModule {}
