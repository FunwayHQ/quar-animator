import { describe, expect, it, vi } from 'vitest';
import { SceneGraph, createDefaultTransform } from '@quar/core';
import type { ArtboardNode, VideoClip, VideoNode } from '@quar/types';

import { firstPictures, presentationVideoFrames } from './presentationVideo';

function video(id: string, clip: Partial<VideoClip> = {}, videoId = 'v1'): VideoNode {
  return {
    id,
    name: id,
    type: 'video',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    videoId,
    width: 160,
    height: 90,
    naturalWidth: 1280,
    naturalHeight: 720,
    cornerRadius: [0, 0, 0, 0],
    clip: { start: 0, offset: 0, duration: 4, ...clip },
  };
}

function board(id: string): ArtboardNode {
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

describe('firstPictures', () => {
  it('is the picture each slide’s video layers show first: at its start, or where a clip starts', () => {
    const sg = new SceneGraph();
    sg.addNode(board('one'));
    sg.addNode(board('two'));
    sg.addNode(video('under-way', { start: 0, offset: 2 }), 'one');
    sg.addNode(video('later', { start: 15, offset: 1 }, 'v2'), 'one');
    sg.addNode(video('after-it', { start: 30 }, 'v3'), 'one');
    sg.addNode({ ...video('hidden', {}, 'v4'), visible: false }, 'one');
    // The same picture on another slide: decoded once
    sg.addNode(video('again', { start: 0, offset: 2 }), 'two');
    const slides = [
      { node: sg.getNode('one')!, frameCount: 30 },
      { node: sg.getNode('two')!, frameCount: 30 },
    ];
    expect(firstPictures(sg, slides, 30)).toEqual([
      { videoId: 'v1', seconds: 2 },
      { videoId: 'v2', seconds: 1 },
    ]);
  });
});

describe('presentationVideoFrames', () => {
  const picture = { source: {} as TexImageSource, key: 'k' };

  it('gives each layer the picture its clip is at in the frame drawn, decoding on while it plays', () => {
    const pick = vi.fn(() => ({ image: picture, exact: true }));
    const drawing = { playing: true, pending: false };
    const frames = presentationVideoFrames({ pick }, 30, drawing);
    expect(frames(video('a', { start: 10, offset: 1 }), 25)).toBe(picture);
    expect(pick).toHaveBeenLastCalledWith('v1', 1.5, true);
    drawing.playing = false;
    frames(video('a', { start: 10, offset: 1, speed: 2 }), 25);
    expect(pick).toHaveBeenLastCalledWith('v1', 2, false);
    expect(drawing.pending).toBe(false);
  });

  it('shows nothing outside the clip', () => {
    const pick = vi.fn(() => ({ image: picture, exact: true }));
    const frames = presentationVideoFrames({ pick }, 30, { playing: false, pending: false });
    expect(frames(video('a', { start: 10 }), 5)).toBeNull();
    expect(frames(video('a', { duration: 1 }), 40)).toBeNull();
    expect(pick).not.toHaveBeenCalled();
  });

  it('says when a picture shown isn’t the moment’s own yet, so it’s drawn again', () => {
    const drawing = { playing: false, pending: false };
    const frames = presentationVideoFrames(
      { pick: () => ({ image: picture, exact: false }) },
      30,
      drawing
    );
    expect(frames(video('a'), 0)).toBe(picture);
    expect(drawing.pending).toBe(true);
  });
});
