/**
 * View shortcuts from anywhere in the editor, not only while the canvas has
 * focus — elsewhere Ctrl/Cmd+0, 1, + and − zoomed the whole page instead:
 * Ctrl/Cmd+0 fits the artwork, +1 is 100%, + and − zoom in and out. They go
 * to the canvas as the View menu's events. Text fields keep their keys.
 */

import { useEffect } from 'react';
import { VIEW_EVENTS } from '../components/layout/MenuBar';

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

const EVENT_FOR_KEY: Record<string, string> = {
  Digit0: VIEW_EVENTS.FIT_TO_WINDOW,
  Numpad0: VIEW_EVENTS.FIT_TO_WINDOW,
  Digit1: VIEW_EVENTS.ZOOM_100,
  Numpad1: VIEW_EVENTS.ZOOM_100,
  Equal: VIEW_EVENTS.ZOOM_IN,
  NumpadAdd: VIEW_EVENTS.ZOOM_IN,
  Minus: VIEW_EVENTS.ZOOM_OUT,
  NumpadSubtract: VIEW_EVENTS.ZOOM_OUT,
};

export function useViewShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // The canvas handles these itself while focused
      if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (isTextField(event.target)) return;
      const view = EVENT_FOR_KEY[event.code];
      if (!view) return;
      event.preventDefault();
      window.dispatchEvent(new CustomEvent(view));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
