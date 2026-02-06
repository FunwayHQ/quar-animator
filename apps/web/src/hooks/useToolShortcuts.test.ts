/**
 * Tests for useToolShortcuts hook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useToolShortcuts, getToolShortcut } from './useToolShortcuts';
import { useEditorStore, DEFAULT_FILL, DEFAULT_STROKE } from '../stores/editorStore';

// ============================================================================
// Test Helpers
// ============================================================================

function dispatchKeyDown(
  key: string,
  options: Partial<KeyboardEventInit> = {},
  target?: HTMLElement
) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });

  // Set a default target if not provided
  if (target) {
    Object.defineProperty(event, 'target', { value: target, writable: false });
  } else {
    Object.defineProperty(event, 'target', { value: document.body, writable: false });
  }

  window.dispatchEvent(event);
  return event;
}

function resetStore() {
  useEditorStore.setState({
    activeTool: 'selection',
    selectedNodeIds: new Set<string>(),
    defaultFill: DEFAULT_FILL,
    defaultStroke: DEFAULT_STROKE,
    isDrawing: false,
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('useToolShortcuts', () => {
  beforeEach(() => {
    resetStore();
  });

  // ==========================================================================
  // Basic Shortcuts
  // ==========================================================================

  describe('basic shortcuts', () => {
    it('should switch to selection tool with V', () => {
      useEditorStore.getState().setActiveTool('rectangle');
      renderHook(() => useToolShortcuts());

      dispatchKeyDown('v');

      expect(useEditorStore.getState().activeTool).toBe('selection');
    });

    it('should switch to rectangle tool with R', () => {
      renderHook(() => useToolShortcuts());

      dispatchKeyDown('r');

      expect(useEditorStore.getState().activeTool).toBe('rectangle');
    });

    it('should switch to ellipse tool with O', () => {
      renderHook(() => useToolShortcuts());

      dispatchKeyDown('o');

      expect(useEditorStore.getState().activeTool).toBe('ellipse');
    });

    it('should switch to pen tool with P', () => {
      renderHook(() => useToolShortcuts());

      dispatchKeyDown('p');

      expect(useEditorStore.getState().activeTool).toBe('pen');
    });
  });

  // ==========================================================================
  // Case Insensitivity
  // ==========================================================================

  describe('case insensitivity', () => {
    it('should handle uppercase V', () => {
      renderHook(() => useToolShortcuts());

      dispatchKeyDown('V');

      expect(useEditorStore.getState().activeTool).toBe('selection');
    });

    it('should handle uppercase R', () => {
      renderHook(() => useToolShortcuts());

      dispatchKeyDown('R');

      expect(useEditorStore.getState().activeTool).toBe('rectangle');
    });

    it('should handle uppercase O', () => {
      renderHook(() => useToolShortcuts());

      dispatchKeyDown('O');

      expect(useEditorStore.getState().activeTool).toBe('ellipse');
    });

    it('should handle uppercase P', () => {
      renderHook(() => useToolShortcuts());

      dispatchKeyDown('P');

      expect(useEditorStore.getState().activeTool).toBe('pen');
    });
  });

  // ==========================================================================
  // Modifier Keys
  // ==========================================================================

  describe('modifier keys', () => {
    it('should ignore when Ctrl is pressed', () => {
      renderHook(() => useToolShortcuts());

      dispatchKeyDown('r', { ctrlKey: true });

      expect(useEditorStore.getState().activeTool).toBe('selection');
    });

    it('should ignore when Alt is pressed', () => {
      renderHook(() => useToolShortcuts());

      dispatchKeyDown('r', { altKey: true });

      expect(useEditorStore.getState().activeTool).toBe('selection');
    });

    it('should ignore when Meta is pressed', () => {
      renderHook(() => useToolShortcuts());

      dispatchKeyDown('r', { metaKey: true });

      expect(useEditorStore.getState().activeTool).toBe('selection');
    });

    it('should ignore when Shift is pressed', () => {
      renderHook(() => useToolShortcuts());

      dispatchKeyDown('r', { shiftKey: true });

      expect(useEditorStore.getState().activeTool).toBe('selection');
    });
  });

  // ==========================================================================
  // Input Focus
  // ==========================================================================

  describe('input focus', () => {
    it('should ignore when input element is focused', () => {
      renderHook(() => useToolShortcuts());

      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent('keydown', {
        key: 'r',
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'target', { value: input });
      window.dispatchEvent(event);

      expect(useEditorStore.getState().activeTool).toBe('selection');

      document.body.removeChild(input);
    });

    it('should ignore when textarea element is focused', () => {
      renderHook(() => useToolShortcuts());

      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();

      const event = new KeyboardEvent('keydown', {
        key: 'r',
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'target', { value: textarea });
      window.dispatchEvent(event);

      expect(useEditorStore.getState().activeTool).toBe('selection');

      document.body.removeChild(textarea);
    });

    it('should ignore when contentEditable element is focused', () => {
      renderHook(() => useToolShortcuts());

      const div = document.createElement('div');
      div.setAttribute('contenteditable', 'true');
      // Also set isContentEditable as JSDOM may not auto-compute it
      Object.defineProperty(div, 'isContentEditable', { value: true, configurable: true });
      document.body.appendChild(div);
      div.focus();

      const event = new KeyboardEvent('keydown', {
        key: 'r',
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'target', { value: div });
      window.dispatchEvent(event);

      expect(useEditorStore.getState().activeTool).toBe('selection');

      document.body.removeChild(div);
    });
  });

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  describe('cleanup', () => {
    it('should remove event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() => useToolShortcuts());
      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });
  });

  // ==========================================================================
  // Unrecognized Keys
  // ==========================================================================

  describe('unrecognized keys', () => {
    it('should not change tool for unrecognized key', () => {
      renderHook(() => useToolShortcuts());

      dispatchKeyDown('x');

      expect(useEditorStore.getState().activeTool).toBe('selection');
    });

    it('should not change tool for number keys', () => {
      renderHook(() => useToolShortcuts());

      dispatchKeyDown('1');

      expect(useEditorStore.getState().activeTool).toBe('selection');
    });
  });
});

// ============================================================================
// getToolShortcut Tests
// ============================================================================

describe('getToolShortcut', () => {
  it('should return V for selection', () => {
    expect(getToolShortcut('selection')).toBe('V');
  });

  it('should return R for rectangle', () => {
    expect(getToolShortcut('rectangle')).toBe('R');
  });

  it('should return O for ellipse', () => {
    expect(getToolShortcut('ellipse')).toBe('O');
  });

  it('should return P for pen', () => {
    expect(getToolShortcut('pen')).toBe('P');
  });

  it('should return null for brush (no shortcut)', () => {
    expect(getToolShortcut('brush')).toBeNull();
  });

  it('should return null for eraser (no shortcut)', () => {
    expect(getToolShortcut('eraser')).toBeNull();
  });
});
