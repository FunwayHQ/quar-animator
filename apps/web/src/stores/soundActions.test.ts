/**
 * Sound clips on the timeline in view: placing, changing and taking them off, undoably.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { SceneGraph } from '@quar/core';
import {
  createTimeline,
  movedClip,
  scopeDuration,
  scopeSounds,
  trimmedEnd,
  trimmedStart,
  withClipSpeed,
  withLoop,
} from '@quar/animation';
import type { Sound, VideoNode } from '@quar/types';
import { useEditorStore } from './editorStore';
import { artboard, linkedSound, testVideo, videoLayer } from '../test/videoLayer';

const store = () => useEditorStore.getState();
const voice: Sound = {
  id: 'voice',
  name: 'Voice',
  src: 'data:audio/wav;base64,AAAA',
  duration: 2,
};

describe('sound clips', () => {
  beforeEach(() => store().resetProject());

  it('puts a sound on the timeline in view at a frame, in the library once, selected', () => {
    const sg = new SceneGraph();
    const id = store().addSoundClip(sg, voice, 15.4);
    expect(scopeSounds(store().timeline, null)).toEqual([
      { id, soundId: 'voice', start: 15, offset: 0, duration: 2, gain: 1 },
    ]);
    store().addSoundClip(sg, voice, 90);
    expect(store().sounds).toEqual([voice]);
    expect(store().selectedSoundClipId).not.toBe(id);
    expect(store().isDirty).toBe(true);
  });

  it('puts it on the artboard’s timeline when that is in view', () => {
    const sg = new SceneGraph();
    store().setTimelineScope('slide');
    store().addSoundClip(sg, voice, 0);
    expect(scopeSounds(store().timeline, 'slide')).toHaveLength(1);
    expect(scopeSounds(store().timeline, null)).toHaveLength(0);
  });

  it('lengthens the timeline to play the sound to its end', () => {
    const sg = new SceneGraph();
    store().setTimelineDuration(60);
    // 30 fps: two seconds from frame 45 end at frame 105
    store().addSoundClip(sg, voice, 45);
    expect(store().timelineDuration).toBe(105);
    expect(store().timeline.duration).toBe(105);
    // One step takes it all back
    store().undo(sg);
    expect(store().timelineDuration).toBe(60);
    expect(scopeSounds(store().timeline, null)).toHaveLength(0);
  });

  it('changes a clip in one undoable step, or (dragging) without one', () => {
    const sg = new SceneGraph();
    const id = store().addSoundClip(sg, voice, 0);
    const steps = store().undoStack.length;
    store().updateSoundClip(sg, id, (clip) => ({ ...clip, gain: 0.5, muted: true }));
    expect(store().undoStack.length).toBe(steps + 1);
    store().updateSoundClip(sg, id, (clip) => movedClip(clip, 30), false);
    expect(store().undoStack.length).toBe(steps + 1);
    expect(scopeSounds(store().timeline, null)[0]).toMatchObject({
      start: 30,
      gain: 0.5,
      muted: true,
    });
    // No change, no step
    store().updateSoundClip(sg, id, (clip) => clip);
    expect(store().undoStack.length).toBe(steps + 1);
    store().undo(sg);
    expect(scopeSounds(store().timeline, null)[0]).toMatchObject({ start: 0, gain: 1 });
  });

  it('takes a clip off, its sound staying in the library, and brings it back on undo', () => {
    const sg = new SceneGraph();
    const id = store().addSoundClip(sg, voice, 0);
    store().removeSoundClip(sg, id);
    expect(scopeSounds(store().timeline, null)).toEqual([]);
    expect(store().selectedSoundClipId).toBeNull();
    expect(store().sounds).toEqual([voice]);
    store().undo(sg);
    expect(scopeSounds(store().timeline, null).map((clip) => clip.id)).toEqual([id]);
  });

  it('selects a clip or keyframes, not both', () => {
    const sg = new SceneGraph();
    const id = store().addSoundClip(sg, voice, 0);
    store().selectKeyframe('kf');
    expect(store().selectedSoundClipId).toBeNull();
    store().selectSoundClip(id);
    expect(store().selectedKeyframeIds.size).toBe(0);
  });

  it('starts a new project with no sounds', () => {
    store().addSoundClip(new SceneGraph(), voice, 0);
    store().resetProject();
    expect(store().sounds).toEqual([]);
    expect(store().selectedSoundClipId).toBeNull();
  });
});

describe('a clip’s length on its timeline', () => {
  beforeEach(() => store().resetProject());

  it('lengthens the timeline to play a clip slowed down or looped to its end', () => {
    const sg = new SceneGraph();
    store().setTimelineDuration(60);
    const id = store().addSoundClip(sg, voice, 0);
    // Half as fast: 4 s, to frame 120
    store().updateSoundClip(sg, id, (clip) => withClipSpeed(clip, 0.5));
    expect(store().timelineDuration).toBe(120);
    // Not while it's dragged (the frame under the pointer would move): as the drag ends
    store().updateSoundClip(
      sg,
      id,
      (clip) => trimmedEnd(withLoop(clip, true), 200, 30, 2),
      true,
      false
    );
    expect(store().timelineDuration).toBe(120);
    store().fitTimelineToSoundClip(id);
    expect(store().timelineDuration).toBe(200);
    // Undone in the step that lengthened it
    store().undo(sg);
    expect(store().timelineDuration).toBe(120);
  });

  it('lengthens the timeline the clip is on, an artboard’s not in view', () => {
    const timeline = createTimeline({
      duration: 300,
      frameRate: 30,
      artboards: {
        slide: {
          duration: 60,
          sounds: [{ id: 's', soundId: 'voice', start: 0, offset: 0, duration: 2, gain: 1 }],
        },
      },
    });
    useEditorStore.setState({ timeline, sounds: [voice] });
    store().updateSoundClip(new SceneGraph(), 's', (clip) => withClipSpeed(clip, 0.5));
    expect(scopeDuration(store().timeline, 'slide')).toBe(120);
    expect(store().timelineDuration).toBe(300);
  });
});

describe('a video’s sound changed on the Sound lane', () => {
  beforeEach(() => store().resetProject());

  const layer = (sg: SceneGraph) => sg.getNode('v') as VideoNode;
  function scene(clip = {}) {
    const sg = new SceneGraph();
    const video = videoLayer('v', 'beach', clip);
    sg.addNode(video);
    useEditorStore.setState({
      videos: [testVideo('beach')],
      sounds: [{ ...voice, id: 'track', duration: 4 }],
      timeline: createTimeline({ duration: 300, frameRate: 30, sounds: [linkedSound('s', video)] }),
    });
    return sg;
  }

  it('trims its video the same way, in the same step', () => {
    const sg = scene({ speed: 2 });
    store().updateSoundClip(sg, 's', (clip) => trimmedStart(clip, 45, 30));
    expect(layer(sg).clip).toEqual({ start: 45, offset: 1, duration: 3, speed: 2 });
    store().updateSoundClip(sg, 's', (clip) => trimmedEnd(clip, 75, 30, 4));
    expect(layer(sg).clip).toEqual({ start: 45, offset: 1, duration: 2, speed: 2 });
    store().undo(sg);
    expect(layer(sg).clip).toEqual({ start: 45, offset: 1, duration: 3, speed: 2 });
    store().undo(sg);
    expect(layer(sg).clip).toEqual({ start: 30, offset: 0, duration: 4, speed: 2 });
    expect(scopeSounds(store().timeline, null)[0]).toMatchObject({ start: 30, duration: 4 });
  });

  it('sets its video’s speed and loop with its own, its hold left as it is', () => {
    const sg = scene({ holdLastFrame: true });
    store().updateSoundClip(sg, 's', (clip) => withClipSpeed(clip, 0.5));
    expect(layer(sg).clip).toEqual({
      start: 30,
      offset: 0,
      duration: 4,
      speed: 0.5,
      holdLastFrame: true,
    });
    store().updateSoundClip(sg, 's', (clip) => trimmedEnd(withLoop(clip, true), 600, 30, 4));
    expect(layer(sg).clip).toMatchObject({ loop: true, loopFor: 19, speed: 0.5 });
    // The timeline the layer plays on lengthened to play them to their end
    expect(store().timelineDuration).toBe(600);
    store().updateSoundClip(sg, 's', (clip) => withClipSpeed(withLoop(clip, false), 1));
    expect(layer(sg).clip).toEqual({ start: 30, offset: 0, duration: 4, holdLastFrame: true });
  });

  it('leaves the video alone for its own volume, fades and mute, or once unlinked', () => {
    const sg = scene();
    store().updateSoundClip(sg, 's', (clip) => ({ ...clip, gain: 0.5, fadeIn: 1, muted: true }));
    expect(layer(sg).clip).toEqual({ start: 30, offset: 0, duration: 4 });
    store().unlinkSoundClip(sg, 's');
    store().updateSoundClip(sg, 's', (clip) => withClipSpeed(clip, 2));
    expect(layer(sg).clip).toEqual({ start: 30, offset: 0, duration: 4 });
  });

  it('follows on an artboard’s timeline too', () => {
    const sg = new SceneGraph();
    sg.addNode(artboard('slide'));
    const video = videoLayer('v', 'beach');
    sg.addNode(video, 'slide');
    useEditorStore.setState({
      timeline: createTimeline({
        duration: 300,
        frameRate: 30,
        artboards: { slide: { duration: 200, sounds: [linkedSound('s', video)] } },
      }),
    });
    store().updateSoundClip(sg, 's', (clip) => trimmedStart(clip, 60, 30));
    expect(layer(sg).clip).toEqual({ start: 60, offset: 1, duration: 3 });
  });
});
