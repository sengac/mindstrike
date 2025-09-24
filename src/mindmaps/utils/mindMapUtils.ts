import type { MindMap } from '../hooks/useMindMaps';

/**
 * Sorts mind maps by updated date in descending order (newest first)
 */
export const sortMindMapsByDate = (mindMaps: MindMap[]): MindMap[] => {
  return [...mindMaps].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );
};

/**
 * Parses date strings from API response into Date objects
 */
export const parseMindMapDates = (data: unknown[]): MindMap[] => {
  return data.map(item => {
    const record = item as Record<string, unknown>;
    return {
      ...record,
      createdAt: new Date(record.createdAt as string),
      updatedAt: new Date(record.updatedAt as string),
    } as MindMap;
  });
};

/**
 * Selects the appropriate mind map ID based on current state and preferences
 */
export const selectDefaultMindMap = (
  mindMaps: MindMap[],
  currentId: string | null,
  preserveSelection: boolean
): string | null => {
  if (mindMaps.length === 0) {
    return null;
  }

  if (preserveSelection && currentId) {
    const exists = mindMaps.some(m => m.id === currentId);
    if (exists) {
      return currentId;
    }
  }

  // Default to the first (most recently updated) mind map
  return mindMaps[0].id;
};

/**
 * Creates a new mind map with default values
 */
let idCounter = 0;
export const createNewMindMap = (
  name: string | undefined,
  currentCount: number
): MindMap => {
  const now = new Date();
  // Use timestamp + counter to ensure unique IDs even when created in rapid succession
  const id = `${Date.now()}-${idCounter++}`;
  return {
    id,
    name: name ?? `MindMap ${currentCount + 1}`,
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * Updates a mind map in the list and returns the sorted result
 */
export const updateMindMapInList = (
  mindMaps: MindMap[],
  id: string,
  updates: Partial<MindMap>
): MindMap[] => {
  const updated = mindMaps.map(m =>
    m.id === id ? { ...m, ...updates, updatedAt: new Date() } : m
  );
  return sortMindMapsByDate(updated);
};

/**
 * Removes a mind map from the list
 */
export const removeMindMapFromList = (
  mindMaps: MindMap[],
  id: string
): MindMap[] => {
  return mindMaps.filter(m => m.id !== id);
};
