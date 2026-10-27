/**
 * Sound clips on the timeline in view: placing, changing and taking them off, undoably.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { SceneGraph } from '@quar/core';
import { movedClip, scopeSounds } from '@quar/animation';
import type { Sound } from '@quar/types';
import { useEditorStore } from './editorStore';

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
