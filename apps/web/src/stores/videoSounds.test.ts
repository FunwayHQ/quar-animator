/**
 * A video layer's linked sound kept on its layer's timeline, where its clip
 * is, and what deleting the layer leaves of it.
 */

import { describe, expect, it } from 'vitest';
import { SceneGraph, createGroupNode } from '@quar/core';
import { createTimeline, scopeSounds } from '@quar/animation';
import type { SoundClip } from '@quar/types';
import {
  findLinkedSound,
  layerScope,
  soundsLinkedToRemoved,
  unlinkedSoundClip,
  withLinkedSoundsFollowing,
  withLinkedSoundsResolved,
} from './videoSounds';
import { artboard, linkedSound, videoLayer } from '../test/videoLayer';

const voice = (id: string): SoundClip => ({
  id,
  soundId: 'voice',
  start: 0,
  offset: 0,
  duration: 1,
  gain: 1,
});

describe('linked sounds', () => {
  it('know the timeline a layer plays on: its artboard’s, or the page’s', () => {
    const sg = new SceneGraph();
    sg.addNode(artboard('slide'));
    sg.addNode(createGroupNode('g', 'G'), 'slide');
    sg.addNode(videoLayer('in', 'beach'), 'g');
    sg.addNode(videoLayer('out', 'beach'));
    expect(layerScope(sg, 'in')).toBe('slide');
    expect(layerScope(sg, 'out')).toBeNull();
    expect(layerScope(sg, 'gone')).toBeNull();
  });

  it('follow their layer onto the timeline it now plays on, where its clip is', () => {
    const sg = new SceneGraph();
    sg.addNode(artboard('slide'));
    const layer = videoLayer('v', 'beach', { start: 12 });
    sg.addNode(layer);
    const sound = { ...linkedSound('s', layer), start: 0, gain: 0.5 };
    const timeline = createTimeline({ sounds: [voice('other'), sound] });
    sg.moveNode('v', 'slide');

    const moved = withLinkedSoundsFollowing(sg, timeline, ['slide']);
    expect(scopeSounds(moved, null).map((clip) => clip.id)).toEqual(['other']);
    expect(scopeSounds(moved, 'slide')).toEqual([{ ...sound, start: 12 }]);
    // The artboard's timeline begins at the page's length
    expect(moved.artboards?.slide?.duration).toBe(timeline.duration);
    expect(findLinkedSound(moved, 'v')).toMatchObject({ scope: 'slide', clip: { id: 's' } });
    // Where it is already, nothing changes
    expect(withLinkedSoundsFollowing(sg, moved, ['v'])).toBe(moved);
  });

  it('left by deleted layers are those on timelines that stay', () => {
    const sg = new SceneGraph();
    sg.addNode(artboard('slide'));
    sg.addNode(createGroupNode('g', 'G'));
    const inGroup = videoLayer('a', 'beach');
    const onSlide = videoLayer('b', 'beach');
    sg.addNode(inGroup, 'g');
    sg.addNode(onSlide, 'slide');
    const timeline = createTimeline({
      sounds: [linkedSound('sa', inGroup), voice('own')],
      artboards: { slide: { duration: 90, sounds: [linkedSound('sb', onSlide)] } },
    });
    expect(soundsLinkedToRemoved(sg, timeline, ['g']).map((clip) => clip.id)).toEqual(['sa']);
    // A deleted artboard takes its timeline's sounds along
    expect(soundsLinkedToRemoved(sg, timeline, ['slide'])).toEqual([]);
    expect(soundsLinkedToRemoved(sg, timeline, ['b'])).toHaveLength(1);

    const kept = withLinkedSoundsResolved(timeline, [linkedSound('sa', inGroup)], true);
    expect(scopeSounds(kept, null)[0]).toEqual(unlinkedSoundClip(linkedSound('sa', inGroup)));
    expect(scopeSounds(kept, null)[0]).not.toHaveProperty('linkedTo');
    const gone = withLinkedSoundsResolved(timeline, [linkedSound('sa', inGroup)], false);
    expect(scopeSounds(gone, null).map((clip) => clip.id)).toEqual(['own']);
  });
});
