/**
 * Tests for Fit to Window
 */

import { describe, it, expect } from 'vitest';
import type { Node } from '@quar/types';
import { Camera, SceneGraph, createDefaultTransform } from '@quar/core';
import { fitViewToArtwork } from './fitView';

function square(id: string, x: number, y: number, size: number): Node {
  return {
    id,
    name: id,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: { ...createDefaultTransform(), position: { x, y } },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: size,
    height: size,
    cornerRadius: [0, 0, 0, 0],
    fills: [],
    strokes: [],
  } as Node;
}

function camera() {
  const c = new Camera();
  c.setViewport(1000, 600);
  return c;
}

describe('fitViewToArtwork', () => {
  it('centers on the artwork and zooms so it fills the view', () => {
    const sg = new SceneGraph();
    sg.addNode(square('a', 1000, 2000, 100));
    sg.addNode(square('b', 1400, 2000, 100));
    const c = camera();

    fitViewToArtwork(c, sg, []);

    // 500 × 100 of artwork in a 1000 × 600 view less 48 px margins: width decides
    expect(c.position).toEqual({ x: 1200, y: 2000 });
    expect(c.zoom).toBeCloseTo((1000 - 96) / 500);
  });

  it('goes back to 100% at the origin on an empty page', () => {
    const c = camera();
    c.zoomTo(3);
    fitViewToArtwork(c, new SceneGraph(), []);
    expect(c.zoom).toBe(1);
    expect(c.position).toEqual({ x: 0, y: 0 });
  });
});
