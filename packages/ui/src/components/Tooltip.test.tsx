import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
});
