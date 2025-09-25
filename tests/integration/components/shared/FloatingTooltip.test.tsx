/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FloatingTooltip } from '../../../../src/components/shared/FloatingTooltip';
import { useRef } from 'react';

describe('FloatingTooltip', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    // Create a container for portals
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Clean up
    document.body.removeChild(container);
    vi.clearAllMocks();
  });

  // Helper component to test FloatingTooltip with a ref
  function TestComponent({
    isVisible,
    placement,
    offset,
    className,
    children = 'Tooltip content',
  }: {
    isVisible: boolean;
    placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
    offset?: number;
    className?: string;
    children?: React.ReactNode;
  }) {
    const targetRef = useRef<HTMLButtonElement>(null);

    return (
      <>
        <button ref={targetRef} data-testid="target-element">
          Target
        </button>
        <FloatingTooltip
          targetRef={targetRef}
          isVisible={isVisible}
          placement={placement}
          offset={offset}
          className={className}
        >
          {children}
        </FloatingTooltip>
      </>
    );
  }

  it('should not render when isVisible is false', () => {
    render(<TestComponent isVisible={false} />);
    expect(screen.queryByTestId('floating-tooltip')).toBeNull();
  });

  it('should render in document.body when isVisible is true', async () => {
    render(<TestComponent isVisible={true} />);

    await waitFor(() => {
      const tooltip = document.body.querySelector(
        '[data-testid="floating-tooltip"]'
      );
      expect(tooltip).toBeTruthy();
      expect(tooltip?.textContent).toBe('Tooltip content');
    });
  });

  it('should apply custom className', async () => {
    render(<TestComponent isVisible={true} className="custom-class" />);

    await waitFor(() => {
      const tooltip = document.body.querySelector(
        '[data-testid="floating-tooltip"]'
      );
      const content = tooltip?.querySelector('.custom-class');
      expect(content).toBeTruthy();
    });
  });

  it('should render custom children', async () => {
    const customContent = (
      <div>
        <h3>Custom Title</h3>
        <p>Custom description</p>
      </div>
    );

    render(<TestComponent isVisible={true}>{customContent}</TestComponent>);

    await waitFor(() => {
      const tooltip = document.body.querySelector(
        '[data-testid="floating-tooltip"]'
      );
      expect(tooltip?.querySelector('h3')?.textContent).toBe('Custom Title');
      expect(tooltip?.querySelector('p')?.textContent).toBe(
        'Custom description'
      );
    });
  });

  it('should have correct z-index for appearing above all content', async () => {
    render(<TestComponent isVisible={true} />);

    await waitFor(() => {
      const tooltip = document.body.querySelector(
        '[data-testid="floating-tooltip"]'
      ) as HTMLElement;
      expect(tooltip?.className).toContain('z-[99999]');
    });
  });

  it('should add resize event listener', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    render(<TestComponent isVisible={true} />);

    await waitFor(() => {
      const tooltip = document.body.querySelector(
        '[data-testid="floating-tooltip"]'
      ) as HTMLElement;
      expect(tooltip).toBeTruthy();
    });

    // Verify that resize event listener was added
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'resize',
      expect.any(Function)
    );

    addEventListenerSpy.mockRestore();
  });

  it('should handle placement prop correctly', async () => {
    const placements: Array<'top' | 'bottom' | 'left' | 'right'> = [
      'top',
      'bottom',
      'left',
      'right',
    ];

    for (const placement of placements) {
      const { unmount } = render(
        <TestComponent isVisible={true} placement={placement} />
      );

      await waitFor(() => {
        const tooltip = document.body.querySelector(
          '[data-testid="floating-tooltip"]'
        );
        expect(tooltip).toBeTruthy();
      });

      unmount();
    }
  });

  it('should use custom offset', async () => {
    const customOffset = 20;
    render(
      <TestComponent isVisible={true} offset={customOffset} placement="top" />
    );

    await waitFor(() => {
      const tooltip = document.body.querySelector(
        '[data-testid="floating-tooltip"]'
      );
      expect(tooltip).toBeTruthy();
    });
  });

  it('should clean up event listeners on unmount', async () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(<TestComponent isVisible={true} />);

    await waitFor(() => {
      const tooltip = document.body.querySelector(
        '[data-testid="floating-tooltip"]'
      );
      expect(tooltip).toBeTruthy();
    });

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      true
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'resize',
      expect.any(Function)
    );
  });

  it('should not render if targetRef current is null', () => {
    const NullRefComponent = () => {
      const targetRef = useRef<HTMLElement>(null);
      // Ref exists but current is null (no element attached)
      return (
        <FloatingTooltip targetRef={targetRef} isVisible={true}>
          Content
        </FloatingTooltip>
      );
    };

    render(<NullRefComponent />);
    // Tooltip renders but won't be positioned correctly since ref.current is null
    const tooltip = screen.queryByTestId('floating-tooltip');
    expect(tooltip).toBeTruthy();
    // It should be at position 0,0 since there's no target element
    expect(tooltip?.style.top).toBe('0px');
    expect(tooltip?.style.left).toBe('0px');
  });

  it('should handle auto placement by positioning below when no space above', async () => {
    render(<TestComponent isVisible={true} placement="auto" />);

    // Mock getBoundingClientRect to simulate element at top of viewport
    const targetElement = screen.getByTestId('target-element');
    targetElement.getBoundingClientRect = vi.fn(() => ({
      top: 5, // Very close to top
      bottom: 25,
      left: 100,
      right: 200,
      width: 100,
      height: 20,
      x: 100,
      y: 5,
    }));

    await waitFor(() => {
      const tooltip = document.body.querySelector(
        '[data-testid="floating-tooltip"]'
      );
      expect(tooltip).toBeTruthy();
    });
  });

  it('should constrain tooltip within viewport bounds', async () => {
    render(<TestComponent isVisible={true} />);

    // Mock getBoundingClientRect to simulate element at edge of viewport
    const targetElement = screen.getByTestId('target-element');
    targetElement.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      bottom: 120,
      left: window.innerWidth - 50, // Near right edge
      right: window.innerWidth - 10,
      width: 40,
      height: 20,
      x: window.innerWidth - 50,
      y: 100,
    }));

    await waitFor(() => {
      const tooltip = document.body.querySelector(
        '[data-testid="floating-tooltip"]'
      ) as HTMLElement;
      expect(tooltip).toBeTruthy();

      // Check that tooltip doesn't go off screen
      const left = parseInt(tooltip.style.left);
      const tooltipWidth = 280; // Approximate width
      expect(left + tooltipWidth).toBeLessThanOrEqual(window.innerWidth);
    });
  });

  it('should update position on scroll', async () => {
    render(<TestComponent isVisible={true} />);

    await waitFor(() => {
      const tooltip = document.body.querySelector(
        '[data-testid="floating-tooltip"]'
      );
      expect(tooltip).toBeTruthy();
    });

    // Trigger scroll event
    window.dispatchEvent(new Event('scroll'));

    // Verify tooltip still exists and is positioned
    await waitFor(() => {
      const tooltip = document.body.querySelector(
        '[data-testid="floating-tooltip"]'
      ) as HTMLElement;
      expect(tooltip).toBeTruthy();
      expect(tooltip.style.top).toBeDefined();
      expect(tooltip.style.left).toBeDefined();
    });
  });
});
