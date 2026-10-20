/**
 * Creating IK chains.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph } from '@quar/core';
import { createBoneNode } from '@quar/rigging';
import { useEditorStore } from './editorStore';

const store = () => useEditorStore.getState();

describe('creating an IK chain', () => {
  beforeEach(() => {
    store().resetProject();
    store().clearHistory();
  });

  it('stops where the skeleton branches', () => {
    const sg = new SceneGraph();
    // A spine with two arms hanging from its top
    sg.addNode(createBoneNode('hips', 'Hips', { x: 0, y: 0 }, 100));
    sg.addNode(createBoneNode('chest', 'Chest', { x: 100, y: 0 }, 100), 'hips');
    for (const side of ['left', 'right']) {
      sg.addNode(createBoneNode(`${side}-upper`, 'Upper', { x: 100, y: 0 }, 80), 'chest');
      sg.addNode(createBoneNode(`${side}-lower`, 'Lower', { x: 80, y: 0 }, 80), `${side}-upper`);
    }

    store().createIKChain(sg, 'left-lower');
    expect(store().ikChains[0]).toMatchObject({
      rootBoneId: 'left-upper',
      endEffectorBoneId: 'left-lower',
    });
  });

  it('takes the whole chain when it doesn’t branch', () => {
    const sg = new SceneGraph();
    sg.addNode(createBoneNode('a', 'A', { x: 0, y: 0 }, 50));
    sg.addNode(createBoneNode('b', 'B', { x: 50, y: 0 }, 50), 'a');
    sg.addNode(createBoneNode('c', 'C', { x: 50, y: 0 }, 50), 'b');
    store().createIKChain(sg, 'c');
    expect(store().ikChains[0]!.rootBoneId).toBe('a');
  });
});
