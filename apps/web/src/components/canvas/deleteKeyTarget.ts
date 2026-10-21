/**
 * Delete Key Target for Quar Animator
 * Who a Delete/Backspace on the canvas is for: the active tool, when it has
 * something of its own to remove, or else the selected layers.
 */

export interface DeleteKeyState {
  /** The Pen is part-way through a path: the key takes back its last point. */
  penDrawing: boolean;
  /** Direct Selection is active with points picked: the key deletes those points. */
  directSelectionActive: boolean;
  directSelectionPointCount: number;
}

export function deleteKeyTarget(state: DeleteKeyState): 'tool' | 'selection' {
  if (state.penDrawing) return 'tool';
  if (state.directSelectionActive && state.directSelectionPointCount > 0) return 'tool';
  return 'selection';
}
