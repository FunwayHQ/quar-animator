/**
 * Tests for the canvas's editing keys working anywhere in the editor
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEditShortcuts } from './useEditShortcuts';
import { useEditorStore } from '../stores/editorStore';

describe('useEditShortcuts', () => {
  const onKeyDown = vi.fn();
  const onKeyUp = vi.fn();
  let canvas: HTMLCanvasElement;
  let place: HTMLElement;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    place = document.createElement('div');
    document.body.append(canvas, place);
    useEditorStore.setState({ activeTool: 'selection' });
    renderHook(() => useEditShortcuts({ canvasRef: { current: canvas }, onKeyDown, onKeyUp }));
  });
  afterEach(() => {
    document.body.innerHTML = '';
    onKeyDown.mockReset();
    onKeyUp.mockReset();
  });

  /** Press a key with focus on `target`; the event, to see whether it was taken. */
  function press(key: string, init: KeyboardEventInit = {}, target: Element = place) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  }

  it('sends Delete, the arrows, Ctrl/Cmd+D, +A and +[ / ] from elsewhere to the canvas', () => {
    const events = [
      press('Delete'),
      press('Backspace'),
      press('ArrowLeft'),
      press('ArrowUp', { shiftKey: true }),
      press('d', { ctrlKey: true }),
      press('a', { metaKey: true }),
      press(']', { ctrlKey: true }),
      press('[', { ctrlKey: true, shiftKey: true }),
    ];

    expect(onKeyDown.mock.calls.map(([event]) => (event as KeyboardEvent).key)).toEqual([
      'Delete',
      'Backspace',
      'ArrowLeft',
      'ArrowUp',
      'd',
      'a',
      ']',
      '[',
    ]);
    // The browser doesn't also bookmark the page, or scroll a list
    expect(events.every((event) => event.defaultPrevented)).toBe(true);
  });

  it('lets an arrow go too, so a run of nudges ends as one step', () => {
    place.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }));
    place.dispatchEvent(new KeyboardEvent('keyup', { key: 'q', bubbles: true }));
    expect(onKeyUp).toHaveBeenCalledTimes(1);
  });

  it("leaves the canvas's own keys to the canvas: never twice", () => {
    press('Delete', {}, canvas);
    press('d', { ctrlKey: true }, canvas);
    canvas.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }));
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(onKeyUp).not.toHaveBeenCalled();
  });

  it('gives the brush keys to Weight Paint, the Point Magnet and the Eraser', () => {
    press('[');
    press('x');
    expect(onKeyDown).not.toHaveBeenCalled(); // the Selection tool has no brush

    useEditorStore.setState({ activeTool: 'weight-paint' });
    press('[');
    press('X');
    useEditorStore.setState({ activeTool: 'point-magnet' });
    press('f');
    press('Escape');
    useEditorStore.setState({ activeTool: 'eraser' });
    press(']');
    press('x'); // not the Eraser's

    expect(onKeyDown.mock.calls.map(([event]) => (event as KeyboardEvent).key)).toEqual([
      '[',
      'X',
      'f',
      'Escape',
      ']',
    ]);
  });

  it('leaves other keys alone: tool letters, Ctrl+Shift+D, Alt', () => {
    press('a');
    press('v');
    press('d', { ctrlKey: true, shiftKey: true });
    press('ArrowLeft', { altKey: true });
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('leaves keys typed in a field, a dialog, a menu or a place with keys of its own', () => {
    const field = document.createElement('input');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const button = document.createElement('button');
    dialog.append(button);
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    const presentation = document.createElement('div');
    presentation.setAttribute('data-own-keys', '');
    document.body.append(field, editable, dialog, menu, presentation);

    for (const target of [field, editable, button, menu, presentation]) {
      press('Delete', {}, target);
      press('a', { ctrlKey: true }, target);
    }
    // Something already took it
    const taken = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });
    taken.preventDefault();
    place.dispatchEvent(taken);

    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('leaves every key while a modal dialog is open', () => {
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    document.body.append(modal);
    press('Delete');
    press('d', { ctrlKey: true });
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('lets the timeline keep Delete and the arrows for its keyframes and sounds, but not Ctrl+D', () => {
    const timeline = document.createElement('div');
    timeline.setAttribute('data-own-edit-keys', '');
    const keyframe = document.createElement('button');
    timeline.append(keyframe);
    document.body.append(timeline);

    press('Delete', {}, keyframe);
    press('ArrowRight', {}, keyframe);
    press('d', { ctrlKey: true }, keyframe);

    expect(onKeyDown.mock.calls.map(([event]) => (event as KeyboardEvent).key)).toEqual(['d']);
  });
});
