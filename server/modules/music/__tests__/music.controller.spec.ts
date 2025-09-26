import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MusicController } from '../music.controller';
import type { MusicService } from '../music.service';

describe('MusicController', () => {
  let controller: MusicController;
  let mockMusicService: Partial<MusicService>;

  beforeEach(() => {
    mockMusicService = {
      getMusicRoot: vi.fn(),
      setMusicRoot: vi.fn(),
    };

    controller = new MusicController(mockMusicService as MusicService);
  });

  describe('getMusicRoot', () => {
    it('should return the music root directory', async () => {
      const mockResult = {
        root: '/test/music',
        exists: true,
        writable: true,
      };

      (
        mockMusicService.getMusicRoot as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const result = await controller.getMusicRoot();

      expect(result).toEqual({
        musicRoot: '/test/music',
      });
      expect(mockMusicService.getMusicRoot).toHaveBeenCalled();
    });

    it('should throw error when service fails', async () => {
      const error = new Error('Service error');
      (
        mockMusicService.getMusicRoot as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.getMusicRoot()).rejects.toThrow('Service error');
    });
  });

  describe('setMusicRoot', () => {
    it('should set the music root directory', async () => {
      const dto = { path: '/new/music/path' };
      const mockResult = {
        musicRoot: '/new/music/path',
        message: 'Music root changed successfully',
      };

      (
        mockMusicService.setMusicRoot as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const result = await controller.setMusicRoot(dto);

      expect(result).toEqual(mockResult);
      expect(mockMusicService.setMusicRoot).toHaveBeenCalledWith(
        '/new/music/path'
      );
    });

    it('should throw BadRequestException when path is missing', async () => {
      const dto = { path: '' };

      await expect(controller.setMusicRoot(dto)).rejects.toThrow(
        BadRequestException
      );
      expect(mockMusicService.setMusicRoot).not.toHaveBeenCalled();
    });

    it('should propagate NotFoundException from service', async () => {
      const dto = { path: '/nonexistent/path' };
      const error = new NotFoundException('Directory does not exist');

      (
        mockMusicService.setMusicRoot as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.setMusicRoot(dto)).rejects.toThrow(
        NotFoundException
      );
      expect(mockMusicService.setMusicRoot).toHaveBeenCalledWith(
        '/nonexistent/path'
      );
    });

    it('should propagate BadRequestException from service', async () => {
      const dto = { path: '/not/a/directory' };
      const error = new BadRequestException('Path is not a directory');

      (
        mockMusicService.setMusicRoot as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.setMusicRoot(dto)).rejects.toThrow(
        BadRequestException
      );
      expect(mockMusicService.setMusicRoot).toHaveBeenCalledWith(
        '/not/a/directory'
      );
    });

    it('should throw generic error for unknown service failures', async () => {
      const dto = { path: '/test/path' };
      const error = new Error('Unknown service error');

      (
        mockMusicService.setMusicRoot as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.setMusicRoot(dto)).rejects.toThrow(
        'Failed to set music root'
      );
      expect(mockMusicService.setMusicRoot).toHaveBeenCalledWith('/test/path');
    });
  });
});
