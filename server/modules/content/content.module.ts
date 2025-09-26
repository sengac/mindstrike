import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { LfsController } from './lfs.controller';
import { ContentService } from './content.service';
import { LfsService } from './services/lfs.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [ContentController, LfsController],
  providers: [ContentService, LfsService],
  exports: [ContentService, LfsService],
})
export class ContentModule {}
