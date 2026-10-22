import { describe, it, expect, vi } from 'vitest';
import { evaluateSmartBones } from '@quar/rigging';
import type { SmartBoneAction } from '@quar/types';
import { createSmartBoneMorphCache } from './smartBoneMorphs';

function makeAction(): SmartBoneAction {
  return {
    id: 'bend',
    name: 'Bend',
    driver: { boneId: 'bone-1', property: 'transform.rotation', rangeMin: 0, rangeMax: 90 },
    targets: [
      { id: 't0', name: 'Rest', driverValue: 0, offsets: { mesh: [] } },
      {
        id: 't1',
        name: 'Bent',
        driverValue: 90,
        offsets: { mesh: [{ vertexIndex: 0, dx: 10, dy: 0 }] },
      },
    ],
    enabled: true,
  };
}

function makeScene(rotation: number) {
  const bone = { type: 'bone', transform: { rotation } };
  return {
    bone,
    sceneGraph: { getNode: (id: string) => (id === 'bone-1' ? bone : undefined) },
  };
}

describe('createSmartBoneMorphCache (F160)', () => {
  it('hands back the same offsets while the driver bone stays put', () => {
    const evaluate = vi.fn(evaluateSmartBones);
    const morphs = createSmartBoneMorphCache(evaluate);
    const actions = [makeAction()];
    const { sceneGraph } = makeScene(45);

    const first = morphs(actions, sceneGraph, new Map([['mesh', 3]]));
    const second = morphs(actions, sceneGraph, new Map([['mesh', 3]]));

    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(second.get('mesh')).toBe(first.get('mesh'));
    expect(first.get('mesh')?.[0]).toBeCloseTo(5);
  });

  it('works them out again when the driver bone turns', () => {
    const evaluate = vi.fn(evaluateSmartBones);
    const morphs = createSmartBoneMorphCache(evaluate);
    const actions = [makeAction()];
    const { bone, sceneGraph } = makeScene(45);

    const first = morphs(actions, sceneGraph, new Map([['mesh', 3]]));
    bone.transform.rotation = 90;
    const second = morphs(actions, sceneGraph, new Map([['mesh', 3]]));

    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
    expect(second.get('mesh')?.[0]).toBeCloseTo(10);
  });

  it('works them out again when the actions or vertex counts change', () => {
    const evaluate = vi.fn(evaluateSmartBones);
    const morphs = createSmartBoneMorphCache(evaluate);
    const { sceneGraph } = makeScene(45);
    const actions = [makeAction()];

    morphs(actions, sceneGraph, new Map([['mesh', 3]]));
    morphs([{ ...makeAction(), enabled: false }], sceneGraph, new Map([['mesh', 3]]));
    expect(evaluate).toHaveBeenCalledTimes(2);

    morphs(actions, sceneGraph, new Map([['mesh', 3]]));
    morphs(actions, sceneGraph, new Map([['mesh', 4]]));
    expect(evaluate).toHaveBeenCalledTimes(4);
  });
});
