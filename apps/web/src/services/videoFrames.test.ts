import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Video } from '@quar/types';

import { useEditorStore } from '../stores/editorStore';
import { keepVideoFiles, setVideoFile } from './videoFiles';

/** A frame source stood in for: it gives whatever the test says it has decoded. */
interface FakeSource {
  file: Blob;
  pick: null | { frame: { canvas: unknown; key: number; timestamp: number }; distance: number };
  asked: Array<[number, boolean]>;
  disposed: boolean;
}

const sources = vi.hoisted(() => [] as FakeSource[]);
/** Whether the sources made now fail to open */
const opening = vi.hoisted(() => ({ fails: false }));

vi.mock('@quar/export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@quar/export')>();
  return {
    ...actual,
    createVideoFrameSource: (file: Blob) => {
      const source: FakeSource = { file, pick: null, asked: [], disposed: false };
      sources.push(source);
      return {
        ready: opening.fails ? Promise.reject(new Error('not a video')) : Promise.resolve(),
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

import { createVideoFrames, releaseVideoFrames, videoFrameAt } from './videoFrames';

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

  it('decodes a video from its file, one source for all one layer asks of it', async () => {
    const file = new Blob(['v1'], { type: 'video/mp4' });
    setVideoFile('v1', file);
    useEditorStore.getState().addVideo(video('v1'));
    videoFrameAt('v1', 0.5);
    await tick();
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

  it('shows the exact frame once it’s decoded, its key changing with the picture', async () => {
    setVideoFile('v1', new Blob(['v1']));
    useEditorStore.getState().addVideo(video('v1'));
    videoFrameAt('v1', 0.5);
    const canvas = { id: 'canvas' };
    sources[0]!.pick = { frame: { canvas, key: 7, timestamp: 0.5 }, distance: 0 };
    await tick();
    expect(videoFrameAt('v1', 0.5)).toEqual({
      source: canvas,
      key: expect.stringMatching(/^v1:r\d+:7$/),
    });
    sources[0]!.pick = { frame: { canvas, key: 8, timestamp: 0.533 }, distance: 0 };
    await tick();
    expect(videoFrameAt('v1', 0.53)?.key).toMatch(/^v1:r\d+:8$/);
    expect(sources).toHaveLength(1);
  });

  it('shows a decoded frame near the moment rather than a still further off', async () => {
    setVideoFile('v1', new Blob(['v1']));
    useEditorStore.getState().addVideo(video('v1'));
    videoFrameAt('v1', 0.6);
    await tick();
    const canvas = { id: 'canvas' };
    // A frame behind while playing: nearer than the still at 0.5
    sources[0]!.pick = { frame: { canvas, key: 3, timestamp: 0.567 }, distance: 0.0001 };
    expect(videoFrameAt('v1', 0.6, true)?.key).toMatch(/^v1:r\d+:3$/);
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

  it('gives a layer showing another moment of the video a reader of its own, kept frame after frame', async () => {
    setVideoFile('v1', new Blob(['v1']));
    // One layer plays the video while another (on another timeline) shows its first picture
    for (let frame = 0; frame < 3; frame++) {
      videoFrameAt('v1', 2 + frame / 30, true);
      videoFrameAt('v1', 0);
      await tick();
    }
    expect(sources).toHaveLength(2);
    expect(sources[0]?.asked.map(([, playing]) => playing)).toEqual([true, true, true]);
    expect(sources[1]?.asked).toEqual([
      [0, false],
      [0, false],
      [0, false],
    ]);
  });

  it('keys each reader’s pictures apart', async () => {
    setVideoFile('v1', new Blob(['v1']));
    videoFrameAt('v1', 2, true);
    videoFrameAt('v1', 0);
    const canvas = { id: 'canvas' };
    sources[0]!.pick = { frame: { canvas, key: 1, timestamp: 2 }, distance: 0 };
    sources[1]!.pick = { frame: { canvas, key: 1, timestamp: 0 }, distance: 0 };
    await tick();
    const playing = videoFrameAt('v1', 2, true)?.key;
    const first = videoFrameAt('v1', 0)?.key;
    expect(playing).not.toBe(first);
  });

  it('seeks one layer’s reader when its playhead jumps, rather than opening another', async () => {
    setVideoFile('v1', new Blob(['v1']));
    videoFrameAt('v1', 0);
    await tick();
    videoFrameAt('v1', 1.5);
    await tick();
    videoFrameAt('v1', 0.2);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.asked.map(([seconds]) => seconds)).toEqual([0, 1.5, 0.2]);
  });

  it('opens three readers of a video at most', () => {
    setVideoFile('v1', new Blob(['v1']));
    for (const seconds of [0, 1, 2, 3, 4]) videoFrameAt('v1', seconds);
    expect(sources).toHaveLength(3);
  });

  it('shows a fourth layer of a video in stills, not seeking the others’ readers', async () => {
    useEditorStore.setState({ videos: [video('v1')] });
    setVideoFile('v1', new Blob(['v1']));
    for (let frame = 0; frame < 3; frame++) {
      for (const seconds of [0, 0.5, 1, 1.5]) videoFrameAt('v1', seconds);
      await tick();
    }
    // Each reader asked only its own layer's moment
    expect(sources).toHaveLength(3);
    for (const [n, seconds] of [0, 0.5, 1].entries()) {
      expect(new Set(sources[n]?.asked.map(([at]) => at))).toEqual(new Set([seconds]));
    }
    // The fourth: the strip's still there (4 a second: the seventh, 1.5 s)
    expect(videoFrameAt('v1', 1.5)?.key).toBe('v1:still6');
  });

  it('lets a reader no layer has asked of for a while go', async () => {
    vi.useFakeTimers();
    try {
      setVideoFile('v1', new Blob(['v1']));
      videoFrameAt('v1', 2, true);
      videoFrameAt('v1', 0);
      await vi.advanceTimersByTimeAsync(100);
      expect(sources).toHaveLength(2);
      // The second layer is gone: only the first asks now
      for (let i = 0; i < 40; i++) {
        videoFrameAt('v1', 2 + i / 30, true);
        await vi.advanceTimersByTimeAsync(100);
      }
      expect(sources.map((s) => s.disposed)).toEqual([false, true]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets a video nobody has drawn for a while go, once another is drawn', async () => {
    vi.useFakeTimers();
    try {
      setVideoFile('v1', new Blob(['v1']));
      setVideoFile('v2', new Blob(['v2']));
      videoFrameAt('v1', 0);
      videoFrameAt('v2', 0);
      // Only v2 is drawn from here on (v1's layer was deleted, say)
      for (let i = 0; i < 12; i++) {
        await vi.advanceTimersByTimeAsync(1000);
        videoFrameAt('v2', i / 30);
      }
      expect(sources.map((s) => s.disposed)).toEqual([true, false]);
    } finally {
      vi.useRealTimers();
      releaseVideoFrames('v2');
    }
  });

  it('lets a video’s decoding go when the document lets its file go', () => {
    setVideoFile('v1', new Blob(['v1']));
    setVideoFile('v2', new Blob(['v2']));
    videoFrameAt('v1', 0);
    videoFrameAt('v2', 0);
    // A project closed: v1 is gone, v2 stays
    keepVideoFiles(new Set(['v2']));
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

describe('createVideoFrames', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', LoadingImage);
    useEditorStore.getState().resetProject();
    sources.length = 0;
    opening.fails = false;
  });

  afterEach(() => {
    releaseVideoFrames('v1');
    vi.unstubAllGlobals();
  });

  it('reads with readers of its own, so the canvas’s aren’t sought to its moments', async () => {
    setVideoFile('v1', new Blob(['v1']));
    const own = createVideoFrames();
    for (let frame = 0; frame < 3; frame++) {
      videoFrameAt('v1', 0);
      await tick();
      own.frameAt('v1', 2 + frame / 30, true);
      await tick();
    }
    expect(sources).toHaveLength(2);
    expect(sources[0]?.asked.map(([seconds]) => seconds)).toEqual([0, 0, 0]);
    expect(sources[1]?.asked.map(([, playing]) => playing)).toEqual([true, true, true]);
    own.dispose();
    expect(sources.map((source) => source.disposed)).toEqual([false, true]);
  });

  it('says whether a picture is the moment’s own yet', async () => {
    setVideoFile('v1', new Blob(['v1']));
    useEditorStore.getState().addVideo(video('v1'));
    const own = createVideoFrames();
    own.pick('v1', 0.5);
    await tick();
    expect(own.pick('v1', 0.5)).toMatchObject({ exact: false, image: { key: 'v1:still2' } });
    const canvas = { id: 'canvas' };
    sources[0]!.pick = { frame: { canvas, key: 4, timestamp: 0.5 }, distance: 0 };
    expect(own.pick('v1', 0.5)).toMatchObject({ exact: true, image: { source: canvas } });
    own.dispose();
  });

  it('decodes a moment ahead of its showing, saying when it’s in', async () => {
    vi.useFakeTimers();
    try {
      setVideoFile('v1', new Blob(['v1']));
      const own = createVideoFrames();
      const decoded = vi.fn();
      void own.decode('v1', 1.5, 2000).then(decoded);
      await vi.advanceTimersByTimeAsync(100);
      expect(decoded).not.toHaveBeenCalled();
      expect(sources[0]?.asked[0]).toEqual([1.5, false]);
      sources[0]!.pick = { frame: { canvas: {}, key: 1, timestamp: 1.5 }, distance: 0 };
      await vi.advanceTimersByTimeAsync(100);
      expect(decoded).toHaveBeenCalledWith(true);
      // Shown later, the decoded picture is there at once
      expect(own.pick('v1', 1.5).exact).toBe(true);
      own.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up on a moment that isn’t in by the time allowed, or can’t be decoded at all', async () => {
    vi.useFakeTimers();
    try {
      setVideoFile('v1', new Blob(['v1']));
      const own = createVideoFrames();
      const late = own.decode('v1', 1, 500);
      await vi.advanceTimersByTimeAsync(600);
      await expect(late).resolves.toBe(false);
      own.dispose();

      opening.fails = true;
      const broken = createVideoFrames();
      await expect(broken.decode('v1', 0, 5000)).resolves.toBe(false);
      await expect(broken.decode('no-file', 0, 5000)).resolves.toBe(false);
      broken.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
