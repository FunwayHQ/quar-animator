/**
 * Tests for the picture each video layer shows on the canvas
 */

import { describe, it, expect, vi } from 'vitest';
import { SceneGraph, type VideoFrameImage } from '@quar/core';
import { artboard, videoLayer } from '../../test/videoLayer';
import {
  createCanvasVideoFrames,
  selectionShowsNothing,
  type CanvasVideoMoment,
} from './canvasVideoFrames';

const still: VideoFrameImage = { source: document.createElement('canvas'), key: 'k' };

function setUp(moment: Partial<CanvasVideoMoment> = {}) {
  const sceneGraph = new SceneGraph();
  const frameAt = vi.fn(() => still);
  const now: CanvasVideoMoment = {
    scope: null,
    frame: 0,
    frameRate: 24,
    playing: false,
    ...moment,
  };
  const provider = createCanvasVideoFrames(
    () => sceneGraph,
    () => now,
    frameAt
  );
  return { sceneGraph, frameAt, now, provider };
}

describe('createCanvasVideoFrames', () => {
  it('shows the moment of its clip the playhead is at, in the timeline in view', () => {
    const { sceneGraph, frameAt, now, provider } = setUp({ frame: 36 });
    const node = videoLayer('v', 'film', { start: 12, offset: 1.5 });
    sceneGraph.addNode(node);

    expect(provider(node)).toBe(still);
    // 24 frames past its start at 24 fps: a second into the clip, 1.5 s trimmed off
    expect(frameAt).toHaveBeenCalledWith('film', 2.5, false);

    now.playing = true;
    provider(node);
    expect(frameAt).toHaveBeenLastCalledWith('film', 2.5, true);
  });

  it('shows nothing before its clip starts or after it ends', () => {
    const { sceneGraph, frameAt, now, provider } = setUp({ frame: 5 });
    const node = videoLayer('v', 'film', { start: 12, duration: 1 });
    sceneGraph.addNode(node);

    expect(provider(node)).toBeNull();
    now.frame = 36;
    expect(provider(node)).toBeNull();
    expect(frameAt).not.toHaveBeenCalled();
  });

  it('follows its clip as it’s dragged along the timeline', () => {
    const { sceneGraph, frameAt, provider } = setUp({ frame: 48 });
    sceneGraph.addNode(videoLayer('v', 'film', { start: 0 }));

    provider(sceneGraph.getNode('v') as Parameters<typeof provider>[0]);
    expect(frameAt).toHaveBeenLastCalledWith('film', 2, false);

    // The clip bar moves it a second later
    sceneGraph.updateNode('v', { clip: { start: 24, offset: 0, duration: 4 } });
    provider(sceneGraph.getNode('v') as Parameters<typeof provider>[0]);
    expect(frameAt).toHaveBeenLastCalledWith('film', 1, false);
  });

  it('plays on the artboard it’s in when that artboard’s timeline is in view', () => {
    const { sceneGraph, frameAt, provider } = setUp({ scope: 'board', frame: 24 });
    sceneGraph.addNode(artboard('board'));
    const node = videoLayer('v', 'film', { start: 0 });
    sceneGraph.addNode(node, 'board');

    provider(node);
    expect(frameAt).toHaveBeenCalledWith('film', 1, false);
  });

  it('shows its clip’s first picture, still, while another timeline is in view', () => {
    const { sceneGraph, frameAt, now, provider } = setUp({ frame: 500, playing: true });
    sceneGraph.addNode(artboard('board'));
    const node = videoLayer('v', 'film', { start: 0, offset: 0.75, duration: 2 });
    sceneGraph.addNode(node, 'board');

    // The page's timeline in view: the artboard's layer is outside it
    expect(provider(node)).toBe(still);
    expect(frameAt).toHaveBeenLastCalledWith('film', 0.75, false);

    // And a page layer while an artboard's timeline is
    now.scope = 'board';
    const pageLayer = videoLayer('page', 'other', { start: 0, offset: 0.25, duration: 2 });
    sceneGraph.addNode(pageLayer);
    provider(pageLayer);
    expect(frameAt).toHaveBeenLastCalledWith('other', 0.25, false);
  });

  it('shows its first picture for a layer not on the page', () => {
    const { frameAt, provider } = setUp({ frame: 30 });
    provider(videoLayer('elsewhere', 'film', { start: 0, offset: 2, duration: 3 }));
    expect(frameAt).toHaveBeenCalledWith('film', 2, false);
  });

  it('shows nothing for a layer with no video, or a clip mended to nothing (a damaged file)', () => {
    const { sceneGraph, frameAt, now, provider } = setUp({ frame: 40 });
    sceneGraph.addNode(artboard('board'));
    const noVideo = videoLayer('no-video', '', { start: 0 });
    const emptyClip = videoLayer('empty', 'film', { start: 0, duration: 0 });
    const brokenClip = videoLayer('broken', 'film', { start: 0, duration: Number.NaN });
    sceneGraph.addNode(noVideo);
    sceneGraph.addNode(emptyClip, 'board');
    sceneGraph.addNode(brokenClip);

    for (const scope of [null, 'board']) {
      now.scope = scope;
      for (const node of [noVideo, emptyClip, brokenClip]) expect(provider(node)).toBeNull();
    }
    expect(frameAt).not.toHaveBeenCalled();
  });

  it('shows nothing while the video’s file isn’t there (the frame source has no picture)', () => {
    const { sceneGraph, frameAt, provider } = setUp({ frame: 40 });
    frameAt.mockReturnValue(null as unknown as VideoFrameImage);
    const node = videoLayer('v', 'missing-file', { start: 0 });
    sceneGraph.addNode(node);
    expect(provider(node)).toBeNull();
  });

  it('shows nothing without a scene', () => {
    const frameAt = vi.fn(() => still);
    const provider = createCanvasVideoFrames(
      () => null,
      () => ({ scope: null, frame: 0, frameRate: 24, playing: false }),
      frameAt
    );
    expect(provider(videoLayer('v', 'film'))).toBeNull();
    expect(frameAt).not.toHaveBeenCalled();
  });
});

describe('selectionShowsNothing', () => {
  const at = (frame: number, scope: string | null = null) => ({ scope, frame, frameRate: 24 });

  function scene() {
    const sceneGraph = new SceneGraph();
    // 1 s from frame 12 (to 36); another held after it ends
    sceneGraph.addNode(videoLayer('v', 'film', { start: 12, duration: 1 }));
    sceneGraph.addNode(videoLayer('held', 'film', { start: 12, duration: 1, holdLastFrame: true }));
    sceneGraph.addNode(artboard('board'));
    sceneGraph.addNode(videoLayer('inside', 'film', { start: 12, duration: 1 }), 'board');
    return sceneGraph;
  }

  it('is true of video layers outside their clips, in the timeline in view', () => {
    const sceneGraph = scene();
    expect(selectionShowsNothing(sceneGraph, ['v'], at(5))).toBe(true);
    expect(selectionShowsNothing(sceneGraph, ['v'], at(36))).toBe(true);
    expect(selectionShowsNothing(sceneGraph, ['v'], at(20))).toBe(false);
    // Holding its last frame, it shows that after its clip (not before it)
    expect(selectionShowsNothing(sceneGraph, ['held'], at(50))).toBe(false);
    expect(selectionShowsNothing(sceneGraph, ['held'], at(5))).toBe(true);
  });

  it('is false of a layer in another timeline (it shows its first frame there)', () => {
    const sceneGraph = scene();
    expect(selectionShowsNothing(sceneGraph, ['inside'], at(5))).toBe(false);
    expect(selectionShowsNothing(sceneGraph, ['inside'], at(5, 'board'))).toBe(true);
    expect(selectionShowsNothing(sceneGraph, ['v'], at(20, 'board'))).toBe(false);
  });

  it('is false unless every layer selected shows nothing', () => {
    const sceneGraph = scene();
    sceneGraph.addNode({ ...artboard('box'), type: 'artboard' });
    expect(selectionShowsNothing(sceneGraph, ['v', 'held'], at(5))).toBe(true);
    expect(selectionShowsNothing(sceneGraph, ['v', 'box'], at(5))).toBe(false);
    expect(selectionShowsNothing(sceneGraph, [], at(5))).toBe(false);
    expect(selectionShowsNothing(sceneGraph, ['gone'], at(5))).toBe(false);
  });
});
