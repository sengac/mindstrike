import { Module } from '@nestjs/common';
import { UtilityController } from './utility.controller';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [ChatModule],
  controllers: [UtilityController],
})
export class UtilityModule {}
