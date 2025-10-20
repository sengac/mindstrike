import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';
import { HealthController } from './health.controller';

@Module({
  controllers: [SystemController, HealthController],
  providers: [SystemService],
  exports: [SystemService],
})
export class SystemModule {}
