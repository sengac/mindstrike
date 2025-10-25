/**
 * Feature: spec/features/frontend-doesn-t-react-to-cli-node-selection-sse-events.feature
 * Scenario: Frontend subscribes to mindmap_update SSE events on initialization
 * Scenario: Frontend receives SSE event and updates selected node
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { sseEventBus } from '../../../src/utils/sseEventBus';
import type { SSEEvent } from '../../../src/utils/sseEventBus';

// Mock the SSE event bus
vi.mock('../../../src/utils/sseEventBus', () => ({
  sseEventBus: {
    subscribe: vi.fn(),
    disconnect: vi.fn(),
  },
}));

describe('BUG-002: Frontend SSE subscription for node selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Scenario: Frontend subscribes to mindmap_update SSE events on initialization', () => {
    it('should subscribe to mindmap_update events when store is initialized', async () => {
      // Given: the frontend application is loaded
      // When: useMindMapStore is initialized

      // Import store (this should trigger subscription)
      await import('../../../src/store/useMindMapStore');

      // Then: useMindMapStore should have a subscription to 'mindmap_update' events
      expect(sseEventBus.subscribe).toHaveBeenCalledWith(
        'mindmap_update',
        expect.any(Function)
      );
    });

    it('should handle node_selected action in the subscription', async () => {
      // Given: the frontend application is loaded
      // And: useMindMapStore is initialized
      let subscribedHandler: ((event: SSEEvent) => void) | null = null;

      vi.mocked(sseEventBus.subscribe).mockImplementation(
        (eventType, handler) => {
          if (eventType === 'mindmap_update') {
            subscribedHandler = handler;
          }
          return vi.fn(); // Return unsubscribe function
        }
      );

      // Import store to trigger subscription
      const { useMindMapStore } = await import(
        '../../../src/store/useMindMapStore'
      );

      // When: an SSE event is received with type='mindmap_update' and action='node_selected'
      const testEvent: SSEEvent = {
        type: 'mindmap_update',
        data: {
          action: 'node_selected',
          nodeId: 'test-node-123',
        },
        timestamp: Date.now(),
      };

      // Then: the subscription should handle action='node_selected'
      expect(subscribedHandler).toBeTruthy();
      if (subscribedHandler) {
        subscribedHandler(testEvent);
      }
    });
  });

  describe('Scenario: Frontend receives SSE event and updates selected node', () => {
    it('should update selectedNodeId when mindmap_update event is received', async () => {
      // Given: the frontend is connected to SSE event bus
      // And: useMindMapStore has subscribed to 'mindmap_update' events
      let subscribedHandler: ((event: SSEEvent) => void) | null = null;

      vi.mocked(sseEventBus.subscribe).mockImplementation(
        (eventType, handler) => {
          if (eventType === 'mindmap_update') {
            subscribedHandler = handler;
          }
          return vi.fn(); // Return unsubscribe function
        }
      );

      const { useMindMapStore } = await import(
        '../../../src/store/useMindMapStore'
      );

      // Get initial state
      const initialSelectedNodeId = useMindMapStore.getState().selectedNodeId;
      expect(initialSelectedNodeId).toBeNull();

      // When: an SSE event is received with type='mindmap_update' and action='node_selected' and nodeId='test-node'
      const testEvent: SSEEvent = {
        type: 'mindmap_update',
        data: {
          action: 'node_selected',
          nodeId: 'test-node',
        },
        timestamp: Date.now(),
      };

      if (subscribedHandler) {
        subscribedHandler(testEvent);
      }

      // Then: useMindMapStore should call selectNode with 'test-node'
      // And: the selectedNodeId state should be updated to 'test-node'
      const updatedState = useMindMapStore.getState();
      expect(updatedState.selectedNodeId).toBe('test-node');

      // And: the UI should reflect the node selection
      // (UI update is tested via Playwright in integration tests)
    });

    it('should handle SSE events with nested data structure', async () => {
      // Given: the frontend is connected to SSE event bus
      let subscribedHandler: ((event: SSEEvent) => void) | null = null;

      vi.mocked(sseEventBus.subscribe).mockImplementation(
        (eventType, handler) => {
          if (eventType === 'mindmap_update') {
            subscribedHandler = handler;
          }
          return vi.fn();
        }
      );

      const { useMindMapStore } = await import(
        '../../../src/store/useMindMapStore'
      );

      // When: an SSE event is received with nested data structure (from unified SSE)
      const testEvent: SSEEvent = {
        type: 'mindmap_update',
        data: {
          data: {
            action: 'node_selected',
            nodeId: 'nested-node-456',
          },
        },
        timestamp: Date.now(),
      };

      if (subscribedHandler) {
        subscribedHandler(testEvent);
      }

      // Then: should handle nested data and update selectedNodeId
      const updatedState = useMindMapStore.getState();
      expect(updatedState.selectedNodeId).toBe('nested-node-456');
    });

    it('should ignore mindmap_update events with other actions', async () => {
      // Given: the frontend is connected to SSE event bus
      let subscribedHandler: ((event: SSEEvent) => void) | null = null;

      vi.mocked(sseEventBus.subscribe).mockImplementation(
        (eventType, handler) => {
          if (eventType === 'mindmap_update') {
            subscribedHandler = handler;
          }
          return vi.fn();
        }
      );

      const { useMindMapStore } = await import(
        '../../../src/store/useMindMapStore'
      );

      // When: an SSE event is received with action='node_created' (not 'node_selected')
      const testEvent: SSEEvent = {
        type: 'mindmap_update',
        data: {
          action: 'node_created',
          nodeId: 'new-node',
        },
        timestamp: Date.now(),
      };

      const beforeState = useMindMapStore.getState().selectedNodeId;

      if (subscribedHandler) {
        subscribedHandler(testEvent);
      }

      // Then: selectedNodeId should not change
      const afterState = useMindMapStore.getState().selectedNodeId;
      expect(afterState).toBe(beforeState);
    });
  });
});
