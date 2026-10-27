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
  fitSkinToVertices,
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

    it('bends the same across the width of a shape at a joint', () => {
      sceneGraph.addNode(createBoneNode('upper', 'Upper', { x: 0, y: 0 }, 100));
      sceneGraph.addNode(createBoneNode('lower', 'Lower', { x: 100, y: 0 }, 100), 'upper');
      const skin = createSkinBinding('upper', ['upper', 'lower'], 1, sceneGraph)!;
      const weightOf = (x: number, y: number, boneId: string) =>
        computeAutoWeights(
          skin,
          new Float32Array([x, y]),
          computeFKChain('upper', sceneGraph)
        ).vertices[0]!.influences.find((inf) => inf.boneId === boneId)?.weight ?? 0;

      // At the joint: half each, on the bone line and at the edges alike
      for (const y of [0, 30, -30]) expect(weightOf(100, y, 'lower')).toBeCloseTo(0.5);
      // A little past it: mostly the lower bone, the same across the width
      const past = weightOf(115, 0, 'lower');
      expect(past).toBeGreaterThan(0.5);
      expect(weightOf(115, 30, 'lower')).toBeCloseTo(past);
      expect(weightOf(115, -30, 'lower')).toBeCloseTo(past);
      // Clear of the joint, each bone has its own
      expect(weightOf(140, 30, 'lower')).toBe(1);
      expect(weightOf(60, 30, 'upper')).toBe(1);
    });

    it('blends bones that aren’t connected where they are about as close', () => {
      sceneGraph.addNode(createBoneNode('left', 'Left', { x: 0, y: 0 }, 100));
      sceneGraph.addNode(createBoneNode('right', 'Right', { x: 0, y: 100 }, 100));
      const skin = createSkinBinding('left', ['left', 'right'], 1, sceneGraph)!;
      const states = [
        ...computeFKChain('left', sceneGraph),
        ...computeFKChain('right', sceneGraph),
      ];
      const [between, nearLeft] = computeAutoWeights(
        skin,
        new Float32Array([50, 50, 50, 5]),
        states
      ).vertices;
      expect(between!.influences.map((inf) => inf.weight)).toEqual([0.5, 0.5]);
      expect(nearLeft!.influences).toEqual([{ boneId: 'left', weight: 1 }]);
    });

    describe('against the shape', () => {
      // A body 200 wide with an arm 40 thick out to its left (y up): the spine
      // runs up the middle, the arm bone from the body's side out along the arm
      const inBody = (x: number, y: number) => x >= -100 && x <= 100 && y >= -50 && y <= 200;
      const inArm = (x: number, y: number) => x >= -250 && x <= -100 && y >= 130 && y <= 170;
      const shape = (x: number, y: number) => inBody(x, y) || inArm(x, y);
      const rig = () => {
        sceneGraph.addNode(createBoneNode('spine', 'Spine', { x: 0, y: 0 }, 200, 90));
        sceneGraph.addNode(createBoneNode('arm', 'Arm', { x: -90, y: 150 }, 150, 180));
        const skin = createSkinBinding('spine', ['spine', 'arm'], 1, sceneGraph)!;
        const states = [
          ...computeFKChain('spine', sceneGraph),
          ...computeFKChain('arm', sceneGraph),
        ];
        return (x: number, y: number, withShape: boolean) =>
          computeAutoWeights(skin, new Float32Array([x, y]), states, withShape ? shape : undefined)
            .vertices[0]!.influences;
      };

      it('gives the body under a limb to the trunk, not to the nearer limb bone', () => {
        const weights = rig();
        // 50 from the arm bone, 90 from the spine: by plain distance it's mostly the arm's
        expect(weights(-90, 100, false)[0]?.boneId).toBe('arm');
        // but it's well outside the arm's thickness (20) and inside the body's width (100)
        expect(weights(-90, 100, true)).toEqual([{ boneId: 'spine', weight: 1 }]);
      });

      it('still gives the limb its own', () => {
        const weights = rig();
        expect(weights(-180, 160, true)).toEqual([{ boneId: 'arm', weight: 1 }]);
        expect(weights(-120, 140, true)).toEqual([{ boneId: 'arm', weight: 1 }]);
        // and the body's middle stays the spine's
        expect(weights(-20, 120, true)).toEqual([{ boneId: 'spine', weight: 1 }]);
      });

      it('blends where the body meets the limb', () => {
        const weights = rig();
        // Inside the body at the shoulder: about as far into each envelope
        const at = weights(-75, 165, true);
        expect(at.map((inf) => inf.boneId).sort()).toEqual(['arm', 'spine']);
      });

      it('gives the cells round the shape the weights of the nearest part inside it', () => {
        sceneGraph.addNode(createBoneNode('spine', 'Spine', { x: 0, y: 0 }, 200, 90));
        sceneGraph.addNode(createBoneNode('arm', 'Arm', { x: -90, y: 150 }, 150, 180));
        const skin = createSkinBinding('spine', ['spine', 'arm'], 6, sceneGraph)!;
        const states = [
          ...computeFKChain('spine', sceneGraph),
          ...computeFKChain('arm', sceneGraph),
        ];
        // Inside: on the arm, on the body. Outside: above the arm (by its own place it
        // would go to the spine, stretching the arm's top edge as it moved), below
        // it, and beside the body
        const points = [-180, 160, -60, 60, -180, 185, -140, 115, -115, 20, -130, 175];
        const owner = computeAutoWeights(
          skin,
          new Float32Array(points),
          states,
          shape
        ).vertices.map((v) => v.influences);
        expect(owner[2]).toEqual(owner[0]);
        expect(owner[3]).toEqual(owner[0]);
        expect(owner[5]).toEqual(owner[0]);
        expect(owner[0]).toEqual([{ boneId: 'arm', weight: 1 }]);
        expect(owner[4]).toEqual([{ boneId: 'spine', weight: 1 }]);
      });

      it('measures a trunk bone by the widest circle round it, not out along the limbs', () => {
        // A T-pose: arms out either side at the neck's height
        const tPose = (x: number, y: number) =>
          (Math.abs(x) <= 100 && y >= -50 && y <= 250) ||
          (Math.abs(x) <= 300 && y >= 140 && y <= 200);
        sceneGraph.addNode(createBoneNode('neck', 'Neck', { x: 0, y: 150 }, 80, 90));
        sceneGraph.addNode(createBoneNode('arm', 'Arm', { x: -110, y: 170 }, 180, 180));
        const skin = createSkinBinding('neck', ['neck', 'arm'], 1, sceneGraph)!;
        const states = [
          ...computeFKChain('neck', sceneGraph),
          ...computeFKChain('arm', sceneGraph),
        ];
        // The arm's top edge: across the neck it's all shape out to the hands,
        // so measured sideways the neck reached past it
        const edge = computeAutoWeights(skin, new Float32Array([-200, 198]), states, tPose);
        expect(edge.vertices[0]!.influences).toEqual([{ boneId: 'arm', weight: 1 }]);
      });

      it('gives a limb’s far end to the limb, not to a wide trunk across the picture', () => {
        // A thin hand bone at the end of an arm, a wide body far away: the hoof's
        // tip is 30 beyond the hand's reach, the body's middle 400 away
        sceneGraph.addNode(createBoneNode('spine', 'Spine', { x: 0, y: 0 }, 200, 90));
        sceneGraph.addNode(createBoneNode('hand', 'Hand', { x: -400, y: 150 }, 60, 180));
        const skin = createSkinBinding('spine', ['spine', 'hand'], 1, sceneGraph)!;
        const states = [
          ...computeFKChain('spine', sceneGraph),
          ...computeFKChain('hand', sceneGraph),
        ];
        const figure = (x: number, y: number) =>
          (Math.abs(x) <= 150 && y >= -50 && y <= 250) ||
          (x >= -470 && x <= -150 && y >= 140 && y <= 160);
        // A tip of the hoof, off the hand's thin line
        const tip = computeAutoWeights(skin, new Float32Array([-465, 159]), states, figure);
        expect(tip.vertices[0]!.influences).toEqual([{ boneId: 'hand', weight: 1 }]);
      });

      it('weighs a bone outside the shape by the others’ envelopes', () => {
        sceneGraph.addNode(createBoneNode('inside', 'Inside', { x: 0, y: 0 }, 100));
        sceneGraph.addNode(createBoneNode('outside', 'Outside', { x: 0, y: 500 }, 100));
        const skin = createSkinBinding('inside', ['inside', 'outside'], 1, sceneGraph)!;
        const states = [
          ...computeFKChain('inside', sceneGraph),
          ...computeFKChain('outside', sceneGraph),
        ];
        // The band round one bone, and a patch near the other (which runs outside the shape)
        const band = (x: number, y: number) =>
          x >= 0 && x <= 100 && (Math.abs(y) <= 20 || (y >= 455 && y <= 480));
        const result = computeAutoWeights(skin, new Float32Array([50, 10, 50, 478]), states, band);
        expect(result.vertices[0]!.influences).toEqual([{ boneId: 'inside', weight: 1 }]);
        expect(result.vertices[1]!.influences).toEqual([{ boneId: 'outside', weight: 1 }]);
      });
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

    it('add mode reaches full weight: the other bones let go', () => {
      const skin = createTestSkinData();
      for (let i = 0; i < 4; i++) paintWeight(skin, 1, 'b1', 0.3, 'add');
      expect(skin.vertices[1]!.influences).toEqual([{ boneId: 'b1', weight: 1 }]);
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

describe('fitSkinToVertices', () => {
  const left = { influences: [{ boneId: 'upper', weight: 1 }] };
  const right = { influences: [{ boneId: 'lower', weight: 1 }] };
  const skin = (): SkinData => ({
    vertices: [left, right],
    inverseBindMatrices: { upper: [1, 0, 0, 1, 0, 0], lower: [1, 0, 0, 1, 0, 0] },
    meshBindMatrix: [1, 0, 0, 1, 0, 0],
    vertexCount: 2,
    bindVertices: [-100, 0, 100, 0],
  });

  it('leaves a binding that matches the geometry alone', () => {
    const bound = skin();
    expect(fitSkinToVertices(bound, new Float32Array([-90, 0, 90, 0]))).toBe(bound);
  });

  it('leaves older bindings without recorded vertices alone', () => {
    const { bindVertices: _, ...older } = skin();
    expect(fitSkinToVertices(older, new Float32Array([-100, 0, 0, 0, 100, 0]))).toBe(older);
  });

  it('gives new vertices the weights of the nearest bound ones', () => {
    const fitted = fitSkinToVertices(skin(), new Float32Array([-100, 0, -80, 10, 0, 0, 100, 0]));
    expect(fitted.vertexCount).toBe(4);
    expect(fitted.bindVertices).toEqual([-100, 0, -80, 10, 0, 0, 100, 0]);
    // Unchanged vertices keep their own weights
    expect(fitted.vertices[0]).toEqual(left);
    expect(fitted.vertices[3]).toEqual(right);
    // Near the left end: mostly the upper bone
    const nearLeft = fitted.vertices[1]!.influences;
    expect(nearLeft[0]).toMatchObject({ boneId: 'upper' });
    expect(nearLeft[0]!.weight).toBeGreaterThan(0.9);
    // Halfway: an even blend
    const middle = Object.fromEntries(
      fitted.vertices[2]!.influences.map((inf) => [inf.boneId, inf.weight])
    );
    expect(middle.upper).toBeCloseTo(0.5);
    expect(middle.lower).toBeCloseTo(0.5);
  });
});
