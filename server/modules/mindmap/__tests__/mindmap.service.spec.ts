import type { Mock } from 'vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MindmapService } from '../mindmap.service';
import type { GlobalConfigService } from '../../shared/services/global-config.service';
import type { MindMap } from '../mindmap.service';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Mock path
vi.mock('path', () => ({
  join: vi.fn(),
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-123'),
}));

describe('MindmapService', () => {
  let service: MindmapService;
  let mockReadFile: Mock;
  let mockWriteFile: Mock;
  let mockPathJoin: Mock;
  let mockGlobalConfigService: Partial<GlobalConfigService>;

  const mockMindmap: MindMap = {
    id: 'test-mindmap-123',
    title: 'Test Mindmap',
    nodes: [
      {
        id: 'node-1',
        type: 'concept',
        data: { label: 'Central Idea' },
        position: { x: 400, y: 300 },
      },
    ],
    edges: [],
    metadata: { category: 'test' },
    createdAt: new Date('2024-01-01T10:00:00Z'),
    updatedAt: new Date('2024-01-01T10:00:00Z'),
  };

  const mockMindmapWithData: MindMap & {
    mindmapData?: Record<string, unknown>;
  } = {
    ...mockMindmap,
    mindmapData: {
      nodeCount: 5,
      layout: 'radial',
      theme: 'light',
    },
  };

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    mockReadFile = fs.readFile as Mock;
    mockWriteFile = fs.writeFile as Mock;
    mockPathJoin = path.join as Mock;

    // Setup default mock implementations
    mockPathJoin.mockReturnValue('/test/workspace/mindstrike-mindmaps.json');
    mockReadFile.mockResolvedValue(JSON.stringify([mockMindmap]));
    mockWriteFile.mockResolvedValue(undefined);

    // Create mock GlobalConfigService
    mockGlobalConfigService = {
      getWorkspaceRoot: vi.fn().mockReturnValue('/test/workspace'),
      getMusicRoot: vi.fn().mockReturnValue('/test/music'),
      getCurrentWorkingDirectory: vi.fn().mockReturnValue('/test/workspace'),
      updateWorkspaceRoot: vi.fn(),
      updateMusicRoot: vi.fn(),
      updateCurrentWorkingDirectory: vi.fn(),
    };

    // Directly instantiate the service with mocked dependency
    service = new MindmapService(
      mockGlobalConfigService as GlobalConfigService
    );
  });

  describe('saveMindmaps', () => {
    it('should save array of mindmaps successfully', async () => {
      const mindmaps = [
        {
          id: 'mindmap-1',
          title: 'First Mindmap',
          nodes: [{ id: 'node-1', data: { label: 'Node 1' } }],
          edges: [],
          metadata: { category: 'work' },
        },
        {
          id: 'mindmap-2',
          title: 'Second Mindmap',
          nodes: [{ id: 'node-2', data: { label: 'Node 2' } }],
          edges: [],
          metadata: { category: 'personal' },
        },
      ];

      await service.saveMindmaps(mindmaps);

      expect(mockWriteFile).toHaveBeenCalledWith(
        '/test/workspace/mindstrike-mindmaps.json',
        expect.stringContaining('mindmap-1'),
        'utf-8'
      );
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/test/workspace/mindstrike-mindmaps.json',
        expect.stringContaining('mindmap-2'),
        'utf-8'
      );
    });

    it('should merge with existing mindmap data', async () => {
      const existingMindmaps = [
        {
          id: 'existing-1',
          title: 'Existing Mindmap',
          nodes: [],
          edges: [],
          mindmapData: { theme: 'dark' },
        },
      ];

      const newMindmaps = [
        {
          id: 'existing-1',
          title: 'Updated Mindmap',
          nodes: [{ id: 'new-node' }],
          edges: [],
        },
        {
          id: 'new-1',
          title: 'New Mindmap',
          nodes: [],
          edges: [],
        },
      ];

      mockReadFile.mockResolvedValueOnce(JSON.stringify(existingMindmaps));

      await service.saveMindmaps(newMindmaps);

      const writeCall = mockWriteFile.mock.calls[0];
      const savedData = JSON.parse(writeCall[1]);

      expect(savedData).toHaveLength(2);

      // Check that existing mindmap was merged
      const updatedMindmap = savedData.find(
        (m: MindMap) => m.id === 'existing-1'
      );
      expect(updatedMindmap.title).toBe('Updated Mindmap');
      expect(updatedMindmap.mindmapData.theme).toBe('dark'); // Preserved from existing
      expect(updatedMindmap.nodes).toHaveLength(1);

      // Check that new mindmap was added
      const newMindmap = savedData.find((m: MindMap) => m.id === 'new-1');
      expect(newMindmap.title).toBe('New Mindmap');
    });

    it('should handle empty array of mindmaps', async () => {
      const mindmaps: Array<Record<string, unknown>> = [];

      await service.saveMindmaps(mindmaps);

      expect(mockWriteFile).toHaveBeenCalledWith(
        '/test/workspace/mindstrike-mindmaps.json',
        '[]',
        'utf-8'
      );
    });

    it('should handle non-existent mindmaps file', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT: no such file'));

      const mindmaps = [
        {
          id: 'new-mindmap',
          title: 'New Mindmap',
          nodes: [],
          edges: [],
        },
      ];

      await service.saveMindmaps(mindmaps);

      expect(mockWriteFile).toHaveBeenCalledWith(
        '/test/workspace/mindstrike-mindmaps.json',
        expect.stringContaining('new-mindmap'),
        'utf-8'
      );
    });

    it('should add updatedAt timestamp to all mindmaps', async () => {
      const mindmaps = [
        {
          id: 'mindmap-1',
          title: 'Test Mindmap',
          nodes: [],
          edges: [],
        },
      ];

      await service.saveMindmaps(mindmaps);

      const writeCall = mockWriteFile.mock.calls[0];
      const savedData = JSON.parse(writeCall[1]);

      expect(savedData[0].updatedAt).toBeDefined();
      expect(new Date(savedData[0].updatedAt)).toBeInstanceOf(Date);
    });

    it('should preserve mindmap IDs when saving', async () => {
      const mindmaps = [
        {
          id: 'custom-id-123',
          title: 'Test Mindmap',
          nodes: [],
          edges: [],
        },
      ];

      await service.saveMindmaps(mindmaps);

      const writeCall = mockWriteFile.mock.calls[0];
      const savedData = JSON.parse(writeCall[1]);

      expect(savedData[0].id).toBe('custom-id-123');
    });

    it('should handle write file errors', async () => {
      const writeError = new Error('EACCES: permission denied');
      mockWriteFile.mockRejectedValueOnce(writeError);

      const mindmaps = [{ id: 'test', title: 'Test' }];

      await expect(service.saveMindmaps(mindmaps)).rejects.toThrow(
        'EACCES: permission denied'
      );
    });

    it('should handle complex mindmap structures', async () => {
      const complexMindmaps = [
        {
          id: 'complex-1',
          title: 'Complex Mindmap',
          nodes: [
            {
              id: 'node-1',
              type: 'concept',
              data: { label: 'Central', description: 'Main concept' },
              position: { x: 400, y: 300 },
            },
            {
              id: 'node-2',
              type: 'idea',
              data: { label: 'Branch', color: '#ff0000' },
              position: { x: 600, y: 400 },
            },
          ],
          edges: [
            {
              id: 'edge-1',
              source: 'node-1',
              target: 'node-2',
              type: 'default',
              data: { strength: 0.8 },
            },
          ],
          metadata: {
            layout: 'hierarchical',
            theme: 'dark',
            tags: ['work', 'planning'],
            statistics: { nodeCount: 2, edgeCount: 1 },
          },
          customProperty: 'custom value',
        },
      ];

      await service.saveMindmaps(complexMindmaps);

      const writeCall = mockWriteFile.mock.calls[0];
      const savedData = JSON.parse(writeCall[1]);

      expect(savedData[0].nodes).toHaveLength(2);
      expect(savedData[0].edges).toHaveLength(1);
      expect(savedData[0].metadata.tags).toContain('work');
      expect(savedData[0].customProperty).toBe('custom value');
    });
  });

  describe('getMindmapData', () => {
    it('should return mindmap data successfully', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify([mockMindmapWithData]));

      const result = await service.getMindmapData('test-mindmap-123');

      expect(result).toEqual({
        nodeCount: 5,
        layout: 'radial',
        theme: 'light',
      });
    });

    it('should return empty object when mindmap has no data', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify([mockMindmap]));

      const result = await service.getMindmapData('test-mindmap-123');

      expect(result).toEqual({});
    });

    it('should throw NotFoundException when mindmap does not exist', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify([mockMindmap]));

      await expect(service.getMindmapData('non-existent')).rejects.toThrow(
        NotFoundException
      );
      await expect(service.getMindmapData('non-existent')).rejects.toThrow(
        'Mindmap with ID non-existent not found'
      );
    });

    it('should handle empty mindmaps file', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify([]));

      await expect(service.getMindmapData('any-id')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should handle non-existent mindmaps file', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT: no such file'));

      await expect(service.getMindmapData('any-id')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should handle complex mindmap data structures', async () => {
      const complexMindmapData = {
        statistics: {
          nodeCount: 15,
          edgeCount: 14,
          maxDepth: 4,
        },
        layout: {
          algorithm: 'force-directed',
          center: { x: 400, y: 300 },
          bounds: { width: 800, height: 600 },
        },
        theme: {
          name: 'custom',
          colors: ['#ff0000', '#00ff00', '#0000ff'],
          fontSize: 14,
        },
        metadata: {
          created: '2024-01-01T09:00:00Z',
          lastModified: '2024-01-01T10:00:00Z',
          author: 'test-user',
          tags: ['project', 'brainstorm'],
        },
      };

      const mindmapWithComplexData = {
        ...mockMindmap,
        mindmapData: complexMindmapData,
      };

      mockReadFile.mockResolvedValueOnce(
        JSON.stringify([mindmapWithComplexData])
      );

      const result = await service.getMindmapData('test-mindmap-123');

      expect(result).toEqual(complexMindmapData);
      expect(result.statistics.nodeCount).toBe(15);
      expect(result.layout.algorithm).toBe('force-directed');
      expect(result.theme.colors).toHaveLength(3);
      expect(result.metadata.tags).toContain('project');
    });

    it('should find mindmap by exact ID match', async () => {
      const mindmaps = [
        { ...mockMindmap, id: 'mindmap-1', mindmapData: { data: 'first' } },
        { ...mockMindmap, id: 'mindmap-12', mindmapData: { data: 'second' } },
        { ...mockMindmap, id: 'mindmap-123', mindmapData: { data: 'third' } },
      ];

      mockReadFile.mockResolvedValueOnce(JSON.stringify(mindmaps));

      const result = await service.getMindmapData('mindmap-12');

      expect(result).toEqual({ data: 'second' });
    });

    it('should handle mindmap without mindmapData property', async () => {
      const mindmapWithoutData = {
        id: 'test-mindmap-123',
        title: 'Test Mindmap',
        nodes: [],
        edges: [],
        // No mindmapData property
      };

      mockReadFile.mockResolvedValueOnce(JSON.stringify([mindmapWithoutData]));

      const result = await service.getMindmapData('test-mindmap-123');

      expect(result).toEqual({});
    });

    it('should handle mindmap with null mindmapData', async () => {
      const mindmapWithNullData = {
        ...mockMindmap,
        mindmapData: null,
      };

      mockReadFile.mockResolvedValueOnce(JSON.stringify([mindmapWithNullData]));

      const result = await service.getMindmapData('test-mindmap-123');

      expect(result).toEqual({});
    });

    it('should handle invalid JSON in mindmaps file', async () => {
      mockReadFile.mockResolvedValueOnce('invalid json');

      await expect(service.getMindmapData('any-id')).rejects.toThrow();
    });

    it('should validate mindmapId parameter', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify([mockMindmapWithData]));

      // Test with empty string
      await expect(service.getMindmapData('')).rejects.toThrow(
        NotFoundException
      );

      // Test with whitespace
      await expect(service.getMindmapData('   ')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('integration scenarios', () => {
    it('should handle saveMindmaps followed by getMindmapData', async () => {
      const mindmapData = {
        nodeCount: 10,
        layout: 'circular',
        theme: 'custom',
      };

      const mindmaps = [
        {
          id: 'integration-test',
          title: 'Integration Test',
          nodes: [],
          edges: [],
          mindmapData,
        },
      ];

      // First save the mindmaps
      await service.saveMindmaps(mindmaps);

      // Mock the read to return what we just saved
      const savedCall = mockWriteFile.mock.calls[0];
      const savedData = savedCall[1];
      mockReadFile.mockResolvedValueOnce(savedData);

      // Then retrieve the mindmap data
      const result = await service.getMindmapData('integration-test');

      expect(result).toEqual(mindmapData);
    });

    it('should preserve existing data when updating mindmap through saveMindmaps', async () => {
      const existingMindmap = {
        id: 'preserve-test',
        title: 'Original Title',
        nodes: [{ id: 'original-node' }],
        edges: [],
        mindmapData: { originalData: 'should be preserved' },
        customField: 'should also be preserved',
      };

      const updatedMindmap = {
        id: 'preserve-test',
        title: 'Updated Title',
        nodes: [{ id: 'updated-node' }],
        edges: [],
        // Note: no mindmapData or customField - should be preserved from existing
      };

      // Mock existing data
      mockReadFile.mockResolvedValueOnce(JSON.stringify([existingMindmap]));

      // Save the update
      await service.saveMindmaps([updatedMindmap]);

      // Verify the saved data preserves existing fields
      const writeCall = mockWriteFile.mock.calls[0];
      const savedData = JSON.parse(writeCall[1]);
      const merged = savedData[0];

      expect(merged.title).toBe('Updated Title'); // Updated
      expect(merged.nodes[0].id).toBe('updated-node'); // Updated
      expect(merged.mindmapData.originalData).toBe('should be preserved'); // Preserved
      expect(merged.customField).toBe('should also be preserved'); // Preserved
    });
  });

  describe('error handling', () => {
    it('should handle file system permission errors in saveMindmaps', async () => {
      const permissionError = new Error('EACCES: permission denied');
      (permissionError as Error & { code: string }).code = 'EACCES';
      mockWriteFile.mockRejectedValueOnce(permissionError);

      const mindmaps = [{ id: 'test', title: 'Test' }];

      await expect(service.saveMindmaps(mindmaps)).rejects.toThrow(
        'EACCES: permission denied'
      );
    });

    it('should handle file system errors in getMindmapData', async () => {
      const fsError = new Error('EIO: i/o error');
      (fsError as Error & { code: string }).code = 'EIO';
      mockReadFile.mockRejectedValueOnce(fsError);

      await expect(service.getMindmapData('any-id')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should handle corrupted mindmaps file in saveMindmaps', async () => {
      mockReadFile.mockResolvedValueOnce('corrupted json data');

      const mindmaps = [{ id: 'test', title: 'Test' }];

      // Should handle JSON parse error gracefully and proceed with saving
      await service.saveMindmaps(mindmaps);

      expect(mockWriteFile).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle mindmaps with circular references in saveMindmaps', async () => {
      const circularMindmap: Record<string, unknown> = {
        id: 'circular-test',
        title: 'Circular Test',
        nodes: [],
        edges: [],
      };
      // Create circular reference
      circularMindmap.self = circularMindmap;

      // JSON.stringify should handle this gracefully or throw
      await expect(service.saveMindmaps([circularMindmap])).rejects.toThrow();
    });

    it('should handle very large mindmap data', async () => {
      const largeMindmapData = {
        nodes: Array.from({ length: 10000 }, (_, i) => ({
          id: `node-${i}`,
          data: { label: `Node ${i}` },
        })),
        edges: Array.from({ length: 9999 }, (_, i) => ({
          id: `edge-${i}`,
          source: `node-${i}`,
          target: `node-${i + 1}`,
        })),
      };

      const largeMindmap = {
        ...mockMindmap,
        mindmapData: largeMindmapData,
      };

      mockReadFile.mockResolvedValueOnce(JSON.stringify([largeMindmap]));

      const result = await service.getMindmapData('test-mindmap-123');

      expect(result.nodes).toHaveLength(10000);
      expect(result.edges).toHaveLength(9999);
    });

    it('should handle mindmaps with undefined and null values', async () => {
      const mindmapWithNulls = {
        id: 'null-test',
        title: null,
        nodes: undefined,
        edges: null,
        metadata: undefined,
        mindmapData: {
          validData: 'test',
          nullData: null,
          undefinedData: undefined,
        },
      };

      mockReadFile.mockResolvedValueOnce(JSON.stringify([mindmapWithNulls]));

      const result = await service.getMindmapData('null-test');

      expect(result.validData).toBe('test');
      expect(result.nullData).toBeNull();
      expect(result).not.toHaveProperty('undefinedData'); // undefined values are not serialized
    });
  });
});
