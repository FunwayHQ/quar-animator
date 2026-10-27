/**
 * PNG Sequence Export
 *
 * Renders each animation frame as a PNG image and bundles them into a ZIP file.
 */

import type { Color } from '@quar/types';
import type { FrameRenderContext, FrameSlide } from './frameRenderer';
import {
  createFrameRenderer,
  getFrameCount,
  generateFrameFilenames,
  preloadShots,
} from './frameRenderer';
import type { Shot } from './exportUtils';
import type { ExportProgress } from './index';

// ============================================================================
// Types
// ============================================================================

export interface PngSequenceOptions {
  startFrame: number;
  endFrame: number;
  width: number;
  height: number;
  multiplier?: number;
  backgroundColor?: Color | null;
  filenamePattern?: string; // default "frame_{N}"
  /** Every frame of these slides' timelines, one after another (the range is then theirs) */
  slides?: FrameSlide[];
}

// ============================================================================
// Export
// ============================================================================

/**
 * Export an animation as a PNG sequence bundled in a ZIP file.
 *
 * @param ctx - Scene graph and timeline for rendering
 * @param options - Export dimensions and frame range
 * @param onProgress - Progress callback
 * @returns ZIP blob containing all PNG frames
 */
export async function exportPngSequence(
  ctx: FrameRenderContext,
  options: PngSequenceOptions,
  onProgress?: (progress: ExportProgress) => void
): Promise<Blob> {
  const {
    startFrame,
    endFrame,
    width,
    height,
    multiplier = 1,
    backgroundColor = null,
    filenamePattern = 'frame_{N}',
  } = options;

  // Every frame of the range — or of each slide's timeline, one after another
  const shots: Shot<FrameRenderContext>[] = options.slides?.length
    ? options.slides.flatMap((slide) =>
        Array.from({ length: slide.frameCount }, (_, frame) => ({ ctx: slide.ctx, frame }))
      )
    : Array.from({ length: getFrameCount(startFrame, endFrame) }, (_, i) => ({
        ctx,
        frame: startFrame + i,
      }));
  const frameCount = shots.length;
  const filenames = options.slides?.length
    ? generateFrameFilenames(filenamePattern, 0, frameCount - 1, 'png')
    : generateFrameFilenames(filenamePattern, startFrame, endFrame, 'png');

  // Lazy-import JSZip to keep bundle size down when not exporting
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  const renderer = createFrameRenderer({ width, height, multiplier, backgroundColor });

  try {
    // Pre-load image textures so they render correctly in the fresh WebGL context.
    // Keep this inside the cleanup boundary because preloading allocates GPU resources too.
    await preloadShots(renderer, shots);

    for (let i = 0; i < frameCount; i++) {
      const shot = shots[i]!;

      // Report progress
      onProgress?.({
        phase: 'rendering',
        current: i + 1,
        total: frameCount,
        percentage: Math.round(((i + 1) / frameCount) * 100),
      });

      // Render frame
      const blob = await renderer.renderFrameAsBlob(shot.ctx, shot.frame);
      if (blob) {
        zip.file(filenames[i]!, blob);
      }

      // Yield to UI between frames
      await new Promise((r) => setTimeout(r, 0));
    }

    // Generate ZIP
    onProgress?.({
      phase: 'finalizing',
      current: frameCount,
      total: frameCount,
      percentage: 100,
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    return zipBlob;
  } finally {
    renderer.dispose();
  }
}
