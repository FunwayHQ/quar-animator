import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders children', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>
    );

    expect(screen.getByRole('button', { name: 'Hover me' })).toBeInTheDocument();
  });

  it('does not show tooltip by default', () => {
    render(
      <Tooltip content="Hidden tooltip">
        <button>Button</button>
      </Tooltip>
    );

    expect(screen.queryByText('Hidden tooltip')).not.toBeInTheDocument();
  });

  it('shows tooltip on hover after delay', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <Tooltip content="Visible tooltip" delay={300}>
        <button>Hover</button>
      </Tooltip>
    );

    await user.hover(screen.getByRole('button'));
    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(screen.getByText('Visible tooltip')).toBeInTheDocument();
    });
  });

  it('hides tooltip on mouse leave', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <Tooltip content="Tooltip" delay={0}>
        <button>Button</button>
      </Tooltip>
    );

    await user.hover(screen.getByRole('button'));
    vi.advanceTimersByTime(0);

    await waitFor(() => {
      expect(screen.getByText('Tooltip')).toBeInTheDocument();
    });

    await user.unhover(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.queryByText('Tooltip')).not.toBeInTheDocument();
    });
  });

  it('stays hidden after the pointer leaves when focus also armed it', () => {
    // Hovering then clicking the button arms the delay twice (mouseenter and
    // focus); leaving must cancel both, or the first one shows the tooltip
    // after the pointer has gone.
    render(
      <Tooltip content="Late tooltip" delay={300}>
        <button>Button</button>
      </Tooltip>
    );
    const button = screen.getByRole('button');

    fireEvent.mouseEnter(button);
    fireEvent.focus(button);
    fireEvent.mouseLeave(button);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryByText('Late tooltip')).not.toBeInTheDocument();
  });

  it('shows keyboard shortcut when provided', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <Tooltip content="Save" shortcut="Ctrl+S" delay={0}>
        <button>Save</button>
      </Tooltip>
    );

    await user.hover(screen.getByRole('button'));
    vi.advanceTimersByTime(0);

    await waitFor(() => {
      expect(screen.getByText('Ctrl+S')).toBeInTheDocument();
    });
  });

  it('does not show when disabled', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <Tooltip content="Disabled tooltip" disabled delay={0}>
        <button>Button</button>
      </Tooltip>
    );

    await user.hover(screen.getByRole('button'));
    vi.advanceTimersByTime(100);

    expect(screen.queryByText('Disabled tooltip')).not.toBeInTheDocument();
  });

  it('supports different positions', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const positions = ['top', 'right', 'bottom', 'left'] as const;

    for (const position of positions) {
      const { unmount } = render(
        <Tooltip content={`Position ${position}`} position={position} delay={0}>
          <button>Button</button>
        </Tooltip>
      );

      await user.hover(screen.getByRole('button'));
      vi.advanceTimersByTime(0);

      await waitFor(() => {
        expect(screen.getByText(`Position ${position}`)).toBeInTheDocument();
      });

      unmount();
    }
  });

  describe('placement on screen', () => {
    // jsdom has no layout, so the trigger and tooltip boxes are mocked; the
    // window is jsdom's 1024 x 768.
    const TIP_WIDTH = 200;
    const TIP_HEIGHT = 40;
    let triggerRect: DOMRect;

    function rect(left: number, top: number, width: number, height: number): DOMRect {
      return {
        left,
        top,
        width,
        height,
        x: left,
        y: top,
        right: left + width,
        bottom: top + height,
        toJSON: () => ({}),
      };
    }

    function showTooltip(position: 'top' | 'right' | 'bottom' | 'left'): HTMLElement {
      render(
        <Tooltip content="Tip" position={position} delay={0}>
          <button>Button</button>
        </Tooltip>
      );
      const wrapper = screen.getByRole('button').parentElement;
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement
      ) {
        return this === wrapper ? triggerRect : rect(0, 0, TIP_WIDTH, TIP_HEIGHT);
      });

      fireEvent.mouseEnter(screen.getByRole('button'));
      act(() => {
        vi.advanceTimersByTime(0);
      });
      return screen.getByText('Tip');
    }

    /** The tooltip's box on screen, from the corner it is placed at. */
    function boxOf(tooltip: HTMLElement) {
      const left = parseFloat(tooltip.style.left);
      const top = parseFloat(tooltip.style.top);
      return { left, top, right: left + TIP_WIDTH, bottom: top + TIP_HEIGHT };
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('keeps the side asked for when there is room', () => {
      triggerRect = rect(400, 300, 80, 24);
      const box = boxOf(showTooltip('top'));

      expect(box.bottom).toBeLessThanOrEqual(triggerRect.top);
      expect(box.left + TIP_WIDTH / 2).toBe(440);
    });

    it('opens below when there is no room above', () => {
      triggerRect = rect(400, 2, 80, 24);
      const box = boxOf(showTooltip('top'));

      expect(box.top).toBeGreaterThanOrEqual(triggerRect.bottom);
    });

    it('opens on the left when there is no room on the right', () => {
      triggerRect = rect(window.innerWidth - 30, 300, 24, 24);
      const box = boxOf(showTooltip('right'));

      expect(box.right).toBeLessThanOrEqual(triggerRect.left);
      expect(box.left).toBeGreaterThanOrEqual(0);
    });

    it('stays inside the window next to a corner', () => {
      triggerRect = rect(window.innerWidth - 20, window.innerHeight - 20, 16, 16);
      const box = boxOf(showTooltip('bottom'));

      expect(box.bottom).toBeLessThanOrEqual(triggerRect.top);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(window.innerWidth);
      expect(box.top).toBeGreaterThanOrEqual(0);
    });

    it('follows its trigger when the page scrolls or the window resizes', () => {
      triggerRect = rect(400, 300, 80, 24);
      const tooltip = showTooltip('bottom');

      triggerRect = rect(400, 100, 80, 24);
      fireEvent.scroll(window);
      expect(boxOf(tooltip).top).toBeGreaterThanOrEqual(124);
      expect(boxOf(tooltip).top).toBeLessThan(300);

      triggerRect = rect(100, 100, 80, 24);
      fireEvent(window, new Event('resize'));
      expect(boxOf(tooltip).left + TIP_WIDTH / 2).toBe(140);
    });
  });
});
