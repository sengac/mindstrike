@ui-overlay
@keybindings
@navigation
@mindmap
@high
@UI-004
Feature: Scroll Modifier Key for Pan/Zoom Switching with Visual Indicator

  """
  Integrates with existing key binding system (useAppStore mindMapKeyBindings). Modifies wheel event handler in MindMap.tsx (handleWheel function, lines 843-934). Removes broken Ctrl/Cmd hardcoded pan logic. Adds new overlay component positioned at bottom-left (fixed positioning). Uses existing Z_INDEX_LAYERS constants for proper layering (Z_INDEX_LAYERS.CONTROLS). Overlay matches existing UI style (dark background, rounded corners like floating action buttons). Key binding detection uses same pattern as existing bindings (getKeyString normalization). Space key default can be rebound through ControlsModal.tsx. Horizontal scroll always pans (preserves existing behavior). Vertical scroll: zoom (default) or pan (when modifier held).
  """

  # ========================================
  # EXAMPLE MAPPING CONTEXT
  # ========================================
  #
  # BUSINESS RULES:
  #   1. Yes, use Space bar as the pan mode modifier key
  #   2. Display 'Zoom Mode (hold Space for Pan Mode)' when in zoom mode, and 'Pan Mode' when Space is held
  #   3. Always visible but semi-transparent, then fully opaque on interaction
  #   4. Configurable entry in key bindings dialog, same pattern as other bindings (user can rebind to any key)
  #   5. Replace the broken Ctrl/Cmd pan behavior entirely. Use only the new configurable key binding system with Space as default pan mode modifier. Remove hardcoded Ctrl/Cmd pan logic from wheel handler.
  #   6. Remove broken Ctrl/Cmd hardcoded pan behavior from wheel handler in MindMap.tsx
  #   7. Match existing MindStrike UI style - dark background with rounded corners, consistent with floating action buttons
  #   8. Pan mode modifier must be tracked via key binding system (useAppStore mindMapKeyBindings)
  #   9. Overlay must be positioned at bottom-left with appropriate z-index (higher than base, lower than modals)
  #   10. Horizontal scrolling should pan horizontally regardless of modifier key state
  #
  # EXAMPLES:
  #   1. User holds Space and scrolls vertically - viewport pans vertically instead of zooming
  #   2. User scrolls without holding Space - viewport zooms in/out as normal
  #   3. User holds Space - overlay changes from 'Zoom Mode (hold Space for Pan Mode)' to 'Pan Mode' and becomes fully opaque
  #   4. User opens key bindings dialog - sees new entry 'Pan Mode Modifier' with default key 'Space'
  #   5. User rebinds pan mode modifier to 'Shift' - holding Shift now enables pan mode instead of Space
  #   6. Overlay is semi-transparent (50% opacity) when idle, becomes fully opaque when Space is pressed or scrolling occurs
  #
  # QUESTIONS (ANSWERED):
  #   Q: Should we use Space bar as the modifier key for pan mode?
  #   A: true
  #
  #   Q: What should the bottom-left overlay display?
  #   A: true
  #
  #   Q: Should the overlay be always visible, hover-only, activity-based fade, or always visible with transparency changes?
  #   A: true
  #
  #   Q: Should the pan mode modifier be configurable in the key bindings dialog like other bindings, or fixed/toggle-only?
  #   A: true
  #
  #   Q: Should we keep existing Ctrl/Cmd pan behavior, replace it entirely, or make it configurable?
  #   A: true
  #
  #   Q: What visual style should the bottom-left overlay use?
  #   A: true
  #
  # ========================================

  Background: User Story
    As a mindmap user
    I want to switch between zoom and pan modes while scrolling
    So that I can navigate the mindmap more efficiently with a single modifier key

  Scenario: Pan mode with Space key held during vertical scroll
    Given I am viewing a mindmap in the MindMap component
    When I hold down the Space key and scroll vertically with the mouse wheel
    Then the viewport should pan vertically instead of zooming
    And the zoom level should remain unchanged


  Scenario: Default zoom mode without modifier key
    Given I am viewing a mindmap in the MindMap component
    When I scroll vertically with the mouse wheel without holding any modifier key
    Then the viewport should zoom in or out based on scroll direction
    And the viewport position should remain centered on the zoom point


  Scenario: Overlay display changes with modifier key press
    Given I am viewing a mindmap with the mode overlay visible
    And the overlay shows 'Zoom Mode (hold Space for Pan Mode)'
    When I press and hold the Space key
    Then the overlay text should change to 'Pan Mode'
    And the overlay should become fully opaque


  Scenario: Key bindings dialog shows pan mode modifier entry
    Given I am viewing the MindStrike application
    When I open the key bindings dialog (ControlsModal)
    Then I should see a new entry labeled 'Pan Mode Modifier'
    And the default key should be set to 'Space'
    And it should follow the same pattern as other key binding entries


  Scenario: Rebinding pan mode modifier key
    Given I am in the key bindings dialog
    And the pan mode modifier is currently set to 'Space'
    When I click edit on the 'Pan Mode Modifier' entry
    And I press the 'Shift' key
    And I save the binding
    Then the pan mode modifier should be updated to 'Shift'
    And holding Shift and scrolling should enable pan mode instead of Space


  Scenario: Overlay opacity changes on interaction
    Given I am viewing a mindmap with the mode overlay visible
    And the overlay is in its idle state
    Then the overlay should be semi-transparent at 50% opacity
    When I press the Space key
    Then the overlay should become fully opaque
    When I scroll the mouse wheel
    Then the overlay should become fully opaque during scrolling

