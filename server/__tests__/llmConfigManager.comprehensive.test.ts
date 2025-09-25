import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { LLMConfigManager } from '../llmConfigManager';
import type { LLMConfiguration, CustomLLMService } from '../llmConfigManager';
import { logger } from '../logger';
import { getLLMConfigDirectory } from '../utils/settingsDirectory';
import {
  mockLLMConfiguration,
  mockLLMModels,
  mockCustomServices,
  mockDetectedServices,
  mockLocalModels,
  mockServiceResponses,
  MockFactories,
  ErrorFactory,
} from './fixtures/testData';

// Mock external dependencies
vi.mock('fs/promises');
vi.mock('../logger');
vi.mock('../utils/settingsDirectory');
vi.mock('../llmScanner', () => ({
  LLMScanner: vi.fn().mockImplementation(() => ({
    getAllModelsWithMetadata: vi.fn(),
  })),
}));

// Global fetch mock using factory
let mockFetch: ReturnType<typeof MockFactories.createMockFetch>;

beforeEach(() => {
  mockFetch = MockFactories.createMockFetch();
  global.fetch = mockFetch;
});

describe('LLMConfigManager', () => {
  let configManager: LLMConfigManager;
  const mockConfigDir = '/mock/config';
  const mockConfigPath = path.join(mockConfigDir, 'config.json');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLLMConfigDirectory).mockReturnValue(mockConfigDir);
    configManager = new LLMConfigManager();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct paths', () => {
      expect(getLLMConfigDirectory).toHaveBeenCalled();
      expect(configManager).toBeDefined();
    });
  });

  describe('loadConfiguration', () => {
    it('should load valid configuration from file', async () => {
      const configData = JSON.stringify(mockLLMConfiguration);
      vi.mocked(fs.readFile).mockResolvedValue(configData);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const result = await configManager.loadConfiguration();

      expect(fs.mkdir).toHaveBeenCalledWith(mockConfigDir, { recursive: true });
      expect(fs.readFile).toHaveBeenCalledWith(mockConfigPath, 'utf-8');
      expect(result).toEqual(
        expect.objectContaining({
          models: mockLLMConfiguration.models,
          customServices: mockLLMConfiguration.customServices,
          defaultModelId: mockLLMConfiguration.defaultModelId,
        })
      );
      expect(result.lastUpdated).toBeInstanceOf(Date);
    });

    it('should create default configuration when file does not exist', async () => {
      const error = ErrorFactory.fileNotFound('config.json');
      vi.mocked(fs.readFile).mockRejectedValue(error);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await configManager.loadConfiguration();

      expect(result).toEqual({
        models: [],
        customServices: [],
        lastUpdated: expect.any(Date),
      });
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should handle empty configuration file', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('');
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await configManager.loadConfiguration();

      expect(result).toEqual({
        models: [],
        customServices: [],
        lastUpdated: expect.any(Date),
      });
    });

    it('should handle corrupted JSON file', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('invalid json{');
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await configManager.loadConfiguration();

      expect(result).toEqual({
        models: [],
        customServices: [],
        lastUpdated: expect.any(Date),
      });
    });

    it('should handle invalid configuration format', async () => {
      const invalidConfig = { invalidField: 'test' };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(invalidConfig));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await configManager.loadConfiguration();

      expect(result).toEqual({
        models: [],
        customServices: [],
        lastUpdated: expect.any(Date),
      });
    });

    it('should throw for unexpected errors', async () => {
      const error = ErrorFactory.permissionDenied('config.json');
      vi.mocked(fs.readFile).mockRejectedValue(error);

      await expect(configManager.loadConfiguration()).rejects.toThrow(
        'EACCES: permission denied'
      );
    });
  });

  describe('saveConfiguration', () => {
    beforeEach(async () => {
      // Load a configuration first
      const configData = JSON.stringify(mockLLMConfiguration);
      vi.mocked(fs.readFile).mockResolvedValue(configData);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      await configManager.loadConfiguration();
    });

    it('should save configuration successfully', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await configManager.saveConfiguration();

      expect(fs.writeFile).toHaveBeenCalledWith(
        mockConfigPath,
        expect.stringContaining('"models"'),
        'utf-8'
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should update lastUpdated timestamp on save', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await configManager.saveConfiguration();

      const savedData = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      const savedConfig = JSON.parse(savedData) as LLMConfiguration;
      expect(new Date(savedConfig.lastUpdated).getTime()).toBeGreaterThan(
        new Date('2023-01-01').getTime()
      );
    });

    it('should throw error when no configuration loaded', async () => {
      const freshManager = new LLMConfigManager();

      await expect(freshManager.saveConfiguration()).rejects.toThrow(
        'No configuration to save'
      );
    });

    it('should handle write errors', async () => {
      const writeError = ErrorFactory.permissionDenied('config.json');
      vi.mocked(fs.writeFile).mockRejectedValue(writeError);

      await expect(configManager.saveConfiguration()).rejects.toThrow(
        'EACCES: permission denied'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to save LLM configuration:',
        writeError
      );
    });
  });

  describe('getModels', () => {
    it('should return models from loaded configuration', async () => {
      const configData = JSON.stringify(mockLLMConfiguration);
      vi.mocked(fs.readFile).mockResolvedValue(configData);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const models = await configManager.getModels();

      expect(models).toEqual(mockLLMModels);
    });

    it('should load configuration if not already loaded', async () => {
      const freshManager = new LLMConfigManager();
      const configData = JSON.stringify(mockLLMConfiguration);
      vi.mocked(fs.readFile).mockResolvedValue(configData);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const models = await freshManager.getModels();

      expect(models).toEqual(mockLLMModels);
      expect(fs.readFile).toHaveBeenCalled();
    });

    it('should return empty array when no models exist', async () => {
      const emptyConfig = { ...mockLLMConfiguration, models: [] };
      const configData = JSON.stringify(emptyConfig);
      vi.mocked(fs.readFile).mockResolvedValue(configData);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const models = await configManager.getModels();

      expect(models).toEqual([]);
    });
  });

  describe('getDefaultModel', () => {
    beforeEach(async () => {
      const configData = JSON.stringify(mockLLMConfiguration);
      vi.mocked(fs.readFile).mockResolvedValue(configData);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      await configManager.loadConfiguration();
    });

    it('should return default model when it exists', async () => {
      const defaultModel = await configManager.getDefaultModel();

      expect(defaultModel).toEqual(mockLLMModels[0]);
      expect(defaultModel?.id).toBe('ollama:llama2');
    });

    it('should return null when no default model is set', async () => {
      const configWithoutDefault = {
        ...mockLLMConfiguration,
        defaultModelId: undefined,
      };
      const configData = JSON.stringify(configWithoutDefault);
      vi.mocked(fs.readFile).mockResolvedValue(configData);

      const freshManager = new LLMConfigManager();
      const defaultModel = await freshManager.getDefaultModel();

      expect(defaultModel).toBeNull();
    });

    it('should return null when default model id does not exist in models', async () => {
      const configWithInvalidDefault = {
        ...mockLLMConfiguration,
        defaultModelId: 'nonexistent',
      };
      const configData = JSON.stringify(configWithInvalidDefault);
      vi.mocked(fs.readFile).mockResolvedValue(configData);

      const freshManager = new LLMConfigManager();
      const defaultModel = await freshManager.getDefaultModel();

      expect(defaultModel).toBeNull();
    });

    it('should handle configuration loading failure', async () => {
      const freshManager = new LLMConfigManager();
      const enoentError = ErrorFactory.fileNotFound('config.json');
      vi.mocked(fs.readFile).mockRejectedValue(enoentError);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const defaultModel = await freshManager.getDefaultModel();

      expect(defaultModel).toBeNull();
    });
  });

  describe('setDefaultModel', () => {
    beforeEach(async () => {
      const configData = JSON.stringify(mockLLMConfiguration);
      vi.mocked(fs.readFile).mockResolvedValue(configData);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      await configManager.loadConfiguration();
    });

    it('should set new default model successfully', async () => {
      const modelId = 'openai:gpt-4';

      await configManager.setDefaultModel(modelId);

      const models = await configManager.getModels();
      const newDefault = models.find(m => m.id === modelId);
      const oldDefault = models.find(m => m.id === 'ollama:llama2');

      expect(newDefault?.isDefault).toBe(true);
      expect(oldDefault?.isDefault).toBe(false);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should throw error for non-existent model', async () => {
      const nonExistentModelId = 'nonexistent:model';

      await expect(
        configManager.setDefaultModel(nonExistentModelId)
      ).rejects.toThrow(`Model with ID ${nonExistentModelId} not found`);
    });

    it('should handle configuration loading failure', async () => {
      const freshManager = new LLMConfigManager();
      const enoentError = new Error('File not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(enoentError);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      // Should create default config and then fail to find the model
      await expect(freshManager.setDefaultModel('any-id')).rejects.toThrow(
        'Model with ID any-id not found'
      );
    });
  });

  describe('addCustomService', () => {
    beforeEach(async () => {
      const configData = JSON.stringify(mockLLMConfiguration);
      vi.mocked(fs.readFile).mockResolvedValue(configData);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      await configManager.loadConfiguration();
    });

    it('should add new custom service successfully', async () => {
      const newService = {
        name: 'New Custom Service',
        baseURL: 'http://localhost:8080',
        type: 'openai-compatible' as const,
        enabled: true,
      };

      const result = await configManager.addCustomService(newService);

      expect(result).toEqual(
        expect.objectContaining({
          ...newService,
          id: expect.stringMatching(/^custom-\d+-[a-z0-9]+$/),
          custom: true,
        })
      );
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should generate unique IDs for multiple services', async () => {
      const service1 = {
        name: 'Service 1',
        baseURL: 'http://localhost:8080',
        type: 'openai-compatible' as const,
        enabled: true,
      };
      const service2 = {
        name: 'Service 2',
        baseURL: 'http://localhost:8081',
        type: 'ollama' as const,
        enabled: true,
      };

      const result1 = await configManager.addCustomService(service1);
      const result2 = await configManager.addCustomService(service2);

      expect(result1.id).not.toBe(result2.id);
      expect(result1.id).toMatch(/^custom-/);
      expect(result2.id).toMatch(/^custom-/);
    });

    it('should handle configuration loading failure', async () => {
      const freshManager = new LLMConfigManager();
      const enoentError = new Error('File not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(enoentError);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const service = {
        name: 'Test Service',
        baseURL: 'http://localhost:8080',
        type: 'openai-compatible' as const,
        enabled: true,
      };

      // Should create default config and then add service successfully
      const result = await freshManager.addCustomService(service);
      expect(result.id).toMatch(/^custom-\d+-[a-z0-9]+$/);
    });
  });

  describe('updateCustomService', () => {
    beforeEach(async () => {
      const configData = JSON.stringify(mockLLMConfiguration);
      vi.mocked(fs.readFile).mockResolvedValue(configData);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      await configManager.loadConfiguration();
    });

    it('should update existing custom service', async () => {
      const serviceId = mockCustomServices[0].id;
      const updates = {
        name: 'Updated Service Name',
        enabled: false,
      };

      const result = await configManager.updateCustomService(
        serviceId,
        updates
      );

      expect(result).toEqual(
        expect.objectContaining({
          ...mockCustomServices[0],
          ...updates,
        })
      );
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should throw error for non-existent service', async () => {
      const nonExistentId = 'nonexistent-service';
      const updates = { enabled: false };

      await expect(
        configManager.updateCustomService(nonExistentId, updates)
      ).rejects.toThrow(`Custom service with ID ${nonExistentId} not found`);
    });

    it('should preserve unchanged fields', async () => {
      const serviceId = mockCustomServices[0].id;
      const updates = { enabled: false };

      const result = await configManager.updateCustomService(
        serviceId,
        updates
      );

      expect(result.name).toBe(mockCustomServices[0].name);
      expect(result.baseURL).toBe(mockCustomServices[0].baseURL);
      expect(result.type).toBe(mockCustomServices[0].type);
      expect(result.enabled).toBe(false);
    });
  });

  describe('removeCustomService', () => {
    beforeEach(async () => {
      const configData = JSON.stringify(mockLLMConfiguration);
      vi.mocked(fs.readFile).mockResolvedValue(configData);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      await configManager.loadConfiguration();
    });

    it('should remove existing custom service and associated models', async () => {
      const serviceId = mockCustomServices[0].id;

      await configManager.removeCustomService(serviceId);

      const services = await configManager.getCustomServices();
      const models = await configManager.getModels();

      expect(services.find(s => s.id === serviceId)).toBeUndefined();
      expect(models.find(m => m.serviceId === serviceId)).toBeUndefined();
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should throw error for non-existent service', async () => {
      const nonExistentId = 'nonexistent-service';

      await expect(
        configManager.removeCustomService(nonExistentId)
      ).rejects.toThrow(`Custom service with ID ${nonExistentId} not found`);
    });

    it('should handle configuration loading failure', async () => {
      const freshManager = new LLMConfigManager();
      const enoentError = new Error('File not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(enoentError);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      // Should create default config and then fail to find the service
      await expect(freshManager.removeCustomService('any-id')).rejects.toThrow(
        'Custom service with ID any-id not found'
      );
    });
  });

  describe('getCustomServices', () => {
    it('should return all custom services', async () => {
      const configData = JSON.stringify(mockLLMConfiguration);
      vi.mocked(fs.readFile).mockResolvedValue(configData);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const services = await configManager.getCustomServices();

      expect(services).toEqual(mockCustomServices);
    });

    it('should return empty array when no custom services exist', async () => {
      const emptyConfig = { ...mockLLMConfiguration, customServices: [] };
      const configData = JSON.stringify(emptyConfig);
      vi.mocked(fs.readFile).mockResolvedValue(configData);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const services = await configManager.getCustomServices();

      expect(services).toEqual([]);
    });
  });

  describe('refreshModels', () => {
    beforeEach(async () => {
      const configData = JSON.stringify(mockLLMConfiguration);
      vi.mocked(fs.readFile).mockResolvedValue(configData);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      await configManager.loadConfiguration();
    });

    it('should refresh models from detected services', async () => {
      const models = await configManager.refreshModels(mockDetectedServices);

      expect(models.length).toBeGreaterThan(0);
      expect(models.some(m => m.serviceId === 'ollama-detected')).toBe(true);
      expect(models.some(m => m.serviceId === 'openai-detected')).toBe(true);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should include local models when provided', async () => {
      const models = await configManager.refreshModels([], mockLocalModels);

      expect(models.some(m => m.type === 'local')).toBe(true);
      expect(models.some(m => m.serviceId === 'local-llm')).toBe(true);
    });

    it('should preserve default model selection if it still exists', async () => {
      // The initial mock configuration has ollama:llama2 as default
      // Use service ID 'ollama' to match the existing model ID format
      const detectedWithDefault = [
        {
          id: 'ollama',
          name: 'Ollama Local',
          baseURL: 'http://localhost:11434',
          type: 'ollama',
          available: true,
          modelsWithMetadata: [
            {
              name: 'llama2',
              display_name: 'Llama 2',
              context_length: 4096,
            },
          ],
        },
      ];

      await configManager.refreshModels(detectedWithDefault);

      const models = await configManager.getModels();
      const defaultModel = models.find(m => m.isDefault);

      expect(defaultModel).toBeTruthy();
      expect(defaultModel?.id).toBe('ollama:llama2');
    });

    it('should clear default if model no longer exists', async () => {
      const detectedWithoutDefault = [
        {
          id: 'different-service',
          name: 'Different Service',
          baseURL: 'http://localhost:9000',
          type: 'ollama',
          available: true,
          models: ['different-model'],
        },
      ];

      await configManager.refreshModels(detectedWithoutDefault);

      const config = await configManager.getConfiguration();
      expect(config.defaultModelId).toBeUndefined();
    });

    it('should handle custom services with model fetching', async () => {
      // Mock successful fetch for custom service
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockServiceResponses.ollama.tags),
      });

      await configManager.refreshModels([]);

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle fetch errors for custom services gracefully', async () => {
      const networkError = ErrorFactory.networkTimeout();
      mockFetch.mockRejectedValueOnce(networkError);

      const models = await configManager.refreshModels([]);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to refresh models for custom service'),
        networkError
      );
    });

    it('should skip disabled custom services', async () => {
      mockFetch.mockClear();

      await configManager.refreshModels([]);

      // Should not fetch for disabled services
      const fetchCalls = mockFetch.mock.calls;
      expect(fetchCalls.some(call => call[0].includes('localhost:8000'))).toBe(
        false
      );
    });

    it('should handle Ollama connection refused errors silently', async () => {
      // Set up a configuration with only Ollama (Local) service
      const ollamaOnlyConfig = {
        ...mockLLMConfiguration,
        customServices: [
          {
            id: 'ollama-local',
            name: 'Ollama (Local)',
            baseURL: 'http://localhost:11434',
            type: 'ollama' as const,
            enabled: true,
            custom: true,
          },
        ],
      };

      const configData = JSON.stringify(ollamaOnlyConfig);
      vi.mocked(fs.readFile).mockResolvedValue(configData);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const freshManager = new LLMConfigManager();
      const connectionError = ErrorFactory.connectionRefused(
        'localhost',
        11434
      );
      mockFetch.mockRejectedValueOnce(connectionError);

      await freshManager.refreshModels([]);

      // Should not log connection refused errors for Ollama (Local)
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should handle different service types correctly', async () => {
      // Test Perplexity service (returns hardcoded models)
      const perplexityService: CustomLLMService = {
        id: 'test-perplexity',
        name: 'Test Perplexity',
        baseURL: 'https://api.perplexity.ai',
        type: 'perplexity',
        enabled: true,
        custom: true,
      };

      const configWithPerplexity = {
        ...mockLLMConfiguration,
        customServices: [perplexityService],
      };

      const configData = JSON.stringify(configWithPerplexity);
      vi.mocked(fs.readFile).mockResolvedValue(configData);

      const freshManager = new LLMConfigManager();
      const models = await freshManager.refreshModels([]);

      expect(models.some(m => m.serviceId === 'test-perplexity')).toBe(true);
      expect(models.some(m => m.model === 'sonar-pro')).toBe(true);
    });

    it('should handle Google service correctly', async () => {
      const googleService: CustomLLMService = {
        id: 'test-google',
        name: 'Test Google',
        baseURL: 'https://api.google.ai',
        type: 'google',
        enabled: true,
        custom: true,
      };

      const configWithGoogle = {
        ...mockLLMConfiguration,
        customServices: [googleService],
      };

      const configData = JSON.stringify(configWithGoogle);
      vi.mocked(fs.readFile).mockResolvedValue(configData);

      const freshManager = new LLMConfigManager();
      const models = await freshManager.refreshModels([]);

      expect(models.some(m => m.serviceId === 'test-google')).toBe(true);
      expect(models.some(m => m.model === 'gemini-1.5-pro')).toBe(true);
    });
  });

  describe('getConfiguration', () => {
    it('should return current configuration', async () => {
      const configData = JSON.stringify(mockLLMConfiguration);
      vi.mocked(fs.readFile).mockResolvedValue(configData);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const config = await configManager.getConfiguration();

      expect(config).toEqual(
        expect.objectContaining({
          models: mockLLMConfiguration.models,
          customServices: mockLLMConfiguration.customServices,
          defaultModelId: mockLLMConfiguration.defaultModelId,
        })
      );
    });

    it('should load configuration if not already loaded', async () => {
      const freshManager = new LLMConfigManager();
      const configData = JSON.stringify(mockLLMConfiguration);
      vi.mocked(fs.readFile).mockResolvedValue(configData);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const config = await freshManager.getConfiguration();

      expect(config).toBeDefined();
      expect(fs.readFile).toHaveBeenCalled();
    });

    it('should create default config if configuration fails to load', async () => {
      const freshManager = new LLMConfigManager();
      const enoentError = new Error('File not found') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(enoentError);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      // Should create default config instead of throwing
      const config = await freshManager.getConfiguration();
      expect(config).toEqual({
        models: [],
        customServices: [],
        lastUpdated: expect.any(Date),
      });
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle simultaneous operations gracefully', async () => {
      const configData = JSON.stringify(mockLLMConfiguration);
      vi.mocked(fs.readFile).mockResolvedValue(configData);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      // Start multiple operations simultaneously
      const operations = [
        configManager.loadConfiguration(),
        configManager.getModels(),
        configManager.getCustomServices(),
      ];

      const results = await Promise.all(operations);

      expect(results).toHaveLength(3);
      expect(results[0]).toBeDefined();
      expect(results[1]).toEqual(mockLLMModels);
      expect(results[2]).toEqual(mockCustomServices);
    });

    it('should handle malformed service responses', async () => {
      // Mock malformed response for Ollama service
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const models = await configManager.refreshModels([]);

      // Should handle gracefully and not crash
      expect(models).toBeDefined();
    });

    it('should handle network interruptions during refresh', async () => {
      const configData = JSON.stringify(mockLLMConfiguration);
      vi.mocked(fs.readFile).mockResolvedValue(configData);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      await configManager.loadConfiguration();

      // Mock network failure
      const networkError = ErrorFactory.networkTimeout();
      mockFetch.mockRejectedValue(networkError);

      const models = await configManager.refreshModels(mockDetectedServices);

      // Should still return models from detected services
      expect(models.length).toBeGreaterThan(0);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to refresh models for custom service'),
        networkError
      );
    });

    it('should handle HTTP errors from services', async () => {
      // Set up a configuration with an enabled custom service
      const configWithEnabledService = {
        ...mockLLMConfiguration,
        customServices: [
          {
            id: 'test-service',
            name: 'Test Service',
            baseURL: 'http://localhost:8080',
            type: 'openai',
            enabled: true,
            custom: true,
          },
        ],
      };

      const configData = JSON.stringify(configWithEnabledService);
      vi.mocked(fs.readFile).mockResolvedValue(configData);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const freshManager = new LLMConfigManager();

      // Mock HTTP error response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      const models = await freshManager.refreshModels([]);

      // Should handle gracefully
      expect(models).toBeDefined();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should handle timeout scenarios', async () => {
      const abortError = ErrorFactory.abortError();
      mockFetch.mockRejectedValueOnce(abortError);

      const models = await configManager.refreshModels([]);

      // Should handle timeout gracefully
      expect(models).toBeDefined();
    });
  });
});
