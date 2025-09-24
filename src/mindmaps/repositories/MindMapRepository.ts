import { mindMapApi } from '../services/mindMapApi';
import type { MindMap } from '../hooks/useMindMaps';

/**
 * Repository for mind map data operations.
 * This is a pure data layer with no state or side effects.
 * All methods return promises and handle only data operations.
 */
export class MindMapRepository {
  /**
   * Load all mind maps from the server
   */
  async load(): Promise<MindMap[]> {
    return mindMapApi.fetchAll();
  }

  /**
   * Save mind maps to the server
   */
  async save(mindMaps: MindMap[]): Promise<void> {
    return mindMapApi.save(mindMaps);
  }

  /**
   * Create a new mind map on the server
   * Note: In current implementation, this saves all mindmaps
   */
  async create(mindMap: MindMap, existingMindMaps: MindMap[]): Promise<void> {
    const updated = [mindMap, ...existingMindMaps];
    return this.save(updated);
  }

  /**
   * Update a mind map on the server
   * Note: In current implementation, this saves all mindmaps
   */
  async update(
    id: string,
    updates: Partial<MindMap>,
    existingMindMaps: MindMap[]
  ): Promise<void> {
    const updated = existingMindMaps.map(m =>
      m.id === id ? { ...m, ...updates, updatedAt: new Date() } : m
    );
    return this.save(updated);
  }

  /**
   * Delete a mind map from the server
   * Note: In current implementation, this saves all mindmaps
   */
  async delete(id: string, existingMindMaps: MindMap[]): Promise<void> {
    const updated = existingMindMaps.filter(m => m.id !== id);
    return this.save(updated);
  }
}

// Export singleton instance
export const mindMapRepository = new MindMapRepository();
