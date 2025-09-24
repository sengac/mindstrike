import { parseMindMapDates } from '../utils/mindMapUtils';
import type { MindMap } from '../hooks/useMindMaps';

export interface MindMapApiResponse {
  ok: boolean;
  status?: number;
  error?: string;
  data?: MindMap[];
}

/**
 * API service for mind map operations
 */
export const mindMapApi = {
  /**
   * Fetches all mind maps from the server
   */
  async fetchAll(): Promise<MindMap[]> {
    const response = await fetch('/api/mindmaps');

    if (!response.ok) {
      throw new Error(`Failed to fetch mindmaps: ${response.status}`);
    }

    const data = (await response.json()) as unknown[];
    return parseMindMapDates(data);
  },

  /**
   * Saves mind maps to the server
   */
  async save(mindMaps: MindMap[]): Promise<void> {
    const response = await fetch('/api/mindmaps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mindMaps),
    });

    if (!response.ok) {
      throw new Error(`Failed to save mindmaps: ${response.status}`);
    }
  },

  /**
   * Creates a new mind map on the server
   */
  async create(mindMap: MindMap): Promise<MindMap> {
    // In the current implementation, we save all mindmaps at once
    // This is a placeholder for future API improvements
    const existingMindMaps = await mindMapApi.fetchAll();
    const updatedMindMaps = [mindMap, ...existingMindMaps];
    await mindMapApi.save(updatedMindMaps);
    return mindMap;
  },

  /**
   * Updates a mind map on the server
   */
  async update(id: string, updates: Partial<MindMap>): Promise<void> {
    // In the current implementation, we save all mindmaps at once
    // This is a placeholder for future API improvements
    const existingMindMaps = await mindMapApi.fetchAll();
    const updatedMindMaps = existingMindMaps.map(m =>
      m.id === id ? { ...m, ...updates, updatedAt: new Date() } : m
    );
    await mindMapApi.save(updatedMindMaps);
  },

  /**
   * Deletes a mind map from the server
   */
  async delete(id: string): Promise<void> {
    // In the current implementation, we save all mindmaps at once
    // This is a placeholder for future API improvements
    const existingMindMaps = await mindMapApi.fetchAll();
    const updatedMindMaps = existingMindMaps.filter(m => m.id !== id);
    await mindMapApi.save(updatedMindMaps);
  },
};
