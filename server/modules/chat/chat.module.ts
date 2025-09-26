import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatController } from './chat.controller';
import { ConversationController } from './conversation.controller';
import { MessageController } from './message.controller';
import { ChatService } from './chat.service';
import { ConversationService } from './services/conversation.service';
import { MessageService } from './services/message.service';
import { SessionService } from './services/session.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [ConfigModule, EventsModule],
  controllers: [ChatController, ConversationController, MessageController],
  providers: [ChatService, MessageService],
  exports: [ChatService, MessageService],
})
export class ChatModule {}
