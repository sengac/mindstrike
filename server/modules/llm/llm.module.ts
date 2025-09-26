import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmController } from './llm.controller';
import { LlmConfigController } from './llm-config.controller';
import { LlmService } from './services/llm.service';
import { LlmConfigService } from './services/llm-config.service';
import { ModelDiscoveryService } from './services/model-discovery.service';
import { ModelDownloadService } from './services/model-download.service';
import { ResponseGeneratorService } from './services/response-generator.service';
import { LocalLlmService } from './services/local-llm.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [ConfigModule, EventsModule],
  controllers: [LlmController, LlmConfigController],
  providers: [
    LlmService,
    LlmConfigService,
    ModelDiscoveryService,
    ModelDownloadService,
    ResponseGeneratorService,
    LocalLlmService,
  ],
  exports: [LlmService, LlmConfigService, ResponseGeneratorService],
})
export class LlmModule {}
