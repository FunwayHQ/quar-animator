/**
 * Whether the tool palette fits in the menu bar beside the menus and the
 * project name. When it doesn't (a tablet, a narrow window) it goes on a row
 * of its own under them: squeezed in beside them, it would shrink to nothing.
 *
 * Decided from what each part needs, not from the room it was given: those
 * are the same in both layouts, so the bar never flips back and forth.
 */

import { useLayoutEffect, useState, type RefObject } from 'react';

/** From the left of an element's first child to the right of its last. */
function contentWidth(element: Element | null | undefined): number {
  const first = element?.firstElementChild;
  const last = element?.lastElementChild;
  if (!first || !last) return 0;
  return last.getBoundingClientRect().right - first.getBoundingClientRect().left;
}

/** Whether the bar's three parts, laid side by side, need more than its width. */
export function toolsOverflow(bar: HTMLElement): boolean {
  const [leading, tools, actions] = Array.from(bar.children);
  if (!tools?.firstElementChild) return false;
  const style = getComputedStyle(bar);
  const gap = parseFloat(style.columnGap) || 0;
  const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const needed =
    padding +
    contentWidth(leading) +
    gap +
    tools.firstElementChild.getBoundingClientRect().width +
    gap +
    contentWidth(actions);
  // A pixel's leeway for fractional widths
  return needed > bar.clientWidth + 1;
}

export function useToolsBelowMenus(bar: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [below, setBelow] = useState(false);

  useLayoutEffect(() => {
    const element = bar.current;
    if (!element || !enabled) {
      setBelow(false);
      return;
    }
    const measure = () => setBelow(toolsOverflow(element));
    measure();
    // The window's width, and what's in the bar (a renamed project, the sync status)
    const resized = new ResizeObserver(measure);
    resized.observe(element);
    for (const part of Array.from(element.children)) {
      resized.observe(part);
      if (part.firstElementChild) resized.observe(part.firstElementChild);
    }
    const changed = new MutationObserver(measure);
    changed.observe(element, { childList: true, subtree: true, characterData: true });
    return () => {
      resized.disconnect();
      changed.disconnect();
    };
  }, [bar, enabled]);

  return below;
}
