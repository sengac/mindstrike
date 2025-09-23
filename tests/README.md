# MindStrike Testing Guide

## Overview

MindStrike uses a comprehensive testing strategy with multiple layers:

1. **Unit Tests** - Test individual components and functions in isolation
2. **Integration Tests** - Test API endpoints and service interactions
3. **Component Tests** - Test React components with Playwright CT
4. **E2E Tests** - Test complete user workflows with Playwright

## Tech Stack

- **Vitest** - Fast unit testing framework with native TypeScript support
- **React Testing Library** - Component testing utilities
- **Playwright** - E2E and component testing
- **Coverage** - Via @vitest/coverage-v8

## Running Tests

```bash
# Run all tests
npm test

# Watch mode for development
npm run test:watch

# Run with coverage
npm run test:coverage

# Run specific test suites
npm run test:server    # Server-side tests only
npm run test:client    # Client-side tests only
npm run test:integration  # Integration tests
npm run test:e2e       # E2E tests with Playwright

# Interactive UI
npm run test:ui
```

## Writing Tests

### Unit Tests (Vitest)

```typescript
// server/agents/__tests__/chat-agent.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('ChatAgent', () => {
  it('should process messages', async () => {
    // Test implementation
  });
});
```

### React Component Tests

```tsx
// src/components/__tests__/Button.test.tsx
import { render, screen, fireEvent } from '@/tests/test-utils';

describe('Button', () => {
  it('should handle clicks', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalled();
  });
});
```

### Integration Tests

```typescript
// tests/integration/api.test.ts
describe('API Integration', () => {
  it('should create a thread', async () => {
    const response = await fetch('/api/threads', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test' }),
    });

    expect(response.ok).toBe(true);
  });
});
```

### E2E Tests (Playwright)

```typescript
// tests/e2e/chat.test.ts
import { test, expect } from '@playwright/test';

test('should send a message', async ({ page }) => {
  await page.goto('/');
  await page.fill('[data-testid="message-input"]', 'Hello');
  await page.click('[data-testid="send-button"]');

  await expect(page.locator('[data-testid="message"]')).toContainText('Hello');
});
```

## Test Structure

```
tests/
├── setup.ts              # Global test setup
├── setup-react.ts        # React-specific setup
├── test-utils.tsx        # Testing utilities
├── __mocks__/           # Module mocks
├── fixtures/            # Test data
├── integration/         # Integration tests
└── e2e/                # End-to-end tests
```

## Mocking

### Server-side Mocks

- Winston logger is automatically mocked
- File system operations are mocked for safety
- External services (LLMs, MCP) are mocked

### Client-side Mocks

- Monaco Editor is replaced with textarea
- ReactFlow is simplified
- SSE connections are mocked
- Fetch requests can be intercepted

## Best Practices

1. **Test Isolation** - Each test should be independent
2. **Use Test IDs** - Add `data-testid` attributes for reliable selection
3. **Mock External Dependencies** - Don't make real API calls in tests
4. **Test User Behavior** - Focus on what users do, not implementation
5. **Keep Tests Fast** - Mock heavy operations
6. **Use Fixtures** - Reuse test data across tests

## CI/CD Integration

Tests run automatically on:

- Every push to main/develop branches
- All pull requests
- Multiple OS and Node.js versions

## Coverage

We aim for:

- 80% overall coverage
- 90% coverage for critical paths
- 100% coverage for utility functions

View coverage reports:

```bash
npm run test:coverage
# Open coverage/index.html in browser
```

## Debugging Tests

### Vitest

```bash
# Run specific test file
npm test -- chat-agent.test.ts

# Run tests matching pattern
npm test -- --grep "should process"

# Debug in VS Code
# Use "Debug Test" CodeLens above test
```

### Playwright

```bash
# Debug mode
npx playwright test --debug

# Headed mode (see browser)
npx playwright test --headed

# Specific test
npx playwright test chat-flow.test.ts
```

## Common Issues

### Tests Failing in CI

- Check for hardcoded ports or URLs
- Ensure all dependencies are mocked
- Verify file paths are cross-platform
- Check for race conditions

### Flaky Tests

- Add proper wait conditions
- Avoid arbitrary timeouts
- Mock time-dependent operations
- Use test retries sparingly

### Memory Issues

- Clean up after tests
- Reset global state
- Clear timers and intervals
- Limit test concurrency in CI
