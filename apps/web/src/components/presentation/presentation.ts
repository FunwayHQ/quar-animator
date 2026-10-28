/**
 * Presentation
 * Plays the page's artboards as slides, full screen, one after another in
 * the Layers panel's order: each plays its own timeline (and sounds) once,
 * then holds on its last frame until ↓ (or Page Down) moves on, ↑ (or Page
 * Up) back. Escape leaves.
 */

import { create } from 'zustand';

export const usePresentation = create<{ open: boolean }>(() => ({ open: false }));

export const startPresentation = () => usePresentation.setState({ open: true });
export const stopPresentation = () => usePresentation.setState({ open: false });

/** The frame a slide shows `elapsedMs` after it began: whole frames, holding on its last. */
export function frameAt(elapsedMs: number, frameRate: number, frameCount: number): number {
  const frame = Math.floor((Math.max(0, elapsedMs) / 1000) * Math.max(1, frameRate));
  return Math.min(Math.max(1, frameCount) - 1, frame);
}

/**
 * The slide a key moves to from `index` of `count`: ↓ or Page Down the
 * next, ↑ or Page Up the one before, Home the first, End the last (clickers
 * send Page Down/Up). Null for a key that moves nothing.
 */
export function slideFor(key: string, index: number, count: number): number | null {
  switch (key) {
    case 'ArrowDown':
    case 'PageDown':
      return Math.min(count - 1, index + 1);
    case 'ArrowUp':
    case 'PageUp':
      return Math.max(0, index - 1);
    case 'Home':
      return 0;
    case 'End':
      return Math.max(0, count - 1);
    default:
      return null;
  }
}
