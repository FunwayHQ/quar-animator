/**
 * Deleting video layers: their sounds on the Sound lane kept, unlinked, or
 * deleted with them, as the person answers once; one undo step either way.
 * Cutting takes the sounds along (they paste back with the layers).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneGraph, createGroupNode } from '@quar/core';
import { createTimeline, scopeSounds } from '@quar/animation';
import type { SoundClip } from '@quar/types';
import { useEditorStore } from './editorStore';
import { artboard, linkedSound, testVideo, videoLayer } from '../test/videoLayer';

const question = vi.hoisted(() => ({ deleteVideoSoundsToo: vi.fn(async () => true) }));
vi.mock('../services/videoSoundQuestion', () => question);

const store = () => useEditorStore.getState();
const own: SoundClip = { id: 'own', soundId: 'music', start: 0, offset: 0, duration: 2, gain: 1 };

/** Two video layers in a group, one alone, each with its sound on the page's timeline. */
function scene() {
  const sg = new SceneGraph();
  sg.addNode(createGroupNode('g', 'Group'));
  const a = videoLayer('a', 'beach');
  const b = videoLayer('b', 'beach', { start: 100 });
  const c = videoLayer('c', 'beach', { start: 200 });
  sg.addNode(a, 'g');
  sg.addNode(b, 'g');
  sg.addNode(c);
  useEditorStore.setState({
    videos: [testVideo('beach')],
    timeline: createTimeline({
      duration: 300,
      frameRate: 30,
      sounds: [linkedSound('sa', a), linkedSound('sb', b), linkedSound('sc', c), own],
    }),
  });
  return sg;
}

const pageSounds = () => scopeSounds(store().timeline, null);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('deleting video layers', () => {
  beforeEach(() => {
    store().resetProject();
    question.deleteVideoSoundsToo.mockReset();
    question.deleteVideoSoundsToo.mockResolvedValue(true);
  });

  it('asks about its sound, and deletes it with the video when told to, in one step', async () => {
    const sg = scene();
    question.deleteVideoSoundsToo.mockResolvedValue(true);
    store().setSelection(['c']);
    store().deleteSelection(sg);
    // Nothing goes until it's answered
    expect(sg.getNode('c')).toBeDefined();
    await settle();
    expect(question.deleteVideoSoundsToo).toHaveBeenCalledWith(1);
    expect(sg.getNode('c')).toBeUndefined();
    expect(pageSounds().map((clip) => clip.id)).toEqual(['sa', 'sb', 'own']);
    expect(store().undoStack).toHaveLength(1);

    store().undo(sg);
    expect(sg.getNode('c')).toBeDefined();
    expect(pageSounds().find((clip) => clip.id === 'sc')?.linkedTo).toBe('c');
  });

  it('keeps the sound, unlinked, when told to keep it', async () => {
    const sg = scene();
    question.deleteVideoSoundsToo.mockResolvedValue(false);
    store().setSelection(['c']);
    store().deleteSelection(sg);
    await settle();
    expect(sg.getNode('c')).toBeUndefined();
    const kept = pageSounds().find((clip) => clip.id === 'sc');
    expect(kept).toMatchObject({ start: 200, soundId: 'track' });
    expect(kept).not.toHaveProperty('linkedTo');
    expect(store().undoStack).toHaveLength(1);
    store().undo(sg);
    expect(pageSounds().find((clip) => clip.id === 'sc')?.linkedTo).toBe('c');
  });

  it('asks once for a group of videos', async () => {
    const sg = scene();
    store().setSelection(['g']);
    store().deleteSelection(sg);
    await settle();
    expect(question.deleteVideoSoundsToo).toHaveBeenCalledOnce();
    expect(question.deleteVideoSoundsToo).toHaveBeenCalledWith(2);
    expect(pageSounds().map((clip) => clip.id)).toEqual(['sc', 'own']);
  });

  it('asks nothing for layers without sounds, deleting them at once', () => {
    const sg = scene();
    sg.addNode(videoLayer('quiet', 'beach'));
    store().setSelection(['quiet']);
    store().deleteSelection(sg);
    expect(question.deleteVideoSoundsToo).not.toHaveBeenCalled();
    expect(sg.getNode('quiet')).toBeUndefined();
    expect(pageSounds()).toHaveLength(4);
  });

  it('asks nothing for an artboard: its own timeline’s sounds go with it', () => {
    const sg = scene();
    sg.addNode(artboard('slide'));
    const onSlide = videoLayer('d', 'beach');
    sg.addNode(onSlide, 'slide');
    useEditorStore.setState({
      timeline: {
        ...store().timeline,
        artboards: { slide: { duration: 90, sounds: [linkedSound('sd', onSlide)] } },
      },
    });
    store().setSelection(['slide']);
    store().deleteSelection(sg);
    expect(question.deleteVideoSoundsToo).not.toHaveBeenCalled();
    expect(sg.getNode('slide')).toBeUndefined();
    expect(pageSounds()).toHaveLength(4);
  });

  it('cuts a video layer with its sound, to paste them back together', () => {
    const sg = scene();
    store().setSelection(['c']);
    store().cutSelection(sg);
    expect(question.deleteVideoSoundsToo).not.toHaveBeenCalled();
    expect(sg.getNode('c')).toBeUndefined();
    expect(pageSounds().map((clip) => clip.id)).toEqual(['sa', 'sb', 'own']);
    store().undo(sg);
    expect(pageSounds().map((clip) => clip.id)).toEqual(['sa', 'sb', 'sc', 'own']);
  });
});
