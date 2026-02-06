/**
 * Tests for useTimelineShortcuts hook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTimelineShortcuts } from './useTimelineShortcuts';
import { useEditorStore, DEFAULT_FILL, DEFAULT_STROKE } from '../stores/editorStore';

function createCallbacks() {
  return {
    togglePlay: vi.fn(),
    goToStart: vi.fn(),
    goToEnd: vi.fn(),
    nextFrame: vi.fn(),
    prevFrame: vi.fn(),
  };
}

function pressKey(key: string, options: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    ...options,
  });
  window.dispatchEvent(event);
}

describe('useTimelineShortcuts', () => {
  beforeEach(() => {
    useEditorStore.setState({
      activeTool: 'selection',
      selectedNodeIds: new Set<string>(),
      defaultFill: DEFAULT_FILL,
      defaultStroke: DEFAULT_STROKE,
      isDrawing: false,
      brushSize: 5,
      brushSmoothing: 50,
      eraserSize: 10,
      eraserMode: 'stroke',
      aspectRatioLocked: false,
      currentFrame: 0,
      isPlaying: false,
      isLooping: false,
      timelineDuration: 300,
      frameRate: 30,
      timelineExpanded: true,
    });
  });

  it('Space should call togglePlay', () => {
    const callbacks = createCallbacks();
    renderHook(() => useTimelineShortcuts(callbacks));

    pressKey(' ');
    expect(callbacks.togglePlay).toHaveBeenCalledTimes(1);
  });

  it('Space with repeat should not trigger togglePlay', () => {
    const callbacks = createCallbacks();
    renderHook(() => useTimelineShortcuts(callbacks));

    pressKey(' ', { repeat: true });
    expect(callbacks.togglePlay).not.toHaveBeenCalled();
  });

  it('Home should call goToStart', () => {
    const callbacks = createCallbacks();
    renderHook(() => useTimelineShortcuts(callbacks));

    pressKey('Home');
    expect(callbacks.goToStart).toHaveBeenCalledTimes(1);
  });

  it('End should call goToEnd', () => {
    const callbacks = createCallbacks();
    renderHook(() => useTimelineShortcuts(callbacks));

    pressKey('End');
    expect(callbacks.goToEnd).toHaveBeenCalledTimes(1);
  });

  it('comma should call prevFrame when not playing', () => {
    const callbacks = createCallbacks();
    renderHook(() => useTimelineShortcuts(callbacks));

    pressKey(',');
    expect(callbacks.prevFrame).toHaveBeenCalledTimes(1);
  });

  it('period should call nextFrame when not playing', () => {
    const callbacks = createCallbacks();
    renderHook(() => useTimelineShortcuts(callbacks));

    pressKey('.');
    expect(callbacks.nextFrame).toHaveBeenCalledTimes(1);
  });

  it('comma should not call prevFrame when playing', () => {
    useEditorStore.setState({ isPlaying: true });
    const callbacks = createCallbacks();
    renderHook(() => useTimelineShortcuts(callbacks));

    pressKey(',');
    expect(callbacks.prevFrame).not.toHaveBeenCalled();
  });

  it('period should not call nextFrame when playing', () => {
    useEditorStore.setState({ isPlaying: true });
    const callbacks = createCallbacks();
    renderHook(() => useTimelineShortcuts(callbacks));

    pressKey('.');
    expect(callbacks.nextFrame).not.toHaveBeenCalled();
  });

  it('L should toggle isLooping in store', () => {
    const callbacks = createCallbacks();
    renderHook(() => useTimelineShortcuts(callbacks));

    pressKey('l');
    expect(useEditorStore.getState().isLooping).toBe(true);

    pressKey('l');
    expect(useEditorStore.getState().isLooping).toBe(false);
  });
});
