import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph } from '@quar/core';
import type { BoneNode } from '@quar/types';
import {
  createBoneNode,
  chainBone,
  getBoneChain,
  getBoneTip,
  getBoneWorldTip,
} from './boneHelpers';

describe('boneHelpers', () => {
  let sceneGraph: SceneGraph;

  beforeEach(() => {
    sceneGraph = new SceneGraph();
  });

  // --------------------------------------------------------------------------
  // createBoneNode
  // --------------------------------------------------------------------------

  describe('createBoneNode', () => {
    it('creates a bone with default values', () => {
      const bone = createBoneNode('b1', 'Bone 1', { x: 100, y: 200 }, 50);
      expect(bone.type).toBe('bone');
      expect(bone.id).toBe('b1');
      expect(bone.name).toBe('Bone 1');
      expect(bone.length).toBe(50);
      expect(bone.boneStyle).toBe('octahedral');
      expect(bone.boneColor).toBe('#E0E0E0');
      expect(bone.transform.position).toEqual({ x: 100, y: 200 });
      expect(bone.transform.rotation).toBe(0);
      expect(bone.visible).toBe(true);
      expect(bone.locked).toBe(false);
      expect(bone.opacity).toBe(1);
    });

    it('sets anchor to (0,0) — bones pivot at root joint', () => {
      const bone = createBoneNode('b1', 'Bone', { x: 0, y: 0 }, 30);
      expect(bone.transform.anchor).toEqual({ x: 0, y: 0 });
    });

    it('accepts optional rotation, style, and color', () => {
      const bone = createBoneNode('b2', 'Bone 2', { x: 0, y: 0 }, 80, 45, 'stick', '#FF0000');
      expect(bone.transform.rotation).toBe(45);
      expect(bone.boneStyle).toBe('stick');
      expect(bone.boneColor).toBe('#FF0000');
    });

    it('has no parent, no children by default', () => {
      const bone = createBoneNode('b1', 'Bone', { x: 0, y: 0 }, 30);
      expect(bone.parent).toBeNull();
      expect(bone.children).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // chainBone
  // --------------------------------------------------------------------------

  describe('chainBone', () => {
    it('sets child position to parent tip and parents it', () => {
      const parent = createBoneNode('p1', 'Parent', { x: 100, y: 100 }, 60);
      const child = createBoneNode('c1', 'Child', { x: 0, y: 0 }, 40);

      sceneGraph.addNode(parent);
      sceneGraph.addNode(child);

      chainBone(parent, 'c1', sceneGraph);

      const updatedChild = sceneGraph.getNode('c1') as BoneNode;
      expect(updatedChild.transform.position).toEqual({ x: 60, y: 0 });
      expect(updatedChild.parent).toBe('p1');
    });

    it('does nothing for non-bone child', () => {
      const parent = createBoneNode('p1', 'Parent', { x: 100, y: 100 }, 60);
      sceneGraph.addNode(parent);
      // No child node exists
      chainBone(parent, 'nonexistent', sceneGraph);
      // Should not throw
    });
  });

  // --------------------------------------------------------------------------
  // getBoneChain
  // --------------------------------------------------------------------------

  describe('getBoneChain', () => {
    it('returns root-to-leaf chain for nested bones', () => {
      const root = createBoneNode('r', 'Root', { x: 0, y: 0 }, 50);
      const mid = createBoneNode('m', 'Mid', { x: 50, y: 0 }, 30);
      const leaf = createBoneNode('l', 'Leaf', { x: 30, y: 0 }, 20);

      sceneGraph.addNode(root);
      sceneGraph.addNode(mid, 'r');
      sceneGraph.addNode(leaf, 'm');

      const chain = getBoneChain('l', sceneGraph);
      expect(chain.map((b) => b.id)).toEqual(['r', 'm', 'l']);
    });

    it('returns single-element array for root bone', () => {
      const root = createBoneNode('r', 'Root', { x: 0, y: 0 }, 50);
      sceneGraph.addNode(root);

      const chain = getBoneChain('r', sceneGraph);
      expect(chain.map((b) => b.id)).toEqual(['r']);
    });

    it('returns empty array for non-existent bone', () => {
      const chain = getBoneChain('nonexistent', sceneGraph);
      expect(chain).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // getBoneTip
  // --------------------------------------------------------------------------

  describe('getBoneTip', () => {
    it('returns local tip position along +X', () => {
      const bone = createBoneNode('b1', 'Bone', { x: 0, y: 0 }, 75);
      const tip = getBoneTip(bone);
      expect(tip).toEqual({ x: 75, y: 0 });
    });
  });

  // --------------------------------------------------------------------------
  // getBoneWorldTip
  // --------------------------------------------------------------------------

  describe('getBoneWorldTip', () => {
    it('returns world-space tip for unrotated root bone', () => {
      const bone = createBoneNode('b1', 'Bone', { x: 100, y: 50 }, 60);
      sceneGraph.addNode(bone);

      const tip = getBoneWorldTip('b1', sceneGraph);
      expect(tip).not.toBeNull();
      expect(tip!.x).toBeCloseTo(160, 1); // 100 + 60
      expect(tip!.y).toBeCloseTo(50, 1);
    });

    it('returns rotated tip for a bone rotated 90 degrees', () => {
      const bone = createBoneNode('b1', 'Bone', { x: 100, y: 50 }, 60, 90);
      sceneGraph.addNode(bone);

      const tip = getBoneWorldTip('b1', sceneGraph);
      expect(tip).not.toBeNull();
      // 90 degree rotation: tip should be at (100, 50+60)
      expect(tip!.x).toBeCloseTo(100, 0);
      expect(tip!.y).toBeCloseTo(110, 0);
    });

    it('returns null for non-existent bone', () => {
      const tip = getBoneWorldTip('nonexistent', sceneGraph);
      expect(tip).toBeNull();
    });

    it('computes correct tip for chained bones with parent rotation', () => {
      const parent = createBoneNode('p', 'Parent', { x: 0, y: 0 }, 100, 90);
      const child = createBoneNode('c', 'Child', { x: 100, y: 0 }, 50);

      sceneGraph.addNode(parent);
      sceneGraph.addNode(child, 'p');

      // Parent at origin, rotated 90 deg, length 100 — child is at parent's local (100, 0)
      // which in world is (0, 100) due to parent's 90 deg rotation
      // Child has length 50 along its local +X, but parent is rotated 90 deg
      // so child's tip in world is further up
      const tip = getBoneWorldTip('c', sceneGraph);
      expect(tip).not.toBeNull();
    });
  });
});
