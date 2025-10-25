@mindmap
@done
@critical
@navigation
@ui
@BUG-003
Feature: Diagonal scroll only zooms, doesn't pan horizontally

  """
  Bug in MindMap.tsx handleWheel logic. Current code uses 'else if (hasHorizontalScroll)' which prevents horizontal panning when vertical scroll is also present. Fix: Remove 'else' to allow both operations. When deltaX exists, always update viewport.x. When deltaY exists (without Ctrl), ReactFlow's zoomOnScroll handles it.
  """

  # ========================================
  # EXAMPLE MAPPING CONTEXT
  # ========================================
  #
  # BUSINESS RULES:
  #   1. When both deltaX and deltaY are present, BOTH operations must execute
  #   2. Horizontal scroll (deltaX) controls horizontal panning regardless of vertical scroll
  #   3. Vertical scroll (deltaY) controls zoom regardless of horizontal scroll
  #   4. No 'else if' logic that prevents simultaneous execution
  #
  # EXAMPLES:
  #   1. User scrolls diagonally down-right → mindmap zooms out AND pans right (both happen)
  #   2. User scrolls mostly right with slight up movement → mindmap pans right AND zooms in slightly
  #   3. User scrolls only horizontally → mindmap only pans (no zoom)
  #   4. User scrolls only vertically → mindmap only zooms (no pan)
  #
  # ========================================

  Background: User Story
    As a user scrolling diagonally on trackpad
    I want to pan horizontally AND zoom vertically simultaneously
    So that I can navigate naturally without the system choosing one action over the other

  Scenario: Diagonal scroll performs both zoom and pan simultaneously
    Given I am viewing a mindmap
    When I scroll diagonally down-right with both deltaX and deltaY
    Then the mindmap should zoom out
    And the mindmap should pan to the right
    And both operations should happen simultaneously

