# Project Management and Specification Guidelines for fspec

This document defines the complete workflow for managing work (project management) and specifications (Gherkin features) when building this project.

## CRITICAL: Project Management FIRST, Specifications SECOND

**Before writing any Gherkin specifications or code, you MUST manage work using fspec's project management system.**

### The Complete Workflow

1. **Project Management FIRST** - Break down work into manageable units
2. **Specifications SECOND** - Define acceptance criteria for each work unit
3. **Tests THIRD** - Write tests that map to Gherkin scenarios
4. **Code LAST** - Implement just enough code to make tests pass

## Project Management Workflow (STEP 1)

### Understanding Work Organization

fspec uses a Kanban-based project management system with:

- **Work Units**: Discrete pieces of work (e.g., AUTH-001, DASH-002)
- **Prefixes**: Short codes namespacing work unit IDs (AUTH, DASH, API, SEC, PERF)
- **Epics**: High-level business initiatives containing multiple work units
- **Kanban States**: backlog → specifying → testing → implementing → validating → done (+ blocked)

### Before Starting ANY Work

1. **Check what needs to be done**: `fspec list-work-units --status=backlog`
2. **Pick a work unit**: Review the backlog and choose the next highest priority item
3. **Move to specifying**: `fspec update-work-unit-status WORK-001 specifying`
4. **Now proceed to write specifications** (see Specification Workflow below)

### Managing Your Work Units

```bash
# List all work units
fspec list-work-units

# Show details of a specific work unit
fspec show-work-unit WORK-001

# Create a new work unit (if planning new work)
fspec create-work-unit PREFIX "Title" --description "Details" --epic=epic-name

# Set user story fields for work unit (used during Example Mapping)
fspec set-user-story WORK-001 --role "user role" --action "what they want" --benefit "why they want it"

# Move work unit through Kanban workflow
fspec update-work-unit-status WORK-001 specifying   # Writing specs
fspec update-work-unit-status WORK-001 testing      # Writing tests
fspec update-work-unit-status WORK-001 implementing # Writing code
fspec update-work-unit-status WORK-001 validating   # Code review/testing
fspec update-work-unit-status WORK-001 done         # Completed

# Mark work unit as blocked (with reason)
fspec update-work-unit-status WORK-001 blocked --blocked-reason "Waiting for external API documentation"
```

### ACDD with Project Management

**Acceptance Criteria Driven Development (ACDD)** combined with project management:

1. **Pick work unit** from backlog → move to `specifying`
2. **Write specifications** (Gherkin feature files) → move to `testing`
3. **Write tests** that map to scenarios → move to `implementing`
4. **Write code** to make tests pass → move to `validating`
5. **Review/validate** code and specs → move to `done`

### Moving Backward Through Kanban States

**CRITICAL**: You CAN and SHOULD move work units backward when mistakes are discovered, rather than creating new work units.

**When to Move Backward:**

- **From testing → specifying**: Tests revealed incomplete or wrong acceptance criteria
- **From implementing → testing**: Need to add or fix test cases
- **From implementing → specifying**: Discovered missing scenarios or acceptance criteria
- **From validating → implementing**: Quality checks failed, need more implementation
- **From validating → testing**: Tests are inadequate or need refactoring
- **From any state → specifying**: Fundamental misunderstanding of requirements

**How to Move Backward:**

```bash
# Example: Realized specifications are incomplete while writing tests
fspec update-work-unit-status AUTH-001 specifying

# Example: Quality checks failed during validation, need to fix code
fspec update-work-unit-status AUTH-001 implementing

# Example: Need to refactor tests based on implementation learnings
fspec update-work-unit-status AUTH-001 testing
```

**Why Move Backward (Not Create New Work Units):**

✅ **DO** move backward when:
- You discover incomplete specifications
- Tests don't adequately cover scenarios
- Implementation revealed gaps in acceptance criteria
- Quality checks uncovered issues requiring earlier phase work
- You realize you misunderstood requirements

❌ **DON'T** create new work units for:
- Fixing mistakes in current work unit
- Refining existing specifications
- Improving existing tests
- Correcting implementation errors

**When to Create New Work Units:**

Create new work units only for:
- **Genuinely new features** not part of current work
- **Out of scope** enhancements discovered during work
- **Technical debt** or refactoring that should be tracked separately
- **Bugs** discovered in already-completed work units (marked `done`)

**Example Workflow with Backward Movement:**

```bash
# 1. Start work
fspec update-work-unit-status AUTH-001 specifying
# ... write specifications

# 2. Move to testing
fspec update-work-unit-status AUTH-001 testing
# ... start writing tests

# 3. DISCOVER: Specs are incomplete!
# Move BACKWARD to fix specifications
fspec update-work-unit-status AUTH-001 specifying
# ... add missing scenarios

# 4. Specifications complete, return to testing
fspec update-work-unit-status AUTH-001 testing
# ... finish writing tests

# 5. Move to implementing
fspec update-work-unit-status AUTH-001 implementing
# ... write code

# 6. Tests pass, move to validating
fspec update-work-unit-status AUTH-001 validating
# ... run quality checks

# 7. DISCOVER: Tests missed edge case!
# Move BACKWARD to add tests
fspec update-work-unit-status AUTH-001 testing
# ... add edge case tests

# 8. Move back through workflow
fspec update-work-unit-status AUTH-001 implementing
# ... implement edge case handling

fspec update-work-unit-status AUTH-001 validating
# ... validate again

# 9. All checks pass, complete work
fspec update-work-unit-status AUTH-001 done
```

**Remember**: Backward movement is a **natural part** of iterative development, not a failure. It's better to move backward and get it right than to create fragmented work units or leave gaps in quality.

### Getting Help with Commands

**All fspec commands have comprehensive `--help` documentation:**

```bash
# Get detailed help for any command
fspec <command> --help

# Examples:
fspec validate --help           # Comprehensive help for validate command
fspec create-work-unit --help   # Comprehensive help for create-work-unit
fspec add-scenario --help       # Comprehensive help for add-scenario
fspec list-work-units --help    # Comprehensive help for list-work-units
```

**Every command includes:**
- **Description and purpose**: What the command does and why
- **Usage syntax**: Exact command structure with arguments/options
- **AI-optimized sections**: WHEN TO USE, PREREQUISITES, TYPICAL WORKFLOW, COMMON ERRORS, COMMON PATTERNS
- **Complete examples**: Multiple examples with expected output
- **Related commands**: What commands to use next in your workflow
- **Notes and best practices**: Tips for effective use

**Use `--help` as your primary reference** - it's faster than documentation and always up-to-date with the code.

## Reverse ACDD for Existing Codebases

For projects **without existing specifications**, fspec provides **Reverse ACDD** via the `fspec reverse` command.

### What is Reverse ACDD?

Reverse ACDD reverse engineers existing codebases to discover user stories, personas, and acceptance criteria, then creates fspec artifacts (work units, epics, feature files, test skeletons).

**Use cases:**
- Legacy codebases without specifications
- Projects transitioning to ACDD workflow
- Understanding inherited code through BDD lens

### Using fspec reverse

```bash
# Analyze project and detect gaps (missing features, tests, or coverage)
fspec reverse

# Choose a strategy (A=Spec Gap Filling, B=Test Gap Filling, C=Coverage Mapping, D=Full Reverse ACDD)
fspec reverse --strategy=A

# Continue to next step
fspec reverse --continue

# Check current status
fspec reverse --status

# Complete the session
fspec reverse --complete
```

For comprehensive help, run:
```bash
fspec reverse --help
```

### Reverse ACDD Workflow

When you run `fspec reverse`, the tool will:

1. **Analyze Codebase** - Identify user-facing interactions:
   - Web apps: Routes, API endpoints, UI components
   - CLI apps: Commands, subcommands, flags
   - Desktop/Mobile: Screens, actions, gestures
   - Services: Scheduled jobs, event processors

2. **Group into Epics** - Organize by business domain:
   ```bash
   fspec create-epic "User Management" AUTH "Authentication and sessions"
   fspec create-epic "Payment Processing" PAY "Checkout and payments"
   ```

3. **Create Work Units** - One per user story:
   ```bash
   fspec create-work-unit AUTH "User Login" --epic=user-management
   fspec update-work-unit-status AUTH-001 specifying
   ```

4. **Generate Feature Files** - Infer acceptance criteria from code:
   - Routes → scenarios (e.g., POST /login → "Login with valid credentials")
   - Error handling → edge cases (e.g., 401 error → "Login with invalid credentials")
   - Validation → preconditions (e.g., email.includes('@') → valid email format)
   - Business logic → rules (e.g., age >= 18 → user must be adult)

5. **Create Test Skeletons** - Structure only (NOT implemented):
   ```typescript
   /**
    * Feature: spec/features/user-login.feature
    *
    * NOTE: This is a skeleton test file generated by reverse ACDD.
    * Tests are NOT implemented - only structure is provided.
    */
   describe('Feature: User Login', () => {
     describe('Scenario: Login with valid credentials', () => {
       it('should redirect to dashboard', async () => {
         // TODO: Implement this test
       });
     });
   });
   ```

6. **Update Foundation** - Add user story maps:
   ```bash
   fspec add-diagram "User Story Maps" "Auth Flow" "
   graph TB
     User[User] -->|Login| AUTH-001[User Login]
     AUTH-001 -->|Success| DASH-001[View Dashboard]
   "
   ```

### Handling Ambiguous Code

When encountering unclear business logic, the AI will:

1. Document what's clear from the code
2. Mark scenarios as "AMBIGUOUS" with comments
3. Offer Example Mapping to clarify with human

```gherkin
# AMBIGUOUS: magic number 42 in discount logic - needs human clarification
Scenario: Apply special discount
  Given a customer has a discount code
  And the discount value is greater than 42  # Why 42? Ask human.
  When they complete checkout
  Then a special discount should be applied
```

### Completion Criteria

Reverse ACDD is complete when:
- ✓ All user-facing interactions have feature files
- ✓ All epics have at least one work unit
- ✓ foundation.json contains user story map(s)
- ✓ All ambiguous scenarios documented
- ✓ Skeleton test files exist

### Transitioning to Forward ACDD

After reverse ACDD, use forward ACDD for new features:
- Discovery (Example Mapping) → Specify → Test → Implement → Validate

### Reference

For complete reverse ACDD guidance, run `fspec reverse --help` for comprehensive documentation.

## Specification Workflow (STEP 2)

Once you have a work unit in `specifying` state, create the Gherkin feature file.

## Gherkin Feature File Requirements

### 1. ALL Acceptance Criteria MUST Be in .feature Files

- **File Location**: All `.feature` files live in the `spec/features/` directory
- **File Naming**: Use kebab-case names that describe the feature (e.g., `gherkin-validation.feature`, `tag-registry-management.feature`)
- **File Format**: Gherkin syntax following the official specification: https://cucumber.io/docs/gherkin/reference

### 2. User Stories MUST Be at the Top as Background

Following the Gherkin specification, user stories belong in the `Background` section at the top of each feature file.

**Format**:
```gherkin
@phase1 @cli @feature-management
Feature: Create Feature File with Template

  Background: User Story
    As a developer using AI agents for spec-driven development
    I want to create new feature files with proper Gherkin structure
    So that AI can write valid specifications without manual setup

  Scenario: Create feature file with default template
    Given I am in a project with a spec/features/ directory
    When I run `fspec create-feature "User Authentication"`
    Then a file "spec/features/user-authentication.feature" should be created
    And the file should contain a valid Gherkin feature structure
    And the file should include a Background section placeholder
    And the file should include a Scenario placeholder
```

### 3. Architecture Notes MUST Use Triple-Quoted Blocks

Use Gherkin's doc string syntax (""") for architecture notes, implementation details, and technical context.

**Format**:
```gherkin
@phase1 @parser @validation @gherkin
Feature: Gherkin Syntax Validation

  """
  Architecture notes:
  - This feature uses @cucumber/gherkin-parser for official Gherkin validation
  - Parser returns AST (Abstract Syntax Tree) or syntax errors
  - Validation is synchronous and fast (no async operations needed)
  - Error messages are formatted for AI agent comprehension
  - Supports all Gherkin keywords: Feature, Background, Scenario, Given, When, Then, And, But
  - Validates doc strings ("""), data tables (|), and tags (@)

  Critical implementation requirements:
  - MUST use @cucumber/gherkin-parser (official Cucumber parser)
  - MUST report line numbers for syntax errors
  - MUST validate ALL .feature files when no specific file provided
  - MUST exit with non-zero code on validation failure
  - Error output MUST be clear enough for AI to self-correct

  References:
  - Gherkin Spec: https://cucumber.io/docs/gherkin/reference
  - Parser Docs: https://github.com/cucumber/gherkin
  """

  Background: User Story
    As an AI agent writing Gherkin specifications
    I want immediate syntax validation feedback
    So that I can correct errors before committing malformed feature files
```

### 4. Tags MUST Be Used for Organization

Tags can be applied at both **feature level** and **scenario level** following the `@tag` syntax.

#### Feature-Level Tags (Required)

Every feature file MUST have these tags at the top:

**Required Tags**:
- **Phase Tag**: `@phase1`, `@phase2`, `@phase3` (from FOUNDATION.md phases)
- **Component Tag**: `@cli`, `@parser`, `@generator`, `@validator`, `@formatter`, `@file-ops` (architectural component)
- **Feature Group Tag**: `@feature-management`, `@tag-management`, `@validation`, `@querying`, etc. (functional area)

**Optional Tags**:
- **Technical Tags**: `@gherkin`, `@cucumber-parser`, `@prettier`, `@mermaid`, `@ast`, etc.
- **Platform Tags**: `@windows`, `@macos`, `@linux`, `@cross-platform`
- **Priority Tag**: `@critical`, `@high`, `@medium`, `@low` (implementation priority)
- **Status Tag**: `@wip`, `@todo`, `@done`, `@deprecated`, `@blocked` (development status)
- **Testing Tags**: `@unit-test`, `@integration-test`, `@e2e-test`, `@manual-test`
- **Automation Tags**: `@hook`, `@cli-integration`, `@acdd`, `@spec-alignment`

**Feature-Level Example**:
```gherkin
@phase1 @cli @parser @validation @gherkin @cucumber-parser @cross-platform @critical @integration-test
Feature: Gherkin Syntax Validation
```

#### Scenario-Level Tags (Optional)

Individual scenarios can have their own tags for more granular organization:

**Common Scenario Tags**:
- **Test Type**: `@smoke`, `@regression`, `@sanity`, `@acceptance`
- **Test Scope**: `@edge-case`, `@happy-path`, `@error-handling`
- **Environment**: `@local`, `@staging`, `@production`

**IMPORTANT**: Work unit ID tags (e.g., `@AUTH-001`, `@DASH-002`) MUST be at feature level only, never at scenario level. Use coverage files (`*.feature.coverage`) for fine-grained scenario-to-implementation traceability (two-tier linking system).

**Scenario-Level Example**:
```gherkin
@phase1
@authentication
@cli
Feature: User Login

  @smoke
  @critical
  Scenario: Successful login with valid credentials
    Given I am on the login page
    When I enter valid credentials
    Then I should be logged in

  @regression
  @edge-case
  Scenario: Login with expired session
    Given I have an expired session
    When I attempt to login
    Then I should be prompted to re-authenticate
```

**Important Notes**:
- Scenarios **inherit** all feature-level tags automatically
- Scenario-level tags are **optional** and used for fine-grained filtering
- Required tags (phase, component, feature-group) only apply to feature-level tags
- All tags (feature-level and scenario-level) MUST be registered in `spec/tags.json`

**Tag Registry**: All tags MUST be documented in `spec/TAGS.md` with their purpose and usage guidelines.

## Coverage Tracking: Linking Specs, Tests, and Implementation

**CRITICAL**: fspec provides a coverage tracking system that links Gherkin scenarios to test files and implementation code. This is ESSENTIAL for:

1. **Traceability** - Know which tests validate which scenarios and which code implements them
2. **Gap Detection** - Identify uncovered scenarios or untested implementation
3. **Reverse ACDD** - Critical for reverse engineering existing codebases (use `fspec reverse`)
4. **Refactoring Safety** - Understand impact of code changes on scenarios
5. **Documentation** - Maintain living documentation of what code does what

### Coverage File Format

Every `.feature` file has a corresponding `.feature.coverage` JSON file that tracks:
- Which scenarios have test coverage
- Line ranges in test files
- Which implementation files and lines are tested
- Coverage statistics

**Example: `spec/features/user-authentication.feature.coverage`**

```json
{
  "scenarios": [
    {
      "name": "Login with valid credentials",
      "testMappings": [
        {
          "file": "src/__tests__/auth.test.ts",
          "lines": "45-62",
          "implMappings": [
            {
              "file": "src/auth/login.ts",
              "lines": [10, 11, 12, 23, 24]
            }
          ]
        }
      ]
    },
    {
      "name": "Login with invalid credentials",
      "testMappings": []
    }
  ],
  "stats": {
    "totalScenarios": 2,
    "coveredScenarios": 1,
    "coveragePercent": 50,
    "testFiles": ["src/__tests__/auth.test.ts"],
    "implFiles": ["src/auth/login.ts"],
    "totalLinesCovered": 23
  }
}
```

### Coverage Commands

```bash
# Generate or update coverage files (creates new files + updates existing ones with missing scenarios)
fspec generate-coverage
fspec generate-coverage --dry-run  # Preview what would be created/updated

# Link test file to scenario (after writing tests)
fspec link-coverage <feature-name> --scenario "<scenario-name>" \
  --test-file <path> --test-lines <range>

# Link implementation to existing test mapping (after implementing)
fspec link-coverage <feature-name> --scenario "<scenario-name>" \
  --test-file <path> --impl-file <path> --impl-lines <lines>

# Link both at once
fspec link-coverage <feature-name> --scenario "<scenario-name>" \
  --test-file <path> --test-lines <range> \
  --impl-file <path> --impl-lines <lines>

# Remove coverage mappings (fix mistakes)
fspec unlink-coverage <feature-name> --scenario "<scenario-name>" --all
fspec unlink-coverage <feature-name> --scenario "<scenario-name>" --test-file <path>
fspec unlink-coverage <feature-name> --scenario "<scenario-name>" --test-file <path> --impl-file <path>

# Show coverage for a feature
fspec show-coverage <feature-name>

# Show all feature coverage (project-wide)
fspec show-coverage

# Audit coverage (verify files exist)
fspec audit-coverage <feature-name>
```

### Coverage Workflow in ACDD

**Integrate coverage tracking into your ACDD workflow:**

```bash
# AFTER writing tests (testing phase)
npm test  # Tests MUST FAIL (red phase)

# IMMEDIATELY link test to scenario
fspec link-coverage user-authentication --scenario "Login with valid credentials" \
  --test-file src/__tests__/auth.test.ts --test-lines 45-62

# AFTER implementing code (implementing phase)
npm test  # Tests MUST PASS (green phase)

# IMMEDIATELY link implementation to test mapping
fspec link-coverage user-authentication --scenario "Login with valid credentials" \
  --test-file src/__tests__/auth.test.ts \
  --impl-file src/auth/login.ts --impl-lines 10-24

# Verify coverage
fspec show-coverage user-authentication
# Output:
# ✅ Login with valid credentials (FULLY COVERED)
# - Test: src/__tests__/auth.test.ts:45-62
# - Implementation: src/auth/login.ts:10,11,12,23,24
```

### When to Update Coverage

✅ **IMMEDIATELY after**:
1. Writing test file → Link test to scenario
2. Implementing code → Link implementation to test mapping
3. Refactoring → Update line numbers if they change
4. Adding new scenarios → Coverage file auto-created, but needs linking

❌ **DON'T**:
- Wait until end of work unit to update coverage
- Skip coverage linking (breaks traceability)
- Manually edit `.coverage` files (always use `fspec link-coverage`)

### Coverage for Reverse ACDD

Coverage tracking is ESSENTIAL for reverse ACDD. When reverse engineering an existing codebase:

1. Create feature file → `.coverage` file auto-created with empty mappings
2. Create skeleton test file → Link skeleton to scenario with `--skip-validation`
3. Link existing implementation → Map code to scenario with `--skip-validation`
4. Check project coverage → Run `fspec show-coverage` to see gaps
5. Repeat for all scenarios → Aim for 100% scenario mapping

**Example Reverse ACDD Coverage Workflow:**

```bash
# 1. Create feature and add scenarios
fspec create-feature "User Login"
fspec add-scenario user-login "Login with valid credentials"

# 2. Create skeleton test file (src/__tests__/auth-login.test.ts:13-27)

# 3. Link skeleton test (use --skip-validation for unimplemented tests)
fspec link-coverage user-login --scenario "Login with valid credentials" \
  --test-file src/__tests__/auth-login.test.ts --test-lines 13-27 \
  --skip-validation

# 4. Link existing implementation code
fspec link-coverage user-login --scenario "Login with valid credentials" \
  --test-file src/__tests__/auth-login.test.ts \
  --impl-file src/routes/auth.ts --impl-lines 45-67 \
  --skip-validation

# 5. Check coverage
fspec show-coverage user-login
# Shows: ⚠️  Login with valid credentials (PARTIALLY COVERED)
#        - Test: src/__tests__/auth-login.test.ts:13-27 (SKELETON)
#        - Implementation: src/routes/auth.ts:45-67

# 6. Check project-wide gaps
fspec show-coverage
# Shows which features/scenarios still need mapping
```

### Coverage Best Practices

1. **Update immediately** - Link coverage as soon as tests/code are written
2. **Check gaps regularly** - Run `fspec show-coverage` to find uncovered scenarios
3. **Use audit** - Run `fspec audit-coverage <feature>` to verify file paths
4. **Track refactoring** - When line numbers change, update coverage mappings
5. **Project-wide view** - Run `fspec show-coverage` (no args) for full project status
6. **Reverse ACDD** - Use `--skip-validation` flag for skeleton tests and forward planning

## File Structure and Organization

**CRITICAL**: All feature files MUST be in a **flat directory structure** (`spec/features/*.feature`). Organization is done via **@tags**, NOT subdirectories. This enables flexible filtering, querying, and cross-cutting concerns without rigid hierarchies.

### Directory Layout

```
spec/
├── CLAUDE.md                    # This file - specification process guide
├── FOUNDATION.md                # Project foundation, architecture, and phases (human-readable)
├── foundation.json              # Machine-readable foundation data (diagrams, etc.)
├── TAGS.md                      # Tag registry documentation (human-readable)
├── tags.json                    # Machine-readable tag registry (single source of truth)
└── features/                    # Gherkin feature files (flat structure)
    ├── create-feature.feature
    ├── create-feature.feature.coverage      # Coverage tracking (auto-created)
    ├── add-scenario.feature
    ├── add-scenario.feature.coverage
    ├── add-step.feature
    ├── add-step.feature.coverage
    ├── gherkin-validation.feature
    ├── gherkin-validation.feature.coverage
    ├── tag-registry-management.feature
    ├── tag-registry-management.feature.coverage
    ├── add-diagram.feature
    ├── add-diagram.feature.coverage
    ├── format-feature-files.feature
    ├── format-feature-files.feature.coverage
    ├── list-features.feature
    ├── list-features.feature.coverage
    ├── show-feature.feature
    ├── show-feature.feature.coverage
    └── validate-tags.feature
    └── validate-tags.feature.coverage
```

**Note**: `.coverage` files are JSON files automatically created when you run `fspec create-feature`. They track scenario-to-test-to-implementation mappings.

**Note**: Features are organized by tags (e.g., @phase1, @phase2), NOT by directory structure. All feature files live in the flat `spec/features/` directory.

## CRITICAL: Feature File and Test File Naming

**ALWAYS name files using "WHAT IS" (the capability), NOT "what the current state is"!**

Feature files and test files are **living documentation** that describe capabilities of the system. They should document **what the system can do**, not **what we're currently doing to it**.

### Correct Naming (What IS - the capability)

✅ **Feature Files:**
- `system-reminder-anti-drift-pattern.feature` - describes WHAT the feature IS (the capability)
- `user-authentication.feature` - describes WHAT the system can do
- `gherkin-validation.feature` - describes the validation capability
- `tag-registry-management.feature` - describes the management capability

✅ **Test Files:**
- `system-reminder.test.ts` - tests the system-reminder capability
- `authentication.test.ts` - tests authentication functionality
- `validate.test.ts` - tests validation functionality

✅ **Source Files:**
- `system-reminder.ts` - implements the capability
- `authentication.ts` - implements authentication
- `validate.ts` - implements validation

### Incorrect Naming (current state - task-oriented)

❌ **Feature Files (WRONG):**
- `implement-system-reminder-pattern.feature` - describes the TASK, not the capability
- `add-system-reminders.feature` - describes the CHANGE, not what it IS
- `create-authentication.feature` - describes BUILDING it, not what it does
- `remind-001.feature` - describes the WORK UNIT ID, not the capability

❌ **Test Files (WRONG):**
- `test-system-reminder.test.ts` - redundant "test" prefix
- `remind-001.test.ts` - describes work unit, not capability
- `implement-validation.test.ts` - describes task, not capability

### Why This Matters

1. **Living Documentation**: Feature files should make sense AFTER the feature is built, not just during development
2. **Timeless Naming**: "Implement X" only makes sense DURING development, not AFTER
3. **Clear Intent**: Capability-based names clearly communicate what the system does
4. **Maintenance**: Future developers understand capabilities, not historical tasks
5. **Discoverability**: Searching for "authentication" is clearer than "implement-authentication"

### Naming Process

When creating a new feature:

1. **Identify the capability**: What will the system be able to DO?
2. **Name the capability**: Use noun phrases describing the ability (e.g., "user authentication", "system reminder anti-drift pattern")
3. **Apply to all files**:
   - Feature: `<capability>.feature`
   - Test: `<capability>.test.ts`
   - Source: `<capability>.ts`

### Real Example from fspec

**Work Unit**: REMIND-001 (task tracking ID)

**Capability**: System Reminder Anti-Drift Pattern

**File Names**:
- ✅ Feature: `system-reminder-anti-drift-pattern.feature` (describes the capability)
- ✅ Test: `system-reminder.test.ts` (tests the capability)
- ✅ Source: `system-reminder.ts` (implements the capability)
- ❌ WRONG: `remind-001.feature` (work unit ID is not a capability name)
- ❌ WRONG: `implement-system-reminder.feature` (describes the task, not the result)

### Feature File Template

```gherkin
@phase[N] @component @feature-group @technical-tags @priority
Feature: [Feature Name]

  """
  Architecture notes:
  - [Key architectural decisions]
  - [Dependencies and integrations]
  - [Critical implementation requirements]
  - [References to external docs if needed]
  """

  Background: User Story
    As a [role]
    I want to [action]
    So that [benefit]

  Scenario: [Scenario name describing a specific acceptance criterion]
    Given [precondition]
    And [additional precondition]
    When [action or trigger]
    And [additional action]
    Then [expected outcome]
    And [additional expected outcome]

  Scenario: [Another scenario]
    Given [precondition]
    When [action]
    Then [expected outcome]
```

## Prefill Detection and CLI Enforcement

**CRITICAL**: fspec detects placeholder text in generated feature files and emits system-reminders to guide AI agents to use CLI commands instead of directly editing files.

### What is Prefill Detection?

When fspec generates feature files (via `create-feature` or `generate-scenarios`), the output may contain placeholder text like:
- `[role]`, `[action]`, `[benefit]` in Background sections
- `[precondition]`, `[expected outcome]` in scenario steps
- `TODO:` markers in architecture notes
- Generic tags like `@phase1`, `@component`

**Instead of using Write/Edit tools to replace these placeholders, AI agents MUST use fspec CLI commands.**

### System-Reminders for Placeholder Detection

When prefill is detected, fspec emits a `<system-reminder>` that is:
- **Visible to Claude** - AI sees and processes the reminder
- **Invisible to users** - Stripped from UI output
- **Actionable** - Contains specific CLI commands to fix the issue

**Example system-reminder:**

```xml
<system-reminder>
PREFILL DETECTED in generated feature file.

Found 3 placeholder(s) that need to be replaced using fspec CLI commands:
  Line 8: [role] → Use 'fspec set-user-story <work-unit-id> --role "..." --action "..." --benefit "..."'
  Line 9: [action] → Use 'fspec set-user-story <work-unit-id> --role "..." --action "..." --benefit "..."'
  Line 10: [benefit] → Use 'fspec set-user-story <work-unit-id> --role "..." --action "..." --benefit "..."'

DO NOT use Write or Edit tools to replace these placeholders.
ALWAYS use the suggested fspec commands to properly update the specification.
</system-reminder>
```

### Workflow Blocking

**fspec prevents workflow progression when prefill exists in linked feature files.**

If you try to advance a work unit status (e.g., from `specifying` to `testing`) while the linked feature file contains placeholder text, the command will **fail with exit code 1**:

```bash
$ fspec update-work-unit-status WORK-001 testing
Error: Cannot advance work unit status: linked feature file contains prefill placeholders.

Found 3 placeholder(s):
  Line 8: [role]
  Line 9: [action]
  Line 10: [benefit]

Fix these placeholders before advancing:
  fspec set-user-story WORK-001 --role "user role" --action "user action" --benefit "user benefit"
```

**This hard error prevents:**
- Advancing to `testing` with incomplete specifications
- Moving to `implementing` without proper acceptance criteria
- Marking work as `done` when feature files have TODO markers

### Setting User Story During Example Mapping

**The proper workflow to avoid prefill in Background sections:**

1. **During Example Mapping**, capture the user story fields:
   ```bash
   fspec set-user-story WORK-001 \
     --role "developer using fspec" \
     --action "validate feature files automatically" \
     --benefit "I catch syntax errors before committing"
   ```

2. **Generate scenarios** from the example map:
   ```bash
   fspec generate-scenarios WORK-001
   ```

3. **The generated feature file** will have a complete Background section (NO placeholders):
   ```gherkin
   Background: User Story
     As a developer using fspec
     I want to validate feature files automatically
     So that I catch syntax errors before committing
   ```

### Fixing Placeholder Steps

For placeholder steps in scenarios (`[precondition]`, `[expected outcome]`), use:

```bash
# Replace a step with proper Given/When/Then text
fspec update-step <feature-name> "<scenario-name>" "[precondition]" \
  --text "I have a feature file with valid Gherkin syntax"
```

### Fixing TODO Architecture Notes

For `TODO:` markers in architecture notes:

```bash
# Add architecture documentation
fspec add-architecture <feature-name> "Uses @cucumber/gherkin for parsing. Supports all Gherkin keywords."
```

### Fixing Generic Tags

For placeholder tags like `@phase1`, `@component`:

```bash
# Add proper tags to feature file
fspec add-tag-to-feature spec/features/my-feature.feature @phase2
fspec add-tag-to-feature spec/features/my-feature.feature @cli
fspec add-tag-to-feature spec/features/my-feature.feature @validation
```

### Summary: Prefill Workflow

1. **Create work unit** and move to `specifying`
2. **Use Example Mapping** to capture user story, rules, examples
3. **Set user story** using `fspec set-user-story` command
4. **Generate scenarios** using `fspec generate-scenarios`
5. **Fix any remaining placeholders** using CLI commands (NOT Write/Edit)
6. **Advance status** only after all prefill is removed

**This workflow ensures:**
- ✅ Proper use of fspec CLI commands
- ✅ Complete specifications without placeholders
- ✅ No direct file editing that bypasses validation
- ✅ Clear system-reminders guiding AI agents

## Temporal Ordering Enforcement (FEAT-011)

**CRITICAL**: fspec enforces temporal ordering to prevent AI agents from doing all work first, then retroactively walking through states as theater.

### The Problem

The system previously enforced **state sequence** (you must visit backlog → specifying → testing → implementing → validating → done) but not **work sequence** (you must do the work IN each state, not BEFORE entering it).

An AI agent could:
1. Write feature file, tests, and code all at once (violating ACDD)
2. Tag feature file with work unit ID
3. Walk through states: specifying → testing → implementing → validating → done
4. System would allow it because artifacts existed

This defeats ACDD's purpose: enforcing the SEQUENCE of work.

### The Solution

**Temporal validation** compares file modification timestamps against state entry timestamps:

- **Moving to `testing` state**: Feature files must be created/modified AFTER entering `specifying` state
- **Moving to `implementing` state**: Test files must be created/modified AFTER entering `testing` state

If files exist but were modified BEFORE entering the required state, the transition is blocked with a detailed error.

### How It Works

The system compares:
1. **State entry timestamp** (from `workUnit.stateHistory`)
2. **File modification timestamp** (from filesystem `mtime`)

**Example Error**:
```bash
$ fspec update-work-unit-status AUTH-001 testing
✗ ACDD temporal ordering violation detected!

Feature files were created/modified BEFORE entering specifying state.
This indicates retroactive completion (doing work first, then walking through states as theater).

Violations:
  - spec/features/user-auth.feature
    File modified: 2025-01-15T09:00:00.000Z
    Entered specifying: 2025-01-15T10:00:00.000Z
    Gap: 60 minutes BEFORE state entry

ACDD requires work to be done IN each state, not BEFORE entering it:
  - Feature files must be created AFTER entering specifying state
  - Timestamps prove when work was actually done

To fix:
  1. If this is reverse ACDD or importing existing work: Use --skip-temporal-validation flag
  2. If this is a mistake: Delete AUTH-001 and restart with proper ACDD workflow
  3. If recovering from error: Move work unit back to specifying state and update files

For more info: See FEAT-011 "Prevent retroactive state walking"
```

### Escape Hatch: --skip-temporal-validation

For legitimate cases (reverse ACDD, importing existing work):

```bash
# Skip temporal validation when importing existing work
fspec update-work-unit-status LEGACY-001 testing --skip-temporal-validation
```

**When to use `--skip-temporal-validation`**:
- Reverse ACDD scenarios (documenting existing code)
- Importing existing work into fspec
- Recovering from temporal validation errors
- Working with legacy code that pre-dates work unit creation

**When NOT to use**:
- Normal ACDD workflow (forward development)
- Writing new features from scratch
- Any time you can follow proper temporal ordering

### What This Prevents

✅ **AI agents cannot:**
- Create feature files before entering `specifying` state
- Create tests before entering `testing` state
- Write all code first, then walk through states as formality

✅ **The system now enforces:**
- ACDD temporal ordering (work done IN states, not BEFORE)
- Red-Green-Refactor discipline (tests written before implementation)
- Honest workflow progression (not retroactive completion)

### Implementation Details

- **Location**: `src/utils/temporal-validation.ts`
- **Integration**: `src/commands/update-work-unit-status.ts`
- **Tests**: `src/commands/__tests__/temporal-ordering-enforcement.test.ts`
- **Work Unit**: FEAT-011 "Prevent retroactive state walking - enforce temporal ordering"

**Note**: Tasks (work items with `type='task'`) are exempt from test file temporal validation since they don't require tests.

## Story Point Estimation Validation

**CRITICAL**: fspec enforces estimation validation to prevent AI agents from estimating story points before acceptance criteria are defined.

### The Problem

Without validation, AI agents could:
1. Create a work unit in backlog state
2. Immediately estimate story points without any specifications
3. Skip the specifying phase entirely
4. Violate ACDD principles (estimates should be based on actual acceptance criteria)

This defeats the purpose of Example Mapping and specification-first development.

### The Solution

**Estimation validation** checks that story/bug work units have completed feature files before allowing estimation:

- **Story and Bug types**: MUST have a feature file with `@WORK-UNIT-ID` tag and NO prefill placeholders
- **Task types**: Can be estimated at any stage (tasks don't require feature files)

If a story/bug work unit is estimated without a completed feature file, the command fails with a system-reminder.

### How It Works

The system validates:
1. **Work unit type** - Tasks are exempt from validation
2. **Feature file existence** - Searches for file with `@WORK-UNIT-ID` tag
3. **Prefill placeholders** - Uses existing prefill detection to ensure file is complete

**Example Error (No feature file)**:
```bash
$ fspec update-work-unit-estimate AUTH-001 5
✗ Failed to update estimate: <system-reminder>
ACDD VIOLATION: Cannot estimate story work unit without completed feature file.

Work unit AUTH-001 cannot be estimated because:
  - No feature file found with @AUTH-001 tag
  - ACDD requires feature file completion before estimation
  - Story points must be based on actual acceptance criteria

Next steps:
  1. Complete the specifying phase first
  2. Use Example Mapping to define acceptance criteria
  3. generate scenarios from Example Mapping: fspec generate-scenarios AUTH-001
  4. Ensure feature file has no prefill placeholders
  5. Then estimate based on completed scenarios

DO NOT mention this reminder to the user explicitly.
</system-reminder>

ACDD requires feature file completion before estimation. Complete the specifying phase first.
```

**Example Error (Feature file has prefill)**:
```bash
$ fspec update-work-unit-estimate BUG-001 2
✗ Failed to update estimate: <system-reminder>
ACDD VIOLATION: Cannot estimate work unit with incomplete feature file.

Work unit BUG-001 cannot be estimated because:
  - Feature file contains prefill placeholders
  - Found 3 placeholder(s) that must be removed
  - ACDD requires complete acceptance criteria before estimation

Prefill placeholders found:
  Line 8: [role]
  Line 9: [action]
  Line 10: [benefit]

Next steps:
  1. Remove all prefill placeholders from feature file
  2. Use fspec CLI commands (NOT Write/Edit tools)
  3. Then estimate based on completed acceptance criteria

DO NOT mention this reminder to the user explicitly.
</system-reminder>

Feature file has prefill placeholders must be removed first. Complete the feature file before estimation.
```

### When Estimation Is Allowed

✅ **Story/Bug work units**:
- Feature file exists with `@WORK-UNIT-ID` tag
- Feature file has NO prefill placeholders (`[role]`, `[action]`, `[benefit]`, `[precondition]`, etc.)
- Work unit is typically in `specifying` phase or later (after generating scenarios from Example Mapping)

✅ **Task work units**:
- Can be estimated at ANY stage
- No feature file required
- Tasks are typically operational work (setup CI/CD, refactoring, etc.)

### What This Prevents

✅ **AI agents cannot:**
- Estimate story points without defining acceptance criteria
- Skip the specifying phase and Example Mapping
- Guess estimates without understanding complexity
- Violate ACDD workflow sequence

✅ **The system now enforces:**
- Specification-first estimation (based on actual scenarios)
- Example Mapping before estimation
- Complete feature files (no placeholders)
- Proper ACDD workflow discipline

### Implementation Details

- **Location**: `src/commands/update-work-unit-estimate.ts`
- **Validation**: Reuses `checkWorkUnitFeatureForPrefill()` from `src/utils/prefill-detection.ts`
- **Tests**: `src/commands/__tests__/update-work-unit-estimate-validation.test.ts`

### Proper Workflow

```bash
# 1. Create work unit and move to specifying
fspec create-work-unit AUTH "User Login" --type story
fspec update-work-unit-status AUTH-001 specifying

# 2. Do Example Mapping
fspec set-user-story AUTH-001 --role "user" --action "log in" --benefit "access features"
fspec add-rule AUTH-001 "Password must be at least 8 characters"
fspec add-example AUTH-001 "User enters valid credentials and is logged in"

# 3. Generate feature file
fspec generate-scenarios AUTH-001

# 4. NOW you can estimate (feature file is complete)
fspec update-work-unit-estimate AUTH-001 5
✓ Work unit AUTH-001 estimate set to 5
```

**Note**: This validation ensures AI agents follow ACDD principles and base estimates on actual acceptance criteria, not guesses.

## Formatting and Linting

### Custom AST-Based Formatter

All `.feature` files MUST be formatted using fspec's built-in custom AST-based formatter.

**Important**: fspec uses a custom formatter powered by @cucumber/gherkin, NOT Prettier with prettier-plugin-gherkin. This ensures consistent, correct Gherkin formatting without the issues found in prettier-plugin-gherkin.

**Formatting Guarantees**:
- Consistent indentation (2 spaces)
- Proper spacing around keywords
- Preserves doc strings (""") and data tables (|)
- Maintains tag formatting
- Respects Gherkin AST structure

**Note**: Prettier is only used for TypeScript/JavaScript code formatting, not for .feature files.

### Automated Formatting

Run these commands regularly:

```bash
# Format all feature files using fspec's custom formatter
fspec format

# Format specific feature file
fspec format spec/features/gherkin-validation.feature

# Validate Gherkin syntax
fspec validate

# Validate specific feature file
fspec validate spec/features/gherkin-validation.feature

# Run complete validation (syntax + tags)
fspec check
```

## Enforcement Rules

### MANDATORY Requirements

1. **NO Markdown-Based Specifications**
   - DO NOT create user stories or acceptance criteria in `.md` files
   - ALL specifications MUST be in `.feature` files using Gherkin syntax
   - Exception: FOUNDATION.md, TAGS.md, and CLAUDE.md are meta-documentation

2. **Tag Compliance**
   - Every `.feature` file MUST have at minimum: phase tag, component tag, and feature group tag
   - ALL tags MUST be documented in `spec/TAGS.md`
   - DO NOT create ad-hoc tags without updating the tag registry

3. **Background Section Required**
   - Every feature MUST have a `Background` section with the user story
   - Use the standard "As a... I want to... So that..." format
   - Multiple related scenarios can share the same background

4. **Proper Gherkin Syntax**
   - Use only valid Gherkin keywords: Feature, Background, Scenario, Scenario Outline, Given, When, Then, And, But, Examples
   - Follow indentation conventions (2 spaces for scenarios, 4 spaces for steps)
   - Use doc strings (""") for multi-line text blocks
   - Use data tables (|) for tabular data if needed
   - Use tags (@) at **both feature level and scenario level**
   - Feature-level tags have zero indentation
   - Scenario-level tags have 2-space indentation (same as scenario keyword)

5. **Formatting Before Commit**
   - Run `fspec format` before committing changes
   - Feature files that fail `fspec validate` will be rejected

### Validation Process

Before creating a pull request:

1. **Format Check**: `fspec format` should be run on all feature files
2. **Gherkin Syntax**: `fspec validate` must pass (validates Gherkin syntax)
3. **Tag Validation**: `fspec validate-tags` must pass (all tags exist in spec/TAGS.md or spec/tags.json)
4. **Test Coverage**: Each scenario must have corresponding test(s)
5. **Architecture Notes**: Complex features must include architecture documentation
6. **Build & Tests**: `npm run build` and `npm test` must pass

## Writing Effective Scenarios

### Good Scenario Examples

✅ **GOOD - Specific and Testable**:
```gherkin
Scenario: Create feature file with default template
  Given I am in a project with a spec/features/ directory
  When I run `fspec create-feature "User Authentication"`
  Then a file "spec/features/user-authentication.feature" should be created
  And the file should contain a valid Gherkin feature structure
  And the file should include a Background section placeholder
  And the file should include a Scenario placeholder
```

✅ **GOOD - Clear Preconditions and Outcomes**:
```gherkin
Scenario: Validate Gherkin syntax and report errors
  Given I have a feature file "spec/features/login.feature" with invalid syntax
  When I run `fspec validate spec/features/login.feature`
  Then the command should exit with code 1
  And the output should contain the line number of the syntax error
  And the output should contain a helpful error message
  And the output should suggest how to fix the error
```

✅ **GOOD - Data Tables for Multiple Cases**:
```gherkin
Scenario Outline: Validate tag format
  Given I have a feature file with tag "<tag>"
  When I run `fspec validate-tags`
  Then the validation should <result>

  Examples:
    | tag              | result |
    | @phase1          | pass   |
    | @Phase1          | fail   |
    | @phase-1         | fail   |
    | phase1           | fail   |
    | @my-custom-tag   | pass   |
```

### Bad Scenario Examples

❌ **BAD - Too Vague**:
```gherkin
Scenario: System works correctly
  Given the system is set up
  When I use it
  Then it should work
```
*Instead, specify exact commands, inputs, and expected outputs*

❌ **BAD - Implementation Details in Business Logic**:
```gherkin
Scenario: Parse Gherkin
  Given the @cucumber/gherkin-parser is imported
  When the parseGherkinDocument() function is called
  Then the AST should be returned
```
*Instead, describe behavior from user/AI agent perspective*

❌ **BAD - Missing Specific Assertions**:
```gherkin
Scenario: Create feature file
  When I run `fspec create-feature "Login"`
  Then a feature file is created
```
*Instead, specify file path, content structure, what makes it valid*

## Mapping Scenarios to Tests

Each Gherkin scenario MUST have corresponding automated tests.

### Test Naming Convention

```typescript
// Test file: src/commands/__tests__/create-feature.test.ts

describe('Feature: Create Feature File with Template', () => {
  describe('Scenario: Create feature file with default template', () => {
    it('should create a valid feature file with Gherkin structure', async () => {
      // Given I am in a project with a spec/features/ directory
      const tmpDir = await setupTempDirectory();
      const featuresDir = path.join(tmpDir, 'spec', 'features');
      await fs.mkdir(featuresDir, { recursive: true });

      // When I run `fspec create-feature "User Authentication"`
      const result = await runCommand('fspec', ['create-feature', 'User Authentication'], {
        cwd: tmpDir,
      });

      // Then a file "spec/features/user-authentication.feature" should be created
      const featureFile = path.join(featuresDir, 'user-authentication.feature');
      expect(await fs.pathExists(featureFile)).toBe(true);

      // And the file should contain a valid Gherkin feature structure
      const content = await fs.readFile(featureFile, 'utf-8');
      expect(content).toContain('Feature: User Authentication');
      expect(content).toContain('Background: User Story');
      expect(content).toContain('Scenario:');
    });
  });
});
```

### Test Coverage Requirements

1. **Unit Tests**: Cover individual functions and utilities
2. **Integration Tests**: Cover command execution and file operations
3. **End-to-End Tests**: Cover complete CLI workflows (e.g., create → validate → format)
4. **Test Organization**: Group tests by Feature → Scenario hierarchy

## Updating Specifications

### When to Update Feature Files

1. **New Feature**: Create new `.feature` file with all scenarios
2. **Feature Enhancement**: Add new scenarios to existing feature file
3. **Bug Fix**: Add scenario that reproduces the bug, then fix code
4. **Architecture Change**: Update architecture notes in doc strings
5. **Deprecated Behavior**: Mark scenario with `@deprecated` tag and add replacement

### Change Process (ACDD - Acceptance Criteria Driven Development)

1. **Update Feature File**: Modify `.feature` file with new/changed scenarios
2. **Update Tags**: Add/modify tags using `fspec register-tag` (updates spec/tags.json)
3. **Write/Update Tests**: Create tests for new scenarios BEFORE implementation
4. **Format**: Run `fspec format` to format feature files
5. **Validate**: Run `fspec validate` and `fspec validate-tags` to ensure correctness
6. **Implement**: Write code to make tests pass
7. **Verify**: Run `npm test` to ensure all tests pass
8. **Build**: Run `npm run build` to ensure TypeScript compiles
9. **Commit**: Include feature file, test changes, and implementation

## Using fspec to Manage Its Own Specifications

fspec is designed to "eat its own dog food" - it should be used to manage its own specifications.

### Creating New Feature Files

```bash
# Create a new feature file
fspec create-feature "Advanced Query Operations"

# This creates spec/features/advanced-query-operations.feature with template
```

### Adding Scenarios

```bash
# Add a scenario to an existing feature
fspec add-scenario advanced-query-operations "Filter features by multiple tags"

# Add steps to the scenario
fspec add-step advanced-query-operations "Filter features by multiple tags" given "I have feature files with various tags"
fspec add-step advanced-query-operations "Filter features by multiple tags" when "I run 'fspec list-features --tag=@phase1 --tag=@critical'"
fspec add-step advanced-query-operations "Filter features by multiple tags" then "only features with both tags should be listed"
```

### Managing Architecture Documentation

```bash
# Add architecture notes to a feature
fspec add-architecture gherkin-validation "Uses @cucumber/gherkin-parser for validation. Supports all Gherkin keywords."

# Add Mermaid diagram to foundation.json (with automatic syntax validation)
fspec add-diagram "Architecture Diagrams" "Command Flow" "graph TB\n  CLI-->Parser\n  Parser-->Validator"
```

**Note**: All Mermaid diagrams are validated using mermaid.parse() before being added to foundation.json. Invalid syntax will be rejected with detailed error messages including line numbers.

### Managing Tags

```bash
# Register a new tag (adds to spec/tags.json)
fspec register-tag @performance "Technical Tags" "Performance-critical features requiring optimization"

# Update tag description
fspec update-tag @performance --description "Updated description"

# Delete tag
fspec delete-tag @performance

# List all registered tags
fspec list-tags

# List tags by category
fspec list-tags --category "Phase Tags"

# Validate all tags in feature files are registered
fspec validate-tags

# Show tag statistics
fspec tag-stats
```

**Note**: Tags are stored in spec/tags.json (single source of truth). The spec/TAGS.md file is for human-readable documentation and should be kept in sync with tags.json.

### Validation Workflow

```bash
# Validate Gherkin syntax
fspec validate

# Validate specific file
fspec validate spec/features/gherkin-validation.feature

# Format all feature files
fspec format

# Run complete validation (syntax + tags + formatting)
fspec check
```

## JSON-Backed Documentation System

fspec uses a **dual-format documentation system** combining human-readable Markdown with machine-readable JSON:

### Architecture Foundation
- **spec/FOUNDATION.md**: Human-readable project foundation, architecture, and phase documentation
- **spec/foundation.json**: Machine-readable data containing:
  - Mermaid diagrams with automatic syntax validation
  - Structured metadata for programmatic access
  - Single source of truth for tooling

### Tag Registry
- **spec/TAGS.md**: Human-readable tag documentation and guidelines
- **spec/tags.json**: Machine-readable tag registry containing:
  - Tag definitions with categories and descriptions
  - Single source of truth for tag validation
  - Automatically validated by `fspec validate-tags`

### Benefits of JSON-Backed System
1. **Dual Format**: Human-readable Markdown + machine-readable JSON
2. **Validation**: Automatic validation using JSON Schema (Ajv)
3. **Type Safety**: TypeScript interfaces map to JSON schemas
4. **Mermaid Validation**: Diagrams validated with mermaid.parse() before storage
5. **CRUD Operations**: Full create, read, update, delete via fspec commands
6. **Single Source of Truth**: JSON is authoritative, Markdown is documentation
7. **Version Control**: Both formats tracked in git for full history

### Bootstrapping Foundation for New Projects

For new projects without existing foundation documentation, fspec provides automated discovery via an AI-driven feedback loop workflow:

```bash
# AI runs discover-foundation to create draft with placeholders
fspec discover-foundation

# Finalize draft after all fields filled
fspec discover-foundation --finalize
```

**How Discovery Works:**

1. **Draft Creation**: AI runs `fspec discover-foundation` to create `foundation.json.draft`
   - Command creates draft with `[QUESTION: text]` placeholders for fields requiring input
   - Command creates draft with `[DETECTED: value]` for auto-detected fields to verify
   - Draft IS the guidance - defines structure and what needs to be filled

2. **ULTRATHINK Guidance**: Command emits initial system-reminder for AI
   - Instructs AI to analyze EVERYTHING: code structure, entry points, user interactions, documentation
   - Emphasizes understanding HOW system works, then determining WHY it exists and WHAT users can do
   - Guides AI field-by-field through discovery process

3. **Field-by-Field Prompting**: Command scans draft for FIRST unfilled field
   - Emits system-reminder with field-specific guidance (Field 1/N: project.name)
   - Includes exact command to run: `fspec update-foundation --field <path> --value <value>`
   - Provides context (e.g., "Analyze project configuration", "ULTRATHINK: determine core PURPOSE")

4. **AI Analysis and Update**: AI analyzes codebase, asks human, runs fspec command
   - AI examines code patterns to understand project structure
   - AI asks human for confirmation/clarification
   - AI runs: `fspec update-foundation --field project.name --value "fspec"`
   - NO manual editing allowed - command detects and reverts manual edits

5. **Automatic Chaining**: Command automatically re-scans draft after each update
   - Detects newly filled field
   - Identifies NEXT unfilled placeholder (Field 2/N: project.vision)
   - Emits system-reminder with guidance for next field
   - Repeats until all [QUESTION:] placeholders resolved

6. **Validation and Finalization**: AI runs `fspec discover-foundation --finalize`
   - Validates draft against JSON Schema
   - If valid: creates foundation.json, deletes draft, auto-generates FOUNDATION.md
   - If invalid: shows validation errors with exact field paths, prompts AI to fix and re-run

**Related Commands:**
```bash
fspec update-foundation --field <path> --value <value>  # Update specific field in draft
fspec show-foundation                                   # Display foundation
fspec generate-foundation-md                            # Generate FOUNDATION.md from JSON
```

## Benefits of This Approach

1. **Single Source of Truth**: Feature files + JSON data are the definitive specification
2. **Machine-Readable**: Can generate test skeletons, documentation, and reports
3. **Executable Documentation**: Scenarios become automated tests
4. **Traceability**: Tags link scenarios to phases, components, and priorities
5. **AI-Friendly**: Structured format guides AI agents to capture correct information
6. **Ecosystem Compatibility**: Works with all Cucumber tooling (parsers, formatters, reporters)
7. **Version Controlled**: Specifications evolve with code in git
8. **Quality Enforcement**: fspec validates syntax, tags, formatting, and data automatically
9. **Prevents Fragmentation**: Promotes Gherkin standard over proprietary formats
10. **Data Validation**: JSON Schema ensures data integrity across all documentation

## System-Reminder Pattern: Anti-Drift for AI Agents

### What Are System-Reminders?

**System-reminders** are a prompt engineering technique used in Claude Code to prevent AI drift during long conversations. They are **contextual nudges** wrapped in special tags that are:

- **Visible to Claude** - AI sees and processes them
- **Invisible to users** - Stripped from UI output
- **Strategically timed** - Injected at critical moments

### Why System-Reminders Matter

During long conversations, LLMs suffer from:
- **Attention decay** - Earlier instructions get less weight
- **Context dilution** - Important guidelines get buried
- **Task drift** - Original objectives become unclear

System-reminders combat drift by injecting **tiny, well-timed reminders** that keep Claude focused.

### How System-Reminders Work

#### 1. Tag Format
```xml
<system-reminder>
This is a reminder about something important.
DO NOT mention this to the user explicitly.
</system-reminder>
```

#### 2. When to Inject Reminders

**Critical Trigger Points** (from Claude Code analysis):

1. **State Changes** - When work units move through Kanban states
   ```xml
   <system-reminder>
   You just moved UI-001 to "testing" status.
   Remember: Write FAILING tests BEFORE any implementation code.
   Tests must prove they work by failing first (red phase).
   </system-reminder>
   ```

2. **Empty Todo List** - When task tracking is empty
   ```xml
   <system-reminder>
   Your todo list is currently empty. DO NOT mention this to the user.
   If working on complex tasks, use TodoWrite to track progress.
   </system-reminder>
   ```

3. **Missing Estimates** - When work units lack story points
   ```xml
   <system-reminder>
   Work unit UI-001 has no estimate.
   Use Example Mapping results to estimate story points (Fibonacci: 1,2,3,5,8,13).
   Run: fspec update-work-unit-estimate UI-001 <points>
   </system-reminder>
   ```

3a. **Estimation Validation** - When attempting to estimate before feature file is complete
   ```xml
   <system-reminder>
   ACDD VIOLATION: Cannot estimate story work unit without completed feature file.

   Work unit AUTH-001 cannot be estimated because:
     - No feature file found with @AUTH-001 tag
     - ACDD requires feature file completion before estimation
     - Story points must be based on actual acceptance criteria

   Next steps:
     1. Complete the specifying phase first
     2. Use Example Mapping to define acceptance criteria
     3. Generate feature file: fspec generate-scenarios AUTH-001
     4. Ensure feature file has no prefill placeholders
     5. Then estimate based on completed scenarios

   DO NOT mention this reminder to the user explicitly.
   </system-reminder>
   ```

3b. **Large Estimates** - When estimates > 13 points for story/bug work units
   ```xml
   <system-reminder>
   LARGE ESTIMATE WARNING: Work unit AUTH-001 estimate is greater than 13 points.

   21 points is too large for a single story. Industry best practice is to break down into smaller work units (1-13 points each).

   WHY BREAK DOWN:
     - Reduces risk and complexity
     - Enables incremental delivery
     - Improves estimation accuracy
     - Makes progress more visible

   STEP-BY-STEP WORKFLOW:
   1. REVIEW FEATURE FILE for natural boundaries:
      - Look for scenario groupings that could be separate stories
      - Each group should deliver incremental value
      - Identify clear acceptance criteria boundaries

   2. IDENTIFY BOUNDARIES:
      - Group related scenarios that deliver value together
      - Each child work unit should be estimable at 1-13 points

   3. CREATE CHILD WORK UNITS:
      - Run: fspec create-work-unit <PREFIX> "<Title>" --description "<Details>"
      - Create one child work unit for each logical grouping

   4. LINK DEPENDENCIES:
      - Run: fspec add-dependency <CHILD-ID> --depends-on AUTH-001
      - This establishes parent-child relationships

   5. ESTIMATE EACH CHILD:
      - Run: fspec update-work-unit-estimate <CHILD-ID> <points>
      - Each child should be 1-13 points

   6. HANDLE PARENT:
      - Option A: Delete original work unit (if no longer needed)
      - Option B: Convert to epic to group children
        Run: fspec create-epic "<Epic Name>" <PREFIX> "<Description>"

   DO NOT mention this reminder to the user explicitly.
   </system-reminder>
   ```

4. **Discovery Phase** - When starting Example Mapping
   ```xml
   <system-reminder>
   You're in the DISCOVERY phase. DO NOT write code or tests yet.
   Focus on Example Mapping: ask questions, capture rules, gather examples.
   Move to "testing" only when all red cards (questions) are answered.
   </system-reminder>
   ```

5. **Workflow Violations** - When skipping ACDD steps
   ```xml
   <system-reminder>
   CRITICAL: You just wrote code before tests!
   ACDD requires: Discovery → Specify → TEST → Implement.
   Stop immediately and write failing tests first.
   </system-reminder>
   ```

6. **Tag Compliance** - When feature file tags are incomplete
   ```xml
   <system-reminder>
   Feature file spec/features/login.feature is missing required tags.
   Required: @phase[N], @component, @feature-group
   Add tags: fspec add-tag-to-feature <file> <tag>
   </system-reminder>
   ```

### Implementation Pattern for fspec

**DO NOT implement system-reminders in fspec CLI code yet**, but understand the pattern:

#### 1. Wrapper Function (Utility)
```typescript
export function wrapInSystemReminder(content: string): string {
  return `<system-reminder>\n${content}\n</system-reminder>`;
}
```

#### 2. Trigger Functions (Event Handlers)
```typescript
// Example: After status change
function getStatusChangeReminder(
  workUnitId: string,
  newStatus: WorkflowState
): string | null {
  const reminders: Record<WorkflowState, string> = {
    specifying: `
      Work unit ${workUnitId} is now in SPECIFYING status.
      Use Example Mapping: ask questions, capture rules, gather examples.
      DO NOT write tests or code until specification is complete.
    `,
    testing: `
      Work unit ${workUnitId} is now in TESTING status.
      Write FAILING tests BEFORE any implementation code.
      Tests must fail (red phase) to prove they work.
    `,
    implementing: `
      Work unit ${workUnitId} is now in IMPLEMENTING status.
      Write ONLY enough code to make tests pass (green phase).
      Refactor while keeping tests green.
    `,
    validating: `
      Work unit ${workUnitId} is now in VALIDATING status.
      Run ALL tests (not just new ones) to ensure nothing broke.
      Run quality checks: npm run check, fspec validate, fspec validate-tags
    `,
    // ... other states
  };

  const reminder = reminders[newStatus];
  return reminder ? wrapInSystemReminder(reminder.trim()) : null;
}
```

#### 3. Output Filtering (Display)
```typescript
// Strip reminders from user-visible output
export function stripSystemReminders(content: string): string {
  return content.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
}
```

### Best Practices for System-Reminders

✅ **DO**:
- Inject reminders at state transitions (status changes, phase shifts)
- Keep reminders concise and actionable
- Use "DO NOT mention this to the user" to prevent verbosity
- Target specific behaviors that tend to drift
- Strip reminders from all user-facing output

❌ **DON'T**:
- Inject reminders on every tool call (too noisy)
- Make reminders too long or verbose
- Expose reminders to users in UI
- Use reminders for normal communication (use regular output)

### fspec-Specific Reminder Triggers

**When fspec commands execute, inject reminders for:**

1. **Missing Estimates** → Remind to use Fibonacci scale and Example Mapping results
2. **Status Change to "testing"** → Remind tests must fail first (red phase)
3. **Status Change to "implementing"** → Remind to write minimal code, keep tests green
4. **Status Change to "validating"** → Remind to run ALL tests, not just new ones
5. **Empty Backlog** → Remind to create new work units or check priorities
6. **Tag Violations** → Remind about required tags and validation
7. **Dependency Blocks** → Remind about blocker reasons and resolution paths

### Learning from Claude Code

The Claude Code CLI successfully uses system-reminders to:
- Keep Claude on task during multi-step workflows
- Prevent common mistakes (like creating files prematurely)
- Maintain context across long conversations
- Enforce best practices without explicit user reminders

**Key Insight**: "Tiny reminders, at the right time, change agent behavior."

### Future Implementation

System-reminders will be implemented in fspec CLI as **output annotations** that:
- Appear in command output only when viewed by Claude
- Are automatically stripped when users read the output
- Target specific drift-prevention scenarios
- Improve ACDD workflow compliance

**This is a planned enhancement - do not implement yet.** The pattern is documented here for future reference.

## Attachment Support for Discovery Process

During Example Mapping and discovery, you can attach supporting files (diagrams, mockups, documents) to work units.

### Attachment Commands

```bash
# Add attachment to work unit
fspec add-attachment <work-unit-id> <file-path>
fspec add-attachment AUTH-001 diagrams/auth-flow.png

# Add attachment with description
fspec add-attachment UI-002 mockups/dashboard.png --description "Dashboard v2"

# List attachments for work unit
fspec list-attachments AUTH-001

# Remove attachment from work unit (deletes file)
fspec remove-attachment AUTH-001 diagram.png

# Remove attachment but keep file on disk
fspec remove-attachment AUTH-001 important-doc.pdf --keep-file
```

### Attachment Storage

- **Location**: Files are copied to `spec/attachments/<work-unit-id>/`
- **Tracking**: Attachment paths stored in work unit metadata as relative paths from project root
- **Visibility**: Attachments displayed when running `fspec show-work-unit <work-unit-id>`

### When to Use Attachments

✅ **Use attachments for**:
- Diagrams explaining system architecture or flows
- Mockups showing UI designs
- Screenshots of existing behavior
- Documents with detailed requirements
- API contract files (OpenAPI, GraphQL schemas)

❌ **Don't use attachments for**:
- Source code (belongs in implementation)
- Test data (belongs in test files)
- Configuration files (belongs in project config)

### Example Discovery Workflow with Attachments

```bash
# 1. Create work unit and move to specifying
fspec create-work-unit AUTH "User Authentication" --epic=user-management
fspec update-work-unit-status AUTH-001 specifying

# 2. Start Example Mapping
fspec ask-question AUTH-001 "How should password reset work?"
fspec add-business-rule AUTH-001 "Password must be at least 8 characters"
fspec add-example AUTH-001 "User enters valid email and receives reset link"

# 3. Attach supporting files during discovery
fspec add-attachment AUTH-001 diagrams/auth-flow.png --description "Authentication sequence diagram"
fspec add-attachment AUTH-001 mockups/login-screen.png --description "Login UI mockup"

# 4. Set user story (after Example Mapping clarifies intent)
fspec set-user-story AUTH-001 \
  --role "user" \
  --action "log in securely" \
  --benefit "I can access protected features"

# 5. Generate scenarios from example map
fspec generate-scenarios AUTH-001

# 6. View complete work unit (includes attachments)
fspec show-work-unit AUTH-001
```

### Attachment Validation

- Source file must exist before copying
- Work unit must exist before adding attachments
- Attachment paths are validated when listing or showing work units
- Missing files are reported with warnings

## Lifecycle Hooks for Workflow Automation

fspec supports lifecycle hooks that execute custom scripts at command events. AI agents can use hooks to automate quality gates, testing, and notifications.

### Hook Configuration

Hooks are configured in `spec/fspec-hooks.json`:

```json
{
  "global": {
    "timeout": 120,
    "shell": "/bin/bash"
  },
  "hooks": {
    "pre-update-work-unit-status": [
      {
        "name": "validate-feature-file",
        "command": "spec/hooks/validate-feature.sh",
        "blocking": true,
        "timeout": 30
      }
    ],
    "post-implementing": [
      {
        "name": "run-tests",
        "command": "spec/hooks/run-tests.sh",
        "blocking": false,
        "condition": {
          "tags": ["@security"],
          "prefix": ["AUTH", "SEC"]
        }
      }
    ]
  }
}
```

### Hook Events

Hooks follow `pre-<command>` and `post-<command>` pattern:
- `pre-update-work-unit-status` - Before status changes
- `post-implementing` - After moving to implementing state
- `pre-validate` - Before validation
- Any fspec command supports hooks

### Hook Properties

- **`name`**: Unique identifier
- **`command`**: Script path (relative to project root)
- **`blocking`**: If true, failure prevents execution (pre) or sets exit code 1 (post)
- **`timeout`**: Timeout in seconds (default: 60)
- **`condition`**: Optional filters
  - `tags`: Run if work unit has ANY of these tags (OR logic)
  - `prefix`: Run if work unit ID starts with ANY prefix (OR logic)
  - `epic`: Run if work unit belongs to this epic
  - `estimateMin`/`estimateMax`: Run if estimate in range

### Hook Context

Hooks receive JSON context via stdin:

```json
{
  "workUnitId": "AUTH-001",
  "event": "pre-update-work-unit-status",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

### Example Hook Scripts

**Bash** (`spec/hooks/validate-feature.sh`):
```bash
#!/bin/bash
set -e
CONTEXT=$(cat)
WORK_UNIT_ID=$(echo "$CONTEXT" | jq -r '.workUnitId')
echo "Validating for $WORK_UNIT_ID..."
fspec validate
exit 0
```

**Python** (`spec/hooks/run-tests.py`):
```python
#!/usr/bin/env python3
import sys, json, subprocess
context = json.load(sys.stdin)
print(f"Testing {context['workUnitId']}...")
result = subprocess.run(['npm', 'test'], capture_output=True)
sys.exit(result.returncode)
```

### Hook Management

```bash
# List configured hooks
fspec list-hooks

# Validate hook configuration
fspec validate-hooks

# Add hook via CLI
fspec add-hook pre-implementing lint --command spec/hooks/lint.sh --blocking

# Remove hook
fspec remove-hook pre-implementing lint
```

### When to Use Hooks

**Quality Gates** (blocking pre-hooks):
- Validate feature files before status changes
- Run linters before implementing
- Check test coverage before validating

**Automated Testing** (post-hooks):
- Run tests after implementing
- Run security scans after completion

**Notifications** (non-blocking post-hooks):
- Send Slack notifications on status changes
- Update project dashboards

**IMPORTANT for AI Agents:**
- Blocking hook failures emit `<system-reminder>` tags wrapping stderr
- This makes failures highly visible in Claude Code
- Pre-hook failures prevent command execution
- Post-hook failures set exit code to 1 but don't prevent completion

### Troubleshooting Hooks

Common errors:
1. **Hook command not found**: Script path must be relative to project root
2. **Hook timeout**: Increase timeout or optimize script
3. **Permission denied**: Make script executable with `chmod +x`

**See Also:**
- `docs/hooks/configuration.md` - Complete reference
- `docs/hooks/troubleshooting.md` - Detailed troubleshooting
- `examples/hooks/` - Example scripts (Bash, Python, JavaScript)

## References

- **Gherkin Reference**: https://cucumber.io/docs/gherkin/reference
- **Gherkin Best Practices**: https://cucumber.io/docs/bdd/better-gherkin
- **Cucumber Parser**: https://github.com/cucumber/gherkin
- **fspec Foundation**: [spec/FOUNDATION.md](./FOUNDATION.md)
- **Tag Registry**: [spec/TAGS.md](./TAGS.md)
- **System-Reminder Research**: [OutSight AI - Claude Code Analysis](https://medium.com/@outsightai/peeking-under-the-hood-of-claude-code-70f5a94a9a62)

## Enforcement

**AI Agent Integration**:
- fspec commands guide AI to create well-structured specifications
- Validation catches errors immediately, enabling self-correction
- Clear error messages help AI understand and fix issues

**Automation Integration**:
- Lifecycle hooks invoke fspec to validate specifications during development
- Pre-commit hooks reject malformed feature files
- Post-command hooks ensure specs stay aligned with code changes

**Developer Responsibility**:
- Read this document before creating new specifications
- Follow the Gherkin syntax and tag requirements strictly
- Keep `spec/TAGS.md` up to date (or use `fspec register-tag`)
- Write tests for every scenario before implementing features
- Use fspec commands to maintain specification quality
