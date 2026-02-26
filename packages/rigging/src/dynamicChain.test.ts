import { describe, it, expect } from 'vitest';
import {
  initializeChainState,
  stepDynamicChain,
  applyChainToBones,
  computeWindForce,
  type DynamicChainSceneGraph,
} from './dynamicChain';
import type { DynamicChain, DynamicChainState, WindSettings, Vector2 } from '@quar/types';

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
  _id: string,
  length: number,
  position: Vector2 = { x: 0, y: 0 },
  rotation = 0,
  parent: string | null = null
): MockBone {
  return {
    type: 'bone',
    length,
    parent,
    transform: { position, rotation },
  };
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

      // Simple world transform: compose from parent chain
      const rad = bone.transform.rotation * (Math.PI / 180);
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      if (bone.parent && bones[bone.parent]) {
        const parentWt = makeSG(bones).getWorldTransform(bone.parent);
        // child local pos transformed by parent
        const px = bone.transform.position.x;
        const py = bone.transform.position.y;
        const wx = parentWt.a * px + parentWt.c * py + parentWt.tx;
        const wy = parentWt.b * px + parentWt.d * py + parentWt.ty;
        return {
          a: parentWt.a * cos + parentWt.c * sin,
          b: parentWt.b * cos + parentWt.d * sin,
          c: parentWt.a * -sin + parentWt.c * cos,
          d: parentWt.b * -sin + parentWt.d * cos,
          tx: wx,
          ty: wy,
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
    boneIds: ['bone-1', 'bone-2', 'bone-3'],
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

// A straight horizontal 3-bone chain at y=0
function makeHorizontalChainSG(): { sg: DynamicChainSceneGraph; bones: Record<string, MockBone> } {
  const bones: Record<string, MockBone> = {
    'bone-1': makeBone('bone-1', 50, { x: 0, y: 0 }, 0),
    'bone-2': makeBone('bone-2', 50, { x: 50, y: 0 }, 0, 'bone-1'),
    'bone-3': makeBone('bone-3', 50, { x: 50, y: 0 }, 0, 'bone-2'),
  };
  return { sg: makeSG(bones), bones };
}

// ---------------------------------------------------------------------------
// computeWindForce
// ---------------------------------------------------------------------------

describe('computeWindForce', () => {
  it('returns zero when disabled', () => {
    const wind = makeWind({ enabled: false, strength: 100 });
    const force = computeWindForce(wind, 0);
    expect(force.x).toBe(0);
    expect(force.y).toBe(0);
  });

  it('returns zero when strength is 0', () => {
    const wind = makeWind({ enabled: true, strength: 0 });
    const force = computeWindForce(wind, 0);
    expect(force.x).toBe(0);
    expect(force.y).toBe(0);
  });

  it('returns force in wind direction', () => {
    const wind = makeWind({ enabled: true, strength: 10, direction: 0, turbulence: 0 });
    const force = computeWindForce(wind, 0);
    expect(force.x).toBeCloseTo(10);
    expect(force.y).toBeCloseTo(0);
  });

  it('returns force at 90 degrees', () => {
    const wind = makeWind({ enabled: true, strength: 10, direction: 90, turbulence: 0 });
    const force = computeWindForce(wind, 0);
    expect(force.x).toBeCloseTo(0, 0);
    expect(force.y).toBeCloseTo(10);
  });

  it('adds turbulence variation over time', () => {
    const wind = makeWind({
      enabled: true,
      strength: 10,
      direction: 0,
      turbulence: 1,
      frequency: 1,
    });
    const force0 = computeWindForce(wind, 0);
    const force1 = computeWindForce(wind, 0.25);
    // Turbulence should cause variation
    expect(force0.x).not.toEqual(force1.x);
  });
});

// ---------------------------------------------------------------------------
// initializeChainState
// ---------------------------------------------------------------------------

describe('initializeChainState', () => {
  it('creates particles for a 3-bone chain', () => {
    const { sg } = makeHorizontalChainSG();
    const chain = makeChain();
    const state = initializeChainState(chain, sg);
    expect(state).not.toBeNull();
    expect(state!.chainId).toBe('chain-1');
    expect(state!.initialized).toBe(true);
    // 3 bones → 4 particles (root + 3 tips)
    expect(state!.particles).toHaveLength(4);
  });

  it('sets correct particle positions for horizontal chain', () => {
    const { sg } = makeHorizontalChainSG();
    const chain = makeChain();
    const state = initializeChainState(chain, sg)!;

    // Particle 0 = bone-1 root at (0, 0)
    expect(state.particles[0]!.position.x).toBeCloseTo(0);
    expect(state.particles[0]!.position.y).toBeCloseTo(0);

    // Particle 1 = bone-1 tip at (50, 0)
    expect(state.particles[1]!.position.x).toBeCloseTo(50);
    expect(state.particles[1]!.position.y).toBeCloseTo(0);

    // Particle 2 = bone-2 tip at (100, 0)
    expect(state.particles[2]!.position.x).toBeCloseTo(100);
    expect(state.particles[2]!.position.y).toBeCloseTo(0);

    // Particle 3 = bone-3 tip at (150, 0)
    expect(state.particles[3]!.position.x).toBeCloseTo(150);
    expect(state.particles[3]!.position.y).toBeCloseTo(0);
  });

  it('stores rest lengths from bone lengths', () => {
    const { sg } = makeHorizontalChainSG();
    const chain = makeChain();
    const state = initializeChainState(chain, sg)!;

    // particle 0 has restLength 0 (root anchor)
    expect(state.particles[0]!.restLength).toBe(0);
    // particles 1-3 have restLength 50 (each bone is 50 units)
    expect(state.particles[1]!.restLength).toBe(50);
    expect(state.particles[2]!.restLength).toBe(50);
    expect(state.particles[3]!.restLength).toBe(50);
  });

  it('returns null for empty boneIds', () => {
    const { sg } = makeHorizontalChainSG();
    const chain = makeChain({ boneIds: [] });
    expect(initializeChainState(chain, sg)).toBeNull();
  });

  it('returns null when root bone not found', () => {
    const { sg } = makeHorizontalChainSG();
    const chain = makeChain({ boneIds: ['nonexistent'] });
    expect(initializeChainState(chain, sg)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// stepDynamicChain
// ---------------------------------------------------------------------------

describe('stepDynamicChain', () => {
  it('pins root particle to FK position', () => {
    const { sg } = makeHorizontalChainSG();
    const chain = makeChain({ gravity: 0 });
    const state = initializeChainState(chain, sg)!;

    // Move root bone
    const rootBone = sg.getNode('bone-1')!;
    sg.updateNode('bone-1', {
      transform: { ...rootBone.transform, position: { x: 10, y: 20 } },
    });

    stepDynamicChain(chain, state, sg, 1 / 60, { x: 0, y: 0 });

    // Root particle should follow FK root
    expect(state.particles[0]!.position.x).toBeCloseTo(10);
    expect(state.particles[0]!.position.y).toBeCloseTo(20);
  });

  it('applies gravity to non-root particles', () => {
    const { sg } = makeHorizontalChainSG();
    const chain = makeChain({ gravity: 100, gravityAngle: -90, damping: 0 });
    const state = initializeChainState(chain, sg)!;

    const initialY1 = state.particles[1]!.position.y;
    const initialY3 = state.particles[3]!.position.y;

    // Step several times
    for (let i = 0; i < 10; i++) {
      stepDynamicChain(chain, state, sg, 1 / 60, { x: 0, y: 0 });
    }

    // Particles should have moved downward (gravity angle -90 = y decreases in Y-up)
    expect(state.particles[1]!.position.y).toBeLessThan(initialY1);
    expect(state.particles[3]!.position.y).toBeLessThan(initialY3);
  });

  it('maintains bone lengths via distance constraints', () => {
    const { sg } = makeHorizontalChainSG();
    const chain = makeChain({ gravity: 100, gravityAngle: -90 });
    const state = initializeChainState(chain, sg)!;

    // Step simulation
    for (let i = 0; i < 20; i++) {
      stepDynamicChain(chain, state, sg, 1 / 60, { x: 0, y: 0 });
    }

    // Check that distances between consecutive particles are approximately 50
    for (let i = 1; i < state.particles.length; i++) {
      const p = state.particles[i - 1]!;
      const c = state.particles[i]!;
      const dx = c.position.x - p.position.x;
      const dy = c.position.y - p.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      expect(dist).toBeCloseTo(50, 0); // Within 1 unit
    }
  });

  it('applies damping to reduce velocity', () => {
    const { sg } = makeHorizontalChainSG();
    const chain = makeChain({ gravity: 50, gravityAngle: -90, damping: 0.9 });
    const state = initializeChainState(chain, sg)!;

    // Perturb particle and step with high damping
    state.particles[3]!.position.y = 100;

    stepDynamicChain(chain, state, sg, 1 / 60, { x: 0, y: 0 });

    // With 0.9 damping, the velocity should be heavily reduced
    const vy = state.particles[3]!.position.y - state.particles[3]!.prevPosition.y;
    expect(Math.abs(vy)).toBeLessThan(50);
  });

  it('stiffness pulls particles toward rest angles', () => {
    const { sg } = makeHorizontalChainSG();
    const chain = makeChain({ gravity: 0, stiffness: 0.5 });
    const state = initializeChainState(chain, sg)!;

    // Perturb last particle significantly downward
    state.particles[3]!.position.y = -50;
    state.particles[3]!.prevPosition.y = -50;

    stepDynamicChain(chain, state, sg, 1 / 60, { x: 0, y: 0 });

    // Stiffness should pull it back toward rest angle (horizontal, y≈0)
    expect(Math.abs(state.particles[3]!.position.y)).toBeLessThan(50);
  });

  it('ignores invalid dt', () => {
    const { sg } = makeHorizontalChainSG();
    const chain = makeChain({ gravity: 100 });
    const state = initializeChainState(chain, sg)!;
    const posBefore = { ...state.particles[3]!.position };

    stepDynamicChain(chain, state, sg, 0, { x: 0, y: 0 });
    expect(state.particles[3]!.position).toEqual(posBefore);

    stepDynamicChain(chain, state, sg, -1, { x: 0, y: 0 });
    expect(state.particles[3]!.position).toEqual(posBefore);

    stepDynamicChain(chain, state, sg, 0.5, { x: 0, y: 0 }); // > 0.1
    expect(state.particles[3]!.position).toEqual(posBefore);
  });

  it('does nothing for uninitialized state', () => {
    const { sg } = makeHorizontalChainSG();
    const chain = makeChain();
    const state: DynamicChainState = {
      chainId: 'chain-1',
      particles: [],
      initialized: false,
    };
    // Should not throw
    stepDynamicChain(chain, state, sg, 1 / 60, { x: 0, y: 0 });
  });

  it('applies wind influence', () => {
    const { sg } = makeHorizontalChainSG();
    const chain = makeChain({ gravity: 0, windInfluence: 1, damping: 0 });
    const state = initializeChainState(chain, sg)!;

    const windForce: Vector2 = { x: 100, y: 0 };

    for (let i = 0; i < 5; i++) {
      stepDynamicChain(chain, state, sg, 1 / 60, windForce);
    }

    // Last particle should have moved in wind direction (positive x)
    expect(state.particles[3]!.position.x).toBeGreaterThan(150);
  });

  it('elasticity pulls particles toward rest position', () => {
    const { sg } = makeHorizontalChainSG();
    const chain = makeChain({ gravity: 0, elasticity: 0.5 });
    const state = initializeChainState(chain, sg)!;

    // Perturb particle
    state.particles[3]!.position = { x: 200, y: -100 };
    state.particles[3]!.prevPosition = { x: 200, y: -100 };

    stepDynamicChain(chain, state, sg, 1 / 60, { x: 0, y: 0 });

    // Should be pulled back toward rest (150, 0)
    expect(state.particles[3]!.position.x).toBeLessThan(200);
  });

  it('freezeAxis x prevents horizontal movement', () => {
    const { sg } = makeHorizontalChainSG();
    const chain = makeChain({ gravity: 0, freezeAxis: 'x' });
    const state = initializeChainState(chain, sg)!;

    // Record initial x positions
    const initialXs = state.particles.map((p) => p.position.x);

    // Perturb and step
    state.particles[3]!.position = { x: 200, y: -100 };
    stepDynamicChain(chain, state, sg, 1 / 60, { x: 0, y: 0 });

    // X positions of non-root particles should be at rest x
    for (let i = 1; i < state.particles.length; i++) {
      expect(state.particles[i]!.position.x).toBeCloseTo(initialXs[i]!, 0);
    }
  });

  it('freezeAxis y prevents vertical movement', () => {
    const { sg } = makeHorizontalChainSG();
    const chain = makeChain({ gravity: 100, gravityAngle: -90, freezeAxis: 'y' });
    const state = initializeChainState(chain, sg)!;

    for (let i = 0; i < 10; i++) {
      stepDynamicChain(chain, state, sg, 1 / 60, { x: 0, y: 0 });
    }

    // Y positions should be at rest (0)
    for (let i = 1; i < state.particles.length; i++) {
      expect(state.particles[i]!.position.y).toBeCloseTo(0, 0);
    }
  });
});

// ---------------------------------------------------------------------------
// applyChainToBones
// ---------------------------------------------------------------------------

describe('applyChainToBones', () => {
  it('sets bone rotations based on particle positions', () => {
    const { sg, bones } = makeHorizontalChainSG();
    const chain = makeChain();
    const state = initializeChainState(chain, sg)!;

    // Bend the chain: move last particle down
    state.particles[3]!.position = { x: 150, y: -50 };

    applyChainToBones(chain, state, sg);

    // bone-3 should have a non-zero rotation since its tip moved down
    expect(bones['bone-3']!.transform.rotation).not.toBeCloseTo(0);
  });

  it('preserves straight chain as zero rotation', () => {
    const { sg, bones } = makeHorizontalChainSG();
    const chain = makeChain();
    const state = initializeChainState(chain, sg)!;

    // Keep particles in straight horizontal line (as initialized)
    applyChainToBones(chain, state, sg);

    // All bones should have approximately 0 rotation
    expect(bones['bone-1']!.transform.rotation).toBeCloseTo(0, 0);
  });

  it('does nothing for uninitialized state', () => {
    const { sg, bones } = makeHorizontalChainSG();
    const chain = makeChain();
    const state: DynamicChainState = {
      chainId: 'chain-1',
      particles: [],
      initialized: false,
    };
    const rotBefore = bones['bone-1']!.transform.rotation;
    applyChainToBones(chain, state, sg);
    expect(bones['bone-1']!.transform.rotation).toBe(rotBefore);
  });

  it('skips missing bones', () => {
    const { sg } = makeHorizontalChainSG();
    const chain = makeChain({ boneIds: ['bone-1', 'missing', 'bone-3'] });
    const state = initializeChainState(makeChain(), makeSG(makeHorizontalChainSG().bones))!;

    // Should not throw
    applyChainToBones(chain, state, sg);
  });
});
