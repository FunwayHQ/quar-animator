import { describe, it, expect } from 'vitest';
import { evaluateDynamicChains, resetDynamicChainStates } from './dynamicChainEvaluator';
import type { DynamicChain, DynamicChainState, WindSettings, Vector2 } from '@quar/types';
import type { DynamicChainSceneGraph } from './dynamicChain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockBone {
  type: 'bone';
  length: number;
  parent: string | null;
  transform: { position: Vector2; rotation: number };
}

function makeBone(
  length: number,
  position: Vector2 = { x: 0, y: 0 },
  rotation = 0,
  parent: string | null = null
): MockBone {
  return { type: 'bone', length, parent, transform: { position, rotation } };
}

function makeSG(bones: Record<string, MockBone>): DynamicChainSceneGraph {
  return {
    getNode(id: string) {
      return bones[id] as any;
    },
    updateNode(id: string, data: Record<string, unknown>) {
      const bone = bones[id];
      if (bone && data.transform) {
        bone.transform = data.transform as any;
      }
    },
    getWorldTransform(id: string) {
      const bone = bones[id];
      if (!bone) return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
      const rad = bone.transform.rotation * (Math.PI / 180);
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      if (bone.parent && bones[bone.parent]) {
        const parentWt = makeSG(bones).getWorldTransform(bone.parent);
        const px = bone.transform.position.x;
        const py = bone.transform.position.y;
        return {
          a: parentWt.a * cos + parentWt.c * sin,
          b: parentWt.b * cos + parentWt.d * sin,
          c: parentWt.a * -sin + parentWt.c * cos,
          d: parentWt.b * -sin + parentWt.d * cos,
          tx: parentWt.a * px + parentWt.c * py + parentWt.tx,
          ty: parentWt.b * px + parentWt.d * py + parentWt.ty,
        };
      }

      return {
        a: cos,
        b: sin,
        c: -sin,
        d: cos,
        tx: bone.transform.position.x,
        ty: bone.transform.position.y,
      };
    },
  };
}

function makeChain(overrides: Partial<DynamicChain> = {}): DynamicChain {
  return {
    id: 'chain-1',
    name: 'Tail',
    rootBoneId: 'bone-1',
    boneIds: ['bone-1', 'bone-2'],
    enabled: true,
    stiffness: 0,
    damping: 0.1,
    gravity: 0,
    gravityAngle: -90,
    windInfluence: 0,
    elasticity: 0,
    collisionRadius: 0,
    ...overrides,
  };
}

function makeWind(overrides: Partial<WindSettings> = {}): WindSettings {
  return {
    strength: 0,
    direction: 0,
    turbulence: 0,
    frequency: 1,
    enabled: false,
    ...overrides,
  };
}

function makeHorizontalBones(): Record<string, MockBone> {
  return {
    'bone-1': makeBone(50, { x: 0, y: 0 }),
    'bone-2': makeBone(50, { x: 50, y: 0 }, 0, 'bone-1'),
  };
}

// ---------------------------------------------------------------------------
// evaluateDynamicChains
// ---------------------------------------------------------------------------

describe('evaluateDynamicChains', () => {
  it('initializes and steps chain state', () => {
    const bones = makeHorizontalBones();
    const sg = makeSG(bones);
    const stateMap = new Map<string, DynamicChainState>();
    const chain = makeChain({ gravity: 50, gravityAngle: -90 });

    evaluateDynamicChains([chain], stateMap, sg, 1 / 60, makeWind(), 0);

    // State should be created
    expect(stateMap.has('chain-1')).toBe(true);
    expect(stateMap.get('chain-1')!.initialized).toBe(true);
  });

  it('skips disabled chains', () => {
    const bones = makeHorizontalBones();
    const sg = makeSG(bones);
    const stateMap = new Map<string, DynamicChainState>();
    const chain = makeChain({ enabled: false });

    evaluateDynamicChains([chain], stateMap, sg, 1 / 60, makeWind(), 0);
    expect(stateMap.size).toBe(0);
  });

  it('skips chains with empty boneIds', () => {
    const bones = makeHorizontalBones();
    const sg = makeSG(bones);
    const stateMap = new Map<string, DynamicChainState>();
    const chain = makeChain({ boneIds: [] });

    evaluateDynamicChains([chain], stateMap, sg, 1 / 60, makeWind(), 0);
    expect(stateMap.size).toBe(0);
  });

  it('applies gravity over multiple steps', () => {
    const bones = makeHorizontalBones();
    const sg = makeSG(bones);
    const stateMap = new Map<string, DynamicChainState>();
    const chain = makeChain({ gravity: 100, gravityAngle: -90 });

    for (let i = 0; i < 20; i++) {
      evaluateDynamicChains([chain], stateMap, sg, 1 / 60, makeWind(), i / 60);
    }

    // bone-2 rotation should have changed from gravity pull
    expect(bones['bone-2']!.transform.rotation).not.toBeCloseTo(0);
  });

  it('handles multiple chains', () => {
    const bones = {
      ...makeHorizontalBones(),
      'bone-3': makeBone(30, { x: 0, y: 100 }),
      'bone-4': makeBone(30, { x: 30, y: 0 }, 0, 'bone-3'),
    };
    const sg = makeSG(bones);
    const stateMap = new Map<string, DynamicChainState>();
    const chain1 = makeChain({ id: 'chain-1', boneIds: ['bone-1', 'bone-2'] });
    const chain2 = makeChain({
      id: 'chain-2',
      rootBoneId: 'bone-3',
      boneIds: ['bone-3', 'bone-4'],
    });

    evaluateDynamicChains([chain1, chain2], stateMap, sg, 1 / 60, makeWind(), 0);
    expect(stateMap.size).toBe(2);
  });

  it('reuses existing state on subsequent calls', () => {
    const bones = makeHorizontalBones();
    const sg = makeSG(bones);
    const stateMap = new Map<string, DynamicChainState>();
    const chain = makeChain();

    evaluateDynamicChains([chain], stateMap, sg, 1 / 60, makeWind(), 0);
    const state1 = stateMap.get('chain-1');

    evaluateDynamicChains([chain], stateMap, sg, 1 / 60, makeWind(), 1 / 60);
    const state2 = stateMap.get('chain-1');

    // Same state object should be reused
    expect(state1).toBe(state2);
  });

  it('applies wind force', () => {
    const bones = makeHorizontalBones();
    const sg = makeSG(bones);
    const stateMap = new Map<string, DynamicChainState>();
    const chain = makeChain({ windInfluence: 1, damping: 0 });
    const wind = makeWind({ enabled: true, strength: 100, direction: 0 });

    for (let i = 0; i < 10; i++) {
      evaluateDynamicChains([chain], stateMap, sg, 1 / 60, wind, i / 60);
    }

    // State particles should show wind influence
    const state = stateMap.get('chain-1')!;
    expect(state.particles[2]!.position.x).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------------------
// resetDynamicChainStates
// ---------------------------------------------------------------------------

describe('resetDynamicChainStates', () => {
  it('clears all states', () => {
    const stateMap = new Map<string, DynamicChainState>();
    stateMap.set('chain-1', {
      chainId: 'chain-1',
      particles: [],
      initialized: true,
    });
    stateMap.set('chain-2', {
      chainId: 'chain-2',
      particles: [],
      initialized: true,
    });

    resetDynamicChainStates(stateMap);
    expect(stateMap.size).toBe(0);
  });
});
