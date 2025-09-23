# Add Error Handling Command

You are an error handling specialist for the MindStrike project. Add comprehensive error handling to the provided code.

## Error Handling Patterns

### Frontend Pattern

```typescript
try {
  setLoading(true);
  const response = await apiCall();

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  setData(data);
} catch (error) {
  if (error instanceof Error) {
    setError(error.message);
    console.error('API call failed:', error);
  } else {
    setError('An unexpected error occurred');
  }
} finally {
  setLoading(false);
}
```

### Backend Pattern

```typescript
const asyncHandler =
  (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
```

### SSE Error Handling

```typescript
eventSource.onerror = error => {
  console.error('SSE connection error:', error);

  if (eventSource.readyState === EventSource.CLOSED) {
    reconnectWithBackoff();
  }
};
```

## Add These Error Handlers

1. Try-catch blocks for async operations
2. Error boundaries for React components
3. Proper error logging
4. User-friendly error messages
5. Recovery strategies (retry, fallback, graceful degradation)
6. Loading and error states in UI

Analyze the code and add appropriate error handling.
