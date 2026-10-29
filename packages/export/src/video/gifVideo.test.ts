/**
 * A GIF through everything that decodes videos — the canvas's frame
 * source, the exports' exact frames, the strip made at import, the stills
 * of Lottie, SVG and PDF — from a real file, composited here (Node has no
 * ImageDecoder) into fake canvases.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneGraph } from '@quar/core';
import { createTimeline } from '@quar/animation';
import type { VideoClip, VideoNode } from '@quar/types';

import { base } from '../__fixtures__/pdfNodes';
import {
  canvasPixel,
  installFakeCanvases,
  pixelsOfUri,
  type FakeCanvas,
} from '../__fixtures__/fakeCanvas';
import { pixelOf } from '../__fixtures__/gifs';
import { sampleTimeline } from '../exportUtils';
import type { FrameRenderContext } from '../frameRenderer';
import { createExportVideoFrames } from './exportFrames';
import { createVideoFrameSource } from './frameSource';
import { readGif, gifFrameAt } from './gif';
import { videoStillsAt } from './still';
import { makeVideoStrip } from './strip';

function bytes(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(resolve(__dirname, '../../../../apps/web/src/test/fixtures/video', name))
  );
}

const gifFile = (name: string) => new Blob([bytes(name)], { type: 'image/gif' });

const COLOURS = [
  [230, 25, 75],
  [60, 180, 75],
  [255, 225, 25],
  [0, 130, 200],
  [245, 130, 48],
  [145, 30, 180],
  [70, 240, 240],
  [240, 50, 230],
  [210, 245, 60],
  [128, 128, 128],
];

const colourIndex = (pixel: ArrayLike<number | undefined>) =>
  COLOURS.findIndex((colour) => colour.every((value, i) => value === pixel[i]));

/** The counter fixture's frame a picture shows (its square's colour). */
const counterFrame = (canvas: unknown) => {
  const { width, height } = canvas as FakeCanvas;
  return colourIndex(
    canvasPixel(canvas, Math.floor((31 * width) / 64), Math.floor((19 * height) / 36))
  );
};

/** The counter fixture's frame showing `seconds` into a clip that loops it, at `speed`. */
const counter = readGif(bytes('gif-counter.gif'));
const expectedFrame = (seconds: number, speed = 1) =>
  gifFrameAt(counter, ((seconds * speed) % counter.duration) + 1e-5);

let restoreCanvases = () => {};
beforeEach(() => {
  restoreCanvases = installFakeCanvases();
});
afterEach(() => restoreCanvases());

describe('a GIF on the canvas', () => {
  it('gives the picture of the frame showing at each moment asked, once it’s decoded', async () => {
    const source = createVideoFrameSource(gifFile('gif-counter.gif'));
    await source.ready;
    for (const seconds of [0.36, 0.05, 0.9, 0.52, 0.99]) {
      source.frameAt(seconds);
      await vi.waitFor(() => expect(source.frameAt(seconds)?.distance).toBe(0), { interval: 2 });
      expect(counterFrame(source.frameAt(seconds)?.frame.canvas)).toBe(expectedFrame(seconds));
    }
    source.dispose();
  });

  it('decodes on ahead while it plays', async () => {
    const source = createVideoFrameSource(gifFile('gif-counter.gif'));
    await source.ready;
    const seen: number[] = [];
    for (let frame = 0; frame < 30; frame++) {
      const seconds = frame / 30;
      source.frameAt(seconds, true);
      await vi.waitFor(() => expect(source.frameAt(seconds, true)?.distance).toBe(0), {
        interval: 2,
      });
      seen.push(counterFrame(source.frameAt(seconds, true)?.frame.canvas));
    }
    expect(seen).toEqual(Array.from({ length: 30 }, (_, frame) => expectedFrame(frame / 30)));
    source.dispose();
  });
});

describe('a GIF in an export', () => {
  function layer(clip: Partial<VideoClip>): VideoNode {
    return {
      ...base('gif'),
      type: 'video',
      videoId: 'video-gif',
      width: 160,
      height: 90,
      naturalWidth: 64,
      naturalHeight: 36,
      cornerRadius: [0, 0, 0, 0],
      clip: { start: 0, offset: 0, duration: 1, ...clip },
    };
  }

  async function exported(node: VideoNode, frames: number, fps = 30): Promise<number[]> {
    const sceneGraph = new SceneGraph();
    sceneGraph.addNode(structuredClone(node));
    const ctx: FrameRenderContext = {
      sceneGraph,
      timeline: createTimeline({ frameRate: 30, duration: 300 }),
      viewportBounds: { x: -160, y: -90, width: 320, height: 180 },
    };
    const shots = sampleTimeline({
      frameRate: 30,
      startFrame: 0,
      endFrame: frames - 1,
      fps,
    }).frames.map((frame) => ({ ctx, frame }));
    const source = createExportVideoFrames(
      shots,
      { width: 320, height: 180 },
      { videoFile: () => gifFile('gif-counter.gif') }
    );
    const seen: number[] = [];
    for (let i = 0; i < shots.length; i++) {
      await source.prepare(i);
      seen.push(counterFrame(source.provider(node)?.source));
    }
    expect(source.problems).toEqual([]);
    source.dispose();
    return seen;
  }

  it('shows the exact frame for each output frame, looping past the GIF’s end', async () => {
    const seen = await exported(layer({ loop: true, loopFor: 3 }), 75);
    expect(seen).toEqual(Array.from({ length: 75 }, (_, frame) => expectedFrame(frame / 30)));
  });

  it('plays at twice its speed', async () => {
    const seen = await exported(layer({ loop: true, loopFor: 2, speed: 2 }), 60);
    expect(seen).toEqual(Array.from({ length: 60 }, (_, frame) => expectedFrame(frame / 30, 2)));
  });

  it('samples it at the export’s own rate', async () => {
    // A 30 fps timeline exported at 12 fps: output frame k shows k / 12 s
    const seen = await exported(layer({ loop: true, loopFor: 2 }), 60, 12);
    expect(seen).toEqual(Array.from({ length: 24 }, (_, k) => expectedFrame(k / 12)));
  });
});

describe('a GIF’s strip', () => {
  it('has its stills a few a second, as pictures of the frames there', async () => {
    const strip = await makeVideoStrip(gifFile('gif-counter.gif'), {
      duration: 1,
      height: 36,
      hasAlpha: false,
    });
    expect(strip.rate).toBe(4);
    expect(strip.frames).toHaveLength(4);
    expect(strip.frames.every((frame) => frame.startsWith('data:image/webp'))).toBe(true);
    const shown = strip.frames.map((frame) => colourIndex(pixelOf(pixelsOfUri(frame), 64, 31, 19)));
    // The frames showing at 0, 0.25, 0.5 and 0.75 s
    expect(shown).toEqual([0, 2, 5, 7]);
  });

  it('keeps a transparent GIF’s stills as PNGs', async () => {
    const strip = await makeVideoStrip(gifFile('gif-transparent.gif'), {
      duration: 1,
      height: 36,
      hasAlpha: true,
    });
    expect(strip.frames.every((frame) => frame.startsWith('data:image/png'))).toBe(true);
    expect(pixelOf(pixelsOfUri(strip.frames[0]!), 64, 0, 0)).toEqual([0, 0, 0, 0]);
  });
});

describe('a GIF’s stills (Lottie, SVG, PDF)', () => {
  it('is the picture of the frame showing at each moment', async () => {
    const stills = await videoStillsAt({ file: gifFile('gif-counter.gif') }, [0.36, 0.72]);
    expect(
      stills.map((still) => colourIndex(pixelOf(pixelsOfUri(still ?? ''), 64, 31, 19)))
    ).toEqual([3, 7]);
  });
});
