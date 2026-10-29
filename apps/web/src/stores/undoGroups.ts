/**
 * Gestures as undo steps: a drag is one step however many changes it makes
 * on the way (the store's beginUndoGroup / endUndoGroup).
 */

import { useEditorStore } from './editorStore';

const RELEASE_EVENTS = ['pointerup', 'pointercancel', 'mouseup'] as const;

/**
 * Make the press starting now one undo step: an undo group open until the
 * pointer is released, wherever that happens.
 */
export function undoGroupUntilRelease(): void {
  const group = useEditorStore.getState().beginUndoGroup();
  const end = () => {
    useEditorStore.getState().endUndoGroup(group);
    for (const type of RELEASE_EVENTS) window.removeEventListener(type, end, true);
  };
  for (const type of RELEASE_EVENTS) window.addEventListener(type, end, true);
}
