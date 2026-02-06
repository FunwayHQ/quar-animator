import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../test/utils';
import userEvent from '@testing-library/user-event';
import { ContextMenu } from './ContextMenu';
import type { ContextMenuEntry } from './ContextMenu';

function makeItems(overrides: Partial<ContextMenuEntry>[] = []): ContextMenuEntry[] {
  const defaults: ContextMenuEntry[] = [
    { id: 'copy', label: 'Copy', shortcut: 'Ctrl+C', onClick: vi.fn() },
    { id: 'paste', label: 'Paste', shortcut: 'Ctrl+V', onClick: vi.fn() },
    { type: 'separator' },
    { id: 'delete', label: 'Delete', danger: true, onClick: vi.fn() },
  ];
  // Apply overrides by index
  return defaults.map((item, i) => (overrides[i] ? { ...item, ...overrides[i] } : item));
}

describe('ContextMenu', () => {
  it('renders items with labels and shortcuts', () => {
    const items = makeItems();
    render(<ContextMenu x={100} y={100} items={items} onClose={vi.fn()} />);

    expect(screen.getByText('Copy')).toBeInTheDocument();
    expect(screen.getByText('Paste')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+C')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+V')).toBeInTheDocument();
  });

  it('calls onClick when item clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const items: ContextMenuEntry[] = [{ id: 'action', label: 'Action', onClick }];
    render(<ContextMenu x={100} y={100} items={items} onClose={vi.fn()} />);

    await user.click(screen.getByText('Action'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('calls onClose on click outside (overlay)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const items: ContextMenuEntry[] = [{ id: 'action', label: 'Action', onClick: vi.fn() }];
    render(<ContextMenu x={100} y={100} items={items} onClose={onClose} />);

    await user.click(screen.getByTestId('context-menu-overlay'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    const items: ContextMenuEntry[] = [{ id: 'action', label: 'Action', onClick: vi.fn() }];
    render(<ContextMenu x={100} y={100} items={items} onClose={onClose} />);

    fireEvent.keyDown(screen.getByTestId('context-menu'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('disabled items do not fire onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const items: ContextMenuEntry[] = [
      { id: 'disabled-action', label: 'Disabled', disabled: true, onClick },
    ];
    render(<ContextMenu x={100} y={100} items={items} onClose={vi.fn()} />);

    await user.click(screen.getByText('Disabled'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders separators', () => {
    const items: ContextMenuEntry[] = [
      { id: 'a', label: 'A', onClick: vi.fn() },
      { type: 'separator' },
      { id: 'b', label: 'B', onClick: vi.fn() },
    ];
    render(<ContextMenu x={100} y={100} items={items} onClose={vi.fn()} />);

    const separators = screen.getByTestId('context-menu').querySelectorAll('[role="separator"]');
    expect(separators).toHaveLength(1);
  });

  it('ArrowDown moves focus to next item', () => {
    const items: ContextMenuEntry[] = [
      { id: 'a', label: 'Item A', onClick: vi.fn() },
      { id: 'b', label: 'Item B', onClick: vi.fn() },
    ];
    render(<ContextMenu x={100} y={100} items={items} onClose={vi.fn()} />);

    const menu = screen.getByTestId('context-menu');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });

    // First item should be focused
    expect(screen.getByTestId('context-menu-item-a')).toHaveFocus();

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByTestId('context-menu-item-b')).toHaveFocus();
  });

  it('ArrowUp moves focus to previous item', () => {
    const items: ContextMenuEntry[] = [
      { id: 'a', label: 'Item A', onClick: vi.fn() },
      { id: 'b', label: 'Item B', onClick: vi.fn() },
    ];
    render(<ContextMenu x={100} y={100} items={items} onClose={vi.fn()} />);

    const menu = screen.getByTestId('context-menu');
    // Focus on second item
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByTestId('context-menu-item-b')).toHaveFocus();

    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(screen.getByTestId('context-menu-item-a')).toHaveFocus();
  });

  it('Enter activates focused item', () => {
    const onClick = vi.fn();
    const items: ContextMenuEntry[] = [
      { id: 'a', label: 'Item A', onClick },
      { id: 'b', label: 'Item B', onClick: vi.fn() },
    ];
    render(<ContextMenu x={100} y={100} items={items} onClose={vi.fn()} />);

    const menu = screen.getByTestId('context-menu');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyDown(menu, { key: 'Enter' });

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('danger items render with danger styling', () => {
    const items: ContextMenuEntry[] = [
      { id: 'delete', label: 'Delete', danger: true, onClick: vi.fn() },
    ];
    render(<ContextMenu x={100} y={100} items={items} onClose={vi.fn()} />);

    const deleteItem = screen.getByTestId('context-menu-item-delete');
    expect(deleteItem.className).toContain('danger');
  });
});
