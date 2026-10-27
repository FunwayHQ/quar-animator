/**
 * A text node for tests, set in the given font.
 */

import type { TextNode } from '@quar/types';

export function textIn(id: string, fontFamily: string, fontWeight = 400): TextNode {
  return {
    id,
    name: id,
    type: 'text',
    parent: null,
    children: [],
    transform: {
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0, y: 0 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    content: 'Hi',
    fontFamily,
    fontSize: 16,
    fontWeight,
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    fills: [],
    strokes: [],
  };
}
