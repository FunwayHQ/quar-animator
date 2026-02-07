/**
 * Tests for useProjectShortcuts Hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useProjectShortcuts } from './useProjectShortcuts';

describe('useProjectShortcuts', () => {
  const callbacks = {
    onSave: vi.fn(),
    onSaveAs: vi.fn(),
    onNew: vi.fn(),
    onOpen: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function fireKeyDown(key: string, options: Partial<KeyboardEvent> = {}) {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        ctrlKey: true,
        bubbles: true,
        ...options,
      })
    );
  }

  it('should call onSave on Ctrl+S', () => {
    renderHook(() => useProjectShortcuts(callbacks));
    fireKeyDown('s');
    expect(callbacks.onSave).toHaveBeenCalledOnce();
  });

  it('should call onSaveAs on Ctrl+Shift+S', () => {
    renderHook(() => useProjectShortcuts(callbacks));
    fireKeyDown('S', { shiftKey: true });
    expect(callbacks.onSaveAs).toHaveBeenCalledOnce();
    expect(callbacks.onSave).not.toHaveBeenCalled();
  });

  it('should call onNew on Ctrl+N', () => {
    renderHook(() => useProjectShortcuts(callbacks));
    fireKeyDown('n');
    expect(callbacks.onNew).toHaveBeenCalledOnce();
  });

  it('should call onOpen on Ctrl+O', () => {
    renderHook(() => useProjectShortcuts(callbacks));
    fireKeyDown('o');
    expect(callbacks.onOpen).toHaveBeenCalledOnce();
  });

  it('should not trigger without Ctrl key', () => {
    renderHook(() => useProjectShortcuts(callbacks));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: false, bubbles: true }));
    expect(callbacks.onSave).not.toHaveBeenCalled();
  });

  it('should not trigger when input is focused', () => {
    renderHook(() => useProjectShortcuts(callbacks));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      bubbles: true,
    });
    Object.defineProperty(event, 'target', { value: input });
    window.dispatchEvent(event);

    expect(callbacks.onSave).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('should clean up listener on unmount', () => {
    const { unmount } = renderHook(() => useProjectShortcuts(callbacks));
    unmount();
    fireKeyDown('s');
    expect(callbacks.onSave).not.toHaveBeenCalled();
  });
});
