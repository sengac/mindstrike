# useMindMaps Hook Decoupling Plan

## Current Problems

### 1. Automatic Side Effects

- Hook automatically loads data on mount (line 83-88)
- Workspace sync triggers automatic reloads (line 96)
- These cause uncontrolled async state updates in tests

### 2. Tight Coupling

- 6 different hooks composed together
- Circular dependencies requiring refs as workarounds
- Data loading, state management, and UI concerns mixed together

### 3. Async Operations Issues

- Debounced save happens in background without proper control
- Load operations trigger cascading state updates
- Error handling was removed to avoid act warnings (hiding real issues)

### 4. Testing Difficulties

- Can't prevent initial load from happening
- Can't control when saves occur
- State updates happen outside of user interactions

## Root Cause Analysis

The fundamental issue is that **data loading and persistence are treated as side effects** rather than explicit operations. This violates the principle of explicit data flow and makes the component behavior unpredictable.

## Proposed Architecture

### 1. Separate Data Layer from UI Layer

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                      │
├─────────────────────────────────────────────────────────┤
│  MindMapDataProvider (Context)                           │
│  - Provides data and operations                         │
│  - No automatic loading                                  │
├─────────────────────────────────────────────────────────┤
│  useMindMapData() - Hook for accessing data            │
│  useMindMapOperations() - Hook for operations          │
│  useMindMapSelection() - Hook for selection only       │
├─────────────────────────────────────────────────────────┤
│  MindMapRepository - Pure data operations              │
│  - load(), save(), create(), update(), delete()        │
└─────────────────────────────────────────────────────────┘
```

### 2. Explicit Data Loading Pattern

Instead of:

```typescript
// Current - automatic loading
function useMindMaps() {
  useEffect(() => {
    load(); // Happens automatically
  }, []);
}
```

Use:

```typescript
// Proposed - explicit loading
function MindMapsView() {
  const { data, operations } = useMindMapData();

  useEffect(() => {
    // Component explicitly decides when to load
    operations.load();
  }, []);
}
```

### 3. Decouple State Management

**Current Structure (Coupled)**:

- `useMindMaps` → manages everything
- `useMindMapState` → just a Zustand wrapper
- `useMindMapLoader` → tightly coupled to state updates
- `useDebouncedSave` → side effect based

**Proposed Structure (Decoupled)**:

#### A. MindMapRepository (Pure Data Layer)

```typescript
class MindMapRepository {
  async load(): Promise<MindMap[]> {
    return mindMapApi.fetchAll();
  }

  async save(mindMaps: MindMap[]): Promise<void> {
    return mindMapApi.save(mindMaps);
  }

  // No state, no side effects, just data operations
}
```

#### B. MindMapStore (State Management)

```typescript
interface MindMapStore {
  // State
  mindMaps: MindMap[];
  activeMindMapId: string | null;
  isLoading: boolean;
  error: Error | null;

  // Actions (sync only)
  setMindMaps: (mindMaps: MindMap[]) => void;
  setActiveMindMapId: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;
}
```

#### C. useMindMapOperations (Business Logic)

```typescript
function useMindMapOperations() {
  const store = useMindMapStore();
  const repository = new MindMapRepository();

  const load = async () => {
    store.setLoading(true);
    try {
      const data = await repository.load();
      store.setMindMaps(data);
    } catch (error) {
      store.setError(error);
    } finally {
      store.setLoading(false);
    }
  };

  const create = (name: string) => {
    const newMindMap = createNewMindMap(name);
    store.setMindMaps([newMindMap, ...store.mindMaps]);
    // Save is explicit, not automatic
    return newMindMap;
  };

  return { load, create /* ... */ };
}
```

### 4. Remove Automatic Side Effects

1. **No automatic loading on mount** - Components decide when to load
2. **No automatic workspace sync** - Make it an explicit operation
3. **No automatic saving** - Return save function for caller to use
4. **No automatic selection** - Let UI layer handle selection

### 5. Simplify Hook Composition

Instead of 6 interdependent hooks, have 3 independent ones:

1. **useMindMapData()** - Just provides current state
2. **useMindMapOperations()** - Provides operations (load, save, create, etc.)
3. **useMindMapSelection()** - Handles selection logic only

## Implementation Plan

### Phase 1: Create New Architecture (Parallel to Existing)

1. Create `MindMapRepository` class for pure data operations
2. Create simplified `mindMapStore` with just state and sync setters
3. Create `useMindMapOperations` hook with explicit operations
4. Create `MindMapDataProvider` context component

### Phase 2: Migrate Components

1. Update `MindMapsView` to use new hooks
2. Update tests to use new explicit operations
3. Remove automatic loading/saving behaviors

### Phase 3: Cleanup

1. Remove old `useMindMaps` hook
2. Remove unnecessary hooks (loader, workspace sync as hooks)
3. Consolidate remaining functionality

## Benefits

1. **Testability**: Full control over when operations happen
2. **Predictability**: No hidden side effects
3. **Separation of Concerns**: Clear boundaries between layers
4. **Flexibility**: Components can control their own loading strategy
5. **Error Handling**: Explicit error handling without act warnings

## Important Discovery: Act Warnings with Zustand

During implementation, I discovered that **Zustand itself causes act warnings** when used in React component tests. This is because Zustand triggers React state updates when you call store setters, even if those setters are called from "pure" operations.

### The Reality

Even with our "decoupled" architecture, we still get act warnings because:

1. `useMindMapOperations` hook uses `useMindMapStore`
2. When we call `create()`, it calls `setMindMaps()` on the store
3. Zustand notifies React components subscribing to the store
4. This state update happens outside of act() if we don't wrap the call

### Solutions

1. **Accept act() wrapping**: When testing React hooks that use Zustand, wrap operations in act()
2. **Test without React**: Test the operations/repository layer without rendering hooks
3. **Use non-reactive state**: For testing, use a plain object store that doesn't trigger React updates

### Revised Testing Strategy

```typescript
// Option 1: Accept act() is needed for Zustand
it('should create a mind map', () => {
  const { result } = renderHook(() => useMindMapOperations());

  act(() => {
    const mindMap = result.current.create('Test');
    expect(mindMap.name).toBe('Test');
  });
});

// Option 2: Test operations without React hooks
it('should create a mind map without React', () => {
  const store = createTestStore(); // Non-reactive store
  const operations = new MindMapOperations(store, repository);

  const mindMap = operations.create('Test');
  expect(mindMap.name).toBe('Test');
  // No act warnings because no React!
});
```

### Key Insight

**The act warnings were not just about async operations - they were about ANY state updates that trigger React re-renders.** Even synchronous Zustand updates need act() when tested in React components.

## Testing Strategy

With the new architecture, tests become simple:

```typescript
it('should create a mind map', () => {
  const { result } = renderHook(() => useMindMapOperations());

  // No automatic loading, so no act warnings
  act(() => {
    const mindMap = result.current.create('Test');
    expect(mindMap.name).toBe('Test');
  });

  // Save is explicit, not automatic
  expect(result.current.save).not.toHaveBeenCalled();
});
```

## Migration Path

1. Implement new architecture alongside existing code
2. Add feature flag to switch between old and new
3. Migrate one component at a time
4. Update tests incrementally
5. Remove old code once migration is complete

This approach ensures we can migrate safely without breaking existing functionality.
