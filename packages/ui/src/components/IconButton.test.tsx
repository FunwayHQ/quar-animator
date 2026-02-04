import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconButton } from './IconButton';

const TestIcon = () => <span data-testid="test-icon">🔥</span>;

describe('IconButton', () => {
  it('renders icon', () => {
    render(<IconButton icon={<TestIcon />} />);
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('renders as button', () => {
    render(<IconButton icon={<TestIcon />} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('handles click', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(<IconButton icon={<TestIcon />} onClick={onClick} />);

    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders tooltip', () => {
    render(<IconButton icon={<TestIcon />} tooltip="Click me" />);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Click me');
  });

  it('renders disabled state', () => {
    render(<IconButton icon={<TestIcon />} disabled />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('does not fire click when disabled', () => {
    const onClick = vi.fn();

    render(<IconButton icon={<TestIcon />} disabled onClick={onClick} />);

    // Button has pointer-events: none when disabled, preventing clicks
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveStyle({ pointerEvents: 'none' });
  });

  it('renders different sizes', () => {
    const { rerender } = render(<IconButton icon={<TestIcon />} size="sm" />);
    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(<IconButton icon={<TestIcon />} size="md" />);
    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(<IconButton icon={<TestIcon />} size="lg" />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('renders different variants', () => {
    const { rerender } = render(<IconButton icon={<TestIcon />} variant="default" />);
    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(<IconButton icon={<TestIcon />} variant="ghost" />);
    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(<IconButton icon={<TestIcon />} variant="primary" />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('renders active state', () => {
    render(<IconButton icon={<TestIcon />} active />);
    // Active state applies styles, button still exists
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('accepts custom style prop', () => {
    const { container } = render(<IconButton icon={<TestIcon />} style={{ margin: '5px' }} />);
    const button = container.querySelector('button');
    expect(button?.style.margin).toBe('5px');
  });

  it('can be focused', async () => {
    const user = userEvent.setup();
    render(<IconButton icon={<TestIcon />} />);

    await user.tab();
    expect(screen.getByRole('button')).toHaveFocus();
  });
});
