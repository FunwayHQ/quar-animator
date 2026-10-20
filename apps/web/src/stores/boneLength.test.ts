import { describe, it, expect } from 'vitest';
import { SceneGraph } from '@quar/core';
import { createBoneNode } from '@quar/rigging';
import type { BoneNode } from '@quar/types';
import { setBoneLength } from './boneLength';

describe('changing a bone’s length', () => {
  it('keeps the bones on its tip attached', () => {
    const sg = new SceneGraph();
    sg.addNode(createBoneNode('upper', 'Upper', { x: 0, y: 0 }, 100));
    sg.addNode(createBoneNode('lower', 'Lower', { x: 100, y: 0 }, 80), 'upper');
    sg.addNode(createBoneNode('spur', 'Spur', { x: 40, y: 10 }, 20), 'upper');

    setBoneLength(sg, 'upper', 150);

    expect((sg.getNode('upper') as BoneNode).length).toBe(150);
    expect(sg.getNode('lower')!.transform.position).toEqual({ x: 150, y: 0 });
    // One branching off mid-bone stays where it is
    expect(sg.getNode('spur')!.transform.position).toEqual({ x: 40, y: 10 });
  });
});
