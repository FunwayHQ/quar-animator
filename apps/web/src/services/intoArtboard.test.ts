import { describe, expect, it } from 'vitest';
import { SceneGraph, createDefaultTransform } from '@quar/core';
import type { Node } from '@quar/types';

import { useEditorStore } from '../stores/editorStore';
import { intoArtboardBeneath } from './intoArtboard';

const layer = (id: string, type: string, x: number, y: number, size: number): Node =>
  ({
    id,
    name: id,
    type,
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
    clipContent: true,
  }) as unknown as Node;

describe('a layer put on the canvas', () => {
  it('goes into the artboard it lands on, keeping its place on screen', () => {
    useEditorStore.getState().resetProject();
    const sg = new SceneGraph();
    sg.addNode(layer('slide', 'artboard', 200, 200, 300));
    sg.addNode(layer('picture', 'rectangle', 250, 180, 40));
    sg.addNode(layer('far', 'rectangle', 900, 900, 40));
    const before = sg.getWorldTransform('picture');

    intoArtboardBeneath(sg, 'picture');
    intoArtboardBeneath(sg, 'far');

    expect(sg.getParent('picture')?.id).toBe('slide');
    const after = sg.getWorldTransform('picture');
    expect([after.tx, after.ty]).toEqual([before.tx, before.ty]);
    expect(sg.getParent('far')).toBeUndefined();
  });
});
