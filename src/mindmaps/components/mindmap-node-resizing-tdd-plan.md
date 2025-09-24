# MindMap Node Auto-Resizing - TDD Implementation Plan

## Current Architecture Analysis

### Problems with Current Implementation

1. **Tight Coupling & Duplication**
   - Text measurement logic is embedded within the React component
   - DUPLICATE width calculation logic exists in `utils/mindMapLayout.ts`
   - Both use Canvas API but with different implementations
   - Uses DOM element (`measureRef`) for width calculation in component
   - Depends on component lifecycle and rendering
   - Not testable in isolation

2. **Text Wrapping Issues**
   - Uses `break-words` CSS class allowing text to wrap
   - Has hardcoded `maxWidth` of 800px forcing wrapping (in BOTH locations)
   - Width calculation doesn't account for single-line requirement
   - Inconsistent styling between measurement span and display span

3. **Performance Concerns**
   - Measures text on every render when not dragging
   - Uses `requestAnimationFrame` for every measurement
   - Multiple state updates trigger re-renders
   - Creates new canvas element on every calculation in `mindMapLayout.ts`

4. **Lack of Tests**
   - No unit tests for text measurement logic
   - No tests for edge cases (long text, special characters, etc.)
   - Integration tests don't verify sizing behavior
   - Existing `calculateNodeWidth` in `mindMapLayout.ts` is untested

### Existing Code to Consolidate

1. **MindMapNode.tsx** (lines 72-95)
   - Uses `measureRef.current.scrollWidth`
   - Has padding of 32px, minWidth 120px, maxWidth 800px
   - Updates state with `setNodeWidth`

2. **mindMapLayout.ts** (lines 99-112)
   - Uses Canvas API: `ctx.measureText(text).width`
   - Same constraints: padding 32px, minWidth 120px, maxWidth 800px
   - Creates new canvas on each call (performance issue)

Both implementations should be replaced with a single, tested service.

## Proposed Architecture

### 1. Text Measurement Service (Pure Functions)

```typescript
// textMeasurementService.ts
interface TextMetrics {
  width: number;
  height: number;
}

interface MeasurementOptions {
  text: string;
  fontSize: string;
  fontFamily: string;
  fontWeight: string;
  padding: { left: number; right: number; top: number; bottom: number };
  minWidth: number;
  // No maxWidth - we want unlimited width for no wrapping
}

// Pure function that calculates dimensions without DOM
function calculateTextDimensions(options: MeasurementOptions): TextMetrics;
```

### 2. Node Sizing Strategy

```typescript
// nodeSizingStrategy.ts
interface NodeSizingStrategy {
  calculateNodeSize(label: string, options?: SizingOptions): NodeDimensions;
}

interface NodeDimensions {
  width: number;
  height: number;
}

interface SizingOptions {
  isEditing?: boolean;
  hasIcons?: boolean;
  level?: number;
}
```

### 3. Decoupled Component Architecture

```typescript
// MindMapNode.tsx uses the sizing strategy
const { width, height } = nodeSizingStrategy.calculateNodeSize(data.label, {
  isEditing,
  hasIcons: Boolean(data.chatId || data.notes),
});
```

## Test-Driven Development Plan

### Phase 1: Unit Tests for Text Measurement (Write First)

```typescript
// __tests__/textMeasurementService.test.ts

describe('Text Measurement Service', () => {
  describe('calculateTextDimensions', () => {
    it('should calculate width for single character', () => {
      const result = calculateTextDimensions({
        text: 'A',
        fontSize: '14px',
        fontFamily: 'Arial',
        fontWeight: 'normal',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
        minWidth: 120,
      });
      expect(result.width).toBeGreaterThanOrEqual(120); // respects minWidth
      expect(result.height).toBeGreaterThan(0);
    });

    it('should calculate width for long text without wrapping', () => {
      const longText =
        'This is a very long text that should not wrap and should extend the node width significantly';
      const result = calculateTextDimensions({
        text: longText,
        fontSize: '14px',
        fontFamily: 'Arial',
        fontWeight: 'normal',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
        minWidth: 120,
      });
      expect(result.width).toBeGreaterThan(500); // Should be quite wide
    });

    it('should handle empty text', () => {
      const result = calculateTextDimensions({
        text: '',
        fontSize: '14px',
        fontFamily: 'Arial',
        fontWeight: 'normal',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
        minWidth: 120,
      });
      expect(result.width).toBe(120); // minWidth
    });

    it('should handle special characters and emojis', () => {
      const specialText = '🚀 Node-Name_2024 (Test) #Important!';
      const result = calculateTextDimensions({
        text: specialText,
        fontSize: '14px',
        fontFamily: 'Arial',
        fontWeight: 'normal',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
        minWidth: 120,
      });
      expect(result.width).toBeGreaterThan(120);
    });

    it('should account for font weight differences', () => {
      const text = 'Bold Text Example';
      const normalResult = calculateTextDimensions({
        text,
        fontSize: '14px',
        fontFamily: 'Arial',
        fontWeight: 'normal',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
        minWidth: 120,
      });
      const boldResult = calculateTextDimensions({
        text,
        fontSize: '14px',
        fontFamily: 'Arial',
        fontWeight: 'bold',
        padding: { left: 16, right: 16, top: 8, bottom: 8 },
        minWidth: 120,
      });
      expect(boldResult.width).toBeGreaterThan(normalResult.width);
    });
  });
});
```

### Phase 2: Unit Tests for Node Sizing Strategy

```typescript
// __tests__/nodeSizingStrategy.test.ts

describe('Node Sizing Strategy', () => {
  let strategy: NodeSizingStrategy;

  beforeEach(() => {
    strategy = new DefaultNodeSizingStrategy();
  });

  it('should size node based on label text', () => {
    const result = strategy.calculateNodeSize('Short Label');
    expect(result.width).toBeGreaterThanOrEqual(120);
    expect(result.height).toBeGreaterThanOrEqual(40);
  });

  it('should add extra width when node has icons', () => {
    const withoutIcons = strategy.calculateNodeSize('Test Label');
    const withIcons = strategy.calculateNodeSize('Test Label', {
      hasIcons: true,
    });
    expect(withIcons.width).toBeGreaterThan(withoutIcons.width);
  });

  it('should handle editing mode with extra space', () => {
    const normal = strategy.calculateNodeSize('Edit Me');
    const editing = strategy.calculateNodeSize('Edit Me', { isEditing: true });
    expect(editing.width).toBeGreaterThan(normal.width); // Extra space for cursor
  });

  it('should apply different sizing for root nodes', () => {
    const childNode = strategy.calculateNodeSize('Node', { level: 1 });
    const rootNode = strategy.calculateNodeSize('Node', { level: 0 });
    expect(rootNode.height).toBeGreaterThan(childNode.height);
  });
});
```

### Phase 3: Integration Tests for MindMapNode

```typescript
// __tests__/MindMapNode.integration.test.tsx

describe('MindMapNode Integration', () => {
  it('should resize based on text content', () => {
    const { container } = render(
      <MindMapNode
        id="1"
        data={{ label: 'A', ...defaultData }}
        selected={false}
      />
    );
    const node = container.querySelector('[data-testid="mindmap-node"]');
    const initialWidth = node.style.width;

    // Update to longer text
    rerender(
      <MindMapNode
        id="1"
        data={{ label: 'This is much longer text that should expand the node', ...defaultData }}
        selected={false}
      />
    );

    const expandedWidth = node.style.width;
    expect(parseInt(expandedWidth)).toBeGreaterThan(parseInt(initialWidth));
  });

  it('should not wrap text in display mode', () => {
    const { container } = render(
      <MindMapNode
        id="1"
        data={{
          label: 'This is a very long label that traditionally would wrap but should not wrap in our implementation',
          ...defaultData
        }}
        selected={false}
      />
    );

    const textElement = container.querySelector('.node-label');
    expect(textElement).toHaveStyle({ whiteSpace: 'nowrap' });
  });

  it('should update size when switching to edit mode', async () => {
    const { container } = render(
      <MindMapNode
        id="1"
        data={{ label: 'Editable', ...defaultData }}
        selected={false}
      />
    );

    const node = container.querySelector('[data-testid="mindmap-node"]');
    const displayWidth = node.style.width;

    // Double-click to edit
    fireEvent.doubleClick(node);
    await waitFor(() => {
      const input = container.querySelector('input');
      expect(input).toBeInTheDocument();
    });

    const editingWidth = node.style.width;
    expect(parseInt(editingWidth)).toBeGreaterThan(parseInt(displayWidth));
  });
});
```

### Phase 4: Canvas Text Measurement Tests

```typescript
// __tests__/canvasTextMeasurement.test.ts

describe('Canvas Text Measurement', () => {
  let canvas: HTMLCanvasElement;
  let context: CanvasRenderingContext2D;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    context = canvas.getContext('2d')!;
  });

  it('should measure text accurately using canvas', () => {
    context.font = '14px Arial';
    const metrics = context.measureText('Hello World');
    expect(metrics.width).toBeGreaterThan(0);
  });

  it('should handle different fonts', () => {
    context.font = '14px Arial';
    const arialWidth = context.measureText('Test Text').width;

    context.font = '14px monospace';
    const monoWidth = context.measureText('Test Text').width;

    expect(arialWidth).not.toBe(monoWidth);
  });
});
```

## Refactoring Strategy

### Step 1: Remove maxWidth Constraint

1. Remove `maxWidth: 800px` from both implementations
2. Change `break-words` to `whitespace-nowrap` in display text
3. Remove `min-w-0` which can cause text shrinking
4. Ensure input field also doesn't wrap during editing

### Step 2: Consolidate Implementations

1. Extract `calculateNodeWidth` from `mindMapLayout.ts`
2. Remove measurement logic from `MindMapNode.tsx`
3. Create new shared text measurement service
4. Update both consumers to use the new service

## Implementation Strategy

### Step 1: Create Text Measurement Service

1. Implement using Canvas API for accurate text measurement
2. Cache measurements for performance
3. Handle font loading edge cases
4. Support all text styling options

### Step 2: Create Node Sizing Strategy

1. Use text measurement service
2. Add logic for padding, icons, edit mode
3. Implement caching for repeated calculations
4. Make it configurable and extensible

### Step 3: Refactor MindMapNode Component

1. Remove embedded measurement logic
2. Inject sizing strategy
3. Update CSS to prevent text wrapping
4. Remove maxWidth constraints
5. Optimize re-render triggers

### Step 4: Performance Optimization

1. Debounce size calculations
2. Memoize sizing results
3. Only recalculate on text/style changes
4. Use CSS transforms for smooth resizing

## CSS Changes Required

```css
/* Remove these classes/styles */
.break-words {
  /* Remove word breaking */
}
max-width: 800px; /* Remove max width constraint */

/* Add these styles */
.mindmap-node-label {
  white-space: nowrap;
  overflow: visible;
  text-overflow: clip;
}

.mindmap-node-container {
  width: auto;
  min-width: 120px;
  /* No max-width */
}
```

## Testing Strategy Summary

1. **Unit Tests First** (TDD)
   - Text measurement calculations
   - Sizing strategies
   - Edge cases and special characters

2. **Integration Tests**
   - Component behavior
   - User interactions
   - Performance benchmarks

3. **Visual Regression Tests**
   - Node appearance at different sizes
   - Transition animations
   - Layout consistency

## Existing Tests to Update

### MindMapNode.test.tsx

- Lines 785-817: Tests for min/max width constraints
- Need to remove maxWidth checks after implementation
- Add new tests for unlimited width scenarios

### useMindMapLayout.test.ts

- Lines 283-296: Tests that enforce 800px maximum
- Line 265: Expects width <= 800
- These tests will fail when we remove maxWidth constraint
- Update to test for no maximum limit

## TDD Workflow

### Red-Green-Refactor Cycle

1. **Red Phase** (Write Failing Tests First)
   - Write test for single character width calculation → FAIL
   - Write test for long text without wrapping → FAIL
   - Write test for empty string handling → FAIL
   - Write test for special characters/emojis → FAIL
   - Write test for font weight differences → FAIL

2. **Green Phase** (Make Tests Pass)
   - Implement minimal text measurement service
   - Add Canvas API integration
   - Handle edge cases one by one
   - Make all tests pass with simplest solution

3. **Refactor Phase** (Improve Code Quality)
   - Add caching mechanism
   - Optimize canvas reuse
   - Extract common constants
   - Improve error handling
   - Add performance optimizations

### Test Execution Order

1. Start with unit tests for pure functions (no DOM)
2. Move to integration tests with mock DOM
3. Finally, add e2e tests with real components
4. Run all tests continuously during development

## Benefits of This Approach

1. **Testability**: Core logic can be tested without DOM
2. **Performance**: Optimized measurement with caching
3. **Maintainability**: Clear separation of concerns
4. **Extensibility**: Easy to add new sizing strategies
5. **Reliability**: Comprehensive test coverage before implementation
6. **No Regressions**: Tests prevent breaking existing functionality
7. **Documentation**: Tests serve as living documentation

## Implementation Priority Order

### Phase 1: Foundation (Tests First)

1. Create text measurement service tests
2. Create node sizing strategy tests
3. Run tests (all should fail)

### Phase 2: Core Implementation

1. Implement text measurement service (make tests pass)
2. Implement node sizing strategy (make tests pass)
3. Create integration with existing code

### Phase 3: Refactor Existing Code

1. Update MindMapNode to use new service
2. Update mindMapLayout to use new service
3. Remove duplicate code
4. Update existing tests to match new behavior

### Phase 4: CSS Updates

1. Replace `break-words` with `whitespace-nowrap`
2. Remove `maxWidth` constraints
3. Update input field styles
4. Test visual appearance

### Phase 5: Performance Optimization

1. Add measurement caching
2. Optimize canvas reuse
3. Debounce resize calculations
4. Profile and benchmark

## Success Criteria

1. ✅ All text displays on single line without wrapping
2. ✅ Nodes expand to accommodate any text length
3. ✅ No artificial width limits (remove 800px constraint)
4. ✅ Performance remains smooth with many nodes
5. ✅ All tests pass (unit, integration, visual)
6. ✅ No duplicate measurement code
7. ✅ Edit mode works correctly with long text
