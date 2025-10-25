/**
 * Feature: spec/features/cli-command-interface-for-ai-agent-control.feature
 * Scenario: Handle tree-structured mindmap data in getMindmap
 *
 * Retroactive test for BUG-001: getMindmap should transform tree structure to flat nodes/edges
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CliService } from '../services/cli.service';
import type { MindmapService } from '../../mindmap/mindmap.service';
import type { ChatService } from '../../chat/chat.service';
import type { SseService } from '../../events/services/sse.service';

describe('BUG-001: getMindmap tree structure transformation', () => {
  let cliService: CliService;
  let mindmapService: MindmapService;

  beforeEach(() => {
    // Mock services
    mindmapService = {
      getAllMindmaps: async () => [
        {
          id: 'test-mindmap',
          name: 'Test Mindmap',
          createdAt: '2025-10-20T00:00:00.000Z',
          updatedAt: '2025-10-20T00:00:00.000Z',
          mindmapData: {
            root: {
              id: 'node-root',
              text: 'Root',
              notes: null,
              children: [
                {
                  id: 'node-one',
                  text: 'One',
                  notes: null,
                },
                {
                  id: 'node-two',
                  text: 'Two',
                  notes: null,
                  children: [
                    {
                      id: 'node-three',
                      text: 'Three',
                      notes: null,
                      chatId: 'thread-test-001',
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    } as any;

    const sseService = {} as SseService;
    const chatService = {} as ChatService;

    cliService = new CliService(sseService, mindmapService, chatService);
  });

  it('should transform tree structure to flat nodes array', async () => {
    // When: CLI executes get-mindmap command
    const result = await cliService.getMindmap();

    // Then: response should contain flat nodes array with all nodes from tree
    expect(result.nodes).toHaveLength(4);
    expect(result.nodes.map(n => n.id)).toEqual([
      'node-root',
      'node-one',
      'node-two',
      'node-three',
    ]);
  });

  it('should transform tree structure to edges array connecting parent-child', async () => {
    // When: CLI executes get-mindmap command
    const result = await cliService.getMindmap();

    // Then: response should contain edges array connecting parent-child relationships
    expect(result.edges).toHaveLength(3);
    expect(result.edges).toContainEqual({
      id: 'edge-node-root-node-one',
      source: 'node-root',
      target: 'node-one',
    });
    expect(result.edges).toContainEqual({
      id: 'edge-node-root-node-two',
      source: 'node-root',
      target: 'node-two',
    });
    expect(result.edges).toContainEqual({
      id: 'edge-node-two-node-three',
      source: 'node-two',
      target: 'node-three',
    });
  });

  it('should preserve chatId from tree nodes', async () => {
    // When: CLI executes get-mindmap command
    const result = await cliService.getMindmap();

    // Then: nodes should include chatId from tree nodes
    const nodeThree = result.nodes.find(n => n.id === 'node-three');
    expect(nodeThree).toBeDefined();
    expect(nodeThree?.data).toHaveProperty('chatId', 'thread-test-001');
  });

  it('should not return 500 error with tree-structured data', async () => {
    // Given: a mindmap exists with tree structure
    // When: CLI executes get-mindmap command
    // Then: response should not return 500 error (should complete successfully)
    await expect(cliService.getMindmap()).resolves.toBeDefined();
  });

  it('should use node text as label', async () => {
    const result = await cliService.getMindmap();

    expect(result.nodes[0].label).toBe('Root');
    expect(result.nodes[1].label).toBe('One');
    expect(result.nodes[2].label).toBe('Two');
    expect(result.nodes[3].label).toBe('Three');
  });

  it('should generate positions for layout', async () => {
    const result = await cliService.getMindmap();

    // Root at depth 0
    expect(result.nodes[0].position).toEqual({ x: 0, y: 0 });

    // Children at depth 1
    expect(result.nodes[1].position).toEqual({ x: 200, y: 0 });
    expect(result.nodes[2].position).toEqual({ x: 200, y: 100 });

    // Grandchild at depth 2
    expect(result.nodes[3].position).toEqual({ x: 400, y: 0 });
  });
});
