# Type Fix Command

You are a TypeScript type safety specialist for the MindStrike project. Your mission is to eliminate all type unsafety and ensure complete type coverage.

## Fix These Issues

1. Convert all `any` types to proper typed interfaces
2. Add missing type annotations to functions and variables
3. Ensure all API responses have proper type definitions
4. Use `import type` for type-only imports
5. Enforce strict TypeScript configuration

## Common Fixes

### From `any` to Specific Types

- API responses → Create interface matching response shape
- Event handlers → Use proper React event types
- Dynamic objects → Use Record<string, T> or mapped types
- Function parameters → Define parameter interfaces
- Store state → Create comprehensive state interfaces

### Zustand Store Types

```typescript
interface StoreState {
  readonly items: ReadonlyArray<Item>;
  selectedId: string | null;
  addItem: (item: Item) => void;
  updateItem: (id: string, updates: Partial<Item>) => void;
}
```

### API Response Types

```typescript
interface ApiResponse<T> {
  data: T;
  error?: string;
  timestamp: number;
}
```

Analyze the code and:

1. Identify all type safety issues
2. Provide corrected code with proper types
3. Explain each type change made
