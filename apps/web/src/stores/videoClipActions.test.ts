/**
 * Moving a video layer's clip on its timeline, its linked sound with it, in
 * one undoable step; and the video library staying through undo and redo.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { SceneGraph } from '@quar/core';
import { createTimeline, scopeSounds } from '@quar/animation';
import type { VideoNode } from '@quar/types';
import { useEditorStore } from './editorStore';
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
