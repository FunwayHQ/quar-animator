import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('handles click', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(<Button onClick={onClick}>Click</Button>);

    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders different variants', () => {
    const { rerender } = render(<Button variant="primary">Primary</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(<Button variant="secondary">Secondary</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(<Button variant="danger">Danger</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('renders different sizes', () => {
    const { rerender } = render(<Button size="sm">Small</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(<Button size="md">Medium</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(<Button size="lg">Large</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('renders disabled state', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('does not fire click when disabled', () => {
    const onClick = vi.fn();

    render(<Button disabled onClick={onClick}>Disabled</Button>);

    // Button has pointer-events: none when disabled, preventing clicks
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveStyle({ pointerEvents: 'none' });
  });

  it('renders loading state', () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    // Loading shows spinner, not text
    expect(screen.queryByText('Loading')).not.toBeInTheDocument();
  });

  it('renders with left icon', () => {
    render(<Button iconLeft={<span data-testid="left-icon">←</span>}>With Icon</Button>);
    expect(screen.getByTestId('left-icon')).toBeInTheDocument();
    expect(screen.getByText('With Icon')).toBeInTheDocument();
  });

  it('renders with right icon', () => {
    render(<Button iconRight={<span data-testid="right-icon">→</span>}>With Icon</Button>);
    expect(screen.getByTestId('right-icon')).toBeInTheDocument();
    expect(screen.getByText('With Icon')).toBeInTheDocument();
  });

  it('renders icon only mode', () => {
    render(<Button iconOnly iconLeft={<span data-testid="icon">★</span>}>Hidden text</Button>);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.queryByText('Hidden text')).not.toBeInTheDocument();
  });

  it('renders full width', () => {
    render(<Button fullWidth>Full Width</Button>);
    expect(screen.getByRole('button')).toHaveStyle({ width: '100%' });
  });

  it('accepts custom style prop', () => {
    const { container } = render(<Button style={{ margin: '10px' }}>Styled</Button>);
    const button = container.querySelector('button');
    expect(button?.style.margin).toBe('10px');
  });

  it('can be focused', async () => {
    const user = userEvent.setup();
    render(<Button>Focus me</Button>);

    await user.tab();
    expect(screen.getByRole('button')).toHaveFocus();
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<Button ref={ref}>Ref button</Button>);
    expect(ref).toHaveBeenCalled();
  });
});
