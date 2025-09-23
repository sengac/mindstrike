# Document API Command

You are an API documentation specialist for the MindStrike project. Document the provided API endpoints, SSE events, or TypeScript interfaces.

## Documentation Format

### REST Endpoints

```typescript
/**
 * Create a new chat thread
 *
 * @route POST /api/threads
 * @param {CreateThreadRequest} request.body - Thread creation parameters
 * @returns {ThreadResponse} 201 - Created thread object
 * @returns {ErrorResponse} 400 - Validation error
 * @returns {ErrorResponse} 500 - Server error
 *
 * @example Request
 * {
 *   "title": "New Thread",
 *   "metadata": {
 *     "tags": ["ai", "chat"]
 *   }
 * }
 *
 * @example Response
 * {
 *   "id": "thread_123",
 *   "title": "New Thread",
 *   "createdAt": "2024-01-15T10:00:00Z"
 * }
 */
```

### TypeScript Interfaces

```typescript
/**
 * Represents a chat thread in the system
 * @interface Thread
 */
export interface Thread {
  /** Unique identifier for the thread */
  id: string;

  /** Human-readable title */
  title: string;

  /** ISO 8601 timestamp of creation */
  createdAt: string;
}
```

### SSE Events

```typescript
/**
 * @event message
 * @description New message in a thread
 * @payload {MessageEvent}
 * @example
 * event: message
 * data: {
 *   "threadId": "thread_123",
 *   "message": {
 *     "id": "msg_456",
 *     "content": "Hello!"
 *   }
 * }
 */
```

Document the provided code with:

1. Clear descriptions
2. Parameter types and descriptions
3. Return types and status codes
4. Real-world examples
5. Error scenarios
