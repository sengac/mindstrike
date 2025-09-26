import { Module } from '@nestjs/common';
import { MindmapController } from './mindmap.controller';
import { MindmapService } from './mindmap.service';

@Module({
  controllers: [MindmapController],
  providers: [MindmapService],
  exports: [MindmapService],
})
export class MindmapModule {}
