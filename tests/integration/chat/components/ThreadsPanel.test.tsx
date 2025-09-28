import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThreadsPanel } from '../../../../src/chat/components/ThreadsPanel';
import type { ThreadMetadata } from '../../../../src/store/useThreadsStore';

describe('ThreadsPanel', () => {
  const mockThreads: ThreadMetadata[] = [
    {
      id: 'thread-1',
      name: 'Thread without custom prompt',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      messageCount: 5,
    },
    {
      id: 'thread-2',
      name: 'Thread with custom prompt',
      createdAt: new Date('2024-01-02'),
      updatedAt: new Date('2024-01-02'),
      messageCount: 10,
      customPrompt: 'You are a helpful coding assistant',
    },
    {
      id: 'thread-3',
      name: 'Another thread with prompt',
      createdAt: new Date('2024-01-03'),
      updatedAt: new Date('2024-01-03'),
      messageCount: 3,
      customPrompt: 'You are a creative writing assistant',
    },
  ];

  const mockHandlers = {
    onThreadSelect: vi.fn(),
    onThreadCreate: vi.fn(),
    onThreadRename: vi.fn(),
    onThreadDelete: vi.fn(),
    onPromptEdit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Custom Prompt Icon', () => {
    it('should not render custom prompt button for threads without custom prompt', () => {
      render(
        <ThreadsPanel
          threads={[mockThreads[0]]}
          activeThreadId="thread-1"
          {...mockHandlers}
        />
      );

      // Should not find any button with the custom prompt title
      const promptButton = screen.queryByTitle(
        'Custom prompt applied - Click to edit'
      );
      expect(promptButton).toBeNull();
    });

    it('should render custom prompt button for threads with custom prompt', () => {
      render(
        <ThreadsPanel
          threads={[mockThreads[1]]}
          activeThreadId="thread-2"
          {...mockHandlers}
        />
      );

      // Should find the custom prompt button
      const promptButton = screen.getByTitle(
        'Custom prompt applied - Click to edit'
      );
      expect(promptButton).toBeTruthy();
      expect(promptButton.tagName).toBe('BUTTON');
    });

    it('should display Terminal icon inside the custom prompt button', () => {
      render(
        <ThreadsPanel
          threads={[mockThreads[1]]}
          activeThreadId="thread-2"
          {...mockHandlers}
        />
      );

      const promptButton = screen.getByTitle(
        'Custom prompt applied - Click to edit'
      );

      // Check for the Terminal icon (Lucide icons render as SVG)
      const icon = promptButton.querySelector('svg');
      expect(icon).toBeTruthy();

      // Check for purple color class
      expect(promptButton.innerHTML).toContain('text-purple-400');
    });

    it('should call onPromptEdit with correct thread ID when custom prompt button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <ThreadsPanel
          threads={[mockThreads[1]]}
          activeThreadId="thread-2"
          {...mockHandlers}
        />
      );

      const promptButton = screen.getByTitle(
        'Custom prompt applied - Click to edit'
      );

      await user.click(promptButton);

      expect(mockHandlers.onPromptEdit).toHaveBeenCalledTimes(1);
      expect(mockHandlers.onPromptEdit).toHaveBeenCalledWith('thread-2');
    });

    it('should not trigger thread selection when custom prompt button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <ThreadsPanel
          threads={[mockThreads[1]]}
          activeThreadId="thread-1"
          {...mockHandlers}
        />
      );

      const promptButton = screen.getByTitle(
        'Custom prompt applied - Click to edit'
      );

      await user.click(promptButton);

      // onPromptEdit should be called
      expect(mockHandlers.onPromptEdit).toHaveBeenCalledTimes(1);

      // onThreadSelect should NOT be called (event propagation stopped)
      expect(mockHandlers.onThreadSelect).not.toHaveBeenCalled();
    });

    it('should render multiple custom prompt buttons for multiple threads with prompts', () => {
      render(
        <ThreadsPanel
          threads={mockThreads}
          activeThreadId="thread-1"
          {...mockHandlers}
        />
      );

      const promptButtons = screen.getAllByTitle(
        'Custom prompt applied - Click to edit'
      );

      // Should have 2 buttons (thread-2 and thread-3 have custom prompts)
      expect(promptButtons).toHaveLength(2);
    });

    it('should call onPromptEdit with correct thread ID for each button', async () => {
      const user = userEvent.setup();

      render(
        <ThreadsPanel
          threads={mockThreads}
          activeThreadId="thread-1"
          {...mockHandlers}
        />
      );

      const promptButtons = screen.getAllByTitle(
        'Custom prompt applied - Click to edit'
      );

      // Click first button (thread-2)
      await user.click(promptButtons[0]);
      expect(mockHandlers.onPromptEdit).toHaveBeenCalledWith('thread-2');

      // Click second button (thread-3)
      await user.click(promptButtons[1]);
      expect(mockHandlers.onPromptEdit).toHaveBeenCalledWith('thread-3');

      // Should have been called twice total
      expect(mockHandlers.onPromptEdit).toHaveBeenCalledTimes(2);
    });

    it('should apply hover styles to custom prompt button', async () => {
      const user = userEvent.setup();

      render(
        <ThreadsPanel
          threads={[mockThreads[1]]}
          activeThreadId="thread-2"
          {...mockHandlers}
        />
      );

      const promptButton = screen.getByTitle(
        'Custom prompt applied - Click to edit'
      );

      // Check for hover-related classes
      expect(promptButton.className).toContain('hover:bg-gray-700');
      expect(promptButton.className).toContain('transition-colors');
      expect(promptButton.className).toContain('rounded');
    });

    it('should handle onPromptEdit being undefined gracefully', async () => {
      const user = userEvent.setup();

      // Render without onPromptEdit prop
      render(
        <ThreadsPanel
          threads={[mockThreads[1]]}
          activeThreadId="thread-2"
          onThreadSelect={mockHandlers.onThreadSelect}
          onThreadCreate={mockHandlers.onThreadCreate}
          onThreadRename={mockHandlers.onThreadRename}
          onThreadDelete={mockHandlers.onThreadDelete}
          // onPromptEdit is intentionally omitted
        />
      );

      const promptButton = screen.getByTitle(
        'Custom prompt applied - Click to edit'
      );

      // Should not throw error when clicked without onPromptEdit
      await expect(user.click(promptButton)).resolves.not.toThrow();
    });
  });

  describe('Integration with ListPanel', () => {
    it('should pass all required props to ListPanel', () => {
      const { container } = render(
        <ThreadsPanel
          threads={mockThreads}
          activeThreadId="thread-1"
          {...mockHandlers}
        />
      );

      // Check that the test ID is present (passed through to ListPanel)
      const listPanel = container.querySelector('[data-testid="chat-slider"]');
      expect(listPanel).toBeTruthy();
    });

    it('should render custom prompt button as part of renderItemContent', () => {
      render(
        <ThreadsPanel
          threads={mockThreads}
          activeThreadId="thread-1"
          {...mockHandlers}
        />
      );

      // The custom prompt buttons should be rendered within list items
      const listItems = screen.getAllByRole('button');

      // Filter to find custom prompt buttons
      const customPromptButtons = listItems.filter(
        button => button.title === 'Custom prompt applied - Click to edit'
      );

      expect(customPromptButtons).toHaveLength(2);
    });
  });

  describe('Accessibility', () => {
    it('should have accessible title attribute on custom prompt button', () => {
      render(
        <ThreadsPanel
          threads={[mockThreads[1]]}
          activeThreadId="thread-2"
          {...mockHandlers}
        />
      );

      const promptButton = screen.getByTitle(
        'Custom prompt applied - Click to edit'
      );

      expect(promptButton.getAttribute('title')).toBe(
        'Custom prompt applied - Click to edit'
      );
    });

    it('should be keyboard accessible', async () => {
      render(
        <ThreadsPanel
          threads={[mockThreads[1]]}
          activeThreadId="thread-2"
          {...mockHandlers}
        />
      );

      const promptButton = screen.getByTitle(
        'Custom prompt applied - Click to edit'
      );

      // Focus the button
      promptButton.focus();
      expect(document.activeElement).toBe(promptButton);

      // Simulate Enter key press
      fireEvent.keyDown(promptButton, { key: 'Enter', code: 'Enter' });
      fireEvent.click(promptButton);

      expect(mockHandlers.onPromptEdit).toHaveBeenCalledWith('thread-2');
    });
  });
});
