/**
 * A WebM's alpha, as mediabunny puts it with the colour: its alpha stream
 * decoded on its own, merged into the colour frame by a worker. The worker's
 * code is run here as the worker runs it, on frames standing in for the
 * browser's (Node has no WebCodecs).
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** The worker's code, as mediabunny hands it to its workers (from the module the editor loads). */
function workerCode(): string {
  const entry = createRequire(import.meta.url).resolve('mediabunny');
  const root = entry.slice(0, entry.lastIndexOf('/dist/'));
  const source = readFileSync(join(root, 'dist/modules/src/media-sink.js'), 'utf8');
  const start = source.indexOf('const colorAlphaMergerWorkerCode = () => {');
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf('\n};', start);
  return source.slice(source.indexOf('() => {', start), end + 2);
}

/** A planar 8-bit frame of `planes`, laid out one after another. */
function frame(planes: number[], fullRange: boolean, width = 2, height = 2) {
  const data = Uint8Array.from(planes);
  return {
    format: 'I420',
    codedWidth: width,
    codedHeight: height,
    visibleRect: { width, height },
    colorSpace: { fullRange },
    timestamp: 0,
    duration: 1,
    allocationSize: () => data.length,
    copyTo: async (destination: Uint8Array) => destination.set(data),
    close: () => {},
  };
}

/** Merges a colour frame with an alpha frame through the worker's code; the I420A planes made. */
async function merge(alphaY: number[], fullRange: boolean): Promise<Uint8Array> {
  let onMessage: ((event: { data: unknown }) => void) | null = null;
  let posted: (value: { frame?: { data: Uint8Array }; error?: string }) => void = () => {};
  const result = new Promise<{ frame?: { data: Uint8Array }; error?: string }>(
    (resolve) => (posted = resolve)
  );
  const self = {
    addEventListener: (_type: string, listener: typeof onMessage) => (onMessage = listener),
    postMessage: posted,
  };
  class VideoFrame {
    data: Uint8Array;
    constructor(buffer: Uint8Array) {
      this.data = buffer;
    }
  }
  new Function('self', 'VideoFrame', `(${workerCode()})()`)(self, VideoFrame);
  // A 2×2 frame: Y, then one U and one V; the alpha stream's Y is its alpha
  const color = frame([81, 81, 81, 81, 90, 240], true);
  const alpha = frame([...alphaY, 128, 128], fullRange);
  onMessage!({ data: { id: 1, color, alpha } });
  const { frame: merged, error } = await result;
  expect(error).toBeUndefined();
  return merged!.data;
}

describe('a WebM’s alpha, merged with its colour', () => {
  it('is the alpha as stored, though its stream says it’s limited range (as libvpx marks it)', async () => {
    const planes = await merge([0, 10, 128, 250], false);
    // I420A: Y (4), U, V, then the alpha (4)
    expect([...planes.subarray(6)]).toEqual([0, 10, 128, 250]);
  });

  it('is the alpha as stored when its stream says it’s full range', async () => {
    const planes = await merge([0, 10, 128, 250], true);
    expect([...planes.subarray(6)]).toEqual([0, 10, 128, 250]);
  });

  it('keeps the colour planes as they are', async () => {
    const planes = await merge([255, 255, 255, 255], false);
    expect([...planes.subarray(0, 6)]).toEqual([81, 81, 81, 81, 90, 240]);
  });
});
