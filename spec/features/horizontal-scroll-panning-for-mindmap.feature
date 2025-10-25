@done
@ui
@high
@navigation
@mindmap
@UI-003
Feature: Horizontal scroll panning for mindmap

  """
  Uses ReactFlow's onWheel event handler to detect horizontal scroll events (event.deltaX). Extends existing zoom behavior (d562b51) which handles vertical scroll (event.deltaY) with modifier keys. Horizontal panning uses viewport.x translation without requiring modifiers. Integrates with existing ReactFlow viewport state management and edge bounds checking.
  """

  # ========================================
  # EXAMPLE MAPPING CONTEXT
  # ========================================
  #
  # BUSINESS RULES:
  #   1. Vertical scroll (up/down) controls zoom in/out
  #   2. Horizontal scroll (left/right) controls panning left/right
  #   3. Horizontal panning requires no modifier keys (always active)
  #   4. Scroll sensitivity matches the pre-zoom-change panning behavior
  #   5. Edge handling uses existing ReactFlow viewport bounds logic
  #   6. Trackpads and mouse wheels behave identically (vertical=zoom, horizontal=pan)
  #
  # EXAMPLES:
  #   1. User scrolls horizontally right on trackpad → mindmap pans right, revealing nodes on the right side
  #   2. User scrolls horizontally left on trackpad → mindmap pans left, revealing nodes on the left side
  #   3. User scrolls vertically up → mindmap zooms in (existing behavior remains unchanged)
  #   4. User scrolls vertically down → mindmap zooms out (existing behavior remains unchanged)
  #   5. User scrolls diagonally (down-right) on trackpad → mindmap zooms out AND pans right simultaneously
  #   6. User has mouse wheel with horizontal scroll capability → scrolling horizontally pans the mindmap
  #
  # QUESTIONS (ANSWERED):
  #   Q: Should horizontal scroll panning work with or without modifier keys?
  #   A: true
  #
  #   Q: How fast should horizontal panning move compared to vertical zoom?
  #   A: true
  #
  #   Q: What should happen when scrolling at the edge of the mindmap?
  #   A: true
  #
  #   Q: Should trackpads and mouse wheels behave differently for diagonal scrolling?
  #   A: true
  #
  # ========================================

  Background: User Story
    As a user viewing a mindmap
    I want to pan the mindmap horizontally using scroll wheel
    So that I can navigate large mindmaps naturally without switching to mouse dragging

  Scenario: Pan mindmap right with horizontal scroll
    Given I am viewing a mindmap with nodes extending beyond the right edge
    When I scroll horizontally to the right on my trackpad
    Then the mindmap should pan to the right
    And nodes on the right side should become visible


  Scenario: Pan mindmap left with horizontal scroll
    Given I am viewing a mindmap with nodes extending beyond the left edge
    When I scroll horizontally to the left on my trackpad
    Then the mindmap should pan to the left
    And nodes on the left side should become visible


  Scenario: Vertical scroll still zooms in (unchanged behavior)
    Given I am viewing a mindmap
    When I scroll vertically up
    Then the mindmap should zoom in
    And the zoom behavior should match the existing implementation


  Scenario: Vertical scroll still zooms out (unchanged behavior)
    Given I am viewing a mindmap
    When I scroll vertically down
    Then the mindmap should zoom out
    And the zoom behavior should match the existing implementation


  Scenario: Diagonal scroll performs both zoom and pan
    Given I am viewing a mindmap
    When I scroll diagonally down-right on my trackpad
    Then the mindmap should zoom out
    And the mindmap should pan to the right simultaneously


  Scenario: Mouse wheel with horizontal scroll capability
    Given I have a mouse with horizontal scroll wheel
    And I am viewing a mindmap
    When I scroll horizontally using the mouse wheel
    Then the mindmap should pan left or right accordingly

