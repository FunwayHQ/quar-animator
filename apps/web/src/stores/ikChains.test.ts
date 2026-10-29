/**
 * Creating IK chains.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph, createDefaultTransform, createGroupNode, timelineScopeOf } from '@quar/core';
import { createBoneNode } from '@quar/rigging';
import type { ArtboardNode } from '@quar/types';
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

  describe('its target', () => {
    function board(id: string, x: number, y: number): ArtboardNode {
      return {
        ...createGroupNode(id, id),
        type: 'artboard',
        transform: { ...createDefaultTransform(), position: { x, y } },
        width: 400,
        height: 300,
        backgroundColor: { r: 255, g: 255, b: 255, a: 1 },
        clipContent: true,
      } as ArtboardNode;
    }

    /** Where a layer is on screen (in the world). */
    function onScreen(sg: SceneGraph, id: string) {
      const world = sg.getWorldTransform(id);
      return { x: world.tx, y: world.ty };
    }

    /** Where a bone's tip is on screen. */
    function tip(sg: SceneGraph, id: string) {
      const world = sg.getWorldTransform(id);
      const length = 50;
      return { x: world.a * length + world.tx, y: world.b * length + world.ty };
    }

    function targetOf(sg: SceneGraph) {
      const id = store().ikChains[0]?.targetNodeId ?? '';
      return { id, node: sg.getNode(id) };
    }

    it('goes into the artboard holding the chain, at the tip of its last bone', () => {
      const sg = new SceneGraph();
      sg.addNode(board('board', 300, 100));
      sg.addNode(createBoneNode('a', 'A', { x: -40, y: 20 }, 50), 'board');
      sg.addNode(createBoneNode('b', 'B', { x: 50, y: 0 }, 50), 'a');
      sg.updateNode('b', { transform: { ...sg.getNode('b')!.transform, rotation: 30 } });

      store().createIKChain(sg, 'b');

      const target = targetOf(sg);
      expect(target.node?.parent).toBe('board');
      const at = onScreen(sg, target.id);
      expect(at.x).toBeCloseTo(tip(sg, 'b').x);
      expect(at.y).toBeCloseTo(tip(sg, 'b').y);
      // So its keyframes go on the artboard's timeline
      expect(timelineScopeOf(sg, target.id)).toBe('board');
    });

    it('goes beside the skeleton, past the bones the chain hangs from', () => {
      const sg = new SceneGraph();
      sg.addNode(board('board', -200, 0));
      sg.addNode(
        {
          ...createGroupNode('rig', 'Rig'),
          transform: { ...createDefaultTransform(), position: { x: 30, y: -10 } },
        },
        'board'
      );
      sg.addNode(createBoneNode('hips', 'Hips', { x: 0, y: 0 }, 50), 'rig');
      sg.addNode(createBoneNode('chest', 'Chest', { x: 50, y: 0 }, 50), 'hips');
      for (const side of ['left', 'right']) {
        sg.addNode(createBoneNode(`${side}-upper`, 'Upper', { x: 50, y: 0 }, 50), 'chest');
        sg.addNode(createBoneNode(`${side}-lower`, 'Lower', { x: 50, y: 0 }, 50), `${side}-upper`);
      }

      store().createIKChain(sg, 'left-lower');

      const target = targetOf(sg);
      expect(target.node?.parent).toBe('rig');
      const at = onScreen(sg, target.id);
      expect(at.x).toBeCloseTo(tip(sg, 'left-lower').x);
      expect(at.y).toBeCloseTo(tip(sg, 'left-lower').y);
      expect(timelineScopeOf(sg, target.id)).toBe('board');
    });

    it('stays at the page’s root for a skeleton there', () => {
      const sg = new SceneGraph();
      sg.addNode(createBoneNode('a', 'A', { x: 10, y: 10 }, 50));
      sg.addNode(createBoneNode('b', 'B', { x: 50, y: 0 }, 50), 'a');

      store().createIKChain(sg, 'b');

      const target = targetOf(sg);
      expect(target.node?.parent).toBeNull();
      expect(target.node?.transform.position).toEqual({ x: 110, y: 10 });
    });
  });
});
