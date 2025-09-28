import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ModelScanController } from '../model-scan.controller';
import type { ModelScanService } from '../model-scan.service';
import type { Response } from 'express';

describe('ModelScanController', () => {
  let controller: ModelScanController;
  let mockModelScanService: Partial<ModelScanService>;

  // Create a mock response that satisfies the minimal Response interface needed
  const createMockResponse = (): Partial<Response> => ({
    writeHead: vi.fn(),
    write: vi.fn(),
    on: vi.fn(),
    end: vi.fn(),
    setHeader: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockModelScanService = {
      addProgressClient: vi.fn(),
      startSearch: vi.fn().mockResolvedValue('test-search-id'),
      startScan: vi.fn().mockResolvedValue('test-scan-id'),
      cancelScan: vi.fn().mockResolvedValue(true),
      getScanStatus: vi.fn().mockResolvedValue({
        scanId: 'test-scan-id',
        status: 'running',
        startTime: Date.now(),
        duration: 5000,
      }),
      onModuleDestroy: vi.fn(),
    };

    controller = new ModelScanController(
      mockModelScanService as ModelScanService
    );
  });

  describe('getProgress', () => {
    it('should set up SSE connection for progress updates', async () => {
      const mockResponse = createMockResponse();

      await controller.getProgress(mockResponse as Response);

      expect(mockModelScanService.addProgressClient).toHaveBeenCalledWith(
        expect.stringContaining('scan-'),
        mockResponse
      );
    });
  });

  describe('searchModels', () => {
    it('should start a model search successfully', async () => {
      const searchParams = {
        query: 'llama',
        searchType: 'text',
        filters: {},
      };
      const result = await controller.searchModels(searchParams);

      expect(result).toEqual({
        searchId: 'test-search-id',
        message: 'Model search started',
      });
      expect(mockModelScanService.startSearch).toHaveBeenCalledWith(
        searchParams
      );
    });

    it('should start a model search with filters', async () => {
      const searchParams = {
        query: 'llama',
        searchType: 'all',
        filters: { sortBy: 'popularity' },
      };
      const result = await controller.searchModels(searchParams);

      expect(result).toEqual({
        searchId: 'test-search-id',
        message: 'Model search started',
      });
      expect(mockModelScanService.startSearch).toHaveBeenCalledWith(
        searchParams
      );
    });

    it('should throw InternalServerErrorException on search failure', async () => {
      const searchParams = {
        query: 'test',
        searchType: 'text',
        filters: {},
      };
      (
        mockModelScanService.startSearch as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error('Search failed'));

      await expect(controller.searchModels(searchParams)).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  describe('startScan', () => {
    it('should start a model scan successfully', async () => {
      const scanParams = { config: {} };
      const result = await controller.startScan(scanParams);

      expect(result).toEqual({
        scanId: 'test-scan-id',
        message: 'Model scan started',
      });
      expect(mockModelScanService.startScan).toHaveBeenCalledWith(scanParams);
    });

    it('should throw InternalServerErrorException on scan failure', async () => {
      const scanParams = { config: {} };
      (
        mockModelScanService.startScan as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error('Scan failed'));

      await expect(controller.startScan(scanParams)).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  describe('cancelScan', () => {
    it('should cancel a scan successfully', async () => {
      const scanId = 'test-scan-id';
      const result = await controller.cancelScan(scanId);

      expect(result).toEqual({ message: 'Scan cancelled successfully' });
      expect(mockModelScanService.cancelScan).toHaveBeenCalledWith(scanId);
    });

    it('should throw NotFoundException when scan session not found', async () => {
      const scanId = 'non-existent-id';
      (
        mockModelScanService.cancelScan as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(false);

      await expect(controller.cancelScan(scanId)).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw BadRequestException when scan is not running', async () => {
      const scanId = 'test-scan-id';
      (
        mockModelScanService.cancelScan as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error('Scan is not currently running'));

      await expect(controller.cancelScan(scanId)).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe('getScanStatus', () => {
    it('should return scan status successfully', async () => {
      const scanId = 'test-scan-id';
      const mockStatus = {
        scanId,
        status: 'running' as const,
        startTime: Date.now(),
        duration: 5000,
      };
      (
        mockModelScanService.getScanStatus as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(mockStatus);

      const result = await controller.getScanStatus(scanId);

      expect(result).toEqual(mockStatus);
      expect(mockModelScanService.getScanStatus).toHaveBeenCalledWith(scanId);
    });

    it('should throw NotFoundException when scan not found', async () => {
      const scanId = 'non-existent-id';
      (
        mockModelScanService.getScanStatus as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(null);

      await expect(controller.getScanStatus(scanId)).rejects.toThrow(
        NotFoundException
      );
    });
  });
});
