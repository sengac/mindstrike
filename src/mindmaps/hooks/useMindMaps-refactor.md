# useMindMaps Hook Refactoring Plan

## Current Issues

1. **Testing Complexity**: The hook does too much, making it hard to test without mocking everything
2. **Async State Updates**: Multiple state updates in async callbacks cause act() warnings
3. **Tight Coupling**: Business logic mixed with React state management
4. **Side Effects**: Network calls and state updates are intertwined
5. **Debouncing Logic**: Save debouncing is mixed with state management

## Refactoring Strategy

### 1. Extract Core Logic into Pure Functions

Create separate utility functions that can be tested independently:

```typescript
// mindMapUtils.ts
export const sortMindMapsByDate = (mindMaps: MindMap[]): MindMap[] => {
  return [...mindMaps].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );
};

export const parseMindMapDates = (data: any[]): MindMap[] => {
  return data.map(item => ({
    ...item,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  }));
};

export const selectDefaultMindMap = (
  mindMaps: MindMap[],
  currentId: string | null,
  preserveSelection: boolean
): string | null => {
  if (mindMaps.length === 0) return null;

  if (preserveSelection && currentId) {
    const exists = mindMaps.some(m => m.id === currentId);
    if (exists) return currentId;
  }

  return mindMaps[0].id;
};

export const createNewMindMap = (
  name: string | undefined,
  currentCount: number
): MindMap => {
  return {
    id: Date.now().toString(),
    name: name || `MindMap ${currentCount + 1}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
};
```

### 2. Extract API Layer

Create a separate API service:

```typescript
// mindMapApi.ts
export const mindMapApi = {
  async fetchAll(): Promise<MindMap[]> {
    const response = await fetch('/api/mindmaps');
    if (!response.ok) {
      throw new Error(`Failed to fetch mindmaps: ${response.status}`);
    }
    const data = await response.json();
    return parseMindMapDates(data);
  },

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
};
```

### 3. Create a Debounced Save Hook

Separate the debouncing logic:

```typescript
// useDebouncedSave.ts
export function useDebouncedSave<T>(
  saveFn: (data: T) => Promise<void>,
  delay: number = 500
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const save = useCallback(
    async (data: T, immediate = false) => {
      if (immediate) {
        await saveFn(data);
        return;
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(async () => {
        if (mountedRef.current) {
          await saveFn(data);
        }
      }, delay);
    },
    [saveFn, delay]
  );

  return save;
}
```

### 4. Create State Management Hook

Separate the state management:

```typescript
// useMindMapState.ts
export function useMindMapState() {
  const [mindMaps, setMindMaps] = useState<MindMap[]>([]);
  const [activeMindMapId, setActiveMindMapId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const activeMindMap = useMemo(
    () => mindMaps.find(m => m.id === activeMindMapId) || null,
    [mindMaps, activeMindMapId]
  );

  return {
    mindMaps,
    setMindMaps,
    activeMindMapId,
    setActiveMindMapId,
    activeMindMap,
    isLoaded,
    setIsLoaded,
  };
}
```

### 5. Refactored Main Hook

Compose everything together:

```typescript
// useMindMaps.ts
export function useMindMaps() {
  const workspaceVersion = useAppStore(state => state.workspaceVersion);
  const {
    mindMaps,
    setMindMaps,
    activeMindMapId,
    setActiveMindMapId,
    activeMindMap,
    isLoaded,
    setIsLoaded,
  } = useMindMapState();

  const save = useDebouncedSave(mindMapApi.save);

  // Load mind maps
  const loadMindMaps = useCallback(
    async (preserveActiveId = false) => {
      try {
        const data = await mindMapApi.fetchAll();
        const sorted = sortMindMapsByDate(data);

        // Batch state updates
        startTransition(() => {
          setMindMaps(sorted);
          const newActiveId = selectDefaultMindMap(
            sorted,
            activeMindMapId,
            preserveActiveId
          );
          setActiveMindMapId(newActiveId);
          setIsLoaded(true);
        });
      } catch (error) {
        logger.error('Failed to load mindmaps:', error);
        setIsLoaded(true);
      }
    },
    [activeMindMapId, setMindMaps, setActiveMindMapId, setIsLoaded]
  );

  // Initial load
  useEffect(() => {
    void loadMindMaps();
  }, [workspaceVersion]); // Remove loadMindMaps from deps to avoid loops

  // CRUD operations
  const createMindMap = useCallback(
    async (name?: string): Promise<string> => {
      const newMindMap = createNewMindMap(name, mindMaps.length);
      const updated = [newMindMap, ...mindMaps];

      setMindMaps(updated);
      setActiveMindMapId(newMindMap.id);

      await save(updated, true); // Save immediately
      return newMindMap.id;
    },
    [mindMaps, setMindMaps, setActiveMindMapId, save]
  );

  const deleteMindMap = useCallback(
    async (id: string) => {
      const updated = mindMaps.filter(m => m.id !== id);

      startTransition(() => {
        setMindMaps(updated);
        if (activeMindMapId === id) {
          const newActiveId = selectDefaultMindMap(updated, null, false);
          setActiveMindMapId(newActiveId);
        }
      });

      await save(updated);
    },
    [mindMaps, activeMindMapId, setMindMaps, setActiveMindMapId, save]
  );

  const renameMindMap = useCallback(
    async (id: string, newName: string) => {
      const updated = mindMaps.map(m =>
        m.id === id ? { ...m, name: newName, updatedAt: new Date() } : m
      );
      const sorted = sortMindMapsByDate(updated);

      setMindMaps(sorted);
      await save(sorted);
    },
    [mindMaps, setMindMaps, save]
  );

  const selectMindMap = useCallback(
    (id: string) => {
      setActiveMindMapId(id);
    },
    [setActiveMindMapId]
  );

  return {
    mindMaps,
    activeMindMapId,
    activeMindMap,
    isLoaded,
    loadMindMaps,
    createMindMap,
    deleteMindMap,
    renameMindMap,
    selectMindMap,
  };
}
```

## Testing Strategy

### 1. Unit Tests for Utilities

```typescript
// mindMapUtils.test.ts
describe('mindMapUtils', () => {
  describe('sortMindMapsByDate', () => {
    it('should sort mind maps by updatedAt in descending order', () => {
      // Test pure function - no async, no mocking needed
    });
  });

  describe('selectDefaultMindMap', () => {
    it('should select first mindmap when not preserving', () => {
      // Test pure function
    });

    it('should preserve selection when mindmap exists', () => {
      // Test pure function
    });
  });
});
```

### 2. API Layer Tests

```typescript
// mindMapApi.test.ts
describe('mindMapApi', () => {
  it('should fetch and parse mind maps', async () => {
    // Mock fetch, test API layer only
  });

  it('should handle fetch errors', async () => {
    // Test error handling
  });
});
```

### 3. Hook Tests

```typescript
// useDebouncedSave.test.ts
describe('useDebouncedSave', () => {
  it('should debounce saves', async () => {
    // Test with fake timers
  });

  it('should save immediately when requested', async () => {
    // Test immediate save
  });
});
```

### 4. Integration Tests

```typescript
// useMindMaps.integration.test.ts
describe('useMindMaps Integration', () => {
  it('should load mindmaps on mount', async () => {
    // Full integration test with real behavior
  });
});
```

## Benefits

1. **Easier Testing**: Each part can be tested in isolation
2. **No Act Warnings**: State updates are batched with `startTransition`
3. **Cleaner Code**: Separation of concerns
4. **Reusable**: Utilities and hooks can be reused elsewhere
5. **Type Safety**: Better TypeScript inference with smaller functions
6. **Performance**: Memoization and batched updates

## Avoiding Infinite Loops

### Problem

The original implementation has circular dependencies:

- `loadMindMaps` depends on `activeMindMapId`
- Loading mind maps sets `activeMindMapId`
- This creates an infinite loop

### Solution: Complete Decoupling

1. **Remove all dependencies from loadMindMaps**: Make it a pure data fetcher
2. **Use a separate effect for initial selection**: Only run once on mount
3. **Make preserveActiveId work without closures**: Pass the ID as a parameter

### Updated Main Hook Design

```typescript
export function useMindMaps() {
  const workspaceVersion = useAppStore(state => state.workspaceVersion);
  const {
    mindMaps,
    setMindMaps,
    activeMindMapId,
    setActiveMindMapId,
    activeMindMap,
    isLoaded,
    setIsLoaded,
  } = useMindMapState();

  const save = useDebouncedSave(mindMapApi.save);

  // Pure data loading - no dependencies on state
  const loadMindMapsData = useCallback(async () => {
    try {
      const data = await mindMapApi.fetchAll();
      return sortMindMapsByDate(data);
    } catch (error) {
      logger.error('Failed to load mindmaps:', error);
      return [];
    }
  }, []); // No dependencies!

  // Load and update state
  const loadMindMaps = useCallback(
    async (preserveActiveId = false) => {
      const sorted = await loadMindMapsData();

      startTransition(() => {
        setMindMaps(sorted);

        if (!preserveActiveId || !activeMindMapId) {
          // Select first if not preserving or no current selection
          const newActiveId = sorted.length > 0 ? sorted[0].id : null;
          setActiveMindMapId(newActiveId);
        } else if (preserveActiveId && activeMindMapId) {
          // Check if current selection still exists
          const stillExists = sorted.some(m => m.id === activeMindMapId);
          if (!stillExists) {
            const newActiveId = sorted.length > 0 ? sorted[0].id : null;
            setActiveMindMapId(newActiveId);
          }
        }

        setIsLoaded(true);
      });
    },
    [
      loadMindMapsData,
      setMindMaps,
      setActiveMindMapId,
      setIsLoaded,
      activeMindMapId,
    ]
  );

  // Initial load - separate effect with minimal dependencies
  useEffect(() => {
    if (!isLoaded) {
      void loadMindMaps(false);
    }
  }, [workspaceVersion]); // Only depend on workspace, not loadMindMaps

  // ... rest of the hook
}
```

## Implementation Steps

1. Create utility functions and test them ✅
2. Create API layer and test it ✅
3. Create debounced save hook and test it ✅
4. Create state management hook ✅
5. Refactor main hook to use all the pieces with proper decoupling
6. Update existing tests
7. Add integration tests
