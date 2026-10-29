/**
 * A video's still at a moment: the one picture it shows there, decoded
 * from its file, for the exports that can't play video (Lottie, SVG, PDF
 * show it as a picture) — as a canvas, or as a picture's data URI (JPEG;
 * PNG where the video may be transparent). Where the file is missing or a
 * moment won't decode, the strip's nearest still stands in.
 */

import type { VideoStrip } from '@quar/types';
import type { InputVideoTrack } from 'mediabunny';
import { openMedia, videoTrackOf } from './media';
import { stillIndexAt } from './strip';

export type StillCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface VideoStillOptions {
  /** The still's longest side at most, in pixels (default 1920; never larger than the video) */
  maxSize?: number;
}

/** What a video's stills are had from: its file, and its strip should that fail. */
export interface VideoStillSource {
  file?: Blob | null;
  strip?: VideoStrip;
  /** Whether its pictures may be transparent (written as PNG, else JPEG) */
  hasAlpha?: boolean;
}

const MAX_SIZE = 1920;
const JPEG_QUALITY = 0.9;
/** As the frame source does: a frame boundary in floating point lands in the frame it begins */
const NUDGE = 1e-5;

/** The strip's still nearest a moment of its video; null when it has none. */
export function stripStillAt(strip: VideoStrip | undefined, seconds: number): string | null {
  if (!strip || strip.frames.length === 0) return null;
  return strip.frames[stillIndexAt(strip, seconds)] ?? null;
}

/**
 * Decodes the pictures of a video at moments, in seconds, one at a time:
 * `take` hears each (null where it gave none) before the next is decoded.
 */
async function decodeEach(
  file: Blob,
  moments: number[],
  options: VideoStillOptions,
  take: (still: StillCanvas | null, index: number) => Promise<void> | void
): Promise<void> {
  const { mb, input } = await openMedia(file);
  try {
    const track = await videoTrackOf(input);
    const sink = new mb.CanvasSink(track, await sinkOptions(track, options));
    const first = await track.getFirstTimestamp();
    const end = await track.computeDuration();
    for (const [index, seconds] of moments.entries()) {
      // Inside the video, where its pictures are
      const at = Math.min(Math.max(seconds + NUDGE, first), Math.max(first, end - NUDGE));
      const decoded = await sink.getCanvas(at).catch(() => null);
      await take(decoded?.canvas ?? null, index);
    }
  } finally {
    input.dispose();
  }
}

/** The stills' size (the video's own, no bigger than asked) and transparency. */
async function sinkOptions(track: InputVideoTrack, options: VideoStillOptions) {
  const width = await track.getDisplayWidth();
  const height = await track.getDisplayHeight();
  const scale = Math.min(1, (options.maxSize ?? MAX_SIZE) / Math.max(width, height, 1));
  const alpha = await track.canBeTransparent();
  if (scale >= 1) return { alpha };
  return width >= height
    ? { alpha, width: Math.round(width * scale) }
    : { alpha, height: Math.round(height * scale) };
}

/** The picture of a video at a moment, in seconds (null where it gives none). */
export async function decodeVideoStill(
  file: Blob,
  seconds: number,
  options: VideoStillOptions = {}
): Promise<StillCanvas | null> {
  let still: StillCanvas | null = null;
  await decodeEach(file, [seconds], options, (decoded) => {
    still = decoded;
  });
  return still;
}

function bytesToDataUri(bytes: Uint8Array, type: string): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${type};base64,${btoa(binary)}`;
}

/** A still as a picture's data URI: PNG to keep transparency, else JPEG. */
export async function stillDataUri(canvas: StillCanvas, transparent: boolean): Promise<string> {
  const type = transparent ? 'image/png' : 'image/jpeg';
  if ('toDataURL' in canvas) return canvas.toDataURL(type, JPEG_QUALITY);
  const blob = await canvas.convertToBlob({ type, quality: JPEG_QUALITY });
  return bytesToDataUri(new Uint8Array(await blob.arrayBuffer()), blob.type || type);
}

/**
 * A video's stills at moments, in seconds, as data URIs: decoded from its
 * file (opened once for them all), the strip's nearest still where there's
 * no file or a moment won't decode, null where there's neither.
 */
export async function videoStillsAt(
  source: VideoStillSource,
  moments: number[],
  options: VideoStillOptions = {}
): Promise<Array<string | null>> {
  const stills: Array<string | null> = moments.map(() => null);
  if (source.file && moments.length > 0) {
    try {
      await decodeEach(source.file, moments, options, async (still, index) => {
        if (still) stills[index] = await stillDataUri(still, source.hasAlpha ?? false);
      });
    } catch (error) {
      console.warn('A video’s stills couldn’t be decoded; its strip stands in:', error);
    }
  }
  return stills.map((still, index) => still ?? stripStillAt(source.strip, moments[index] ?? 0));
}
