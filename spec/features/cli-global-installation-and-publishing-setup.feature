@npm
@phase1
@deployment
@cli
@CLI-001
Feature: CLI Global Installation and Publishing Setup

  """
  Package rename: @mindstrike/cli → @sengac/mindstrike-cli for namespace consistency. Global installation: Uses npm link for development, npm install -g for production. Bootstrap integration: Provides template to fspec tool registry (FEAT-018) for multi-tool bootstrap system. Coverage linking: Maps implementation files (cli/src/commands/*.ts) to test scenarios for traceability. Dependencies: commander.js (CLI framework), @sengac namespace (organization scope). No npm publication yet - preparation only.
  """

  # ========================================
  # EXAMPLE MAPPING CONTEXT
  # ========================================
  #
  # BUSINESS RULES:
  #   1. Package name must follow @sengac namespace pattern (like @sengac/fspec)
  #   2. CLI must be installable globally via npm install -g @sengac/mindstrike-cli
  #   3. Bootstrap file (.claude/commands/mindstrike.md) must exist for AI agent discovery
  #   4. Implementation files must be linked to coverage mappings in feature file
  #   5. Package must be publishable to npm registry (proper metadata, license, repository links)
  #   6. Overview + --help references (like fspec does). Bootstrap file will be created by 'fspec init' via multi-tool bootstrap system (FEAT-018 in fspec project), not by mindstrike CLI itself. Mindstrike CLI just provides template content to fspec's tool registry.
  #   7. @sengac/mindstrike-cli (with -cli suffix). Main project will be @sengac/mindstrike.
  #
  # EXAMPLES:
  #   1. Developer runs 'npm install -g @sengac/mindstrike-cli' and 'mindstrike --help' works immediately
  #   2. Package.json shows name as '@sengac/mindstrike-cli' not '@mindstrike/cli'
  #   3. Bootstrap file at .claude/commands/mindstrike.md contains command overview and --help references
  #   4. Running 'fspec show-coverage cli-command-interface-for-ai-agent-control' shows implementation files linked (not 0 files)
  #   5. Package.json includes repository field pointing to GitHub, proper license (MIT), and keywords for npm search
  #
  # QUESTIONS (ANSWERED):
  #   Q: Should we publish to npm registry immediately, or just prepare package.json for future publication?
  #   A: true
  #
  #   Q: What should the bootstrap file (.claude/commands/mindstrike.md) contain - full command list or just overview with --help references (like fspec does)?
  #   A: true
  #
  #   Q: Should the package name be '@sengac/mindstrike-cli' or '@sengac/mindstrike' (shorter, without -cli suffix)?
  #   A: true
  #
  #   Q: Do we need a separate README.md for the CLI subdirectory, or is package.json description sufficient?
  #   A: true
  #
  # ASSUMPTIONS:
  #   1. No, just prepare package.json for future publication. Not publishing to npm registry yet.
  #   2. No separate README.md needed. Use comprehensive --help system (like fspec does) for all documentation. Package.json description is sufficient for npm listing.
  #
  # ========================================

  Background: User Story
    As a developer or AI agent
    I want to install and use the mindstrike CLI globally on any system
    So that I can control MindStrike programmatically without manual setup

  Scenario: Install CLI globally and verify help works
    Given the CLI package has been built (npm run build in cli/)
    When developer runs 'npm install -g @sengac/mindstrike-cli'
    Then the 'mindstrike' command should be available in PATH
    And running 'mindstrike --help' should display command list
    And the output should include select-node, create-node, get-mindmap, send-message commands


  Scenario: Package name uses @sengac namespace
    Given the CLI package.json exists at cli/package.json
    When developer reads the 'name' field
    Then the name should be '@sengac/mindstrike-cli'
    And the name should NOT be '@mindstrike/cli'


  Scenario: Bootstrap template provided for fspec tool registry
    Given the CLI has a bootstrap template file or configuration
    When fspec init runs with multi-tool bootstrap system (FEAT-018)
    Then bootstrap file should be created at .claude/commands/mindstrike.md
    And the file should contain command overview with --help references
    And the file should NOT contain full command documentation


  Scenario: Implementation files linked to coverage mappings
    Given the feature file cli-command-interface-for-ai-agent-control.feature exists
    And implementation files exist at cli/src/commands/*.ts
    When developer runs 'fspec show-coverage cli-command-interface-for-ai-agent-control'
    Then coverage report should show implementation files mapped
    And implementation file count should NOT be 0
    And should show mappings for select-node.ts, create-node.ts, get-mindmap.ts, send-message.ts


  Scenario: Package metadata prepared for npm publication
    Given the CLI package.json exists at cli/package.json
    When developer inspects package.json fields
    Then repository field should point to GitHub repository
    And license field should be 'MIT'
    And keywords array should include 'cli', 'ai-agent', 'mindstrike'
    And description field should explain CLI purpose
    And package should NOT be published to npm yet (assumption)

