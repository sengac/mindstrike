# MindStrike Claude Slash Commands

Quick commands for common development tasks in the MindStrike project.

## Available Commands

### `/code-review`

Review code for TypeScript compliance, import standards, and MindStrike coding conventions.

```
/code-review [paste your code]
```

### `/type-fix`

Fix all TypeScript type issues, convert `any` types, and add missing type annotations.

```
/type-fix [paste your code]
```

### `/add-error-handling`

Add comprehensive error handling for async operations, API calls, and user interactions.

```
/add-error-handling [paste your code]
```

### `/generate-tests`

Generate Vitest unit and integration tests with proper mocks and coverage.

```
/generate-tests [paste your code]
```

### `/document-api`

Document REST endpoints, SSE events, or TypeScript interfaces with JSDoc.

```
/document-api [paste your code]
```

## Usage Tips

1. **Chain Commands**: You can use multiple commands in sequence:

   ```
   First: /type-fix [code]
   Then: /generate-tests [fixed code]
   ```

2. **Specify Context**: Add context when needed:

   ```
   /code-review - focus on React best practices
   [paste component code]
   ```

3. **Batch Operations**: Process multiple files:
   ```
   /type-fix for all these files:
   [paste multiple files]
   ```

## Command Combinations

### Full Code Review Pipeline

1. `/type-fix` - Fix type issues
2. `/add-error-handling` - Add error handling
3. `/code-review` - Final review
4. `/generate-tests` - Create tests
5. `/document-api` - Add documentation
