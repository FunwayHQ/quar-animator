/**
 * The canvas's editing keys from anywhere in the editor, not only while the
 * canvas has focus: after a click in the Layers panel, say, Delete, the
 * arrows (nudge), Ctrl/Cmd+D, Ctrl/Cmd+A and Ctrl/Cmd+[ / ] (order) did
 * nothing — Chrome took Ctrl+D for a bookmark — and the brush keys of Weight
 * Paint ([ ] X), the Point Magnet ([ ] F Esc) and the Eraser ([ ]) waited
 * for a first stroke on the canvas. They go to the canvas's own key handler,
 * to do what they do there; with the canvas focused it has them already, so
 * nothing happens twice. Keys stay where they're typed into a field, in a
 * dialog or menu, or a place with keys of its own (the presentation); the
 * timeline keeps Delete and the arrows for its keyframes and sound clips.
 */

import { useEffect, type RefObject } from 'react';
import { POINT_MAGNET_KEYS } from '@quar/core';
import type { ToolType } from '@quar/types';
import { useEditorStore } from '../stores/editorStore';

/** Keys a tool's brush takes while it's the active tool. */
const BRUSH_KEYS: Partial<Record<ToolType, readonly string[]>> = {
  'weight-paint': ['[', ']', 'x', 'X'],
  'point-magnet': POINT_MAGNET_KEYS,
  eraser: ['[', ']'],
};

const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/** Delete and the arrows: the keys that remove or move what's picked. */
function editsPicked(event: KeyboardEvent): boolean {
  return event.key === 'Delete' || event.key === 'Backspace' || ARROWS.has(event.key);
}

/** Whether this is one of the canvas's editing keys, with this tool active. */
export function isCanvasEditKey(event: KeyboardEvent, activeTool: ToolType): boolean {
  if (event.altKey) return false;
  if (event.ctrlKey || event.metaKey) {
    const key = event.key.toLowerCase();
    if (key === '[' || key === ']') return true;
    return !event.shiftKey && (key === 'd' || key === 'a');
  }
  if (editsPicked(event)) return true;
  return !event.shiftKey && (BRUSH_KEYS[activeTool]?.includes(event.key) ?? false);
}

/** Whether a key is for where it was pressed (or something has taken it already). */
export function keyStaysThere(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return true;
  if (document.querySelector('[aria-modal="true"]')) return true;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
    return true;
  }
  const ownKeys = [
    '[contenteditable]:not([contenteditable="false"])',
    '[data-own-keys]',
    '[role="dialog"]',
    '[role="menu"]',
    '[role="listbox"]',
  ];
  if (target.closest(ownKeys.join(', '))) return true;
  return editsPicked(event) && target.closest('[data-own-edit-keys]') !== null;
}

interface EditShortcutsOptions {
  /** The canvas: its own key handler has the keys pressed on it */
  canvasRef: RefObject<HTMLElement>;
  /** The canvas's key handlers */
  onKeyDown: (event: KeyboardEvent) => void;
  onKeyUp: (event: KeyboardEvent) => void;
}

export function useEditShortcuts({ canvasRef, onKeyDown, onKeyUp }: EditShortcutsOptions): void {
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.target === canvasRef.current) return;
      if (!isCanvasEditKey(event, useEditorStore.getState().activeTool)) return;
      if (keyStaysThere(event)) return;
      // Nor does the browser bookmark the page, or scroll a list with the arrows
      event.preventDefault();
      onKeyDown(event);
    };
    // A run of arrow nudges ends, as one undo step, when the key is let go
    const up = (event: KeyboardEvent) => {
      if (event.target === canvasRef.current || !ARROWS.has(event.key)) return;
      if (keyStaysThere(event)) return;
      onKeyUp(event);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [canvasRef, onKeyDown, onKeyUp]);
}
