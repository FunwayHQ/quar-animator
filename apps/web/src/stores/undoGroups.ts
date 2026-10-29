/**
 * Gestures as undo steps: a drag is one step however many changes it makes
 * on the way (the store's beginUndoGroup / endUndoGroup).
 */

import { useEditorStore } from './editorStore';
import type { UndoGroup } from './editorStore';

/**
 * What ends a press: its release — or, should a native menu or popup have
 * taken that, the next press or key, or leaving the window.
 */
const END_EVENTS = ['pointerup', 'pointercancel', 'mouseup', 'pointerdown', 'keydown', 'blur'];
/** Keys held during a drag (Shift to constrain it), not the end of it. */
const MODIFIER_KEYS = new Set(['Shift', 'Alt', 'Control', 'Meta']);

/**
 * Make the press starting now one undo step: an undo group open until the
 * pointer is released, wherever that happens.
 */
export function undoGroupUntilRelease(): UndoGroup {
  const group = useEditorStore.getState().beginUndoGroup();
  const end = (event: Event) => {
    if (event instanceof KeyboardEvent && MODIFIER_KEYS.has(event.key)) return;
    // A field losing focus to the press isn't the window being left
    if (event.type === 'blur' && event.target !== window) return;
    useEditorStore.getState().endUndoGroup(group);
    for (const type of END_EVENTS) window.removeEventListener(type, end, true);
  };
  // Capturing: this press has gone past the window already, the next one won't have
  for (const type of END_EVENTS) window.addEventListener(type, end, true);
  return group;
}
