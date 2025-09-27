import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { CoreModule } from './core.module';
import {
  SessionService,
  GlobalSessionManager,
} from '../chat/services/session.service';
import { ConversationService } from '../chat/services/conversation.service';
import { SseService } from '../events/services/sse.service';
import { GlobalLlmConfigService } from '../shared/services/global-llm-config.service';
import { LlmConfigService } from '../llm/services/llm-config.service';
import { LlmService } from '../llm/services/llm.service';
import { ResponseGeneratorService } from '../llm/services/response-generator.service';
import { ModelDiscoveryService } from '../llm/services/model-discovery.service';
import { ModelDownloadService } from '../llm/services/model-download.service';
import { LocalLlmService } from '../llm/services/local-llm.service';

describe('CoreModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
        }),
      ],
      providers: [
        // CoreModule providers
        ConversationService,
        SessionService,
        GlobalSessionManager,
        SseService,
        GlobalLlmConfigService,
        // Mock LLM module providers
        {
          provide: LlmConfigService,
          useValue: {
            getDefaultModel: vi.fn().mockResolvedValue(null),
            getModels: vi.fn().mockResolvedValue([]),
            setDefaultModel: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: LlmService,
          useValue: {
            getChatModel: vi.fn(),
          },
        },
        {
          provide: ResponseGeneratorService,
          useValue: {
            generateResponse: vi.fn(),
          },
        },
        {
          provide: ModelDiscoveryService,
          useValue: {
            discoverModels: vi.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ModelDownloadService,
          useValue: {
            downloadModel: vi.fn(),
          },
        },
        {
          provide: LocalLlmService,
          useValue: {
            getModels: vi.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide SessionService with all dependencies', () => {
    const sessionService = module.get<SessionService>(SessionService);
    expect(sessionService).toBeDefined();
  });

  it('should provide GlobalSessionManager', () => {
    const globalSessionManager =
      module.get<GlobalSessionManager>(GlobalSessionManager);
    expect(globalSessionManager).toBeDefined();
  });

  it('should provide ConversationService', () => {
    const conversationService =
      module.get<ConversationService>(ConversationService);
    expect(conversationService).toBeDefined();
  });

  it('should provide SseService', () => {
    const sseService = module.get<SseService>(SseService);
    expect(sseService).toBeDefined();
  });

  it('should provide GlobalLlmConfigService', () => {
    const globalLlmConfigService = module.get<GlobalLlmConfigService>(
      GlobalLlmConfigService
    );
    expect(globalLlmConfigService).toBeDefined();
  });
});
