import { describe, expect, it } from 'vitest';

import { toolsOverflow } from './useToolsBelowMenus';

/** An element laid out from `left`, `width` wide (jsdom has no layout). */
function box(left: number, width: number, children: HTMLElement[] = []): HTMLElement {
  const element = document.createElement('div');
  element.append(...children);
  element.getBoundingClientRect = () =>
    ({ left, right: left + width, width, top: 0, bottom: 44, height: 44 }) as DOMRect;
  return element;
}

/**
 * The menu bar: logo and menus, the tool palette, the project name, as the
 * browser has them in a window `width` wide (12 px padding, 16 px gaps). The
 * palette's own width is its content's, however little room its slot got.
 */
function bar(width: number, parts: { menus: number; tools: number; name: number }): HTMLElement {
  const leading = box(12, parts.menus, [box(12, 70), box(98, parts.menus - 86)]);
  const tools = box(0, 0, [box(0, parts.tools)]);
  const actions = box(0, 0, [box(width - 12 - parts.name, parts.name)]);
  const header = document.createElement('header');
  header.append(leading, tools, actions);
  header.style.padding = '0 12px';
  header.style.columnGap = '16px';
  Object.defineProperty(header, 'clientWidth', { value: width });
  return header;
}

describe('the tool palette beside the menus, or under them', () => {
  const parts = { menus: 538, tools: 384, name: 246 };

  it('stays beside them while everything fits', () => {
    // 12 + 538 + 16 + 384 + 16 + 246 + 12 = 1224
    expect(toolsOverflow(bar(1440, parts))).toBe(false);
    expect(toolsOverflow(bar(1224, parts))).toBe(false);
  });

  it('goes under them on a tablet, where it would shrink to nothing', () => {
    expect(toolsOverflow(bar(1180, parts))).toBe(true);
    expect(toolsOverflow(bar(820, parts))).toBe(true);
  });

  it('is decided by what the parts need, not the room they were given', () => {
    // The same answer whichever row the palette is on: no flipping back and forth
    const squeezed = bar(820, parts);
    const below = bar(820, parts);
    const palette = below.children[1]?.firstElementChild;
    if (palette instanceof HTMLElement) {
      // Centered on a row of its own, the slot the full width
      palette.getBoundingClientRect = () => ({ left: 218, right: 602, width: 384 }) as DOMRect;
    }
    expect(toolsOverflow(squeezed)).toBe(true);
    expect(toolsOverflow(below)).toBe(true);
  });

  it('has nothing to place without a palette', () => {
    const header = bar(400, parts);
    header.children[1]?.replaceChildren();
    expect(toolsOverflow(header)).toBe(false);
  });
});
