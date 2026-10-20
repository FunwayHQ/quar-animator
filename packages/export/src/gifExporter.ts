/** Render an animation range and encode it as an animated GIF. */

import type { Color } from '@quar/types';
import { DEFAULT_DOCUMENT_BACKGROUND } from '@quar/core';
import type { FrameRenderContext } from './frameRenderer';
import { createFrameRenderer, getFrameCount, getFrameRenderRoots } from './frameRenderer';
import { sampleTimeline, type PlaybackTiming } from './exportUtils';
import type { ExportProgress } from './index';

/** `fps` defaults to the timeline's, at most 50. */
export interface GifExportOptions extends PlaybackTiming {
  width: number;
  height: number;
  transparent?: boolean;
  /** What shows where nothing is drawn, unless transparent: the document background. */
  backgroundColor?: Color;
  /**
   * 0 (best quality) … 100 (smallest file). Fewer palette colors, and pixels
   * whose color barely changed from what's on screen are left as they are.
   */
  compression?: number;
}

export interface GifCompressionSettings {
  /** Palette size, including the index reserved for unchanged/transparent pixels. */
  colors: number;
  /** Largest RGB distance at which a pixel counts as unchanged between frames. */
  tolerance: number;
}

/** Palette size halves every 25% (256 → 16); the tolerance grows to 24. */
export function gifCompressionSettings(compression = 0): GifCompressionSettings {
  const c = Math.min(100, Math.max(0, Number.isFinite(compression) ? compression : 0));
  return {
    colors: Math.max(16, Math.min(256, Math.round(256 * 2 ** (-c / 25)))),
    tolerance: (c / 100) * 24,
  };
}

/** Players slow frames shorter than 2/100 s right down, so 50 fps is the ceiling. */
export const MAX_GIF_FPS = 50;

export interface GifTiming {
  /** The timeline frame (possibly between two) each GIF frame shows. */
  frames: number[];
  /** How long each GIF frame shows, in hundredths of a second. */
  delays: number[];
}

/**
 * Which moments of the timeline a GIF shows, and for how long. GIF delays are
 * whole hundredths of a second, so they're spread to add up exactly (30 fps:
 * 3, 3, 4, 3, 3, 4…) instead of each being rounded (30 fps playing 11% fast).
 */
export function gifTiming(options: PlaybackTiming): GifTiming {
  const { fps, frames } = sampleTimeline(options, MAX_GIF_FPS);
  const at = (k: number) => Math.round((k * 100) / fps);
  return { frames, delays: frames.map((_, k) => at(k + 1) - at(k)) };
}

const MAX_PALETTE_SAMPLE_PIXELS = 250_000;

/** Index meaning "nothing shown here yet" (or cleared to transparent). */
const NOTHING = -1;

/**
 * Frame differencing: rewrite `indexed` so every pixel that already shows the
 * right color (within `tolerance`) becomes the transparent index, which the GIF
 * player leaves untouched and LZW compresses to almost nothing. `shown` tracks
 * what the viewer sees and is updated in place.
 */
export function diffGifFrame(
  indexed: Uint8Array,
  pixels: Uint8Array | Uint8ClampedArray,
  shown: Int16Array,
  palette: number[][],
  transparentIndex: number,
  tolerance: number
): Uint8Array {
  const toleranceSq = tolerance * tolerance;
  for (let p = 0; p < indexed.length; p++) {
    const index = indexed[p]!;
    const current = shown[p]!;
    if (index === transparentIndex) continue; // Transparent here (only after a clear)
    if (current !== NOTHING) {
      let unchanged = current === index;
      if (!unchanged && toleranceSq > 0) {
        const color = palette[current]!;
        const dr = pixels[p * 4]! - color[0]!;
        const dg = pixels[p * 4 + 1]! - color[1]!;
        const db = pixels[p * 4 + 2]! - color[2]!;
        unchanged = dr * dr + dg * dg + db * db <= toleranceSq;
      }
      if (unchanged) {
        indexed[p] = transparentIndex;
        continue;
      }
    }
    shown[p] = index;
  }
  return indexed;
}

function isUnchanged(indexed: Uint8Array, transparentIndex: number): boolean {
  return indexed.every((index) => index === transparentIndex);
}

/** Whether a pixel on screen has to turn transparent (only a clear can do that). */
function needsClear(indexed: Uint8Array, shown: Int16Array, transparentIndex: number): boolean {
  for (let p = 0; p < indexed.length; p++) {
    if (indexed[p] === transparentIndex && shown[p] !== NOTHING) return true;
  }
  return false;
}

/**
 * Render frames twice to build one shared color palette for the whole GIF.
 * Sampling a bounded number of pixels keeps memory use predictable for long
 * animations while avoiding frame-to-frame palette flicker. Frames after the
 * first only draw what changed, and a frame that changes nothing just extends
 * the previous one.
 */
export async function exportGif(
  ctx: FrameRenderContext,
  options: GifExportOptions,
  onProgress?: (progress: ExportProgress) => void,
  isCancelled: () => boolean = () => false
): Promise<Blob | null> {
  const { width, height, startFrame, endFrame, transparent = false } = options;
  if (getFrameCount(startFrame, endFrame) === 0) {
    throw new Error('Choose a valid frame range to export.');
  }
  if (width < 1 || height < 1) throw new Error('Export width and height must be at least 1 pixel.');
  const timing = gifTiming(options);
  const frameCount = timing.frames.length;
  const { colors, tolerance } = gifCompressionSettings(options.compression);

  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const backgroundColor: Color | null = transparent
    ? null
    : { ...(options.backgroundColor ?? DEFAULT_DOCUMENT_BACKGROUND), a: 1 };
  const renderer = createFrameRenderer({ width, height, backgroundColor });
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = width;
  sampleCanvas.height = height;
  const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
  if (!sampleContext) {
    renderer.dispose();
    throw new Error('Could not create a canvas for GIF color conversion.');
  }

  try {
    await renderer.preloadTextures(getFrameRenderRoots(ctx), ctx.sceneGraph, ctx.symbols);

    const pixelCount = width * height;
    const samplesPerFrame = Math.max(1, Math.floor(MAX_PALETTE_SAMPLE_PIXELS / frameCount));
    const sampleStride = Math.max(1, Math.ceil(pixelCount / samplesPerFrame));
    const samplesPerFrameActual = Math.ceil(pixelCount / sampleStride);
    const samplePixels = Math.min(MAX_PALETTE_SAMPLE_PIXELS, samplesPerFrameActual * frameCount);
    const colorSamples = new Uint8Array(samplePixels * 4);
    let sampleOffset = 0;

    for (let i = 0; i < frameCount; i++) {
      if (isCancelled()) return null;
      const canvas = renderer.renderFrame(ctx, timing.frames[i]!);
      sampleContext.clearRect(0, 0, width, height);
      sampleContext.drawImage(canvas, 0, 0, width, height);
      const pixels = sampleContext.getImageData(0, 0, width, height).data;
      for (
        let pixel = 0;
        pixel < pixelCount && sampleOffset < colorSamples.length;
        pixel += sampleStride
      ) {
        const offset = pixel * 4;
        colorSamples[sampleOffset++] = pixels[offset] ?? 0;
        colorSamples[sampleOffset++] = pixels[offset + 1] ?? 0;
        colorSamples[sampleOffset++] = pixels[offset + 2] ?? 0;
        colorSamples[sampleOffset++] = pixels[offset + 3] ?? 255;
      }
      onProgress?.({
        phase: 'preparing',
        current: i + 1,
        total: frameCount,
        percentage: Math.round(((i + 1) / frameCount) * 30),
      });
      await yieldToBrowser();
    }

    if (isCancelled()) return null;
    const paletteFormat = transparent ? 'rgba4444' : 'rgb565';
    let palette: number[][];
    let transparentIndex: number;
    if (transparent) {
      palette = quantize(colorSamples.subarray(0, sampleOffset), colors, {
        format: paletteFormat,
        oneBitAlpha: 127,
      });
      transparentIndex = palette.findIndex((color) => (color[3] ?? 255) < 128);
      if (transparentIndex < 0) {
        palette.unshift([0, 0, 0, 0]);
        if (palette.length > colors) palette.pop();
        transparentIndex = 0;
      }
    } else {
      // One index stays free to mean "unchanged"
      palette = quantize(colorSamples.subarray(0, sampleOffset), colors - 1, {
        format: paletteFormat,
      });
      transparentIndex = palette.length;
      palette.push([0, 0, 0]);
    }
    const colorDepth = Math.max(2, Math.ceil(Math.log2(palette.length)));

    const gif = GIFEncoder();
    const shown = new Int16Array(pixelCount).fill(NOTHING);
    // A frame's disposal (whether the next must clear the screen) and length
    // (whether the next changes anything) depend on the next frame, so each
    // frame is written once the next is known
    let pending: Uint8Array | null = null;
    let pendingDelay = 0;
    let writtenFrames = 0;
    const writePending = (dispose: number) => {
      gif.writeFrame(pending!, width, height, {
        ...(writtenFrames === 0 ? { palette, repeat: 0 } : {}),
        delay: Math.min(65535, pendingDelay) * 10,
        transparent: true,
        transparentIndex,
        dispose,
        colorDepth,
      });
      writtenFrames++;
    };
    // Real colors only: nothing may map to the reserved "unchanged" index
    const colorPalette = transparent ? palette : palette.slice(0, -1);

    for (let i = 0; i < frameCount; i++) {
      if (isCancelled()) return null;
      const canvas = renderer.renderFrame(ctx, timing.frames[i]!);
      sampleContext.clearRect(0, 0, width, height);
      sampleContext.drawImage(canvas, 0, 0, width, height);
      const pixels = sampleContext.getImageData(0, 0, width, height).data;
      const indexed = applyPalette(pixels, colorPalette, paletteFormat);
      const delay = timing.delays[i]!;

      // 2 = restore to background (clear), 1 = keep for the next frame to draw on
      if (pending && transparent && needsClear(indexed, shown, transparentIndex)) {
        writePending(2);
        shown.fill(NOTHING);
        pending = null;
      }
      const frame = diffGifFrame(indexed, pixels, shown, palette, transparentIndex, tolerance);
      if (pending && isUnchanged(frame, transparentIndex)) {
        pendingDelay += delay;
      } else {
        if (pending) writePending(1);
        pending = frame;
        pendingDelay = delay;
      }

      onProgress?.({
        phase: 'encoding',
        current: i + 1,
        total: frameCount,
        percentage: 30 + Math.round(((i + 1) / frameCount) * 65),
      });
      await yieldToBrowser();
    }

    if (isCancelled()) return null;
    if (pending) writePending(transparent ? 2 : 1);
    gif.finish();
    const bytes = gif.bytes();
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    onProgress?.({ phase: 'finalizing', current: frameCount, total: frameCount, percentage: 100 });
    return new Blob([buffer], { type: 'image/gif' });
  } finally {
    renderer.dispose();
  }
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
