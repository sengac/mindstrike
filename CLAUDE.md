# MindStrike - AI Knowledge Assistant Platform

## STRICT ESLINT RULES - MANDATORY COMPLIANCE

**ALL CODE MUST PASS ESLINT CHECKS BEFORE COMMITTING**

### MANDATORY CODING RULES - YOUR CODE WILL NOT PASS IF VIOLATED

**EVERY SINGLE RULE BELOW IS MANDATORY - NO EXCEPTIONS**

#### What You MUST and MUST NOT Do:

**Variables & Types:**

- ❌ **NEVER** write: `const unused = 'value'` without using it
- ✅ **ALWAYS** remove or use every variable you declare (ignoreRestSiblings allowed for destructuring)
- ❌ **NEVER** write: `const data: any = response`
- ✅ **ALWAYS** write: `const data: ResponseType = response`
- ❌ **NEVER** write: `type User = { name: string }`
- ✅ **ALWAYS** write: `interface User { name: string }`
- ❌ **NEVER** write: `import { SomeType } from './types'` when only using as type
- ✅ **ALWAYS** write: `import type { SomeType } from './types'`

**Type Safety:**

- ❌ **NEVER** write: `const result = someFunction()` without knowing the return type
- ✅ **ALWAYS** ensure all assignments, calls, and returns are fully typed
- ❌ **NEVER** pass untyped arguments to functions
- ✅ **ALWAYS** ensure function arguments match expected types exactly

**Variable Declaration:**

- ❌ **NEVER** write: `let value = 5` if value never changes
- ✅ **ALWAYS** write: `const value = 5` for unchanging values
- ❌ **NEVER** write: `var something = 'test'`
- ✅ **ALWAYS** write: `const something = 'test'` or `let something = 'test'`

**Equality Checks:**

- ❌ **NEVER** write: `if (value == null)` or `if (value != 'test')`
- ✅ **ALWAYS** write: `if (value === null)` or `if (value !== 'test')`

**Control Flow:**

- ❌ **NEVER** write: `if (condition) doSomething()`
- ✅ **ALWAYS** write: `if (condition) { doSomething() }`
- ❌ **NEVER** write: `for (let i = 0; i < 10; i++) console.log(i)`
- ✅ **ALWAYS** write: `for (let i = 0; i < 10; i++) { console.log(i) }`

**Promises & Async:**

- ❌ **NEVER** write: `fetchData()` without handling the promise
- ✅ **ALWAYS** write: `await fetchData()` or `fetchData().then()` or `void fetchData()`
- ❌ **NEVER** write: `await someValue` if someValue is not a promise
- ✅ **ALWAYS** only await actual promises/thenables

**Nullish Checks:**

- ❌ **NEVER** write: `const value = input || 'default'` for nullish checks
- ✅ **ALWAYS** write: `const value = input ?? 'default'` for nullish coalescing

**Optional Chaining:**

- ❌ **NEVER** write: `if (user && user.profile && user.profile.name)`
- ✅ **ALWAYS** write: `if (user?.profile?.name)`

**Console Statements:**

- ❌ **NEVER** write: `console.log('debug')` in frontend components
- ✅ **ONLY** use console in: server files, test files, scripts, config files, or src/utils/logger.ts

**React Hooks:**

- ❌ **NEVER** call hooks conditionally: `if (condition) { useState() }`
- ✅ **ALWAYS** call hooks at the top level of components
- ❌ **NEVER** omit dependencies: `useEffect(() => {}, [])` when using external values
- ✅ **ALWAYS** include all dependencies: `useEffect(() => {}, [dep1, dep2])`

**Type Assertions:**

- ❌ **NEVER** write: `(value as string)` when TypeScript already knows it's a string
- ✅ **ONLY** use type assertions when absolutely necessary and type is genuinely unknown

**Empty Blocks & Case Declarations:**

- ⚠️ **AVOID** empty blocks: `catch(e) {}` - handle or comment why it's empty
- ⚠️ **AVOID** declaring variables in case statements without block scope
- ✅ **ALWAYS** use block scope in switch cases when declaring variables: `case 'x': { const val = 1; break; }`

**Void Operator:**

- ❌ **NEVER** use the `void` operator except for ignoring promise returns
- ✅ **ONLY** use void for explicitly ignoring promises: `void asyncFunction()`

### Console Statement Exceptions ONLY

- **Server Files** (`server/**/*.ts`): Console statements allowed
- **Test Files** (`**/*.test.ts`, `**/*.spec.ts`, `tests/**/*.ts`): Console statements allowed
- **Scripts and Config** (`scripts/**/*.js`, `*.mjs`, `*.js`): Console statements allowed
- **Logger** (`src/utils/logger.ts`): Console statements allowed

### Running ESLint

```bash
# Check all files
npm run lint

# Auto-fix issues where possible
npm run lint:fix

# Check specific files
npx eslint src/components/MyComponent.tsx
```

**IMPORTANT**: Code that doesn't pass ESLint will be rejected. Always run `npm run lint` before committing.

## Project Overview

MindStrike is a comprehensive AI knowledge assistant platform built as a modern desktop and web application. It combines multi-threaded conversational AI, interactive mind mapping, workspace management, and real-time agent workflows in a unified interface.

## Technical Architecture

### Tech Stack

**Frontend**

- React 18 + TypeScript
- Vite (build tooling)
- Tailwind CSS (styling)
- Zustand (state management)
- ReactFlow (mind maps)
- Monaco Editor (code editing)
- Lucide React (icons)

**Backend**

- Node.js + Express
- TypeScript
- LangChain (AI orchestration)
- Model Context Protocol (MCP) for tools
- Winston (logging)

**Desktop**

- Electron
- Cross-platform packaging (DMG, NSIS, AppImage)

**Real-time**

- Server-Sent Events (SSE)
- WebSocket fallback support

## Core Systems

### State Management

#### Zustand Stores

- `useAppStore` - Global settings, workspace config
- `useThreadsStore` - Active threads, selection
- `useChatThreadStore` - Per-thread messages
- `useMindMapStore` - Mind map data and operations
- `useModelsStore` - Available LLM configurations
- `useTaskStore` - Background task tracking
- `useDebugStore` - Development debugging

#### Persistence

- Zustand persist middleware for local storage
- Server-side file persistence for threads/mindmaps
- Automatic state synchronization

#### Immer middleware

- Using Immer for undo/redo functionality as Zustand middleware

### Real-time Communication

#### SSE Architecture

- Single persistent EventSource connection
- Topic-based message routing
- Automatic reconnection with exponential backoff
- Large content chunking and reference storage

### MCP (Model Context Protocol) Integration

#### Memory Server - When to Use

**Store Knowledge When:**

- Discovering important architectural patterns or design decisions in the codebase
- Finding non-obvious relationships between components or systems
- Learning about project-specific conventions or patterns
- Debugging complex issues and finding root causes
- Understanding business logic or domain concepts

**Retrieve Knowledge When:**

- Starting work on a related component or feature
- Debugging similar issues
- Needing context about architectural decisions
- Onboarding to a new area of the codebase
- Making changes that might affect related systems

**What to Store:**

- Architectural patterns and their rationale
- Component relationships and dependencies
- Bug patterns and their solutions
- Performance optimizations and their impact
- Business rules and domain logic
- Integration points and API contracts

#### Context7 Server - When to Use

**Use for Documentation When:**

- Implementing new features with unfamiliar libraries
- Upgrading dependencies and checking breaking changes
- Following current best practices for frameworks
- Researching optimal API usage patterns
- Verifying correct implementation approaches

**Priority Libraries for MindStrike:**

- React 18 patterns and hooks
- TypeScript strict mode practices
- Zustand state management patterns
- ReactFlow for mind mapping
- LangChain for AI orchestration
- Electron for desktop features
- Vite configuration and optimization

#### Knowledge Management Strategy

1. **Capture During Development**: Store insights immediately when discovering important patterns
2. **Build Relationships**: Connect related components, bugs, and solutions
3. **Update Continuously**: Add new observations to existing entities as understanding evolves
4. **Query Before Changes**: Check stored knowledge before modifying complex systems
5. **Document Integration Points**: Store how different systems interact and communicate

### Coding Standards

#### TypeScript Rules (Strict Enforcement)

- **Strict Mode**: All TypeScript strict checks enabled
- **No `any` Types**: Complete type safety required - use proper types always
- **Interface Over Type**: Use `interface` for object definitions, not `type`
- **Readonly Properties**: Use `readonly` where immutability is expected
- **Null Safety**: Strict null checks enabled - handle undefined/null explicitly

#### Import & Module Rules

- **ES6 Imports Only**: Never use `require()` - always use `import`
- **File Extensions**: Always use `.js` extension for local module imports (ES modules)
- **Consistent Type Imports**: Use `import type` for type-only imports
- **Explicit Imports**: Prefer explicit imports over star imports

#### Code Quality Requirements

- **Error Handling**: Comprehensive try/catch patterns for async operations
- **Async/Await**: Always await thenable expressions - no floating promises
- **Promise Handling**: All promises must be properly handled or explicitly ignored
- **Function Purity**: Prefer pure functions and immutable data structures

#### Linting Rules (ESLint)

- **Curly Braces**: Required for all control statements
- **Const Preference**: Use `const` over `let`/`var` where possible
- **No Unused Variables**: All declared variables must be used
- **Strict Equality**: Use `===` and `!==` instead of `==` and `!=`
- **No Console**: Console statements discouraged (except in server/test files)

#### Naming Conventions

- **Files**: `PascalCase.tsx` for components, `useCamelCase.ts` for hooks
- **Components**: `PascalCase` for React components
- **Hooks**: `useCamelCase` for custom hooks
- **CSS**: `camelCase` for class names
- **Constants**: `UPPER_SNAKE_CASE` for global constants
- **Interfaces**: `IPascalCase` or just `PascalCase` for TypeScript interfaces

#### React Best Practices

- **Functional Components**: Always use functional components with hooks
- **Component Size**: Keep components focused and small (< 200 lines)
- **Hook Extraction**: Extract complex logic to custom hooks
- **Memo Usage**: Use React.memo for expensive components
- **Prop Types**: TypeScript interfaces for all component props
- **State Management**: Zustand for global state, useState for local state

#### Development Workflow

##### Before Starting Development

1. **Understanding**: Review relevant source files in the module you're working on
2. **Testing**: Run existing tests to ensure baseline functionality
3. **Linting**: Ensure code passes all linting rules before making changes
4. **Typechecking**: Ensure all code typechecking works

##### During Development

1. **Type Safety**: Write code that satisfies TypeScript strict mode
2. **Testing**: Write tests for new functionality (unit and integration as appropriate)
3. **Error Handling**: Implement proper error handling for all async operations
4. **Documentation**: Update code comments for complex logic

### Specialized Subagents

MindStrike uses specialized subagents for specific development tasks. Use these agents proactively when their expertise matches the task:

#### API Documenter Agent

**Triggers:**

- After creating new API endpoints
- When modifying endpoint parameters or responses
- Before releasing API changes
- When examples or documentation are outdated

#### Code Reviewer Agent

**Triggers:**

- Completed implementation of 50+ lines
- Modified critical business logic
- Changed authentication/authorization code
- Implemented new data structures
- Refactored existing components

#### Error Handler Agent

**Triggers:**

- Writing async/await code
- Implementing API calls or network requests
- Creating new React components with dynamic data
- Working with file system operations
- Integrating external services

#### Test Generator Agent

**Triggers:**

- New feature implementation complete
- Refactoring that changes interfaces
- Bug fixes that need regression tests
- Coverage reports show gaps
- Before major releases

**Testing Requirements:**

- **Unit Tests**: Test individual functions and components in isolation
- **Integration Tests**: Test interactions between components using fixtures
- **Fixtures**: Create reusable test data and mock objects for:
  - Store states (Zustand mocks)
  - API responses
  - Component props
  - User interactions
  - File system operations
- **Test Structure**:
  - Place tests in `__tests__` directories adjacent to source files
  - Name test files as `[component].test.tsx` or `[module].test.ts`
  - Use descriptive test names that explain the behavior being tested
- **Testing Libraries**:
  - Vitest for test runner
  - React Testing Library for component tests
  - MSW (Mock Service Worker) for API mocking
  - Testing Library User Event for user interactions

#### Type Enforcer Agent

**Triggers:**

- TypeScript errors in build
- Using `any` type temporarily
- Creating new interfaces or types
- Working with third-party libraries
- Implementing generic components
