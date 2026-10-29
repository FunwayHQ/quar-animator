import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { SceneGraph } from '@quar/core';
import { addKeyframe, getOrCreateTrack } from '@quar/animation';
import { useEditorStore } from '../stores/editorStore';
import { useUndoShortcuts } from './useUndoShortcuts';

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('useUndoShortcuts', () => {
  const sg = new SceneGraph();
  const undo = vi.fn();
  const redo = vi.fn();
  const original = { undo: useEditorStore.getState().undo, redo: useEditorStore.getState().redo };

  beforeEach(() => {
    undo.mockClear();
    redo.mockClear();
    useEditorStore.setState({ undo, redo });
  });

  afterEach(() => {
    useEditorStore.setState(original);
    document.body.innerHTML = '';
  });

  it('undoes with Cmd+Z or Ctrl+Z wherever focus is', () => {
    renderHook(() => useUndoShortcuts(sg));
    expect(press('z', { metaKey: true }).defaultPrevented).toBe(true);
    press('z', { ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(2);
    expect(undo).toHaveBeenCalledWith(sg);
  });

  it('redoes with Cmd/Ctrl+Shift+Z or Ctrl+Y', () => {
    renderHook(() => useUndoShortcuts(sg));
    press('Z', { metaKey: true, shiftKey: true });
    press('z', { ctrlKey: true, shiftKey: true });
    press('y', { ctrlKey: true });
    expect(redo).toHaveBeenCalledTimes(3);
    expect(undo).not.toHaveBeenCalled();
  });

  it('leaves text fields their own undo', () => {
    renderHook(() => useUndoShortcuts(sg));
    const input = document.createElement('input');
    document.body.appendChild(input);
    expect(press('z', { metaKey: true }, input).defaultPrevented).toBe(false);
    expect(undo).not.toHaveBeenCalled();
  });

  it('undoes from a slider, checkbox or list just used (they have no undo of their own)', () => {
    renderHook(() => useUndoShortcuts(sg));
    const controls = [
      Object.assign(document.createElement('input'), { type: 'range' }),
      Object.assign(document.createElement('input'), { type: 'checkbox' }),
      document.createElement('select'),
    ];
    for (const control of controls) {
      document.body.appendChild(control);
      expect(press('z', { metaKey: true }, control).defaultPrevented).toBe(true);
    }
    expect(undo).toHaveBeenCalledTimes(3);

    // A number field keeps its own
    const number = Object.assign(document.createElement('input'), { type: 'number' });
    document.body.appendChild(number);
    press('z', { ctrlKey: true }, number);
    expect(undo).toHaveBeenCalledTimes(3);
  });

  it('ignores Z without a modifier', () => {
    renderHook(() => useUndoShortcuts(sg));
    press('z');
    expect(undo).not.toHaveBeenCalled();
  });
});

describe('undoing Delete Animation from the keyboard', () => {
  it('brings the animation back', () => {
    useEditorStore.getState().resetProject();
    const sg = new SceneGraph();
    renderHook(() => useUndoShortcuts(sg));
    const track = getOrCreateTrack<number>(useEditorStore.getState().timeline, 'shape', 'opacity');
    addKeyframe(track, 0, 0);
    addKeyframe(track, 10, 1);

    useEditorStore.getState().deleteLayerAnimation(sg, ['shape']);
    expect(useEditorStore.getState().timeline.tracks).toHaveLength(0);

    press('z', { metaKey: true });
    expect(useEditorStore.getState().timeline.tracks[0]!.keyframes).toHaveLength(2);
  });
});
