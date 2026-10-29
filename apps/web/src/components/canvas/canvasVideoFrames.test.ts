/**
 * Tests for the picture each video layer shows on the canvas
 */

import { describe, it, expect, vi } from 'vitest';
import { SceneGraph, createDefaultTransform, type VideoFrameImage } from '@quar/core';
import type { ArtboardNode } from '@quar/types';
import { videoLayer } from '../../test/videoLayerFixture';
import { createCanvasVideoFrames, type CanvasVideoMoment } from './canvasVideoFrames';

function artboard(id: string): ArtboardNode {
  return {
    id,
    name: id,
    type: 'artboard',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 400,
    height: 300,
    fills: [],
    clipContent: true,
  };
}

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
    const node = videoLayer('v', { clip: { start: 12, offset: 1.5, duration: 4 } });
    sceneGraph.addNode(node);

    expect(provider(node)).toBe(still);
    // 24 frames past its start at 24 fps: a second into the clip, 1.5 s trimmed off
    expect(frameAt).toHaveBeenCalledWith(node.videoId, 2.5, false);

    now.playing = true;
    provider(node);
    expect(frameAt).toHaveBeenLastCalledWith(node.videoId, 2.5, true);
  });

  it('shows nothing before its clip starts or after it ends', () => {
    const { sceneGraph, frameAt, now, provider } = setUp({ frame: 5 });
    const node = videoLayer('v', { clip: { start: 12, offset: 0, duration: 1 } });
    sceneGraph.addNode(node);

    expect(provider(node)).toBeNull();
    now.frame = 36;
    expect(provider(node)).toBeNull();
    expect(frameAt).not.toHaveBeenCalled();
  });

  it('plays on the artboard it’s in when that artboard’s timeline is in view', () => {
    const { sceneGraph, frameAt, provider } = setUp({ scope: 'board', frame: 24 });
    sceneGraph.addNode(artboard('board'));
    const node = videoLayer('v');
    sceneGraph.addNode(node, 'board');

    provider(node);
    expect(frameAt).toHaveBeenCalledWith(node.videoId, 1, false);
  });

  it('shows its clip’s first picture, still, while another timeline is in view', () => {
    const { sceneGraph, frameAt, now, provider } = setUp({ frame: 500, playing: true });
    sceneGraph.addNode(artboard('board'));
    const node = videoLayer('v', { clip: { start: 0, offset: 0.75, duration: 2 } });
    sceneGraph.addNode(node, 'board');

    // The page's timeline in view: the artboard's layer is outside it
    expect(provider(node)).toBe(still);
    expect(frameAt).toHaveBeenLastCalledWith(node.videoId, 0.75, false);

    // And a page layer while an artboard's timeline is
    now.scope = 'board';
    const pageLayer = videoLayer('page', { clip: { start: 0, offset: 0.25, duration: 2 } });
    sceneGraph.addNode(pageLayer);
    provider(pageLayer);
    expect(frameAt).toHaveBeenLastCalledWith(pageLayer.videoId, 0.25, false);
  });

  it('shows its first picture for a video a symbol instance draws', () => {
    const { frameAt, provider } = setUp({ frame: 30 });
    // Not on the page: one of a symbol's layers
    const node = videoLayer('in-symbol', { clip: { start: 0, offset: 2, duration: 3 } });
    provider(node);
    expect(frameAt).toHaveBeenCalledWith(node.videoId, 2, false);
  });

  it('shows nothing without a scene', () => {
    const frameAt = vi.fn(() => still);
    const provider = createCanvasVideoFrames(
      () => null,
      () => ({ scope: null, frame: 0, frameRate: 24, playing: false }),
      frameAt
    );
    expect(provider(videoLayer('v'))).toBeNull();
    expect(frameAt).not.toHaveBeenCalled();
  });
});
