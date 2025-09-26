import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// Use vi.hoisted to define mocks before imports
const { mockStat, mockStatSync, mockCreateReadStream, mockReaddir } =
  vi.hoisted(() => {
    return {
      mockStat: vi.fn(),
      mockStatSync: vi.fn(),
      mockCreateReadStream: vi.fn(),
      mockReaddir: vi.fn(),
    };
  });

// Mock fs before importing anything
vi.mock('fs', () => ({
  stat: mockStat,
  statSync: mockStatSync,
  createReadStream: mockCreateReadStream,
}));

vi.mock('fs/promises', () => ({
  readdir: mockReaddir,
}));

// Import the controller and services
import { AudioController } from './audio.controller';
import type { MusicService } from './music.service';
import type { MusicMetadataCacheService } from './music-metadata-cache.service';

describe('AudioController', () => {
  let controller: AudioController;
  let musicService: Partial<MusicService>;
  let musicMetadataCache: Partial<MusicMetadataCacheService>;

  beforeEach(() => {
    vi.clearAllMocks();

    musicService = {
      getMusicRoot: vi.fn().mockResolvedValue({ root: '/test/music' }),
    };

    musicMetadataCache = {
      getMetadata: vi.fn(),
      saveCache: vi.fn(),
    };

    controller = new AudioController(
      musicService as MusicService,
      musicMetadataCache as MusicMetadataCacheService
    );
  });

  it('should create an instance', () => {
    expect(controller).toBeDefined();
  });

  it('should handle 403 for invalid paths', async () => {
    const mockRequest: Partial<Request> = {
      url: '/audio/../../../etc/passwd',
      originalUrl: '/audio/../../../etc/passwd',
    };

    const mockResponse: Partial<Response> = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    await controller.streamAudio(
      mockRequest as Request,
      undefined,
      mockResponse as Response
    );

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Access denied' });
  });

  it('should list audio files', async () => {
    // Setup mocks
    mockStatSync.mockReturnValue({ size: 5000000 });

    const mockDirents = [
      {
        name: 'song.mp3',
        isFile: () => true,
        isDirectory: () => false,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isSymbolicLink: () => false,
        isFIFO: () => false,
        isSocket: () => false,
      },
    ];

    mockReaddir.mockImplementation(
      async (dirPath: string, options?: { withFileTypes?: boolean }) => {
        if (options?.withFileTypes) {
          return mockDirents;
        }
        return ['song.mp3'];
      }
    );

    (
      musicMetadataCache.getMetadata as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      title: 'Test Song',
      artist: 'Test Artist',
      album: 'Test Album',
      genre: ['Rock'],
      year: 2024,
      duration: '3:45',
      coverArtUrl: '/cover.jpg',
      metadata: {},
    });

    const result = await controller.getAudioFiles();

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Test Song');
  });

  it('should stream audio with range requests', async () => {
    const mockRequest: Partial<Request> = {
      url: '/audio/test.mp3',
      originalUrl: '/audio/test.mp3',
    };

    const mockResponse: Partial<Response> = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      writeHead: vi.fn(),
      end: vi.fn(),
      set: vi.fn().mockReturnThis(),
    };

    const mockStream = {
      pipe: vi.fn(),
    };

    mockStat.mockImplementation((filePath: string, callback: Function) => {
      callback(null, { size: 1024000 });
    });

    mockCreateReadStream.mockReturnValue(mockStream);

    await controller.streamAudio(
      mockRequest as Request,
      'bytes=0-499',
      mockResponse as Response
    );

    expect(mockResponse.writeHead).toHaveBeenCalledWith(206, {
      'Content-Range': 'bytes 0-499/1024000',
      'Accept-Ranges': 'bytes',
      'Content-Length': '500',
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=3600',
    });
  });

  it('should return 404 for non-existent files', async () => {
    const mockRequest: Partial<Request> = {
      url: '/audio/non-existent.mp3',
      originalUrl: '/audio/non-existent.mp3',
    };

    const mockResponse: Partial<Response> = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    mockStat.mockImplementation((filePath: string, callback: Function) => {
      callback(new Error('ENOENT: no such file or directory'), null);
    });

    await controller.streamAudio(
      mockRequest as Request,
      undefined,
      mockResponse as Response
    );

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: 'Audio file not found',
    });
  });
});
