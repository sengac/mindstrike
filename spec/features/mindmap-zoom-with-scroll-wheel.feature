@done
@interaction
@mindmap
@ui
@medium
@UI-001
Feature: Mindmap Zoom with Scroll Wheel

  """
  Uses ReactFlow library for mindmap rendering. Requires modifying the onWheel event handler to trigger zoom instead of pan. Zoom should use ReactFlow's zoomIn/zoomOut API with cursor position as focal point. Must preserve existing touchpad pinch-to-zoom gesture support.
  """

  # ========================================
  # EXAMPLE MAPPING CONTEXT
  # ========================================
  #
  # BUSINESS RULES:
  #   1. Scroll wheel must zoom the mindmap (not pan)
  #   2. Click-and-drag must pan the mindmap
  #   3. Zoom behavior replaces current scroll wheel panning
  #   4. Zoom centered on mouse cursor position (not viewport center)
  #   5. Keep existing touchpad pinch-to-zoom functionality - it currently works and should be retained alongside scroll wheel zoom
  #   6. Ctrl+scroll wheel should pan the mindmap (preserving current scroll behavior as a modifier). Normal scroll wheel (without Ctrl) should zoom.
  #
  # EXAMPLES:
  #   1. User scrolls mouse wheel up → mindmap zooms in
  #   2. User scrolls mouse wheel down → mindmap zooms out
  #   3. User clicks and drags on mindmap → canvas pans in drag direction
  #
  # QUESTIONS (ANSWERED):
  #   Q: Should zoom be centered on the mouse cursor position, or on the center of the viewport?
  #   A: true
  #
  #   Q: Should there be minimum and maximum zoom levels? If so, what should they be?
  #   A: true
  #
  #   Q: Should the zoom transition be smooth/animated, or instant?
  #   A: true
  #
  #   Q: Should touchpad pinch-to-zoom gestures also work for zooming?
  #   A: true
  #
  #   Q: Are there any keyboard modifiers that should change scroll behavior (e.g., Ctrl+scroll for different zoom speed)?
  #   A: true
  #
  # ASSUMPTIONS:
  #   1. Use existing default minimum and maximum zoom levels from current implementation
  #   2. Use existing zoom transition behavior from current implementation
  #
  # ========================================

  Background: User Story
    As a user navigating the mindmap
    I want to zoom the mindmap using the scroll wheel
    So that I can quickly zoom in and out without switching tools or using keyboard shortcuts

  Scenario: Zoom in with scroll wheel up
    Given I am viewing a mindmap
    When I scroll the mouse wheel up
    Then the mindmap should zoom in
    And the zoom should be centered on the mouse cursor position

  Scenario: Zoom out with scroll wheel down
    Given I am viewing a mindmap
    When I scroll the mouse wheel down
    Then the mindmap should zoom out
    And the zoom should be centered on the mouse cursor position

  Scenario: Pan with click and drag
    Given I am viewing a mindmap
    When I click and drag on the mindmap canvas
    Then the canvas should pan in the direction of the drag
    And the zoom level should remain unchanged

  Scenario: Pan with Ctrl+scroll wheel
    Given I am viewing a mindmap
    When I hold the Ctrl key and scroll the mouse wheel
    Then the mindmap should pan (not zoom)
    And the zoom level should remain unchanged

  Scenario: Touchpad pinch-to-zoom still works
    Given I am viewing a mindmap on a device with a touchpad
    When I perform a pinch-to-zoom gesture on the touchpad
    Then the mindmap should zoom in or out accordingly
    And the zoom should be centered on the gesture focal point