import { describe, it, expect, vi } from 'vitest';
import { bakeDynamicChainToKeyframes } from './bakeDynamicChain';
import type { DynamicChain, WindSettings, Vector2 } from '@quar/types';
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
    gravity: 50,
    gravityAngle: -90,
    windInfluence: 0,
    elasticity: 0,
    collisionRadius: 0,
    ...overrides,
  };
}

function makeWind(): WindSettings {
  return { strength: 0, direction: 0, turbulence: 0, frequency: 1, enabled: false };
}

function makeHorizontalBones(): Record<string, MockBone> {
  return {
    'bone-1': makeBone(50, { x: 0, y: 0 }),
    'bone-2': makeBone(50, { x: 50, y: 0 }, 0, 'bone-1'),
  };
}

// ---------------------------------------------------------------------------
// bakeDynamicChainToKeyframes
// ---------------------------------------------------------------------------

describe('bakeDynamicChainToKeyframes', () => {
  it('produces keyframes for each bone at each frame', () => {
    const bones = makeHorizontalBones();
    const sg = makeSG(bones);
    const chain = makeChain();
    const applyAnimation = vi.fn();

    const result = bakeDynamicChainToKeyframes(chain, sg, 10, 24, makeWind(), applyAnimation);
    expect(result).not.toBeNull();

    // 2 bones
    expect(result!.boneKeyframes.size).toBe(2);

    // 11 keyframes each (frames 0 through 10)
    expect(result!.boneKeyframes.get('bone-1')!).toHaveLength(11);
    expect(result!.boneKeyframes.get('bone-2')!).toHaveLength(11);
  });

  it('calls applyAnimationAtFrame for each frame', () => {
    const bones = makeHorizontalBones();
    const sg = makeSG(bones);
    const chain = makeChain();
    const applyAnimation = vi.fn();

    bakeDynamicChainToKeyframes(chain, sg, 5, 24, makeWind(), applyAnimation);

    // Called for frame 0 (init) + frames 0-5 (loop) = frame 0 called twice (init + loop start)
    expect(applyAnimation).toHaveBeenCalledWith(0);
    expect(applyAnimation).toHaveBeenCalledWith(5);
  });

  it('keyframes have linear easing', () => {
    const bones = makeHorizontalBones();
    const sg = makeSG(bones);
    const chain = makeChain();

    const result = bakeDynamicChainToKeyframes(chain, sg, 3, 24, makeWind(), () => {});
    const kfs = result!.boneKeyframes.get('bone-1')!;
    for (const kf of kfs) {
      expect(kf.easing).toBe('linear');
    }
  });

  it('returns null for empty boneIds', () => {
    const bones = makeHorizontalBones();
    const sg = makeSG(bones);
    const chain = makeChain({ boneIds: [] });

    const result = bakeDynamicChainToKeyframes(chain, sg, 10, 24, makeWind(), () => {});
    expect(result).toBeNull();
  });

  it('returns null for negative endFrame', () => {
    const bones = makeHorizontalBones();
    const sg = makeSG(bones);
    const chain = makeChain();

    const result = bakeDynamicChainToKeyframes(chain, sg, -1, 24, makeWind(), () => {});
    expect(result).toBeNull();
  });

  it('returns null for zero frameRate', () => {
    const bones = makeHorizontalBones();
    const sg = makeSG(bones);
    const chain = makeChain();

    const result = bakeDynamicChainToKeyframes(chain, sg, 10, 0, makeWind(), () => {});
    expect(result).toBeNull();
  });

  it('keyframe times match frame numbers', () => {
    const bones = makeHorizontalBones();
    const sg = makeSG(bones);
    const chain = makeChain();

    const result = bakeDynamicChainToKeyframes(chain, sg, 4, 24, makeWind(), () => {});
    const kfs = result!.boneKeyframes.get('bone-1')!;
    expect(kfs.map((k) => k.time)).toEqual([0, 1, 2, 3, 4]);
  });

  it('records varying rotations when gravity is applied', () => {
    const bones = makeHorizontalBones();
    const sg = makeSG(bones);
    const chain = makeChain({ gravity: 200, gravityAngle: -90 });

    const result = bakeDynamicChainToKeyframes(chain, sg, 20, 24, makeWind(), () => {});
    const kfs = result!.boneKeyframes.get('bone-2')!;

    // Later frames should have different rotation than frame 0
    const rot0 = kfs[0]!.value;
    const rot20 = kfs[20]!.value;
    expect(rot0).not.toEqual(rot20);
  });
});
