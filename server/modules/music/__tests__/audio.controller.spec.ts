import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { AudioController } from '../audio.controller';
import type { MusicService } from '../music.service';
import type { MusicMetadataCacheService } from '../music-metadata-cache.service';
import { HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as path from 'path';
import type { Dirent, Stats } from 'fs';

// Mock getMindstrikeDirectory function
vi.mock('../../../../server/utils/settingsDirectory', () => ({
  getMindstrikeDirectory: vi.fn().mockReturnValue('/test/.mindstrike'),
  getHomeDirectory: vi.fn().mockReturnValue('/test/home'),
}));

// Mock music-metadata module
vi.mock('music-metadata', () => ({
  parseFile: vi.fn().mockResolvedValue({
    common: { title: 'Test Song', artist: 'Test Artist' },
    format: { duration: 225 },
  }),
}));

// Mock fs/promises module
vi.mock('fs/promises', () => ({
  default: {
    readdir: vi.fn(),
    stat: vi.fn(),
    access: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
  readdir: vi.fn(),
  stat: vi.fn(),
  access: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Mock fs module for createReadStream
vi.mock('fs', () => ({
  default: {
    statSync: vi.fn(),
    createReadStream: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
    stat: vi.fn(),
  },
  statSync: vi.fn(),
  createReadStream: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  stat: vi.fn(),
}));

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';

// Proper type for mocked Dirent
const createMockDirent = (name: string, isDir: boolean): Dirent =>
  ({
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
  }) as Dirent;

// Proper type for mocked Response
const createMockResponse = (): Partial<Response> => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  writeHead: vi.fn(),
  end: vi.fn(),
  set: vi.fn().mockReturnThis(),
});

// Proper type for mocked ReadStream that extends the real ReadStream
interface MockReadStream extends Partial<fs.ReadStream> {
  pipe: ReturnType<typeof vi.fn>;
}

describe('AudioController', () => {
  let controller: AudioController;
  let musicService: Partial<MusicService>;
  let musicMetadataCache: Partial<MusicMetadataCacheService>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create mock services
    musicService = {
      getMusicRoot: vi.fn(),
    };

    musicMetadataCache = {
      getMetadata: vi.fn(),
      saveCache: vi.fn(),
    };

    // Directly instantiate controller with mocked services
    controller = new AudioController(
      musicService as MusicService,
      musicMetadataCache as MusicMetadataCacheService
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getAudioFiles', () => {
    it('should return an array of audio files', async () => {
      const mockMusicRoot = '/test/music';
      (musicService.getMusicRoot as ReturnType<typeof vi.fn>).mockResolvedValue(
        {
          root: mockMusicRoot,
          exists: true,
          writable: true,
        }
      );

      (
        musicMetadataCache.getMetadata as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        metadata: {},
        title: 'Test Song',
        artist: 'Test Artist',
        album: 'Test Album',
        genre: ['Rock'],
        year: 2024,
        duration: '3:45',
        coverArtUrl: 'data:image/jpeg;base64,test',
      });

      // Mock fs.promises.readdir with proper types
      (fsPromises.readdir as ReturnType<typeof vi.fn>).mockResolvedValue([
        createMockDirent('test.mp3', false),
      ] as Dirent[]);

      // Mock fs.statSync with proper types
      (fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({
        size: 1024000,
        mtime: new Date(),
      } as Stats);

      const result = await controller.getAudioFiles();

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(1);
      expect(result[0]).toMatchObject({
        id: 1,
        title: 'Test Song',
        artist: 'Test Artist',
        album: 'Test Album',
        genre: ['Rock'],
        year: 2024,
        duration: '3:45',
        url: '/audio/test.mp3',
        path: 'test.mp3',
        size: 1024000,
        isActive: false,
      });

      expect(musicMetadataCache.saveCache).toHaveBeenCalled();
    });

    it('should handle files without metadata gracefully', async () => {
      const mockMusicRoot = '/test/music';
      (musicService.getMusicRoot as ReturnType<typeof vi.fn>).mockResolvedValue(
        {
          root: mockMusicRoot,
          exists: true,
          writable: true,
        }
      );

      (
        musicMetadataCache.getMetadata as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Metadata extraction failed'));

      (fsPromises.readdir as ReturnType<typeof vi.fn>).mockResolvedValue([
        createMockDirent('unknown-song.mp3', false),
      ] as Dirent[]);

      (fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({
        size: 2048000,
        mtime: new Date(),
      } as Stats);

      const result = await controller.getAudioFiles();

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(1);
      expect(result[0]).toMatchObject({
        id: 1,
        title: 'Unknown Song',
        artist: 'Unknown Artist',
        duration: '0:00',
        url: '/audio/unknown-song.mp3',
        path: 'unknown-song.mp3',
        size: 2048000,
        isActive: false,
      });
    });

    it('should skip unsupported file extensions', async () => {
      const mockMusicRoot = '/test/music';
      (musicService.getMusicRoot as ReturnType<typeof vi.fn>).mockResolvedValue(
        {
          root: mockMusicRoot,
          exists: true,
          writable: true,
        }
      );

      (fsPromises.readdir as ReturnType<typeof vi.fn>).mockResolvedValue([
        createMockDirent('document.pdf', false),
        createMockDirent('song.mp3', false),
      ] as Dirent[]);

      (fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({
        size: 1024000,
        mtime: new Date(),
      } as Stats);

      (
        musicMetadataCache.getMetadata as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        metadata: {},
        title: 'Song',
        artist: 'Artist',
        duration: '2:30',
      });

      const result = await controller.getAudioFiles();

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('song.mp3');
    });

    it('should skip system directories', async () => {
      const mockMusicRoot = '/test/music';
      (musicService.getMusicRoot as ReturnType<typeof vi.fn>).mockResolvedValue(
        {
          root: mockMusicRoot,
          exists: true,
          writable: true,
        }
      );

      const readdir = fsPromises.readdir as ReturnType<typeof vi.fn>;
      readdir.mockImplementation(async dirPath => {
        if (dirPath === mockMusicRoot) {
          return [
            createMockDirent('node_modules', true),
            createMockDirent('.git', true),
            createMockDirent('music.mp3', false),
          ] as Dirent[];
        }
        return [] as Dirent[];
      });

      (fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({
        size: 1024000,
        mtime: new Date(),
      } as Stats);

      (
        musicMetadataCache.getMetadata as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        metadata: {},
        title: 'Music',
        artist: 'Artist',
        duration: '3:00',
      });

      const result = await controller.getAudioFiles();

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('music.mp3');
      expect(readdir).toHaveBeenCalledTimes(1);
    });
  });

  describe('streamAudio', () => {
    it('should stream audio file with proper headers', async () => {
      const mockMusicRoot = '/test/music';
      const audioPath = 'song.mp3';
      const fullPath = path.resolve(mockMusicRoot, audioPath);

      (musicService.getMusicRoot as ReturnType<typeof vi.fn>).mockResolvedValue(
        {
          root: mockMusicRoot,
          exists: true,
          writable: true,
        }
      );

      const mockResponse = createMockResponse() as Response;

      const mockStream: MockReadStream = {
        pipe: vi.fn(),
      };

      // Type-safe stat mock
      type StatCallback = (
        err: NodeJS.ErrnoException | null,
        stats: Stats
      ) => void;
      (fs.stat as ReturnType<typeof vi.fn>).mockImplementation(
        (p: fs.PathLike, callback: StatCallback) => {
          callback(null, {
            size: 5242880,
            mtime: new Date(),
          } as Stats);
        }
      );

      (fs.createReadStream as ReturnType<typeof vi.fn>).mockReturnValue(
        mockStream as fs.ReadStream
      );

      const mockRequest = {
        url: `/audio/${audioPath}`,
        originalUrl: `/audio/${audioPath}`,
      } as Request;

      await controller.streamAudio(mockRequest, undefined, mockResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(HttpStatus.OK, {
        'Content-Length': '5242880',
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      });

      expect(mockStream.pipe).toHaveBeenCalledWith(mockResponse);
    });

    it('should handle range requests properly', async () => {
      const mockMusicRoot = '/test/music';
      const audioPath = 'song.mp3';

      (musicService.getMusicRoot as ReturnType<typeof vi.fn>).mockResolvedValue(
        {
          root: mockMusicRoot,
          exists: true,
          writable: true,
        }
      );

      const mockResponse = createMockResponse() as Response;

      const mockStream: MockReadStream = {
        pipe: vi.fn(),
      };

      type StatCallback = (
        err: NodeJS.ErrnoException | null,
        stats: Stats
      ) => void;
      (fs.stat as ReturnType<typeof vi.fn>).mockImplementation(
        (p: fs.PathLike, callback: StatCallback) => {
          callback(null, {
            size: 5242880,
            mtime: new Date(),
          } as Stats);
        }
      );

      (fs.createReadStream as ReturnType<typeof vi.fn>).mockReturnValue(
        mockStream as fs.ReadStream
      );

      const mockRequest = {
        url: `/audio/${audioPath}`,
        originalUrl: `/audio/${audioPath}`,
      } as Request;

      const range = 'bytes=0-1024';
      await controller.streamAudio(mockRequest, range, mockResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(
        HttpStatus.PARTIAL_CONTENT,
        {
          'Content-Range': 'bytes 0-1024/5242880',
          'Accept-Ranges': 'bytes',
          'Content-Length': '1025',
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=3600',
        }
      );

      expect(fs.createReadStream).toHaveBeenCalledWith(expect.any(String), {
        start: 0,
        end: 1024,
      });
    });

    it('should return 404 for non-existent files', async () => {
      const mockMusicRoot = '/test/music';
      const audioPath = 'nonexistent.mp3';

      (musicService.getMusicRoot as ReturnType<typeof vi.fn>).mockResolvedValue(
        {
          root: mockMusicRoot,
          exists: true,
          writable: true,
        }
      );

      const mockResponse = createMockResponse() as Response;

      type StatCallback = (
        err: NodeJS.ErrnoException | null,
        stats: Stats
      ) => void;
      (fs.stat as ReturnType<typeof vi.fn>).mockImplementation(
        (p: fs.PathLike, callback: StatCallback) => {
          callback(new Error('File not found'), {} as Stats);
        }
      );

      const mockRequest = {
        url: `/audio/${audioPath}`,
        originalUrl: `/audio/${audioPath}`,
      } as Request;

      await controller.streamAudio(mockRequest, undefined, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Audio file not found',
      });
    });

    it('should deny access to files outside music root', async () => {
      const mockMusicRoot = '/test/music';
      const audioPath = '../../../etc/passwd';

      (musicService.getMusicRoot as ReturnType<typeof vi.fn>).mockResolvedValue(
        {
          root: mockMusicRoot,
          exists: true,
          writable: true,
        }
      );

      const mockResponse = createMockResponse() as Response;

      const mockRequest = {
        url: `/audio/${audioPath}`,
        originalUrl: `/audio/${audioPath}`,
      } as Request;

      await controller.streamAudio(mockRequest, undefined, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Access denied',
      });
    });

    it('should handle invalid range requests', async () => {
      const mockMusicRoot = '/test/music';
      const audioPath = 'song.mp3';

      (musicService.getMusicRoot as ReturnType<typeof vi.fn>).mockResolvedValue(
        {
          root: mockMusicRoot,
          exists: true,
          writable: true,
        }
      );

      const mockResponse = createMockResponse() as Response;

      type StatCallback = (
        err: NodeJS.ErrnoException | null,
        stats: Stats
      ) => void;
      (fs.stat as ReturnType<typeof vi.fn>).mockImplementation(
        (p: fs.PathLike, callback: StatCallback) => {
          callback(null, {
            size: 5242880,
            mtime: new Date(),
          } as Stats);
        }
      );

      const mockRequest = {
        url: `/audio/${audioPath}`,
        originalUrl: `/audio/${audioPath}`,
      } as Request;

      const range = 'bytes=10000000-20000000';
      await controller.streamAudio(mockRequest, range, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE
      );
      expect(mockResponse.set).toHaveBeenCalledWith({
        'Content-Range': 'bytes */5242880',
      });
      expect(mockResponse.end).toHaveBeenCalled();
    });
  });
});
