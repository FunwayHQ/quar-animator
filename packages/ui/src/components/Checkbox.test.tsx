import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('renders with label', () => {
    render(<Checkbox label="Accept terms" />);
    expect(screen.getByText('Accept terms')).toBeInTheDocument();
  });

  it('renders without label', () => {
    render(<Checkbox />);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('renders unchecked by default', () => {
    render(<Checkbox label="Test" />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('renders checked state', () => {
    render(<Checkbox label="Test" checked onChange={() => {}} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('handles click to toggle', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<Checkbox label="Toggle me" onChange={onChange} />);

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('renders disabled state', () => {
    render(<Checkbox label="Disabled" disabled />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('renders indeterminate state', () => {
    render(<Checkbox label="Indeterminate" indeterminate />);
    // Indeterminate shows minus icon, checkbox exists
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('renders different sizes', () => {
    const { rerender } = render(<Checkbox size="sm" label="Small" />);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();

    rerender(<Checkbox size="md" label="Medium" />);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();

    rerender(<Checkbox size="lg" label="Large" />);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('can be focused via keyboard', async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Keyboard" />);

    await user.tab();
    expect(screen.getByRole('checkbox')).toHaveFocus();
  });

  it('can be toggled via keyboard space', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<Checkbox label="Space toggle" onChange={onChange} />);

    await user.tab();
    await user.keyboard(' ');

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('clicking label toggles checkbox', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<Checkbox label="Click label" onChange={onChange} />);

    await user.click(screen.getByText('Click label'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
