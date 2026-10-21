/**
 * Flip the selection from the keyboard anywhere in the editor, as in Figma:
 * Shift+H flips it horizontally, Shift+V vertically. Text fields keep their
 * keys.
 */

import { useEffect } from 'react';
import type { SceneGraph } from '@quar/core';
import { flipSelected } from '../components/canvas/flipSelected';

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function useFlipShortcuts(sceneGraph: SceneGraph): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTextField(event.target)) return;
      const key = event.key.toLowerCase();
      if (key !== 'h' && key !== 'v') return;
      event.preventDefault();
      flipSelected(sceneGraph, key === 'h' ? 'horizontal' : 'vertical');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sceneGraph]);
}
