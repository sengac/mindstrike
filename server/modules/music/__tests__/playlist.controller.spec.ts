import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PlaylistController } from '../playlist.controller';
import type { PlaylistService } from '../playlist.service';

describe('PlaylistController', () => {
  let controller: PlaylistController;
  let mockPlaylistService: Partial<PlaylistService>;

  beforeEach(() => {
    mockPlaylistService = {
      savePlaylists: vi.fn(),
      loadPlaylists: vi.fn(),
      getPlaylistById: vi.fn(),
      deletePlaylistById: vi.fn(),
    };

    controller = new PlaylistController(mockPlaylistService as PlaylistService);
  });

  describe('savePlaylists', () => {
    it('should save playlists successfully', async () => {
      const playlists = [
        { id: '1', name: 'Test Playlist 1' },
        { id: '2', name: 'Test Playlist 2' },
      ];
      const mockResult = { success: true };

      (
        mockPlaylistService.savePlaylists as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const result = await controller.savePlaylists(playlists);

      expect(result).toEqual(mockResult);
      expect(mockPlaylistService.savePlaylists).toHaveBeenCalledWith(playlists);
    });

    it('should throw InternalServerErrorException when service fails', async () => {
      const playlists = [{ id: '1', name: 'Test' }];
      const error = new Error('Service error');

      (
        mockPlaylistService.savePlaylists as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.savePlaylists(playlists)).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  describe('loadPlaylists', () => {
    it('should load playlists successfully', async () => {
      const mockPlaylists = [
        { id: '1', name: 'Playlist 1' },
        { id: '2', name: 'Playlist 2' },
      ];

      (
        mockPlaylistService.loadPlaylists as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockPlaylists);

      const result = await controller.loadPlaylists();

      expect(result).toEqual(mockPlaylists);
      expect(mockPlaylistService.loadPlaylists).toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException when service fails', async () => {
      const error = new Error('Service error');

      (
        mockPlaylistService.loadPlaylists as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.loadPlaylists()).rejects.toThrow(
        InternalServerErrorException
      );
    });

    it('should return empty array when no playlists exist', async () => {
      const mockPlaylists: unknown[] = [];

      (
        mockPlaylistService.loadPlaylists as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockPlaylists);

      const result = await controller.loadPlaylists();

      expect(result).toEqual([]);
    });
  });

  describe('getPlaylist', () => {
    it('should get playlist by ID successfully', async () => {
      const playlistId = 'test-id';
      const mockPlaylist = {
        id: playlistId,
        name: 'Test Playlist',
        tracks: [],
      };

      (
        mockPlaylistService.getPlaylistById as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockPlaylist);

      const result = await controller.getPlaylist(playlistId);

      expect(result).toEqual(mockPlaylist);
      expect(mockPlaylistService.getPlaylistById).toHaveBeenCalledWith(
        playlistId
      );
    });

    it('should throw NotFoundException when playlist not found', async () => {
      const playlistId = 'nonexistent-id';
      const error = new BadRequestException('Playlist not found');

      (
        mockPlaylistService.getPlaylistById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.getPlaylist(playlistId)).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw InternalServerErrorException for invalid file format', async () => {
      const playlistId = 'test-id';
      const error = new BadRequestException('Invalid playlists file format');

      (
        mockPlaylistService.getPlaylistById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.getPlaylist(playlistId)).rejects.toThrow(
        InternalServerErrorException
      );
    });

    it('should throw InternalServerErrorException for generic errors', async () => {
      const playlistId = 'test-id';
      const error = new Error('Generic error');

      (
        mockPlaylistService.getPlaylistById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.getPlaylist(playlistId)).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  describe('deletePlaylist', () => {
    it('should delete playlist successfully', async () => {
      const playlistId = 'test-id';
      const mockResult = { success: true };

      (
        mockPlaylistService.deletePlaylistById as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockResult);

      const result = await controller.deletePlaylist(playlistId);

      expect(result).toEqual(mockResult);
      expect(mockPlaylistService.deletePlaylistById).toHaveBeenCalledWith(
        playlistId
      );
    });

    it('should throw InternalServerErrorException for invalid file format', async () => {
      const playlistId = 'test-id';
      const error = new BadRequestException('Invalid playlists file format');

      (
        mockPlaylistService.deletePlaylistById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.deletePlaylist(playlistId)).rejects.toThrow(
        InternalServerErrorException
      );
    });

    it('should throw InternalServerErrorException for generic errors', async () => {
      const playlistId = 'test-id';
      const error = new Error('Generic error');

      (
        mockPlaylistService.deletePlaylistById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(error);

      await expect(controller.deletePlaylist(playlistId)).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });
});
