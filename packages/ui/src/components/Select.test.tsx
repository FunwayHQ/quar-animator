import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './Select';

const options = [
  { value: 'option1', label: 'Option 1' },
  { value: 'option2', label: 'Option 2' },
  { value: 'option3', label: 'Option 3' },
];

describe('Select', () => {
  it('renders with options', () => {
    render(<Select options={options} />);

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();

    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(screen.getByText('Option 2')).toBeInTheDocument();
    expect(screen.getByText('Option 3')).toBeInTheDocument();
  });

  it('renders with placeholder', () => {
    render(<Select options={options} placeholder="Select an option" />);
    expect(screen.getByText('Select an option')).toBeInTheDocument();
  });

  it('renders with label', () => {
    render(<Select options={options} label="Choose" />);
    expect(screen.getByText('Choose')).toBeInTheDocument();
  });

  it('renders with helper text', () => {
    render(<Select options={options} helperText="Select one" />);
    expect(screen.getByText('Select one')).toBeInTheDocument();
  });

  it('renders error state with error message', () => {
    render(<Select options={options} error errorMessage="Required" />);
    expect(screen.getByText('Required')).toBeInTheDocument();
  });

  it('handles selection change', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<Select options={options} onChange={onChange} />);

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'option2');

    expect(onChange).toHaveBeenCalled();
  });

  it('renders disabled state', () => {
    render(<Select options={options} disabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('renders disabled options', () => {
    const optionsWithDisabled = [
      ...options,
      { value: 'disabled', label: 'Disabled Option', disabled: true },
    ];
    render(<Select options={optionsWithDisabled} />);

    const disabledOption = screen.getByText('Disabled Option');
    expect(disabledOption).toBeDisabled();
  });

  it('renders different sizes', () => {
    const { rerender } = render(<Select options={options} size="sm" />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();

    rerender(<Select options={options} size="md" />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();

    rerender(<Select options={options} size="lg" />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('supports fullWidth prop', () => {
    const { container } = render(<Select options={options} fullWidth />);
    const wrapper = container.firstChild;
    expect(wrapper).toHaveStyle({ width: '100%' });
  });
});
