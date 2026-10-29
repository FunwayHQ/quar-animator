/**
 * Undo and redo from the keyboard anywhere in the editor — not only while the
 * canvas has focus (after using the timeline or a panel, Cmd/Ctrl+Z did
 * nothing). Text fields keep their own native undo; sliders, checkboxes and
 * lists have none, so after using one Cmd/Ctrl+Z undoes what it changed.
 *
 * Undo: Cmd+Z (macOS) / Ctrl+Z. Redo: Cmd+Shift+Z / Ctrl+Shift+Z / Ctrl+Y.
 */

import { useEffect } from 'react';
import type { SceneGraphLike } from '../stores/editorStore';
import { useEditorStore } from '../stores/editorStore';
import { CONTROL_INPUTS } from './useUndoableEdits';

function isTextField(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) return !CONTROL_INPUTS.has(target.type);
  return (
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function useUndoShortcuts(sceneGraph: SceneGraphLike): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (isTextField(event.target)) return;
      const key = event.key.toLowerCase();
      const redo = (key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey);
      const undo = key === 'z' && !event.shiftKey;
      if (!undo && !redo) return;
      event.preventDefault();
      if (undo) useEditorStore.getState().undo(sceneGraph);
      else useEditorStore.getState().redo(sceneGraph);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sceneGraph]);
}
