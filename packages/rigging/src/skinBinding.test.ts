import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph } from '@quar/core';
import type { SkinData, VertexSkinEntry } from '@quar/types';
import { createBoneNode } from './boneHelpers';
import { computeFKChain } from './fk';
import {
  createSkinBinding,
  computeAutoWeights,
  normalizeWeights,
  paintWeight,
} from './skinBinding';

describe('skinBinding', () => {
  let sceneGraph: SceneGraph;

  beforeEach(() => {
    sceneGraph = new SceneGraph();
  });

  // --------------------------------------------------------------------------
  // createSkinBinding
  // --------------------------------------------------------------------------

  describe('createSkinBinding', () => {
    it('creates valid SkinData with inverse bind matrices', () => {
      const bone = createBoneNode('b1', 'Bone', { x: 100, y: 0 }, 50);
      sceneGraph.addNode(bone);

      const rect = {
        id: 'rect1',
        name: 'Rect',
        type: 'rectangle' as const,
        parent: null,
        children: [],
        transform: {
          position: { x: 50, y: 50 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          anchor: { x: 0.5, y: 0.5 },
          skew: { x: 0, y: 0 },
        },
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        width: 100,
        height: 100,
        cornerRadius: [0, 0, 0, 0] as [number, number, number, number],
        fills: [],
        strokes: [],
      };
      sceneGraph.addNode(rect);

      const skin = createSkinBinding('rect1', ['b1'], 4, sceneGraph);
      expect(skin).not.toBeNull();
      expect(skin!.vertexCount).toBe(4);
      expect(skin!.vertices).toHaveLength(4);
      expect(skin!.inverseBindMatrices['b1']).toBeDefined();
      expect(skin!.inverseBindMatrices['b1']).toHaveLength(6);
      expect(skin!.meshBindMatrix).toHaveLength(6);
    });

    it('returns null for empty bone list', () => {
      const rect = {
        id: 'rect1',
        name: 'Rect',
        type: 'rectangle' as const,
        parent: null,
        children: [],
        transform: {
          position: { x: 0, y: 0 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          anchor: { x: 0.5, y: 0.5 },
          skew: { x: 0, y: 0 },
        },
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        width: 50,
        height: 50,
        cornerRadius: [0, 0, 0, 0] as [number, number, number, number],
        fills: [],
        strokes: [],
      };
      sceneGraph.addNode(rect);

      const skin = createSkinBinding('rect1', [], 4, sceneGraph);
      expect(skin).toBeNull();
    });

    it('returns null for zero vertex count', () => {
      const bone = createBoneNode('b1', 'Bone', { x: 0, y: 0 }, 50);
      sceneGraph.addNode(bone);
      const skin = createSkinBinding('nonexistent', ['b1'], 0, sceneGraph);
      expect(skin).toBeNull();
    });

    it('returns null when node does not exist', () => {
      const bone = createBoneNode('b1', 'Bone', { x: 0, y: 0 }, 50);
      sceneGraph.addNode(bone);
      const skin = createSkinBinding('nonexistent', ['b1'], 4, sceneGraph);
      expect(skin).toBeNull();
    });

    it('skips non-bone nodes in boneIds', () => {
      const rect1 = {
        id: 'rect1',
        name: 'Rect',
        type: 'rectangle' as const,
        parent: null,
        children: [],
        transform: {
          position: { x: 0, y: 0 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          anchor: { x: 0.5, y: 0.5 },
          skew: { x: 0, y: 0 },
        },
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        width: 50,
        height: 50,
        cornerRadius: [0, 0, 0, 0] as [number, number, number, number],
        fills: [],
        strokes: [],
      };
      sceneGraph.addNode(rect1);

      // Passing another rect as a "bone" should fail
      const skin = createSkinBinding('rect1', ['rect1'], 4, sceneGraph);
      expect(skin).toBeNull();
    });

    it('initializes all vertices with empty influences', () => {
      const bone = createBoneNode('b1', 'Bone', { x: 0, y: 0 }, 50);
      sceneGraph.addNode(bone);

      const rect = {
        id: 'rect1',
        name: 'Rect',
        type: 'rectangle' as const,
        parent: null,
        children: [],
        transform: {
          position: { x: 0, y: 0 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          anchor: { x: 0.5, y: 0.5 },
          skew: { x: 0, y: 0 },
        },
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        width: 50,
        height: 50,
        cornerRadius: [0, 0, 0, 0] as [number, number, number, number],
        fills: [],
        strokes: [],
      };
      sceneGraph.addNode(rect);

      const skin = createSkinBinding('rect1', ['b1'], 6, sceneGraph);
      expect(skin).not.toBeNull();
      for (const v of skin!.vertices) {
        expect(v.influences).toEqual([]);
      }
    });
  });

  // --------------------------------------------------------------------------
  // computeAutoWeights
  // --------------------------------------------------------------------------

  describe('computeAutoWeights', () => {
    it('assigns nearest-bone weights', () => {
      const bone1 = createBoneNode('b1', 'Bone 1', { x: 0, y: 0 }, 50);
      const bone2 = createBoneNode('b2', 'Bone 2', { x: 100, y: 0 }, 50);
      sceneGraph.addNode(bone1);
      sceneGraph.addNode(bone2);

      const rect = {
        id: 'r1',
        name: 'R',
        type: 'rectangle' as const,
        parent: null,
        children: [],
        transform: {
          position: { x: 50, y: 0 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          anchor: { x: 0.5, y: 0.5 },
          skew: { x: 0, y: 0 },
        },
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        width: 100,
        height: 20,
        cornerRadius: [0, 0, 0, 0] as [number, number, number, number],
        fills: [],
        strokes: [],
      };
      sceneGraph.addNode(rect);

      const skin = createSkinBinding('r1', ['b1', 'b2'], 2, sceneGraph)!;
      const states1 = computeFKChain('b1', sceneGraph);
      const states2 = computeFKChain('b2', sceneGraph);
      const allStates = [...states1, ...states2];

      // Vertex near bone1 and vertex near bone2
      const positions = new Float32Array([10, 0, 110, 0]);
      const result = computeAutoWeights(skin, positions, allStates);

      // First vertex should favor b1, second should favor b2
      expect(result.vertices[0]!.influences.length).toBeGreaterThan(0);
      expect(result.vertices[1]!.influences.length).toBeGreaterThan(0);

      const v0Primary = result.vertices[0]!.influences[0]!;
      expect(v0Primary.boneId).toBe('b1');
      expect(v0Primary.weight).toBeGreaterThan(0.5);

      const v1Primary = result.vertices[1]!.influences[0]!;
      expect(v1Primary.boneId).toBe('b2');
      expect(v1Primary.weight).toBeGreaterThan(0.5);
    });

    it('respects max 2 bones per vertex', () => {
      const bone1 = createBoneNode('b1', 'B1', { x: 0, y: 0 }, 30);
      const bone2 = createBoneNode('b2', 'B2', { x: 50, y: 0 }, 30);
      const bone3 = createBoneNode('b3', 'B3', { x: 100, y: 0 }, 30);
      sceneGraph.addNode(bone1);
      sceneGraph.addNode(bone2);
      sceneGraph.addNode(bone3);

      const rect = {
        id: 'r1',
        name: 'R',
        type: 'rectangle' as const,
        parent: null,
        children: [],
        transform: {
          position: { x: 50, y: 0 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          anchor: { x: 0.5, y: 0.5 },
          skew: { x: 0, y: 0 },
        },
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        width: 100,
        height: 20,
        cornerRadius: [0, 0, 0, 0] as [number, number, number, number],
        fills: [],
        strokes: [],
      };
      sceneGraph.addNode(rect);

      const skin = createSkinBinding('r1', ['b1', 'b2', 'b3'], 1, sceneGraph)!;
      const allStates = [
        ...computeFKChain('b1', sceneGraph),
        ...computeFKChain('b2', sceneGraph),
        ...computeFKChain('b3', sceneGraph),
      ];

      // Vertex equidistant from all — should only get 2 nearest
      const positions = new Float32Array([50, 10]);
      const result = computeAutoWeights(skin, positions, allStates);
      expect(result.vertices[0]!.influences.length).toBeLessThanOrEqual(2);
    });
  });

  // --------------------------------------------------------------------------
  // normalizeWeights
  // --------------------------------------------------------------------------

  describe('normalizeWeights', () => {
    it('normalizes weights to sum to 1.0', () => {
      const entry: VertexSkinEntry = {
        influences: [
          { boneId: 'b1', weight: 0.3 },
          { boneId: 'b2', weight: 0.3 },
        ],
      };
      const result = normalizeWeights(entry);
      const total = result.influences.reduce((s, i) => s + i.weight, 0);
      expect(total).toBeCloseTo(1.0);
    });

    it('removes zero-weight entries', () => {
      const entry: VertexSkinEntry = {
        influences: [
          { boneId: 'b1', weight: 0.5 },
          { boneId: 'b2', weight: 0 },
          { boneId: 'b3', weight: 0.00001 },
        ],
      };
      const result = normalizeWeights(entry);
      expect(result.influences.length).toBe(1);
      expect(result.influences[0]!.boneId).toBe('b1');
      expect(result.influences[0]!.weight).toBeCloseTo(1.0);
    });

    it('caps at 4 influences', () => {
      const entry: VertexSkinEntry = {
        influences: [
          { boneId: 'b1', weight: 0.3 },
          { boneId: 'b2', weight: 0.25 },
          { boneId: 'b3', weight: 0.2 },
          { boneId: 'b4', weight: 0.15 },
          { boneId: 'b5', weight: 0.1 },
        ],
      };
      const result = normalizeWeights(entry);
      expect(result.influences.length).toBe(4);
      const total = result.influences.reduce((s, i) => s + i.weight, 0);
      expect(total).toBeCloseTo(1.0);
    });

    it('sorts by weight descending', () => {
      const entry: VertexSkinEntry = {
        influences: [
          { boneId: 'b1', weight: 0.1 },
          { boneId: 'b2', weight: 0.5 },
          { boneId: 'b3', weight: 0.3 },
        ],
      };
      const result = normalizeWeights(entry);
      expect(result.influences[0]!.boneId).toBe('b2');
      expect(result.influences[1]!.boneId).toBe('b3');
      expect(result.influences[2]!.boneId).toBe('b1');
    });

    it('returns empty for no influences', () => {
      const result = normalizeWeights({ influences: [] });
      expect(result.influences).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // paintWeight
  // --------------------------------------------------------------------------

  describe('paintWeight', () => {
    function createTestSkinData(): SkinData {
      return {
        vertices: [
          {
            influences: [
              { boneId: 'b1', weight: 0.7 },
              { boneId: 'b2', weight: 0.3 },
            ],
          },
          {
            influences: [
              { boneId: 'b1', weight: 0.5 },
              { boneId: 'b2', weight: 0.5 },
            ],
          },
        ],
        inverseBindMatrices: {
          b1: [1, 0, 0, 1, 0, 0],
          b2: [1, 0, 0, 1, -50, 0],
        },
        meshBindMatrix: [1, 0, 0, 1, 0, 0],
        vertexCount: 2,
      };
    }

    it('add mode increases weight for target bone', () => {
      const skin = createTestSkinData();
      paintWeight(skin, 0, 'b1', 0.2, 'add');

      const b1Weight = skin.vertices[0]!.influences.find((i) => i.boneId === 'b1')?.weight ?? 0;
      expect(b1Weight).toBeGreaterThan(0.7);
    });

    it('subtract mode decreases weight for target bone', () => {
      const skin = createTestSkinData();
      paintWeight(skin, 0, 'b1', 0.3, 'subtract');

      const b1Weight = skin.vertices[0]!.influences.find((i) => i.boneId === 'b1')?.weight ?? 0;
      expect(b1Weight).toBeLessThan(0.7);
    });

    it('clamps weight to [0, 1]', () => {
      const skin = createTestSkinData();
      // Try to add way more than possible
      paintWeight(skin, 0, 'b1', 5.0, 'add');

      const b1Weight = skin.vertices[0]!.influences.find((i) => i.boneId === 'b1')?.weight ?? 0;
      expect(b1Weight).toBeLessThanOrEqual(1.0);
      expect(b1Weight).toBeGreaterThanOrEqual(0);
    });

    it('renormalizes other bones after add', () => {
      const skin = createTestSkinData();
      paintWeight(skin, 1, 'b1', 0.3, 'add');

      const total = skin.vertices[1]!.influences.reduce((s, i) => s + i.weight, 0);
      expect(total).toBeCloseTo(1.0);
    });

    it('does nothing for out-of-range vertex index', () => {
      const skin = createTestSkinData();
      const before = JSON.stringify(skin);
      paintWeight(skin, -1, 'b1', 0.1, 'add');
      paintWeight(skin, 999, 'b1', 0.1, 'add');
      expect(JSON.stringify(skin)).toBe(before);
    });

    it('adds new bone influence if not present', () => {
      const skin: SkinData = {
        vertices: [{ influences: [{ boneId: 'b1', weight: 1.0 }] }],
        inverseBindMatrices: {
          b1: [1, 0, 0, 1, 0, 0],
          b2: [1, 0, 0, 1, -50, 0],
        },
        meshBindMatrix: [1, 0, 0, 1, 0, 0],
        vertexCount: 1,
      };

      paintWeight(skin, 0, 'b2', 0.3, 'add');
      const b2 = skin.vertices[0]!.influences.find((i) => i.boneId === 'b2');
      expect(b2).toBeDefined();
      expect(b2!.weight).toBeGreaterThan(0);
    });
  });
});
