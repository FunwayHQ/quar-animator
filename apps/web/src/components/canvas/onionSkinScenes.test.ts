import { describe, it, expect } from 'vitest';
import { SceneGraph, createGroupNode } from '@quar/core';
import { addKeyframe, createTimeline, getOrCreateTrack } from '@quar/animation';
import { createBoneNode } from '@quar/rigging';
import type { ArtboardNode } from '@quar/types';
import { GhostSceneCache, poseSceneAtFrame } from './onionSkinScenes';

describe('onion-skin ghost scenes', () => {
  function scene() {
    const sg = new SceneGraph();
    sg.addNode(createGroupNode('g', 'Group'));
    sg.addNode(createBoneNode('upper', 'Upper', { x: 0, y: 0 }, 100), 'g');
    sg.addNode(createBoneNode('lower', 'Lower', { x: 100, y: 0 }, 100), 'upper');
    const timeline = createTimeline({ duration: 30, frameRate: 30 });
    const track = getOrCreateTrack<number>(timeline, 'lower', 'transform.rotation');
    addKeyframe(track, 0, 0);
    addKeyframe(track, 10, 90);
    return { sg, timeline };
  }

  it('poses layers deep in the scene, without touching it', () => {
    const { sg, timeline } = scene();
    const ghost = poseSceneAtFrame(sg, timeline, 5, []);
    // The child bone, inside a group, posed at frame 5
    expect(ghost.getNode('lower')!.transform.rotation).toBeCloseTo(45, 0);
    expect(ghost.getNode('lower')!.parent).toBe('upper');
    expect(sg.getNode('lower')!.transform.rotation).toBe(0);
  });

  it('leaves out artboard backgrounds', () => {
    const sg = new SceneGraph();
    sg.addNode({
      ...createGroupNode('a', 'Artboard'),
      type: 'artboard',
      width: 100,
      height: 100,
      fills: [
        { type: 'solid', color: { r: 255, g: 255, b: 255, a: 1 }, opacity: 1, visible: true },
      ],
    } as unknown as ArtboardNode);
    const ghost = poseSceneAtFrame(sg, createTimeline({ duration: 10, frameRate: 30 }), 1, []);
    expect((ghost.getNode('a') as ArtboardNode).fills).toEqual([]);
    expect((sg.getNode('a') as ArtboardNode).fills).toHaveLength(1);
  });

  it('keeps posed scenes while nothing they depend on changes', () => {
    const cache = new GhostSceneCache();
    let posed = 0;
    const pose = () => {
      posed++;
      return new SceneGraph();
    };
    const inputs = [1, 'timeline'];
    const first = cache.get(inputs, 3, pose);
    expect(cache.get([1, 'timeline'], 3, pose)).toBe(first);
    expect(posed).toBe(1);
    // The scene changed
    cache.get([2, 'timeline'], 3, pose);
    expect(posed).toBe(2);
  });
});
