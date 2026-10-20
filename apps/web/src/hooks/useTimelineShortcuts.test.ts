/**
 * Tests for useTimelineShortcuts hook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTimelineShortcuts } from './useTimelineShortcuts';
import { useEditorStore, DEFAULT_FILL, DEFAULT_STROKE } from '../stores/editorStore';
import { DEFAULT_ONION_SKIN_SETTINGS } from '@quar/core';

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
      onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
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

  describe('Space wherever focus is', () => {
    /** Press (and release) Space on an element, as the browser delivers it. */
    function spaceOn(target: EventTarget, type: 'keydown' | 'keyup', init: KeyboardEventInit = {}) {
      const event = new KeyboardEvent(type, {
        key: ' ',
        code: 'Space',
        bubbles: true,
        cancelable: true,
        ...init,
      });
      target.dispatchEvent(event);
      return event;
    }

    function mount<T extends HTMLElement>(element: T): T {
      document.body.appendChild(element);
      return element;
    }

    it('plays from the canvas on release, leaving the press to the canvas for panning', () => {
      const callbacks = createCallbacks();
      renderHook(() => useTimelineShortcuts(callbacks));
      const canvas = mount(document.createElement('canvas'));
      const canvasKeys = vi.fn();
      canvas.addEventListener('keydown', canvasKeys);

      spaceOn(canvas, 'keydown');
      expect(callbacks.togglePlay).not.toHaveBeenCalled();
      expect(canvasKeys).toHaveBeenCalledTimes(1);
      spaceOn(canvas, 'keydown', { repeat: true });
      spaceOn(canvas, 'keyup');

      expect(callbacks.togglePlay).toHaveBeenCalledTimes(1);
      canvas.remove();
    });

    it('does not play after a Space+drag pan on the canvas', () => {
      const callbacks = createCallbacks();
      renderHook(() => useTimelineShortcuts(callbacks));
      const canvas = mount(document.createElement('canvas'));

      spaceOn(canvas, 'keydown');
      canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      spaceOn(canvas, 'keyup');

      expect(callbacks.togglePlay).not.toHaveBeenCalled();
      canvas.remove();
    });

    it('plays from a focused button without clicking it', () => {
      const callbacks = createCallbacks();
      renderHook(() => useTimelineShortcuts(callbacks));
      const button = mount(document.createElement('button'));
      const buttonKeys = vi.fn();
      button.addEventListener('keydown', buttonKeys);
      button.addEventListener('keyup', buttonKeys);

      const down = spaceOn(button, 'keydown');
      const up = spaceOn(button, 'keyup');

      expect(callbacks.togglePlay).toHaveBeenCalledTimes(1);
      expect(down.defaultPrevented).toBe(true);
      expect(up.defaultPrevented).toBe(true);
      expect(buttonKeys).not.toHaveBeenCalled();
      button.remove();
    });

    it('plays from checkboxes and sliders, but types into text fields', () => {
      const callbacks = createCallbacks();
      renderHook(() => useTimelineShortcuts(callbacks));
      const checkbox = mount(Object.assign(document.createElement('input'), { type: 'checkbox' }));
      const text = mount(document.createElement('input'));
      const area = mount(document.createElement('textarea'));

      spaceOn(checkbox, 'keydown');
      expect(callbacks.togglePlay).toHaveBeenCalledTimes(1);

      const typed = spaceOn(text, 'keydown');
      spaceOn(area, 'keydown');
      expect(callbacks.togglePlay).toHaveBeenCalledTimes(1);
      expect(typed.defaultPrevented).toBe(false);
      for (const element of [checkbox, text, area]) element.remove();
    });

    it('leaves Space with a modifier alone', () => {
      const callbacks = createCallbacks();
      renderHook(() => useTimelineShortcuts(callbacks));

      pressKey(' ', { shiftKey: true });
      pressKey(' ', { metaKey: true });

      expect(callbacks.togglePlay).not.toHaveBeenCalled();
    });
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

  it('Shift+O should toggle onion skin in store', () => {
    const callbacks = createCallbacks();
    renderHook(() => useTimelineShortcuts(callbacks));

    expect(useEditorStore.getState().onionSkin.enabled).toBe(false);
    pressKey('O', { shiftKey: true });
    expect(useEditorStore.getState().onionSkin.enabled).toBe(true);
    pressKey('O', { shiftKey: true });
    expect(useEditorStore.getState().onionSkin.enabled).toBe(false);
  });

  it('Shift+A should toggle the Animation Sequence window', () => {
    const callbacks = createCallbacks();
    renderHook(() => useTimelineShortcuts(callbacks));

    useEditorStore.setState({ sequenceWindowOpen: false });
    pressKey('A', { shiftKey: true });
    expect(useEditorStore.getState().sequenceWindowOpen).toBe(true);
    pressKey('A', { shiftKey: true });
    expect(useEditorStore.getState().sequenceWindowOpen).toBe(false);
  });

  it('Shift+. should jump 10 frames forward', () => {
    useEditorStore.setState({ currentFrame: 20 });
    const callbacks = createCallbacks();
    renderHook(() => useTimelineShortcuts(callbacks));

    pressKey('>', { shiftKey: true });
    expect(useEditorStore.getState().currentFrame).toBe(30);
  });

  it('Shift+, should jump 10 frames backward', () => {
    useEditorStore.setState({ currentFrame: 20 });
    const callbacks = createCallbacks();
    renderHook(() => useTimelineShortcuts(callbacks));

    pressKey('<', { shiftKey: true });
    expect(useEditorStore.getState().currentFrame).toBe(10);
  });
});
