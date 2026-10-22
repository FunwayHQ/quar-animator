import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './Input';

describe('Input', () => {
  it('renders with placeholder', () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  it('renders with label', () => {
    render(<Input label="Email" placeholder="Enter email" />);
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('names the input by its label', () => {
    render(<Input label="Email" placeholder="Enter email" />);
    expect(screen.getByLabelText('Email')).toBe(screen.getByPlaceholderText('Enter email'));
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeInTheDocument();
  });

  it('focuses the input when its label is clicked', async () => {
    const user = userEvent.setup();
    render(<Input label="Email" />);

    await user.click(screen.getByText('Email'));
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveFocus();
  });

  it('keeps an id given by the caller', () => {
    render(<Input id="email-field" label="Email" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('id', 'email-field');
  });

  it('gives each input its own id', () => {
    render(
      <>
        <Input label="First" />
        <Input label="Second" />
      </>
    );
    expect(screen.getByLabelText('First')).not.toBe(screen.getByLabelText('Second'));
  });

  it('describes the input with its helper text', () => {
    render(<Input label="Email" helperText="We never share it" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAccessibleDescription('We never share it');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('marks an input with an error invalid and describes it with the message', () => {
    render(<Input label="Email" helperText="Helper" error errorMessage="Invalid" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Invalid');
  });

  it('keeps a description given by the caller alongside its own', () => {
    render(
      <>
        <span id="email-hint">Work address</span>
        <Input label="Email" aria-describedby="email-hint" helperText="We never share it" />
      </>
    );
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
      'Work address We never share it'
    );
  });

  it('has no description without helper text or an error message', () => {
    render(<Input label="Email" error />);
    const input = screen.getByLabelText('Email');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('renders with helper text', () => {
    render(<Input helperText="This is helpful" />);
    expect(screen.getByText('This is helpful')).toBeInTheDocument();
  });

  it('renders error state with error message', () => {
    render(<Input error errorMessage="Invalid input" />);
    expect(screen.getByText('Invalid input')).toBeInTheDocument();
  });

  it('does not show helper text when error is shown', () => {
    render(<Input helperText="Helper" error errorMessage="Error" />);
    expect(screen.queryByText('Helper')).not.toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('handles input changes', async () => {
    const user = userEvent.setup();
    render(<Input placeholder="Type here" />);

    const input = screen.getByPlaceholderText('Type here');
    await user.type(input, 'Hello');

    expect(input).toHaveValue('Hello');
  });

  it('renders disabled state', () => {
    render(<Input disabled placeholder="Disabled" />);
    expect(screen.getByPlaceholderText('Disabled')).toBeDisabled();
  });

  it('renders different sizes', () => {
    const { rerender } = render(<Input size="sm" placeholder="Small" />);
    expect(screen.getByPlaceholderText('Small')).toBeInTheDocument();

    rerender(<Input size="md" placeholder="Medium" />);
    expect(screen.getByPlaceholderText('Medium')).toBeInTheDocument();

    rerender(<Input size="lg" placeholder="Large" />);
    expect(screen.getByPlaceholderText('Large')).toBeInTheDocument();
  });

  it('renders with left icon', () => {
    render(<Input iconLeft={<span data-testid="left-icon">🔍</span>} />);
    expect(screen.getByTestId('left-icon')).toBeInTheDocument();
  });

  it('renders with right icon', () => {
    render(<Input iconRight={<span data-testid="right-icon">✓</span>} />);
    expect(screen.getByTestId('right-icon')).toBeInTheDocument();
  });

  it('calls onFocus and onBlur handlers', async () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const user = userEvent.setup();

    render(<Input onFocus={onFocus} onBlur={onBlur} placeholder="Focus test" />);
    const input = screen.getByPlaceholderText('Focus test');

    await user.click(input);
    expect(onFocus).toHaveBeenCalledTimes(1);

    await user.tab();
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('supports fullWidth prop', () => {
    const { container } = render(<Input fullWidth />);
    const wrapper = container.firstChild;
    expect(wrapper).toHaveStyle({ width: '100%' });
  });
});
