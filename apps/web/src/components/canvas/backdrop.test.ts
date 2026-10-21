/**
 * Tests for choosing a stroke that shows on the canvas
 */

import { describe, it, expect } from 'vitest';
import { SceneGraph, createDefaultTransform } from '@quar/core';
import type { ArtboardNode, Stroke } from '@quar/types';
import { backdropColorAt, strokeAgainst } from './backdrop';

const DARK = { r: 27, g: 27, b: 27, a: 1 };
const PAPER = { r: 250, g: 249, b: 246, a: 1 };
const stroke: Stroke = {
  color: { r: 0, g: 0, b: 0, a: 1 },
  width: 2,
  opacity: 1,
  cap: 'round',
  join: 'round',
  visible: true,
};

function board(id: string, x: number, fill = PAPER): ArtboardNode {
  const transform = createDefaultTransform();
  transform.position = { x, y: 0 };
  return {
    id,
    name: id,
    type: 'artboard',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 200,
    height: 100,
    fills: [{ type: 'solid', color: fill, opacity: 1, visible: true }],
    clipContent: true,
  };
}

describe('backdrop', () => {
  it('is the document background off any artboard, the artboard on one', () => {
    const sceneGraph = new SceneGraph();
    sceneGraph.addNode(board('a', 0));
    expect(backdropColorAt(sceneGraph, { x: 500, y: 0 }, DARK)).toEqual(DARK);
    expect(backdropColorAt(sceneGraph, { x: 50, y: 20 }, DARK)).toEqual(PAPER);
  });

  it('is the topmost artboard where they overlap', () => {
    const sceneGraph = new SceneGraph();
    sceneGraph.addNode(board('under', 0));
    sceneGraph.addNode(board('over', 50, DARK));
    expect(backdropColorAt(sceneGraph, { x: 80, y: 0 }, PAPER)).toEqual(DARK);
  });

  it('picks a light stroke on a dark backdrop and black on a light one', () => {
    expect(strokeAgainst(stroke, DARK).color.r).toBeGreaterThan(200);
    expect(strokeAgainst(stroke, PAPER).color).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(strokeAgainst(stroke, DARK).width).toBe(2);
  });
});
