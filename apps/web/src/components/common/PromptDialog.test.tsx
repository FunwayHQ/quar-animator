import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromptDialog, PromptDialogHost, confirmDialog, promptDialog } from './PromptDialog';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('PromptDialog', () => {
  it('renders its initial value and prevents confirming an empty prompt', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <PromptDialog
        title="Rename layer"
        placeholder="Layer name"
        defaultValue="Layer 1"
        confirmLabel="Save"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Rename layer' })).toBeTruthy();
    expect(screen.getByTestId('prompt-dialog-input')).toHaveProperty('value', 'Layer 1');
    expect(screen.getByTestId('prompt-dialog-input')).toHaveProperty('placeholder', 'Layer name');
    expect(screen.getByTestId('prompt-dialog-confirm').textContent).toBe('Save');

    fireEvent.change(screen.getByTestId('prompt-dialog-input'), { target: { value: '   ' } });
    expect(screen.getByTestId('prompt-dialog-confirm')).toHaveProperty('disabled', true);
    fireEvent.keyDown(screen.getByTestId('prompt-dialog-input'), { key: 'Enter' });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('trims the confirmed value after the exit transition', () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<PromptDialog title="New profile" onConfirm={onConfirm} onCancel={onCancel} />);
    const input = screen.getByTestId('prompt-dialog-input');
    fireEvent.change(input, { target: { value: '  Walk cycle  ' } });
    fireEvent.click(screen.getByTestId('prompt-dialog-confirm'));

    expect(onConfirm).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(120));

    expect(onConfirm).toHaveBeenCalledWith('Walk cycle');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels on Escape or backdrop click, but not on dialog content', () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <PromptDialog title="Rename" defaultValue="Layer" onConfirm={onConfirm} onCancel={onCancel} />
    );

    fireEvent.mouseDown(screen.getByTestId('prompt-dialog'));
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByTestId('prompt-dialog-input'), { key: 'Escape' });
    act(() => vi.advanceTimersByTime(120));
    expect(onCancel).toHaveBeenCalledOnce();

    cleanup();
    onCancel.mockClear();
    render(
      <PromptDialog title="Rename" defaultValue="Layer" onConfirm={onConfirm} onCancel={onCancel} />
    );
    fireEvent.mouseDown(screen.getByTestId('prompt-dialog-backdrop'));
    act(() => vi.advanceTimersByTime(120));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('PromptDialogHost imperative API', () => {
  it('resolves the prompt promise with the confirmed value', async () => {
    vi.useFakeTimers();
    render(<PromptDialogHost />);

    let result!: Promise<string | null>;
    act(() => {
      result = promptDialog({ title: 'Create group', placeholder: 'Group name' });
    });
    fireEvent.change(screen.getByTestId('prompt-dialog-input'), { target: { value: 'Faces' } });
    fireEvent.click(screen.getByTestId('prompt-dialog-confirm'));
    act(() => vi.advanceTimersByTime(120));

    await expect(result).resolves.toBe('Faces');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('resolves the prompt promise with null when cancelled', async () => {
    vi.useFakeTimers();
    render(<PromptDialogHost />);

    let result!: Promise<string | null>;
    act(() => {
      result = promptDialog({ title: 'Create group' });
    });
    fireEvent.click(screen.getByTestId('prompt-dialog-cancel'));
    act(() => vi.advanceTimersByTime(120));

    await expect(result).resolves.toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('PromptDialogHost with more than one question at a time (F159)', () => {
  it('asks a second question once the first is answered, settling both', async () => {
    vi.useFakeTimers();
    render(<PromptDialogHost />);

    let first!: Promise<string | null>;
    let second!: Promise<string | null>;
    act(() => {
      first = promptDialog({ title: 'Name the group', defaultValue: 'Faces' });
      second = promptDialog({ title: 'Name the symbol', defaultValue: 'Star' });
    });

    // The first question is asked first
    expect(screen.getByText('Name the group')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('prompt-dialog-confirm'));
    act(() => vi.advanceTimersByTime(120));
    await expect(first).resolves.toBe('Faces');

    // Then the second, with its own value
    expect(screen.getByText('Name the symbol')).toBeInTheDocument();
    expect(screen.getByTestId('prompt-dialog-input')).toHaveValue('Star');
    fireEvent.click(screen.getByTestId('prompt-dialog-cancel'));
    act(() => vi.advanceTimersByTime(120));
    await expect(second).resolves.toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('confirmDialog', () => {
  it('asks a question with no input, and resolves true when confirmed', async () => {
    vi.useFakeTimers();
    render(<PromptDialogHost />);

    let result!: Promise<boolean>;
    act(() => {
      result = confirmDialog({ title: 'Use it?', message: 'It calls out.', confirmLabel: 'Allow' });
    });
    expect(screen.getByText('It calls out.')).toBeInTheDocument();
    expect(screen.queryByTestId('prompt-dialog-input')).toBeNull();
    expect(screen.getByTestId('prompt-dialog-confirm')).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    act(() => vi.advanceTimersByTime(120));

    await expect(result).resolves.toBe(true);
  });

  it('resolves false on Escape', async () => {
    vi.useFakeTimers();
    render(<PromptDialogHost />);

    let result!: Promise<boolean>;
    act(() => {
      result = confirmDialog({ title: 'Use it?' });
    });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    act(() => vi.advanceTimersByTime(120));

    await expect(result).resolves.toBe(false);
  });

  it('names its other answer, when that isn’t Cancel', async () => {
    vi.useFakeTimers();
    render(<PromptDialogHost />);

    let result!: Promise<boolean>;
    act(() => {
      result = confirmDialog({ title: 'Delete it?', confirmLabel: 'Delete', cancelLabel: 'Keep' });
    });
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    act(() => vi.advanceTimersByTime(120));

    await expect(result).resolves.toBe(false);
  });
});
