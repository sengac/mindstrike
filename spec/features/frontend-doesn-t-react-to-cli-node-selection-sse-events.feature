@agent-integration
@cli
@sse
@phase1
@BUG-002
Feature: Frontend doesn't react to CLI node selection SSE events

  """
  Testing Requirements: Must validate with Playwright MCP plugin (mcp__playwright__*). Validation steps: 1) Use mcp__playwright__browser_navigate to load frontend at localhost:5173, 2) Use mcp__playwright__browser_click to navigate to MindMaps view, 3) Execute CLI command 'mindstrike select-node <nodeId>' via Bash tool, 4) Use mcp__playwright__browser_snapshot to capture page state and verify yellow highlight box appears around selected node.
  """

  # ========================================
  # EXAMPLE MAPPING CONTEXT
  # ========================================
  #
  # BUSINESS RULES:
  #   1. CLI broadcasts 'mindmap_update' SSE events with type='mindmap_update' and action='node_selected'
  #   2. Frontend useMindMapStore must subscribe to 'mindmap_update' events on initialization
  #   3. When 'mindmap_update' event with action='node_selected' is received, frontend must update selectedNodeId state
  #
  # EXAMPLES:
  #   1. CLI executes 'mindstrike select-node node-1760928953203' and frontend updates selectedNodeId to 'node-1760928953203' with yellow highlight
  #   2. Server broadcasts SSE event {type: 'mindmap_update', action: 'node_selected', nodeId: 'test-node'} and frontend calls selectNode('test-node')
  #
  # ========================================

  Background: User Story
    As a user interacting with CLI
    I want to see the frontend mindmap update when CLI selects a node
    So that the CLI and frontend UI stay synchronized

  Scenario: Frontend subscribes to mindmap_update SSE events on initialization
    Given the frontend application is loaded
    And useMindMapStore is initialized
    When the SSE event bus is active
    Then useMindMapStore should have a subscription to 'mindmap_update' events
    And the subscription should handle action='node_selected'

  Scenario: CLI command selects node and frontend updates via SSE
    Given the MindStrike server is running on port 3001
    And the frontend is loaded at localhost:5173
    And a mindmap contains a node with ID "node-1760928953203"
    When the CLI executes "mindstrike select-node node-1760928953203"
    Then the server should broadcast an SSE event with type 'mindmap_update'
    And the event should have action 'node_selected'
    And the event should have nodeId 'node-1760928953203'
    And the frontend selectedNodeId state should update to 'node-1760928953203'
    And the node should display a yellow highlight box in the UI

  Scenario: Frontend receives SSE event and updates selected node
    Given the frontend is connected to SSE event bus
    And useMindMapStore has subscribed to 'mindmap_update' events
    When an SSE event is received with type 'mindmap_update' and action 'node_selected' and nodeId 'test-node'
    Then useMindMapStore should call selectNode with 'test-node'
    And the selectedNodeId state should be updated to 'test-node'
    And the UI should reflect the node selection
