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

  it('names the select by its label', () => {
    render(<Select options={options} label="Frame Rate" />);
    expect(screen.getByLabelText('Frame Rate')).toBe(screen.getByRole('combobox'));
    expect(screen.getByRole('combobox', { name: 'Frame Rate' })).toBeInTheDocument();
  });

  it('focuses the select when its label is clicked', async () => {
    const user = userEvent.setup();
    render(<Select options={options} label="Frame Rate" />);

    await user.click(screen.getByText('Frame Rate'));
    expect(screen.getByRole('combobox', { name: 'Frame Rate' })).toHaveFocus();
  });

  it('keeps an id given by the caller', () => {
    render(<Select options={options} id="fps" label="Frame Rate" />);
    expect(screen.getByLabelText('Frame Rate')).toHaveAttribute('id', 'fps');
  });

  it('gives each select its own id', () => {
    render(
      <>
        <Select options={options} label="First" />
        <Select options={options} label="Second" />
      </>
    );
    expect(screen.getByLabelText('First')).not.toBe(screen.getByLabelText('Second'));
  });

  it('describes the select with its helper text', () => {
    render(<Select options={options} label="Frame Rate" helperText="Frames per second" />);
    const select = screen.getByLabelText('Frame Rate');
    expect(select).toHaveAccessibleDescription('Frames per second');
    expect(select).not.toHaveAttribute('aria-invalid');
  });

  it('marks a select with an error invalid and describes it with the message', () => {
    render(
      <Select
        options={options}
        label="Frame Rate"
        helperText="Helper"
        error
        errorMessage="Required"
      />
    );
    const select = screen.getByLabelText('Frame Rate');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription('Required');
  });

  it('keeps a description given by the caller alongside its own', () => {
    render(
      <>
        <span id="fps-hint">Project wide</span>
        <Select
          options={options}
          label="Frame Rate"
          aria-describedby="fps-hint"
          helperText="Frames per second"
        />
      </>
    );
    expect(screen.getByLabelText('Frame Rate')).toHaveAccessibleDescription(
      'Project wide Frames per second'
    );
  });

  it('has no description without helper text or an error message', () => {
    render(<Select options={options} label="Frame Rate" error />);
    const select = screen.getByLabelText('Frame Rate');
    expect(select).not.toHaveAttribute('aria-describedby');
    expect(select).toHaveAttribute('aria-invalid', 'true');
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
