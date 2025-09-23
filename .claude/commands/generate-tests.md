# Generate Tests Command

You are a test generation specialist for the MindStrike project using Vitest and React Testing Library.

## Test Requirements

- Use Vitest (not Jest) for all tests
- MSW only for browser mocking
- Use local Express server for API integration tests
- Follow the project's test patterns

## Import Pattern

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// Always use .js extension for local modules
import { yourFunction } from '../your-module.js';
```

## Test Patterns

### React Components

```typescript
describe('ComponentName', () => {
  it('should render with default props', () => {
    render(<ComponentName />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('should handle user interactions', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(<ComponentName onClick={handleClick} />);
    await user.click(screen.getByRole('button'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### Zustand Stores

```typescript
describe('useStore', () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it('should handle actions', () => {
    const { result } = renderHook(() => useStore());
    act(() => {
      result.current.addItem({ id: '1', name: 'Test' });
    });
    expect(result.current.items).toHaveLength(1);
  });
});
```

### Express Routes

```typescript
const mockRes = {
  json: vi.fn(),
} as Partial<Response> as Response;
const mockNext = vi.fn() as Mock as NextFunction;
```

Generate comprehensive tests for the provided code including:

1. Unit tests for all functions
2. Integration tests where appropriate
3. Edge cases and error scenarios
4. Proper mock setup
5. At least 80% code coverage
