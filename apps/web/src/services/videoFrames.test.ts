import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Video } from '@quar/types';

import { useEditorStore } from '../stores/editorStore';
import { setVideoFile } from './videoFiles';

/** A frame source stood in for: it gives whatever the test says it has decoded. */
interface FakeSource {
  file: Blob;
  pick: null | { frame: { canvas: unknown; key: number; timestamp: number }; distance: number };
  asked: Array<[number, boolean]>;
  disposed: boolean;
}

const sources = vi.hoisted(() => [] as FakeSource[]);

vi.mock('@quar/export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@quar/export')>();
  return {
    ...actual,
    createVideoFrameSource: (file: Blob) => {
      const source: FakeSource = { file, pick: null, asked: [], disposed: false };
      sources.push(source);
      return {
        ready: Promise.resolve(),
        frameAt: (seconds: number, playing = false) => {
          source.asked.push([seconds, playing]);
          return source.pick;
        },
        dispose: () => {
          source.disposed = true;
        },
      };
    },
  };
});

import { releaseVideoFrames, videoFrameAt } from './videoFrames';

/** Pictures load at once here (jsdom loads none): the stills are ready a tick after they're asked for. */
class LoadingImage {
  onload: (() => void) | null = null;
  decoding = 'auto';
  set src(value: string) {
    this.loaded = value;
    setTimeout(() => this.onload?.(), 0);
  }
  loaded = '';
}

const video = (id: string): Video => ({
  id,
  name: 'Clip',
  mimeType: 'video/mp4',
  byteLength: 1000,
  width: 160,
  height: 90,
  duration: 2,
  frameRate: 30,
  hasAlpha: false,
  strip: { rate: 4, height: 90, frames: ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7'] },
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('videoFrameAt', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', LoadingImage);
    useEditorStore.getState().resetProject();
    sources.length = 0;
  });

  afterEach(() => {
    releaseVideoFrames('v1');
    releaseVideoFrames('v2');
    vi.unstubAllGlobals();
  });

  it('shows nothing of a video it knows nothing of', () => {
    expect(videoFrameAt('nowhere', 0)).toBeNull();
  });

  it('decodes a video from its file, one source for all it asks of it', () => {
    const file = new Blob(['v1'], { type: 'video/mp4' });
    setVideoFile('v1', file);
    useEditorStore.getState().addVideo(video('v1'));
    videoFrameAt('v1', 0.5);
    videoFrameAt('v1', 0.6, true);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.file).toBe(file);
    expect(sources[0]?.asked).toEqual([
      [0.5, false],
      [0.6, true],
    ]);
  });

  it('shows the strip’s nearest still until the frame is decoded', async () => {
    setVideoFile('v1', new Blob(['v1']));
    useEditorStore.getState().addVideo(video('v1'));
    // Asked for, then loaded
    expect(videoFrameAt('v1', 0.5)).toBeNull();
    await tick();
    const still = videoFrameAt('v1', 0.5);
    expect((still?.source as unknown as LoadingImage).loaded).toBe('s2');
    expect(still?.key).toBe('v1:still2');
  });

  it('shows the exact frame once it’s decoded, its key changing with the picture', () => {
    setVideoFile('v1', new Blob(['v1']));
    useEditorStore.getState().addVideo(video('v1'));
    videoFrameAt('v1', 0.5);
    const canvas = { id: 'canvas' };
    sources[0]!.pick = { frame: { canvas, key: 7, timestamp: 0.5 }, distance: 0 };
    expect(videoFrameAt('v1', 0.5)).toEqual({ source: canvas, key: 'v1:7' });
    sources[0]!.pick = { frame: { canvas, key: 8, timestamp: 0.533 }, distance: 0 };
    expect(videoFrameAt('v1', 0.53)?.key).toBe('v1:8');
  });

  it('shows a decoded frame near the moment rather than a still further off', async () => {
    setVideoFile('v1', new Blob(['v1']));
    useEditorStore.getState().addVideo(video('v1'));
    videoFrameAt('v1', 0.6);
    await tick();
    const canvas = { id: 'canvas' };
    // A frame behind while playing: nearer than the still at 0.5
    sources[0]!.pick = { frame: { canvas, key: 3, timestamp: 0.567 }, distance: 0.0001 };
    expect(videoFrameAt('v1', 0.6, true)?.key).toBe('v1:3');
    // Seconds away (the playhead jumped): the still at 0.5 is nearer
    sources[0]!.pick = { frame: { canvas, key: 3, timestamp: 1.5 }, distance: 0.9 };
    expect(videoFrameAt('v1', 0.6)?.key).toBe('v1:still2');
  });

  it('shows the strip of a video whose file it hasn’t got', async () => {
    useEditorStore.getState().addVideo(video('v2'));
    videoFrameAt('v2', 1.9);
    await tick();
    expect(videoFrameAt('v2', 1.9)?.key).toBe('v2:still7');
    expect(sources).toHaveLength(0);
  });

  it('decodes a file put in the old one’s place afresh', () => {
    setVideoFile('v1', new Blob(['old']));
    videoFrameAt('v1', 0);
    setVideoFile('v1', new Blob(['new']));
    videoFrameAt('v1', 0);
    expect(sources.map((s) => s.disposed)).toEqual([true, false]);
  });

  it('lets a video’s decoding go when it’s released', async () => {
    setVideoFile('v1', new Blob(['v1']));
    useEditorStore.getState().addVideo(video('v1'));
    videoFrameAt('v1', 0.5);
    await tick();
    releaseVideoFrames('v1');
    expect(sources[0]?.disposed).toBe(true);
    // Its stills are let go too: asked again, they load again
    expect(videoFrameAt('v1', 0.5)).toBeNull();
    expect(sources).toHaveLength(2);
  });
});
