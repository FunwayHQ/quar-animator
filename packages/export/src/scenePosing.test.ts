/**
 * Tests for posing a copy of the scene, rig included, for exports
 */

import { describe, it, expect } from 'vitest';
import { createScenePoser, rigHasPhysics } from './scenePosing';
import { riggedArm } from './__fixtures__/riggedArm';

/** The largest x and y among world-space vertices. */
function farthest(world: Float32Array): { x: number; y: number } {
  let x = -Infinity;
  let y = -Infinity;
  for (let i = 0; i < world.length; i += 2) {
    x = Math.max(x, world[i]!);
    y = Math.max(y, world[i + 1]!);
  }
  return { x, y };
}

describe('createScenePoser', () => {
  it('poses a copy at each frame, leaving the scene alone', () => {
    const { sg, timeline } = riggedArm();
    const poser = createScenePoser(sg, timeline, { frameRate: 30 });
    poser.poseAt(10);
    expect(poser.scene.getNode('lower')!.transform.rotation).toBeCloseTo(90);
    expect(sg.getNode('lower')!.transform.rotation).toBe(0);
    poser.poseAt(0);
    expect(poser.scene.getNode('lower')!.transform.rotation).toBeCloseTo(0);
  });

  it("gives bound shapes' outlines where their bones bend them", () => {
    const { sg, timeline, outlineCount } = riggedArm();
    const poser = createScenePoser(sg, timeline, { frameRate: 30 });
    poser.poseAt(0);
    const rest = poser.boundOutlines().get('arm')!;
    expect(rest.closed).toBe(true);
    expect(rest.world.length / 2).toBe(outlineCount);
    expect(farthest(rest.world).x).toBeCloseTo(100, 0);

    poser.poseAt(10);
    const bent = farthest(poser.boundOutlines().get('arm')!.world);
    // The forearm swung up: its end is higher and no longer as far right
    expect(bent.x).toBeLessThan(60);
    expect(bent.y).toBeGreaterThan(60);
  });

  it('knows when the rig has physics', () => {
    expect(rigHasPhysics(undefined)).toBe(false);
    expect(rigHasPhysics({ frameRate: 30, dynamicChains: [] })).toBe(false);
    expect(
      rigHasPhysics({
        frameRate: 30,
        dynamicChains: [{ enabled: true } as never],
      })
    ).toBe(true);
  });
});
