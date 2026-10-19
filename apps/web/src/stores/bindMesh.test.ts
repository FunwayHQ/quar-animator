/**
 * Binding shapes to bones.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph, createDefaultTransform } from '@quar/core';
import { createBoneNode } from '@quar/rigging';
import type { RectangleNode, SkinData } from '@quar/types';
import { useEditorStore } from './editorStore';

const store = () => useEditorStore.getState();

describe('binding a shape to bones', () => {
  beforeEach(() => {
    store().resetProject();
    store().clearHistory();
  });

  it('records the vertices its weights belong to', () => {
    const sg = new SceneGraph();
    sg.addNode(createBoneNode('bone', 'Bone', { x: -50, y: 0 }, 100));
    sg.addNode({
      id: 'rect',
      name: 'Rect',
      type: 'rectangle',
      parent: null,
      children: [],
      transform: createDefaultTransform(),
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      width: 100,
      height: 20,
      cornerRadius: [0, 0, 0, 0],
      fills: [],
      strokes: [],
    } as RectangleNode);

    const corners = new Float32Array([-50, -10, 50.00042, -10, -50, 10, 50, 10]);
    store().bindMeshToBones(sg, 'rect', ['bone'], corners);

    const skin = (sg.getNode('rect') as RectangleNode & { skinData: SkinData }).skinData;
    expect(skin.vertexCount).toBe(4);
    // Rounded to a thousandth, so files stay small
    expect(skin.bindVertices).toEqual([-50, -10, 50, -10, -50, 10, 50, 10]);
  });
});
