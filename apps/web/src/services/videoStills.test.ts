import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneGraph, createDefaultTransform } from '@quar/core';
import type { ArtboardNode, Video, VideoNode } from '@quar/types';

import { useEditorStore } from '../stores/editorStore';
import { keepVideoFiles, setVideoFile } from './videoFiles';

const decoded = vi.hoisted(() => ({
  calls: [] as Array<{ source: unknown; moments: number[]; options: unknown }>,
}));

vi.mock('@quar/export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@quar/export')>();
  return {
    ...actual,
    // Each moment's still named for its video and moment
    videoStillsAt: vi.fn(
      async (source: { strip?: { frames: string[] } }, moments: number[], options: unknown) => {
        decoded.calls.push({ source, moments, options });
        return moments.map((seconds) => `${source.strip?.frames[0] ?? '?'}@${seconds}`);
      }
    ),
  };
});

import { canvasVideoMoments, loadVideoStills } from './videoStills';

const video = (id: string, more: Partial<Video> = {}): Video => ({
  id,
  name: 'Clip',
  mimeType: 'video/mp4',
  byteLength: 1000,
  width: 1280,
  height: 720,
  duration: 2,
  frameRate: 30,
  hasAlpha: false,
  strip: { rate: 4, height: 90, frames: [id] },
  ...more,
});

describe('loadVideoStills', () => {
  beforeEach(() => {
    useEditorStore.getState().resetProject();
    keepVideoFiles(new Set());
    decoded.calls = [];
  });

  it('has each layer’s still at its moment, decoding each video once for its moments', async () => {
    const file = new Blob(['v1']);
    useEditorStore.getState().addVideo(video('v1', { hasAlpha: true }));
    useEditorStore.getState().addVideo(video('v2'));
    setVideoFile('v1', file);
    const stills = await loadVideoStills([
      { nodeId: 'a', videoId: 'v1', seconds: 0.5 },
      { nodeId: 'b', videoId: 'v1', seconds: 0.5 },
      { nodeId: 'c', videoId: 'v1', seconds: 1 },
      { nodeId: 'd', videoId: 'v2', seconds: 0 },
    ]);
    expect([...stills]).toEqual([
      ['a', 'v1@0.5'],
      ['b', 'v1@0.5'],
      ['c', 'v1@1'],
      ['d', 'v2@0'],
    ]);
    expect(decoded.calls).toHaveLength(2);
    expect(decoded.calls[0]).toMatchObject({
      source: { file, hasAlpha: true, strip: { frames: ['v1'] } },
      moments: [0.5, 1],
      options: { maxSize: 1920 },
    });
    // No file: the strip stands in
    expect(decoded.calls[1]?.source).toMatchObject({ file: undefined });
  });

  it('has none for a video the document doesn’t have', async () => {
    const stills = await loadVideoStills([{ nodeId: 'a', videoId: 'gone', seconds: 0 }]);
    expect(stills.size).toBe(0);
    expect(decoded.calls).toEqual([]);
  });

  it('decodes nothing with nothing asked', async () => {
    expect((await loadVideoStills([])).size).toBe(0);
    expect(decoded.calls).toEqual([]);
  });
});

const layer = (id: string, offset: number): VideoNode => ({
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
  videoId: 'v1',
  width: 160,
  height: 90,
  naturalWidth: 1280,
  naturalHeight: 720,
  cornerRadius: [0, 0, 0, 0],
  clip: { start: 0, offset, duration: 2 },
});

describe('canvasVideoMoments', () => {
  beforeEach(() => {
    useEditorStore.getState().resetProject();
  });

  it('is what the canvas shows: the playhead’s moment in view, a clip’s first on another timeline', () => {
    const sg = new SceneGraph();
    const board: ArtboardNode = {
      ...layer('board', 0),
      type: 'artboard',
      width: 400,
      height: 300,
      fills: [],
      clipContent: true,
    } as unknown as ArtboardNode;
    sg.addNode(board);
    sg.addNode(layer('on-page', 0));
    sg.addNode(layer('on-board', 0.5), 'board');
    useEditorStore.setState({ timelineScope: null, currentFrame: 15, frameRate: 30 });
    expect(canvasVideoMoments(sg, sg.getRootNodes())).toEqual([
      { nodeId: 'on-board', videoId: 'v1', seconds: 0.5 },
      { nodeId: 'on-page', videoId: 'v1', seconds: 0.5 },
    ]);
    useEditorStore.setState({ timelineScope: 'board', currentFrame: 30 });
    expect(canvasVideoMoments(sg, [sg.getNode('on-board')!])).toEqual([
      { nodeId: 'on-board', videoId: 'v1', seconds: 1.5 },
    ]);
  });

  it('has none for a layer outside its clip at the playhead', () => {
    const sg = new SceneGraph();
    sg.addNode(layer('v', 0));
    useEditorStore.setState({ timelineScope: null, currentFrame: 90, frameRate: 30 });
    expect(canvasVideoMoments(sg, sg.getRootNodes())).toEqual([]);
  });
});
