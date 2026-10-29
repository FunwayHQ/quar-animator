/**
 * Moving a video layer's clip on its timeline, its linked sound with it, in
 * one undoable step; and the video library staying through undo and redo.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { SceneGraph } from '@quar/core';
import {
  createTimeline,
  scopeDuration,
  scopeSounds,
  trimmedVideoEnd,
  trimmedVideoStart,
  withClipSpeed,
  withHold,
  withLoop,
} from '@quar/animation';
import { heldVideoTime, videoTimeAt } from '@quar/animation';
import type { VideoNode } from '@quar/types';
import { useEditorStore } from './editorStore';
import { withClipLoop } from './videoClipActions';
import { artboard, linkedSound, testVideo, videoLayer } from '../test/videoLayer';

const store = () => useEditorStore.getState();
const layer = (sg: SceneGraph, id = 'v') => sg.getNode(id) as VideoNode;

function scene() {
  const sg = new SceneGraph();
  const video = videoLayer('v', 'beach');
  sg.addNode(video);
  useEditorStore.setState({
    videos: [testVideo('beach')],
    timeline: createTimeline({ duration: 300, frameRate: 30, sounds: [linkedSound('s', video)] }),
  });
  return sg;
}

describe('moving a video clip', () => {
  beforeEach(() => store().resetProject());

  it('moves the clip a whole frame at a time, its linked sound with it, in one step', () => {
    const sg = scene();
    store().moveVideoClip(sg, 'v', 44.6);
    expect(layer(sg).clip).toEqual({ start: 45, offset: 0, duration: 4 });
    expect(scopeSounds(store().timeline, null)[0]).toMatchObject({ id: 's', start: 45 });
    expect(store().undoStack).toHaveLength(1);
    expect(store().isDirty).toBe(true);

    store().undo(sg);
    expect(layer(sg).clip.start).toBe(30);
    expect(scopeSounds(store().timeline, null)[0]?.start).toBe(30);
    store().redo(sg);
    expect(layer(sg).clip.start).toBe(45);
    expect(scopeSounds(store().timeline, null)[0]?.start).toBe(45);
  });

  it('records no step when it stays put, and none while a drag goes on', () => {
    const sg = scene();
    store().moveVideoClip(sg, 'v', 30);
    expect(store().undoStack).toHaveLength(0);
    store().moveVideoClip(sg, 'v', 40);
    store().moveVideoClip(sg, 'v', 50, false);
    expect(store().undoStack).toHaveLength(1);
    expect(layer(sg).clip.start).toBe(50);
    store().undo(sg);
    expect(layer(sg).clip.start).toBe(30);
  });

  it('moves the sound on the timeline it’s on (an artboard’s)', () => {
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
    store().moveVideoClip(sg, 'v', 0);
    expect(scopeSounds(store().timeline, 'slide')[0]?.start).toBe(0);
    expect(scopeSounds(store().timeline, null)).toEqual([]);
  });

  it('moves a clip without a sound, and leaves other layers alone', () => {
    const sg = scene();
    sg.addNode(videoLayer('quiet', 'beach'));
    store().moveVideoClip(sg, 'quiet', 90);
    expect(layer(sg, 'quiet').clip.start).toBe(90);
    expect(layer(sg).clip.start).toBe(30);
    expect(scopeSounds(store().timeline, null)[0]?.start).toBe(30);
    store().moveVideoClip(sg, 'nothing', 10);
    expect(store().undoStack).toHaveLength(1);
  });

  it('a linked sound moved on the Sound lane takes the video with it', () => {
    const sg = scene();
    store().updateSoundClip(sg, 's', (clip) => ({ ...clip, start: 60 }));
    expect(layer(sg).clip.start).toBe(60);
    // Its volume is its own
    store().updateSoundClip(sg, 's', (clip) => ({ ...clip, gain: 0.5 }));
    expect(layer(sg).clip.start).toBe(60);
    store().undo(sg);
    store().undo(sg);
    expect(layer(sg).clip.start).toBe(30);
  });

  it('unlinked, a sound moves on its own', () => {
    const sg = scene();
    store().unlinkSoundClip(sg, 's');
    expect(scopeSounds(store().timeline, null)[0]).not.toHaveProperty('linkedTo');
    store().updateSoundClip(sg, 's', (clip) => ({ ...clip, start: 60 }));
    expect(layer(sg).clip.start).toBe(30);
    store().undo(sg);
    store().undo(sg);
    expect(scopeSounds(store().timeline, null)[0]?.linkedTo).toBe('v');
  });
});

describe('changing a video clip', () => {
  beforeEach(() => store().resetProject());

  const sound = () => scopeSounds(store().timeline, null)[0];

  it('trims the clip, its linked sound with it, in one step', () => {
    const sg = scene();
    store().updateVideoClip(sg, 'v', (clip) => trimmedVideoStart(clip, 60, 30));
    expect(layer(sg).clip).toEqual({ start: 60, offset: 1, duration: 3 });
    expect(sound()).toMatchObject({ id: 's', start: 60, offset: 1, duration: 3, gain: 1 });
    expect(store().undoStack).toHaveLength(1);
    expect(store().isDirty).toBe(true);
    store().undo(sg);
    expect(layer(sg).clip).toEqual({ start: 30, offset: 0, duration: 4 });
    expect(sound()).toMatchObject({ start: 30, offset: 0, duration: 4 });
  });

  it('gives its sound its speed and loop, and lengthens the timeline to play it to its end', () => {
    const sg = scene();
    // A quarter as fast: 16 s from frame 30, to frame 510
    store().updateVideoClip(sg, 'v', (clip) => withClipSpeed(clip, 0.25));
    expect(sound()).toMatchObject({ start: 30, duration: 4, speed: 0.25 });
    expect(store().timelineDuration).toBe(510);
    store().updateVideoClip(sg, 'v', (clip) => withClipSpeed(withLoop(clip, true), 1));
    store().updateVideoClip(sg, 'v', (clip) => trimmedVideoEnd(clip, 630, 30, 4));
    expect(layer(sg).clip).toEqual({ start: 30, offset: 0, duration: 4, loop: true, loopFor: 20 });
    expect(sound()).toMatchObject({ loop: true, loopFor: 20 });
    expect(sound()).not.toHaveProperty('speed');
    expect(store().timelineDuration).toBe(630);
    expect(store().undoStack).toHaveLength(3);
    store().undo(sg);
    expect(store().timelineDuration).toBe(510);
    store().undo(sg);
    store().undo(sg);
    expect(store().timelineDuration).toBe(300);
    expect(sound()).not.toHaveProperty('speed');
  });

  it('holds its last frame without lengthening the timeline, or touching its sound', () => {
    const sg = scene();
    const before = store().timeline;
    store().updateVideoClip(sg, 'v', (clip) => withHold(clip, true));
    expect(layer(sg).clip.holdLastFrame).toBe(true);
    expect(store().timeline).toBe(before);
    expect(store().timelineDuration).toBe(300);
    expect(store().undoStack).toHaveLength(1);
  });

  it('records no step when nothing changes, and none while a drag goes on', () => {
    const sg = scene();
    store().updateVideoClip(sg, 'v', (clip) => clip);
    store().updateVideoClip(sg, 'nothing', (clip) => withHold(clip, true));
    expect(store().undoStack).toHaveLength(0);
    store().updateVideoClip(sg, 'v', (clip) => trimmedVideoEnd(clip, 120, 30, 4));
    store().updateVideoClip(sg, 'v', (clip) => trimmedVideoEnd(clip, 100, 30, 4), false);
    expect(store().undoStack).toHaveLength(1);
    store().undo(sg);
    expect(layer(sg).clip.duration).toBe(4);
  });

  it('lengthens the timeline as a drag ends, not while it goes on', () => {
    const sg = scene();
    // Looped, then lengthened past the timeline's end, as a drag of its end does
    store().updateVideoClip(sg, 'v', (clip) => withLoop(clip, true), true, false);
    store().updateVideoClip(sg, 'v', (clip) => trimmedVideoEnd(clip, 400, 30, 4), false, false);
    expect(store().timelineDuration).toBe(300);
    store().fitTimelineToVideoClip(sg, 'v');
    expect(store().timelineDuration).toBe(400);
    // One step for it all
    expect(store().undoStack).toHaveLength(1);
    store().undo(sg);
    expect(store().timelineDuration).toBe(300);
    expect(layer(sg).clip).toEqual({ start: 30, offset: 0, duration: 4 });
  });

  it('lengthens the timeline its layer plays on, not the one in view', () => {
    const sg = new SceneGraph();
    sg.addNode(artboard('slide'));
    sg.addNode(videoLayer('v', 'beach'), 'slide');
    useEditorStore.setState({
      timeline: createTimeline({
        duration: 300,
        frameRate: 30,
        artboards: { slide: { duration: 200 } },
      }),
    });
    store().updateVideoClip(sg, 'v', (clip) => withClipSpeed(clip, 0.5));
    // 8 s from frame 30: 270 frames
    expect(scopeDuration(store().timeline, 'slide')).toBe(270);
    expect(store().timelineDuration).toBe(300);
    expect(scopeDuration(store().timeline, null)).toBe(300);
  });

  it('still moves a clip, as it did', () => {
    const sg = scene();
    store().moveVideoClip(sg, 'v', 250);
    // Moving doesn’t lengthen the timeline: a drag does as it ends
    expect(store().timelineDuration).toBe(300);
    expect(sound()?.start).toBe(250);
  });
});

describe('a GIF’s loop', () => {
  const gif = testVideo('wave', { mimeType: 'image/gif', duration: 1 });

  it('turned off holds its last frame, as a browser leaves a stopped GIF', () => {
    const looped = { start: 0, offset: 0, duration: 1, loop: true, loopFor: 5 };
    expect(withClipLoop(looped, false, gif)).toEqual({
      start: 0,
      offset: 0,
      duration: 1,
      holdLastFrame: true,
    });
    // On again: it loops, still held when it ends
    expect(withClipLoop({ start: 0, offset: 0, duration: 1 }, true, gif)).toMatchObject({
      loop: true,
    });
  });

  it('turned off on a video only stops it looping', () => {
    const looped = { start: 0, offset: 0, duration: 4, loop: true, loopFor: 9 };
    expect(withClipLoop(looped, false, testVideo('beach'))).toEqual({
      start: 0,
      offset: 0,
      duration: 4,
    });
  });
});

describe('stopping a video clip at a frame', () => {
  beforeEach(() => store().resetProject());

  it('ends a looped clip on that frame, holding the picture showing there, in one step', () => {
    const sg = new SceneGraph();
    // A 1 s GIF from frame 30, looping for 8 s
    sg.addNode(videoLayer('g', 'wave', { duration: 1, loop: true, loopFor: 8 }));
    useEditorStore.setState({
      videos: [testVideo('wave', { mimeType: 'image/gif', duration: 1 })],
    });
    const showing = videoTimeAt(layer(sg, 'g').clip, 107, 30);
    store().stopVideoClip(sg, 'g', 107);
    const clip = layer(sg, 'g').clip;
    // Frames 30 to 107: 78 frames, part way through its third pass
    expect(clip).toEqual({
      start: 30,
      offset: 0,
      duration: 1,
      loop: true,
      loopFor: 78 / 30,
      holdLastFrame: true,
    });
    expect(videoTimeAt(clip, 107, 30)).toBe(showing);
    expect(heldVideoTime(clip, 30)).toBe(showing);
    expect(videoTimeAt(clip, 250, 30)).toBe(showing);
    expect(store().undoStack).toHaveLength(1);
    store().undo(sg);
    expect(layer(sg, 'g').clip).toEqual({
      start: 30,
      offset: 0,
      duration: 1,
      loop: true,
      loopFor: 8,
    });
  });

  it('ends a video’s clip there too, its sound with it', () => {
    const sg = scene();
    store().stopVideoClip(sg, 'v', 89);
    // 4 s from frame 30, stopped after frame 89: 2 s of it
    expect(layer(sg).clip).toEqual({ start: 30, offset: 0, duration: 2, holdLastFrame: true });
    expect(scopeSounds(store().timeline, null)[0]).toMatchObject({ duration: 2 });
    expect(scopeSounds(store().timeline, null)[0]).not.toHaveProperty('holdLastFrame');
  });

  it('does nothing at a frame outside the clip', () => {
    const sg = scene();
    store().stopVideoClip(sg, 'v', 29);
    store().stopVideoClip(sg, 'v', 150);
    expect(layer(sg).clip).toEqual({ start: 30, offset: 0, duration: 4 });
    expect(store().undoStack).toHaveLength(0);
  });
});

describe('the video library through undo', () => {
  beforeEach(() => store().resetProject());

  it('still has the video when the layer showing it is undone and redone', () => {
    const sg = new SceneGraph();
    store().addVideo(testVideo('beach'));
    store().pushUndo(sg);
    sg.addNode(videoLayer('v', 'beach'));
    store().undo(sg);
    expect(sg.getNode('v')).toBeUndefined();
    expect(store().videos.map((video) => video.id)).toEqual(['beach']);
    store().redo(sg);
    expect(layer(sg).videoId).toBe('beach');
    expect(store().videos.map((video) => video.id)).toEqual(['beach']);
  });
});
