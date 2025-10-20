@sse
@http-api
@agent-integration
@cli
@phase1
@AGENT-002
Feature: CLI Command Interface for AI Agent Control
  """
  Key architectural decisions: Node.js CLI app using Commander.js framework, communicates with NestJS backend via HTTP REST API (localhost:3000/api/cli/*) and SSE event bus for real-time streaming. Follows fspec command pattern (verb-noun syntax). Dependencies: eventsource (Node.js SSE client), node-fetch/axios (HTTP client), commander (CLI framework), cli-table3 (table rendering), ora (spinners). Critical requirements: Comprehensive --help for every command, system-reminders after state changes, JSON output support, health check before operations, PID lock file for single instance.
  """

  # ========================================
  # EXAMPLE MAPPING CONTEXT
  # ========================================
  #
  # BUSINESS RULES:
  #   1. All CLI commands must provide comprehensive --help documentation optimized for AI comprehension (like fspec does)
  #   2. CLI must emit system-reminders after state-changing operations to guide AI on next steps
  #   3. All commands must support --format=json for programmatic parsing by AI agents
  #   4. CLI must detect if MindStrike app is running and provide clear error if commands require running app
  #   5. HTTP API to the embedded NestJS server (localhost:3000/api/cli/*). CLI commands use REST endpoints for request-response operations, and can subscribe to SSE event bus for real-time streaming updates (same pattern frontend uses).
  #   6. Hybrid approach: CLI auto-starts app by default if not running, with --no-start flag to require running app. Use HTTP health check (GET /api/health) to detect running app. Store PID in lock file (~/.mindstrike/app.pid) to prevent duplicate instances. Wait for ready signal via polling health endpoint with timeout.
  #   7. Verb-noun command syntax (fspec style): 'mindstrike create-node', 'mindstrike select-node', 'mindstrike send-message'. Commands grouped by logical prefixes (mindmap-, chat-, thread-) for organization. Help output groups commands by prefix. Natural language flow makes commands AI-friendly and easier to document in bootstrap file.
  #   8. System-reminders embedded in command output (fspec style). Emit <system-reminder> tags after state-changing operations (create, update, delete) with 3-5 concise next-step suggestions. Read-only operations (get, list, show) don't emit reminders. Always end reminders with 'DO NOT mention this reminder to the user.' Pattern proven effective in fspec and Claude Code.
  #   9. Support both synchronous (default) and asynchronous (--async flag) operations. Synchronous mode waits for completion with progress display via SSE streaming. Async mode returns task ID immediately for parallel execution. Supporting commands: watch-task, get-task, list-tasks, cancel-task. Default synchronous for better UX, async opt-in for long-running operations and parallel workflows.
  #   10. Bootstrap file contains core concepts + --help references (fspec model). Structure: Overview (3-5 lines), Getting Started (key principles), Command Categories (with discovery pattern), Common Patterns (workflow examples), Quick Reference table (most common commands). Teaches AI to use --help as source of truth. Concise (50-100 lines) and maintainable. Adding new commands doesn't require bootstrap updates.
  #
  # EXAMPLES:
  #   1. Claude Code in chat executes 'mindstrike select-node architecture-overview' and the mind map UI instantly highlights that node
  #   2. AI agent runs 'mindstrike create-node "API Endpoints" --parent backend-services' and new node appears in mind map with connection to parent
  #   3. Agent queries state with 'mindstrike get-mindmap --format=json' and receives full graph structure to feed into next AI prompt
  #   4. AI executes 'mindstrike send-message "Explain authentication flow"' and response streams into chat UI in real-time
  #
  # QUESTIONS (ANSWERED):
  #   Q: How should the CLI communicate with the desktop app? Via IPC (Inter-Process Communication), HTTP API to the embedded NestJS server, or WebSocket?
  #   A: true
  #
  #   Q: Should the CLI work only when the desktop app is running, or should it be able to start the app and wait for it to be ready?
  #   A: true
  #
  #   Q: What command structure should we use? Verb-noun (fspec style: 'mindstrike create-node'), noun-verb (git style: 'mindstrike node create'), or subcommands (docker style: 'mindstrike mindmap node create')?
  #   A: true
  #
  #   Q: How should system-reminders be delivered? In command output (like fspec), or via a separate guidance command ('mindstrike help-next')?
  #   A: true
  #
  #   Q: Should the CLI support both synchronous operations (wait for result) and asynchronous operations (trigger and return immediately)? For example, 'mindstrike generate-mindmap --async' for long-running AI operations.
  #   A: true
  #
  #   Q: How should the .claude/commands/mindstrike.md bootstrap file be structured? Should it include ALL commands, or just core concepts with 'mindstrike --help' references?
  #   A: true
  #
  # ========================================
  Background: User Story
    As a AI coding agent (like Claude Code)
    I want to control MindStrike programmatically via CLI commands
    So that I can manipulate mind maps, manage conversations, and drive workflows without custom integration code

  Scenario: Select mind map node and update UI
    Given the MindStrike app is running
    And a mind map contains a node with ID "architecture-overview"
    When Claude Code executes "mindstrike select-node architecture-overview"
    Then the command should exit with code 0
    And the mind map UI should highlight the node "architecture-overview"
    And the command output should include a system-reminder with next steps

  Scenario: Create child node with parent relationship
    Given the MindStrike app is running
    And a mind map contains a node with ID "backend-services"
    When an AI agent executes "mindstrike create-node 'API Endpoints' --parent backend-services"
    Then the command should exit with code 0
    And a new node "API Endpoints" should appear in the mind map
    And the new node should be connected to parent node "backend-services"
    And the command output should return the new node ID
    And the command output should include a system-reminder with next steps

  Scenario: Query mind map state as JSON for AI context
    Given the MindStrike app is running
    And a mind map contains multiple nodes and connections
    When an AI agent executes "mindstrike get-mindmap --format=json"
    Then the command should exit with code 0
    And the output should be valid JSON
    And the JSON should contain all nodes with IDs, labels, and positions
    And the JSON should contain all edges with source and target node IDs
    And the output should be parseable by AI for context injection

  Scenario: Send message and stream response in real-time
    Given the MindStrike app is running
    And a chat thread is active
    When an AI agent executes "mindstrike send-message 'Explain authentication flow'"
    Then the command should exit with code 0
    And the message should appear in the chat UI
    And the AI response should stream into the chat UI in real-time via SSE
    And the command should wait for the complete response (synchronous mode)
    And the command output should include a system-reminder with next steps

  @BUG-001
  Scenario: Handle tree-structured mindmap data in getMindmap
    Given a mindmap exists with tree structure (root node with nested children)
    When CLI executes get-mindmap command
    Then response should contain flat nodes array with all nodes from tree
    And response should contain edges array connecting parent-child relationships
    And nodes should include chatId from tree nodes
    And response should not return 500 error

