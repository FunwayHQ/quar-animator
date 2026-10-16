import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useContextMenu } from './useContextMenu';

describe('useContextMenu', () => {
  it('starts closed and opens at the pointer position without bubbling the event', () => {
    const { result } = renderHook(() => useContextMenu());
    const event = {
      clientX: 24,
      clientY: 48,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.MouseEvent;

    expect(result.current.menuState).toEqual({ isOpen: false, x: 0, y: 0 });

    act(() => result.current.openMenu(event));

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(result.current.menuState).toEqual({ isOpen: true, x: 24, y: 48 });
  });

  it('closes the menu and resets its position', () => {
    const { result } = renderHook(() => useContextMenu());
    const event = {
      clientX: 100,
      clientY: 200,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => result.current.openMenu(event));
    act(() => result.current.closeMenu());

    expect(result.current.menuState).toEqual({ isOpen: false, x: 0, y: 0 });
  });
});
