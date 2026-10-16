/** Render an animation range and encode it as an animated GIF. */

import type { Color } from '@quar/types';
import type { FrameRenderContext } from './frameRenderer';
import { createFrameRenderer, getFrameCount, getFrameRenderRoots } from './frameRenderer';
import type { ExportProgress } from './index';

export interface GifExportOptions {
  width: number;
  height: number;
  frameRate: number;
  startFrame: number;
  endFrame: number;
  transparent?: boolean;
}

const MAX_PALETTE_SAMPLE_PIXELS = 250_000;

/**
 * Render frames twice to build one shared color palette for the whole GIF.
 * Sampling a bounded number of pixels keeps memory use predictable for long
 * animations while avoiding frame-to-frame palette flicker.
 */
export async function exportGif(
  ctx: FrameRenderContext,
  options: GifExportOptions,
  onProgress?: (progress: ExportProgress) => void,
  isCancelled: () => boolean = () => false
): Promise<Blob | null> {
  const { width, height, frameRate, startFrame, endFrame, transparent = false } = options;
  const frameCount = getFrameCount(startFrame, endFrame);
  if (frameCount === 0) throw new Error('Choose a valid frame range to export.');
  if (width < 1 || height < 1) throw new Error('Export width and height must be at least 1 pixel.');

  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const backgroundColor: Color | null = transparent ? null : { r: 26, g: 26, b: 26, a: 1 };
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
    await renderer.preloadTextures(getFrameRenderRoots(ctx), ctx.sceneGraph);

    const pixelCount = width * height;
    const samplesPerFrame = Math.max(1, Math.floor(MAX_PALETTE_SAMPLE_PIXELS / frameCount));
    const sampleStride = Math.max(1, Math.ceil(pixelCount / samplesPerFrame));
    const samplesPerFrameActual = Math.ceil(pixelCount / sampleStride);
    const samplePixels = Math.min(MAX_PALETTE_SAMPLE_PIXELS, samplesPerFrameActual * frameCount);
    const colorSamples = new Uint8Array(samplePixels * 4);
    let sampleOffset = 0;

    for (let i = 0; i < frameCount; i++) {
      if (isCancelled()) return null;
      const canvas = renderer.renderFrame(ctx, startFrame + i);
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
    const palette = quantize(
      colorSamples.subarray(0, sampleOffset),
      256,
      transparent ? { format: paletteFormat, oneBitAlpha: 127 } : { format: paletteFormat }
    );
    let transparentIndex = -1;
    if (transparent) {
      transparentIndex = palette.findIndex((color) => (color[3] ?? 255) < 128);
      if (transparentIndex < 0) {
        palette.unshift([0, 0, 0, 0]);
        if (palette.length > 256) palette.pop();
        transparentIndex = 0;
      }
    }

    const gif = GIFEncoder();
    const delay = Math.max(10, Math.round(1000 / Math.max(1, frameRate) / 10) * 10);
    for (let i = 0; i < frameCount; i++) {
      if (isCancelled()) return null;
      const canvas = renderer.renderFrame(ctx, startFrame + i);
      sampleContext.clearRect(0, 0, width, height);
      sampleContext.drawImage(canvas, 0, 0, width, height);
      const pixels = sampleContext.getImageData(0, 0, width, height).data;
      const indexed = applyPalette(pixels, palette, paletteFormat);
      gif.writeFrame(indexed, width, height, {
        ...(i === 0 ? { palette, repeat: 0 } : {}),
        delay,
        ...(transparent ? { transparent: true, transparentIndex, dispose: 2 } : {}),
      });
      onProgress?.({
        phase: 'encoding',
        current: i + 1,
        total: frameCount,
        percentage: 30 + Math.round(((i + 1) / frameCount) * 65),
      });
      await yieldToBrowser();
    }

    if (isCancelled()) return null;
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
