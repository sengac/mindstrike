import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { MindmapController } from '../mindmap.controller';
import type { MindmapService } from '../mindmap.service';
import type {
  UpdateMindmapDto,
  IterateMindmapDto,
  GenerateMindmapDto,
} from '../dto/mindmap.dto';

describe('MindmapController', () => {
  let controller: MindmapController;
  let mockMindmapService: Partial<MindmapService>;

  const mockMindmap = {
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
    metadata: {},
    createdAt: new Date('2024-01-01T10:00:00Z'),
    updatedAt: new Date('2024-01-01T10:00:00Z'),
  };

  beforeEach(() => {
    mockMindmapService = {
      getAllMindmaps: vi.fn().mockResolvedValue([mockMindmap]),
      getMindmap: vi.fn().mockResolvedValue(mockMindmap),
      getMindmapData: vi
        .fn()
        .mockResolvedValue({ nodeCount: 5, layout: 'radial' }),
      saveMindmap: vi.fn().mockResolvedValue({
        success: true,
        id: 'test-mindmap-123',
      }),
      saveMindmaps: vi.fn().mockResolvedValue(undefined),
      iterateMindmap: vi.fn().mockResolvedValue({
        success: true,
        changes: {
          addedNodes: [
            {
              id: 'new-node',
              type: 'concept',
              data: { label: 'New Concept' },
              position: { x: 500, y: 400 },
            },
          ],
          addedEdges: 1,
        },
      }),
      generateContent: vi.fn().mockResolvedValue({
        success: true,
        generatedNodes: [
          {
            id: 'gen-node-1',
            type: 'idea',
            data: { label: 'Generated Idea' },
            position: { x: 200, y: 200 },
          },
        ],
        generatedEdges: [
          {
            id: 'gen-edge-1',
            source: 'node-1',
            target: 'gen-node-1',
            type: 'default',
          },
        ],
      }),
    };

    controller = new MindmapController(mockMindmapService as MindmapService);
  });

  describe('getAllMindmaps', () => {
    it('should return all mindmaps', async () => {
      const result = await controller.getAllMindmaps();

      expect(result).toEqual([mockMindmap]);
      expect(mockMindmapService.getAllMindmaps).toHaveBeenCalled();
    });
  });

  describe('getMindmap', () => {
    it('should return a mindmap by ID', async () => {
      const mindmapId = 'test-mindmap-123';

      const result = await controller.getMindmap(mindmapId);

      expect(result).toEqual(mockMindmap);
      expect(mockMindmapService.getMindmap).toHaveBeenCalledWith(mindmapId);
    });

    it('should throw NotFoundException when mindmap does not exist', async () => {
      const mindmapId = 'non-existent';
      (
        mockMindmapService.getMindmap as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new NotFoundException('Mindmap not found'));

      await expect(controller.getMindmap(mindmapId)).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('updateMindmap', () => {
    it('should update a mindmap', async () => {
      const mindmapId = 'test-mindmap-123';
      const dto: UpdateMindmapDto = {
        nodes: [{ id: 'node-1', data: { label: 'Updated' } }],
        edges: [],
      };

      const result = await controller.updateMindmap(mindmapId, dto);

      expect(result).toEqual({ success: true, id: mindmapId });
      expect(mockMindmapService.saveMindmap).toHaveBeenCalledWith(
        mindmapId,
        dto
      );
    });
  });

  describe('addNode', () => {
    it('should add a node to the mindmap', async () => {
      const mindmapId = 'test-mindmap-123';
      const dto = {
        node: {
          label: 'New Node',
          position: { x: 300, y: 300 },
          data: { extra: 'data' },
        },
        parentNodeId: 'node-1',
      };

      const result = await controller.addNode(mindmapId, dto);

      expect(result.success).toBe(true);
      expect(result.nodeId).toBeDefined();
      expect(mockMindmapService.getMindmap).toHaveBeenCalledWith(mindmapId);
      expect(mockMindmapService.saveMindmap).toHaveBeenCalled();
    });

    it('should add a node without parent', async () => {
      const mindmapId = 'test-mindmap-123';
      const dto = {
        node: {
          id: 'custom-id',
          label: 'Standalone Node',
        },
      };

      const result = await controller.addNode(mindmapId, dto);

      expect(result.success).toBe(true);
      expect(result.nodeId).toBe('custom-id');
    });
  });

  describe('iterateMindmap', () => {
    it('should iterate on a mindmap', async () => {
      const mindmapId = 'test-mindmap-123';
      const dto: IterateMindmapDto = {
        prompt: 'Generate more ideas',
        nodeId: 'node-1',
      };

      const result = await controller.iterateMindmap(mindmapId, dto);

      expect(result.success).toBe(true);
      expect(result.newNodes).toHaveLength(1);
      expect(result.newEdges).toHaveLength(1);
      expect(mockMindmapService.iterateMindmap).toHaveBeenCalledWith(
        mindmapId,
        dto.prompt,
        dto.nodeId
      );
    });
  });

  describe('generateChildren', () => {
    it('should generate child nodes', async () => {
      const mindmapId = 'test-mindmap-123';
      const dto: GenerateMindmapDto = {
        prompt: 'Generate children for this concept',
        style: 'hierarchical',
      };

      const result = await controller.generateChildren(mindmapId, dto);

      expect(result.success).toBe(true);
      expect(result.generatedNodes).toHaveLength(1);
      expect(result.generatedEdges).toHaveLength(1);
      expect(mockMindmapService.generateContent).toHaveBeenCalledWith(
        mindmapId,
        dto.prompt,
        dto.style
      );
    });
  });

  // NEW TESTS FOR ADDED FUNCTIONALITY
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

      const result = await controller.saveMindmaps(mindmaps);

      expect(result).toBeUndefined();
      expect(mockMindmapService.saveMindmaps).toHaveBeenCalledWith(mindmaps);
    });

    it('should handle empty array of mindmaps', async () => {
      const mindmaps: Array<Record<string, unknown>> = [];

      const result = await controller.saveMindmaps(mindmaps);

      expect(result).toBeUndefined();
      expect(mockMindmapService.saveMindmaps).toHaveBeenCalledWith(mindmaps);
    });

    it('should handle mindmaps with different structures', async () => {
      const mindmaps = [
        {
          id: 'mindmap-1',
          title: 'Minimal Mindmap',
          nodes: [],
          edges: [],
        },
        {
          id: 'mindmap-2',
          title: 'Complex Mindmap',
          nodes: [
            {
              id: 'node-1',
              type: 'concept',
              data: { label: 'Central' },
              position: { x: 0, y: 0 },
            },
            {
              id: 'node-2',
              type: 'idea',
              data: { label: 'Branch' },
              position: { x: 100, y: 100 },
            },
          ],
          edges: [
            {
              id: 'edge-1',
              source: 'node-1',
              target: 'node-2',
              type: 'default',
            },
          ],
          metadata: { layout: 'hierarchical', theme: 'dark' },
          customProperty: 'custom value',
        },
      ];

      const result = await controller.saveMindmaps(mindmaps);

      expect(result).toBeUndefined();
      expect(mockMindmapService.saveMindmaps).toHaveBeenCalledWith(mindmaps);
    });

    it('should propagate service errors', async () => {
      const mindmaps = [{ id: 'test', title: 'Test' }];
      const error = new Error('Service error');
      (
        mockMindmapService.saveMindmaps as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(error);

      await expect(controller.saveMindmaps(mindmaps)).rejects.toThrow(
        'Service error'
      );
    });
  });

  describe('getMindmapData', () => {
    it('should return mindmap data successfully', async () => {
      const mindmapId = 'test-mindmap-123';
      const expectedData = {
        nodeCount: 5,
        layout: 'radial',
        theme: 'light',
        lastModified: '2024-01-01T10:00:00Z',
      };

      (
        mockMindmapService.getMindmapData as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(expectedData);

      const result = await controller.getMindmapData(mindmapId);

      expect(result).toEqual(expectedData);
      expect(mockMindmapService.getMindmapData).toHaveBeenCalledWith(mindmapId);
    });

    it('should return empty object when no mindmap data exists', async () => {
      const mindmapId = 'test-mindmap-123';
      (
        mockMindmapService.getMindmapData as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({});

      const result = await controller.getMindmapData(mindmapId);

      expect(result).toEqual({});
      expect(mockMindmapService.getMindmapData).toHaveBeenCalledWith(mindmapId);
    });

    it('should throw NotFoundException when mindmap does not exist', async () => {
      const mindmapId = 'non-existent';
      (
        mockMindmapService.getMindmapData as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new NotFoundException('Mindmap not found'));

      await expect(controller.getMindmapData(mindmapId)).rejects.toThrow(
        NotFoundException
      );
      expect(mockMindmapService.getMindmapData).toHaveBeenCalledWith(mindmapId);
    });

    it('should handle complex mindmap data structures', async () => {
      const mindmapId = 'complex-mindmap';
      const complexData = {
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

      (
        mockMindmapService.getMindmapData as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(complexData);

      const result = await controller.getMindmapData(mindmapId);

      expect(result).toEqual(complexData);
      expect(result.statistics.nodeCount).toBe(15);
      expect(result.layout.algorithm).toBe('force-directed');
      expect(result.theme.colors).toHaveLength(3);
      expect(result.metadata.tags).toContain('project');
    });

    it('should handle service errors gracefully', async () => {
      const mindmapId = 'error-mindmap';
      const error = new Error('Database connection failed');
      (
        mockMindmapService.getMindmapData as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(error);

      await expect(controller.getMindmapData(mindmapId)).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should validate mindmapId parameter', async () => {
      const emptyId = '';
      (
        mockMindmapService.getMindmapData as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({});

      const result = await controller.getMindmapData(emptyId);

      expect(mockMindmapService.getMindmapData).toHaveBeenCalledWith(emptyId);
      expect(result).toBeDefined();
    });
  });

  describe('saveMindmapData', () => {
    beforeEach(() => {
      mockMindmapService.saveMindmapData = vi.fn().mockResolvedValue(undefined);
    });

    it('should save mindmap data successfully', async () => {
      const mindmapId = 'test-mindmap-123';
      const mindmapData = {
        statistics: {
          nodeCount: 10,
          edgeCount: 9,
          maxDepth: 3,
        },
        layout: {
          algorithm: 'force-directed',
          center: { x: 400, y: 300 },
        },
        theme: {
          name: 'default',
          colors: ['#blue', '#green', '#red'],
        },
      };

      const result = await controller.saveMindmapData(mindmapId, mindmapData);

      expect(result).toBeUndefined();
      expect(mockMindmapService.saveMindmapData).toHaveBeenCalledWith(
        mindmapId,
        mindmapData
      );
    });

    it('should handle empty mindmap data', async () => {
      const mindmapId = 'test-mindmap-123';
      const emptyData = {};

      const result = await controller.saveMindmapData(mindmapId, emptyData);

      expect(result).toBeUndefined();
      expect(mockMindmapService.saveMindmapData).toHaveBeenCalledWith(
        mindmapId,
        emptyData
      );
    });

    it('should handle complex nested mindmap data structures', async () => {
      const mindmapId = 'complex-mindmap';
      const complexData = {
        metadata: {
          created: '2024-01-01T09:00:00Z',
          lastModified: '2024-01-01T10:00:00Z',
          author: 'test-user',
          version: '1.2.3',
          tags: ['project', 'brainstorm', 'important'],
        },
        analytics: {
          viewCount: 42,
          editCount: 15,
          shareCount: 3,
          lastViewed: '2024-01-01T09:30:00Z',
          collaborators: ['user1', 'user2'],
        },
        customProperties: {
          backgroundColor: '#f0f0f0',
          fontFamily: 'Arial',
          zoom: 1.5,
          gridEnabled: true,
          snapToGrid: false,
        },
        exportSettings: {
          format: 'png',
          resolution: '1920x1080',
          includeMetadata: true,
        },
      };

      const result = await controller.saveMindmapData(mindmapId, complexData);

      expect(result).toBeUndefined();
      expect(mockMindmapService.saveMindmapData).toHaveBeenCalledWith(
        mindmapId,
        complexData
      );
    });

    it('should propagate service errors when saving fails', async () => {
      const mindmapId = 'failing-mindmap';
      const mindmapData = { test: 'data' };
      const error = new Error('File system error');

      (
        mockMindmapService.saveMindmapData as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(error);

      await expect(
        controller.saveMindmapData(mindmapId, mindmapData)
      ).rejects.toThrow('File system error');
    });

    it('should handle mindmap data with arrays and nested objects', async () => {
      const mindmapId = 'array-test-mindmap';
      const dataWithArrays = {
        nodePositions: [
          { id: 'node1', x: 100, y: 200 },
          { id: 'node2', x: 300, y: 400 },
          { id: 'node3', x: 500, y: 600 },
        ],
        edgeStyles: [
          { id: 'edge1', color: '#ff0000', width: 2 },
          { id: 'edge2', color: '#00ff00', width: 3 },
        ],
        history: [
          {
            action: 'create_node',
            timestamp: '2024-01-01T10:00:00Z',
            user: 'user1',
            details: { nodeId: 'node1', label: 'First Node' },
          },
          {
            action: 'create_edge',
            timestamp: '2024-01-01T10:01:00Z',
            user: 'user1',
            details: { edgeId: 'edge1', source: 'node1', target: 'node2' },
          },
        ],
      };

      const result = await controller.saveMindmapData(
        mindmapId,
        dataWithArrays
      );

      expect(result).toBeUndefined();
      expect(mockMindmapService.saveMindmapData).toHaveBeenCalledWith(
        mindmapId,
        dataWithArrays
      );
    });

    it('should validate mindmapId parameter is passed correctly', async () => {
      const mindmapIds = ['123', 'test-id', 'complex-id-with-dashes-123'];
      const testData = { key: 'value' };

      for (const mindmapId of mindmapIds) {
        await controller.saveMindmapData(mindmapId, testData);
        expect(mockMindmapService.saveMindmapData).toHaveBeenCalledWith(
          mindmapId,
          testData
        );
      }

      expect(mockMindmapService.saveMindmapData).toHaveBeenCalledTimes(
        mindmapIds.length
      );
    });

    it('should handle NotFoundException from service', async () => {
      const mindmapId = 'non-existent-mindmap';
      const mindmapData = { test: 'data' };
      const notFoundError = new NotFoundException('Mindmap not found');

      (
        mockMindmapService.saveMindmapData as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(notFoundError);

      await expect(
        controller.saveMindmapData(mindmapId, mindmapData)
      ).rejects.toThrow(NotFoundException);
      expect(mockMindmapService.saveMindmapData).toHaveBeenCalledWith(
        mindmapId,
        mindmapData
      );
    });
  });
});
