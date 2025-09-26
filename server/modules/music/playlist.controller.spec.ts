import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlaylistController } from './playlist.controller';
import type { PlaylistService } from './playlist.service';
import {
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

describe('PlaylistController', () => {
  let controller: PlaylistController;
  let playlistService: Partial<PlaylistService>;

  beforeEach(() => {
    // Create mock service
    playlistService = {
      savePlaylists: vi.fn(),
      loadPlaylists: vi.fn(),
      getPlaylistById: vi.fn(),
      deletePlaylistById: vi.fn(),
    };

    // Create controller with mocked dependency
    controller = new PlaylistController(playlistService as PlaylistService);
  });

  describe('savePlaylists', () => {
    it('should save playlists successfully', async () => {
      const mockPlaylists = [
        { id: '1', name: 'Playlist 1', songs: [] },
        { id: '2', name: 'Playlist 2', songs: [] },
      ];

      (
        playlistService.savePlaylists as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        success: true,
      });

      const result = await controller.savePlaylists(mockPlaylists);

      expect(playlistService.savePlaylists).toHaveBeenCalledWith(mockPlaylists);
      expect(result).toEqual({ success: true });
    });

    it('should throw InternalServerErrorException when save fails', async () => {
      const mockPlaylists = [{ id: '1', name: 'Playlist 1', songs: [] }];
      const error = new Error('Failed to save');

      (
        playlistService.savePlaylists as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.savePlaylists(mockPlaylists)).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  describe('loadPlaylists', () => {
    it('should load playlists successfully', async () => {
      const mockPlaylists = [
        { id: '1', name: 'Playlist 1', songs: [] },
        { id: '2', name: 'Playlist 2', songs: [] },
      ];

      (
        playlistService.loadPlaylists as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockPlaylists);

      const result = await controller.loadPlaylists();

      expect(playlistService.loadPlaylists).toHaveBeenCalled();
      expect(result).toEqual(mockPlaylists);
    });

    it('should throw InternalServerErrorException when load fails', async () => {
      const error = new Error('Failed to load');

      (
        playlistService.loadPlaylists as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.loadPlaylists()).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  describe('getPlaylist', () => {
    it('should get playlist by id successfully', async () => {
      const mockPlaylist = { id: '1', name: 'Playlist 1', songs: [] };

      (
        playlistService.getPlaylistById as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockPlaylist);

      const result = await controller.getPlaylist('1');

      expect(playlistService.getPlaylistById).toHaveBeenCalledWith('1');
      expect(result).toEqual(mockPlaylist);
    });

    it('should throw NotFoundException when playlist not found', async () => {
      const error = new BadRequestException('Playlist not found');

      (
        playlistService.getPlaylistById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.getPlaylist('999')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw InternalServerErrorException for invalid format', async () => {
      const error = new BadRequestException('Invalid playlists file format');

      (
        playlistService.getPlaylistById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.getPlaylist('1')).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  describe('deletePlaylist', () => {
    it('should delete playlist successfully', async () => {
      (
        playlistService.deletePlaylistById as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        success: true,
      });

      const result = await controller.deletePlaylist('1');

      expect(playlistService.deletePlaylistById).toHaveBeenCalledWith('1');
      expect(result).toEqual({ success: true });
    });

    it('should throw InternalServerErrorException when delete fails', async () => {
      const error = new Error('Failed to delete');

      (
        playlistService.deletePlaylistById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.deletePlaylist('1')).rejects.toThrow(
        InternalServerErrorException
      );
    });

    it('should throw InternalServerErrorException for invalid format', async () => {
      const error = new BadRequestException('Invalid playlists file format');

      (
        playlistService.deletePlaylistById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.deletePlaylist('1')).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });
});
