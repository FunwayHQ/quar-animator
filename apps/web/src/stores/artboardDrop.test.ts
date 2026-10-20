/**
 * Moving an animated layer into an artboard.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph, createDefaultTransform, createGroupNode } from '@quar/core';
import { addKeyframe, evaluateNodeAtFrame, getOrCreateTrack } from '@quar/animation';
import type { ArtboardNode, RectangleNode } from '@quar/types';
import { useEditorStore } from './editorStore';

const store = () => useEditorStore.getState();

describe('moving an animated layer into an artboard', () => {
  beforeEach(() => store().resetProject());

  it('keeps it moving where it moved, in the artboard’s own space', () => {
    const sg = new SceneGraph();
    sg.addNode({
      ...createGroupNode('board', 'Board'),
      type: 'artboard',
      width: 400,
      height: 300,
      fills: [],
      transform: {
        ...createDefaultTransform(),
        position: { x: 300, y: 100 },
        anchor: { x: 0, y: 0 },
      },
    } as unknown as ArtboardNode);
    sg.addNode({
      id: 'ball',
      name: 'Ball',
      type: 'rectangle',
      parent: null,
      children: [],
      transform: {
        ...createDefaultTransform(),
        position: { x: 350, y: 150 },
        anchor: { x: 0, y: 0 },
      },
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      width: 10,
      height: 10,
      cornerRadius: [0, 0, 0, 0],
      fills: [],
      strokes: [],
    } as RectangleNode);
    const x = getOrCreateTrack<number>(store().timeline, 'ball', 'transform.position.x');
    addKeyframe(x, 0, 350);
    addKeyframe(x, 10, 450);

    store().moveNodeKeepingPlacement(sg, 'ball', 'board');

    expect(sg.getNode('ball')!.parent).toBe('board');
    // 50 into the board at frame 0, 150 at frame 10: the same places on the canvas
    const xAt = (frame: number) =>
      evaluateNodeAtFrame(store().timeline, 'ball', frame).get('transform.position.x');
    expect(xAt(0)).toBeCloseTo(50);
    expect(xAt(10)).toBeCloseTo(150);
  });
});
