import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { logger } from '../utils/logger';

interface DocumentSummary {
  id: string;
  originalId: string;
  summary: string;
  keyPoints: string[];
  contentType: string;
  originalSize: number;
  generatedAt: string;
  model: string;
}

interface LFSStore {
  // Actions
  retrieveContent: (id: string) => Promise<string | null>;
  getSummary: (id: string) => Promise<DocumentSummary | null>;
  getStats: () => Promise<{
    totalEntries: number;
    totalSize: number;
    totalCompressedSize: number;
    entriesWithSummaries: number;
  }>;

  // Cache for retrieved content and summaries
  cache: Map<string, string>;
  summaryCache: Map<string, DocumentSummary>;
  setCacheEntry: (id: string, content: string) => void;
  getCacheEntry: (id: string) => string | null;
  setSummaryCache: (id: string, summary: DocumentSummary) => void;
  getSummaryCache: (id: string) => DocumentSummary | null;
}

export const useLFSStore = create<LFSStore>()(
  persist(
    (set, get) => ({
      cache: new Map<string, string>(),
      summaryCache: new Map<string, DocumentSummary>(),

      retrieveContent: async (id: string) => {
        // Check if this is an LFS reference
        const lfsMatch = id.match(/^\[LFS:([^\]]+)\]$/);
        if (!lfsMatch) {
          return id; // Return as-is if not an LFS reference
        }

        const lfsId = lfsMatch[1];

        // Check cache first
        const cached = get().getCacheEntry(lfsId);
        if (cached) {
          return cached;
        }

        try {
          const response = await fetch(`/api/lfs/${lfsId}`);
          if (!response.ok) {
            logger.warn(`LFS entry not found: ${lfsId}`);
            return null;
          }

          const data = await response.json();
          const content = data.content;

          // Cache the retrieved content
          get().setCacheEntry(lfsId, content);

          return content;
        } catch (error) {
          logger.error(`Failed to retrieve LFS entry ${lfsId}:`, error);
          return null;
        }
      },

      getSummary: async (id: string) => {
        // Check if this is an LFS reference
        const lfsMatch = id.match(/^\[LFS:([^\]]+)\]$/);
        const lfsId = lfsMatch ? lfsMatch[1] : id;

        // Check cache first
        const cached = get().getSummaryCache(lfsId);
        if (cached) {
          return cached;
        }

        try {
          const response = await fetch(`/api/lfs/${lfsId}/summary`);
          if (!response.ok) {
            return null;
          }

          const summary = await response.json();

          // Cache the retrieved summary
          get().setSummaryCache(lfsId, summary);

          return summary;
        } catch (error) {
          logger.error(`Failed to retrieve LFS summary ${lfsId}:`, error);
          return null;
        }
      },

      getStats: async () => {
        try {
          const response = await fetch('/api/lfs/stats');
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return await response.json();
        } catch (error) {
          logger.error('Failed to get LFS stats:', error);
          return {
            totalEntries: 0,
            totalSize: 0,
            totalCompressedSize: 0,
            entriesWithSummaries: 0,
          };
        }
      },

      setCacheEntry: (id: string, content: string) => {
        set(state => {
          const newCache = new Map(state.cache);
          newCache.set(id, content);
          return { cache: newCache };
        });
      },

      getCacheEntry: (id: string) => {
        return get().cache.get(id) || null;
      },

      setSummaryCache: (id: string, summary: DocumentSummary) => {
        set(state => {
          const newCache = new Map(state.summaryCache);
          newCache.set(id, summary);
          return { summaryCache: newCache };
        });
      },

      getSummaryCache: (id: string) => {
        return get().summaryCache.get(id) || null;
      },
    }),
    {
      name: 'lfs-store',
      storage: {
        getItem: () => null, // No persistence needed for cache
        setItem: () => Promise.resolve(),
        removeItem: () => Promise.resolve(),
      },
    }
  )
);

// Utility functions for easy import
export const retrieveLargeContent = async (id: string) => {
  return await useLFSStore.getState().retrieveContent(id);
};

export const getLFSSummary = async (id: string) => {
  return await useLFSStore.getState().getSummary(id);
};

export const isLFSReference = (content: string): boolean => {
  return /^\[LFS:[^\]]+\]$/.test(content);
};
