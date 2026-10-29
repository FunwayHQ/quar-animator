/**
 * A video's frame strip: small stills taken through it at a steady rate
 * when it's imported, kept with it — drawn on its clip bar in the
 * timeline, shown on the canvas until the exact frame is decoded, and by
 * renders that can't decode video at all.
 */

import type { VideoStrip } from '@quar/types';
import { openMedia, videoTrackOf } from './media';

/** Stills a second, at most */
export const STRIP_RATE = 4;
/** Stills in all, at most: a longer video's are further apart */
export const STRIP_STILLS = 240;
/** Their height, at most, in pixels */
export const STRIP_HEIGHT = 160;

const STILL_QUALITY = 0.8;

/** Stills a second for a video this long: four, fewer past a minute (240 in all). */
export function stripRate(duration: number): number {
  return duration > 0 ? Math.min(STRIP_RATE, STRIP_STILLS / duration) : STRIP_RATE;
}

/** The moments, in seconds, a strip's stills are taken at: `i / rate` while the video lasts (one at least). */
export function stripTimes(duration: number, rate: number): number[] {
  const count = Math.max(1, Math.min(STRIP_STILLS, Math.ceil(duration * rate - 1e-9)));
  return Array.from({ length: count }, (_, i) => i / rate);
}

/** The still of a strip nearest a moment of its video. */
export function stillIndexAt(strip: VideoStrip, seconds: number): number {
  const last = strip.frames.length - 1;
  return Math.max(0, Math.min(last, Math.round(seconds * strip.rate)));
}

type StillCanvas = HTMLCanvasElement | OffscreenCanvas;

function bytesToDataUri(bytes: Uint8Array, type: string): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${type};base64,${btoa(binary)}`;
}

/** A still as a data URI: PNG keeps transparency; else WebP, or JPEG where the browser can't write WebP. */
async function stillDataUri(canvas: StillCanvas, transparent: boolean): Promise<string> {
  const types = transparent ? ['image/png'] : ['image/webp', 'image/jpeg'];
  if ('toDataURL' in canvas) {
    let uri = '';
    for (const type of types) {
      uri = canvas.toDataURL(type, STILL_QUALITY);
      // A browser that can't write the type writes PNG instead
      if (uri.startsWith(`data:${type}`)) return uri;
    }
    return uri;
  }
  let blob: Blob | null = null;
  for (const type of types) {
    blob = await canvas.convertToBlob({ type, quality: STILL_QUALITY });
    if (blob.type === type) break;
  }
  if (!blob) throw new Error('A still couldn’t be encoded.');
  return bytesToDataUri(new Uint8Array(await blob.arrayBuffer()), blob.type);
}

/**
 * A video's strip, its stills decoded at `stripRate` a second (at most
 * 160 px high, its shape kept). `onProgress` hears how much is done (0–1).
 */
export async function makeVideoStrip(
  file: Blob,
  video: { duration: number; height: number; hasAlpha: boolean },
  onProgress?: (fraction: number) => void
): Promise<VideoStrip> {
  const rate = stripRate(video.duration);
  const height = Math.max(1, Math.round(Math.min(STRIP_HEIGHT, video.height)));
  const { mb, input } = await openMedia(file);
  try {
    const track = await videoTrackOf(input);
    // Nothing shows before its first frame: the first still is that frame
    const first = await track.getFirstTimestamp();
    const times = stripTimes(video.duration, rate).map((time) => Math.max(first, time));
    // One canvas, used again for each still: each is encoded before the next is drawn
    const sink = new mb.CanvasSink(track, { height, alpha: video.hasAlpha, poolSize: 1 });
    const frames: Array<string | null> = [];
    for await (const still of sink.canvasesAtTimestamps(times)) {
      frames.push(still ? await stillDataUri(still.canvas, video.hasAlpha) : null);
      onProgress?.(frames.length / times.length);
    }
    // A moment that gave no picture shows the one before it (the first one after, at the start)
    const firstStill = frames.find((frame) => frame !== null);
    if (!firstStill) throw new Error('No pictures could be decoded from the video.');
    let previous = firstStill;
    return {
      rate,
      height,
      frames: frames.map((frame) => (previous = frame ?? previous)),
    };
  } finally {
    input.dispose();
  }
}
