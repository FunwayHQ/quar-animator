import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph } from '@quar/core';
import type { BoneNode } from '@quar/types';
import { createBoneNode } from './boneHelpers';
import { clampBoneRotation, computeFKChain, poseBone } from './fk';

describe('FK (Forward Kinematics)', () => {
  let sceneGraph: SceneGraph;

  beforeEach(() => {
    sceneGraph = new SceneGraph();
  });

  // --------------------------------------------------------------------------
  // clampBoneRotation
  // --------------------------------------------------------------------------

  describe('clampBoneRotation', () => {
    it('returns original angle when no constraints', () => {
      const bone = createBoneNode('b1', 'Bone', { x: 0, y: 0 }, 50);
      expect(clampBoneRotation(bone, 45)).toBe(45);
      expect(clampBoneRotation(bone, -180)).toBe(-180);
    });

    it('clamps angle to min/max range', () => {
      const bone = createBoneNode('b1', 'Bone', { x: 0, y: 0 }, 50);
      bone.angleMin = -30;
      bone.angleMax = 30;

      expect(clampBoneRotation(bone, 0)).toBe(0);
      expect(clampBoneRotation(bone, 45)).toBe(30);
      expect(clampBoneRotation(bone, -45)).toBe(-30);
    });

    it('handles only min constraint', () => {
      const bone = createBoneNode('b1', 'Bone', { x: 0, y: 0 }, 50);
      bone.angleMin = -10;
      // angleMax undefined
      expect(clampBoneRotation(bone, -20)).toBe(-10);
      expect(clampBoneRotation(bone, 100)).toBe(100);
    });

    it('handles only max constraint', () => {
      const bone = createBoneNode('b1', 'Bone', { x: 0, y: 0 }, 50);
      bone.angleMax = 45;
      // angleMin undefined
      expect(clampBoneRotation(bone, 60)).toBe(45);
      expect(clampBoneRotation(bone, -100)).toBe(-100);
    });
  });

  // --------------------------------------------------------------------------
  // computeFKChain
  // --------------------------------------------------------------------------

  describe('computeFKChain', () => {
    it('computes chain for a single bone', () => {
      const bone = createBoneNode('b1', 'Bone', { x: 100, y: 50 }, 60);
      sceneGraph.addNode(bone);

      const chain = computeFKChain('b1', sceneGraph);
      expect(chain).toHaveLength(1);
      expect(chain[0]!.boneId).toBe('b1');
      expect(chain[0]!.worldPos.x).toBeCloseTo(100, 1);
      expect(chain[0]!.worldPos.y).toBeCloseTo(50, 1);
      expect(chain[0]!.worldTip.x).toBeCloseTo(160, 1);
      expect(chain[0]!.worldTip.y).toBeCloseTo(50, 1);
    });

    it('computes chain for multi-bone hierarchy', () => {
      const root = createBoneNode('r', 'Root', { x: 0, y: 0 }, 50);
      const child = createBoneNode('c', 'Child', { x: 50, y: 0 }, 30);

      sceneGraph.addNode(root);
      sceneGraph.addNode(child, 'r');

      const chain = computeFKChain('r', sceneGraph);
      expect(chain).toHaveLength(2);
      expect(chain[0]!.boneId).toBe('r');
      expect(chain[1]!.boneId).toBe('c');
    });

    it('includes world rotation in chain state', () => {
      const bone = createBoneNode('b1', 'Bone', { x: 0, y: 0 }, 60, 45);
      sceneGraph.addNode(bone);

      const chain = computeFKChain('b1', sceneGraph);
      expect(chain[0]!.worldRotation).toBeCloseTo(45, 1);
    });

    it('returns empty for non-existent bone', () => {
      const chain = computeFKChain('nonexistent', sceneGraph);
      expect(chain).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // poseBone
  // --------------------------------------------------------------------------

  describe('poseBone', () => {
    it('sets bone rotation', () => {
      const bone = createBoneNode('b1', 'Bone', { x: 0, y: 0 }, 50);
      sceneGraph.addNode(bone);

      poseBone('b1', 30, sceneGraph);

      const updated = sceneGraph.getNode('b1') as BoneNode;
      expect(updated.transform.rotation).toBe(30);
    });

    it('clamps rotation when constraints exist', () => {
      const bone = createBoneNode('b1', 'Bone', { x: 0, y: 0 }, 50);
      bone.angleMin = -20;
      bone.angleMax = 20;
      sceneGraph.addNode(bone);

      poseBone('b1', 45, sceneGraph);

      const updated = sceneGraph.getNode('b1') as BoneNode;
      expect(updated.transform.rotation).toBe(20);
    });

    it('does nothing for non-existent bone', () => {
      // Should not throw
      poseBone('nonexistent', 30, sceneGraph);
    });
  });
});
