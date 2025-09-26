import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MusicController } from './music.controller';
import type { MusicService } from './music.service';
import type { SetMusicRootDto } from './dto/music.dto';

describe('MusicController', () => {
  let controller: MusicController;
  let musicService: Partial<MusicService>;

  beforeEach(() => {
    // Create mock service
    musicService = {
      getMusicRoot: vi.fn(),
      setMusicRoot: vi.fn(),
    };

    // Create controller with mocked dependencies
    controller = new MusicController(musicService as MusicService);
  });

  describe('getMusicRoot', () => {
    it('should return the current music root directory', async () => {
      const mockMusicRoot = '/test/music/path';
      (musicService.getMusicRoot as ReturnType<typeof vi.fn>).mockResolvedValue(
        {
          root: mockMusicRoot,
          exists: true,
          writable: true,
        }
      );

      const result = await controller.getMusicRoot();

      expect(result).toEqual({
        musicRoot: mockMusicRoot,
      });
      expect(musicService.getMusicRoot).toHaveBeenCalled();
    });

    it('should handle errors from the service', async () => {
      const errorMessage = 'Failed to get music root';
      (musicService.getMusicRoot as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error(errorMessage)
      );

      await expect(controller.getMusicRoot()).rejects.toThrow(errorMessage);
    });
  });

  describe('setMusicRoot', () => {
    it('should set a new music root directory with absolute path', async () => {
      const dto: SetMusicRootDto = {
        path: '/new/music/path',
      };

      const expectedResult = {
        musicRoot: '/new/music/path',
        message: 'Music root changed successfully',
      };

      (musicService.setMusicRoot as ReturnType<typeof vi.fn>).mockResolvedValue(
        expectedResult
      );

      const result = await controller.setMusicRoot(dto);

      expect(result).toEqual(expectedResult);
      expect(musicService.setMusicRoot).toHaveBeenCalledWith(dto.path);
    });

    it('should set a new music root directory with relative path', async () => {
      const dto: SetMusicRootDto = {
        path: './music',
      };

      const expectedResult = {
        musicRoot: '/workspace/music',
        message: 'Music root changed successfully',
      };

      (musicService.setMusicRoot as ReturnType<typeof vi.fn>).mockResolvedValue(
        expectedResult
      );

      const result = await controller.setMusicRoot(dto);

      expect(result).toEqual(expectedResult);
      expect(musicService.setMusicRoot).toHaveBeenCalledWith(dto.path);
    });

    it('should throw BadRequestException when path is not provided', async () => {
      const dto: SetMusicRootDto = {
        path: '',
      };

      await expect(controller.setMusicRoot(dto)).rejects.toThrow(
        BadRequestException
      );
      expect(musicService.setMusicRoot).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when directory does not exist', async () => {
      const dto: SetMusicRootDto = {
        path: '/non/existent/path',
      };

      (musicService.setMusicRoot as ReturnType<typeof vi.fn>).mockRejectedValue(
        new NotFoundException('Directory does not exist')
      );

      await expect(controller.setMusicRoot(dto)).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw BadRequestException when path is not a directory', async () => {
      const dto: SetMusicRootDto = {
        path: '/path/to/file.txt',
      };

      (musicService.setMusicRoot as ReturnType<typeof vi.fn>).mockRejectedValue(
        new BadRequestException('Path is not a directory')
      );

      await expect(controller.setMusicRoot(dto)).rejects.toThrow(
        BadRequestException
      );
    });

    it('should handle generic errors from the service', async () => {
      const dto: SetMusicRootDto = {
        path: '/some/path',
      };

      (musicService.setMusicRoot as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Some internal error')
      );

      await expect(controller.setMusicRoot(dto)).rejects.toThrow(
        'Failed to set music root'
      );
    });

    it('should not update if the path is the same', async () => {
      const dto: SetMusicRootDto = {
        path: '/current/music/path',
      };

      const expectedResult = {
        musicRoot: '/current/music/path',
        message: 'Music root changed successfully',
      };

      (musicService.setMusicRoot as ReturnType<typeof vi.fn>).mockResolvedValue(
        expectedResult
      );

      const result = await controller.setMusicRoot(dto);

      expect(result).toEqual(expectedResult);
      expect(musicService.setMusicRoot).toHaveBeenCalledWith(dto.path);
    });
  });
});
