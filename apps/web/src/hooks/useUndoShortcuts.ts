/**
 * Undo and redo from the keyboard anywhere in the editor — not only while the
 * canvas has focus (after using the timeline or a panel, Cmd/Ctrl+Z did
 * nothing). Text fields keep their own native undo.
 *
 * Undo: Cmd+Z (macOS) / Ctrl+Z. Redo: Cmd+Shift+Z / Ctrl+Shift+Z / Ctrl+Y.
 */

import { useEffect } from 'react';
import type { SceneGraphLike } from '../stores/editorStore';
import { useEditorStore } from '../stores/editorStore';

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
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
