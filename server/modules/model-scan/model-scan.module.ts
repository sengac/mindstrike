import { Module } from '@nestjs/common';
import { ModelScanController } from './model-scan.controller';
import { ModelScanService } from './model-scan.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [ModelScanController],
  providers: [ModelScanService],
  exports: [ModelScanService],
})
export class ModelScanModule {}
