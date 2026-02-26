/**
 * Sprite Sheet Export
 *
 * Renders animation frames and composites them into a single atlas image
 * with accompanying TexturePacker-compatible JSON metadata.
 */

import type { Color } from '@quar/types';
import type { FrameRenderContext } from './frameRenderer';
import { createFrameRenderer } from './frameRenderer';
import { getFrameCount } from './exportUtils';
import { packGrid, packMaxRects, nextPowerOfTwo, type PackResult } from './binPacking';
import { generateSpriteSheetMetadata } from './spriteSheetMetadata';
import type { ExportProgress } from './index';

// Re-export for convenience
export { generateSpriteSheetMetadata } from './spriteSheetMetadata';

// ============================================================================
// Types
// ============================================================================

export interface SpriteSheetOptions {
  startFrame: number;
  endFrame: number;
  frameWidth: number;
  frameHeight: number;
  layout: 'grid' | 'packed';
  columns?: number;
  padding?: number;
  powerOfTwo?: boolean;
  multiplier?: number;
  backgroundColor?: Color | null;
}

// ============================================================================
// Export
// ============================================================================

/**
 * Export an animation as a sprite sheet (atlas image + JSON metadata).
 */
export async function exportSpriteSheet(
  ctx: FrameRenderContext,
  options: SpriteSheetOptions,
  onProgress?: (progress: ExportProgress) => void
): Promise<{ image: Blob; metadata: string }> {
  const {
    startFrame,
    endFrame,
    frameWidth,
    frameHeight,
    layout,
    columns,
    padding = 0,
    powerOfTwo = false,
    multiplier = 1,
    backgroundColor = null,
  } = options;

  const frameCount = getFrameCount(startFrame, endFrame);

  // Compute atlas layout
  let packResult: PackResult;
  if (layout === 'grid') {
    packResult = packGrid(frameCount, frameWidth, frameHeight, columns, padding);
  } else {
    const frames = Array.from({ length: frameCount }, () => ({
      width: frameWidth,
      height: frameHeight,
    }));
    const maxDim = 4096;
    packResult = packMaxRects(frames, maxDim, maxDim, padding);
  }

  let atlasW = packResult.atlasWidth;
  let atlasH = packResult.atlasHeight;
  if (powerOfTwo) {
    atlasW = nextPowerOfTwo(atlasW);
    atlasH = nextPowerOfTwo(atlasH);
  }

  // Create atlas canvas (2D context for compositing)
  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = atlasW;
  atlasCanvas.height = atlasH;
  const atlasCtx = atlasCanvas.getContext('2d');
  if (!atlasCtx) {
    throw new Error('Failed to create 2D canvas context for sprite sheet atlas');
  }

  if (backgroundColor) {
    atlasCtx.fillStyle = `rgba(${backgroundColor.r}, ${backgroundColor.g}, ${backgroundColor.b}, ${backgroundColor.a})`;
    atlasCtx.fillRect(0, 0, atlasW, atlasH);
  }

  // Render individual frames
  const frameRenderer = createFrameRenderer({
    width: frameWidth,
    height: frameHeight,
    multiplier,
    backgroundColor,
  });

  // Pre-load image textures so they render correctly in the fresh WebGL context
  await frameRenderer.preloadTextures(ctx.sceneGraph.getRootNodes(), ctx.sceneGraph);

  try {
    for (let i = 0; i < frameCount; i++) {
      const frame = startFrame + i;
      const rect = packResult.rects[i];
      if (!rect || rect.x < 0) continue; // Skip frames that didn't fit

      onProgress?.({
        phase: 'rendering',
        current: i + 1,
        total: frameCount,
        percentage: Math.round(((i + 1) / frameCount) * 90), // Reserve 10% for finalizing
      });

      const frameCanvas = frameRenderer.renderFrame(ctx, frame);

      // Blit frame to atlas
      if (rect.rotated) {
        atlasCtx.save();
        atlasCtx.translate(rect.x + rect.width, rect.y);
        atlasCtx.rotate(Math.PI / 2);
        atlasCtx.drawImage(frameCanvas, 0, 0);
        atlasCtx.restore();
      } else {
        atlasCtx.drawImage(frameCanvas, rect.x, rect.y);
      }

      // Yield to UI
      await new Promise((r) => setTimeout(r, 0));
    }

    // Generate atlas image
    onProgress?.({
      phase: 'finalizing',
      current: frameCount,
      total: frameCount,
      percentage: 95,
    });

    const imageBlob = await new Promise<Blob>((resolve, reject) => {
      atlasCanvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to generate sprite sheet image blob'));
        }
      }, 'image/png');
    });

    // Generate metadata
    const metadata = generateSpriteSheetMetadata(
      packResult,
      { startFrame, endFrame, frameWidth, frameHeight },
      'spritesheet.png'
    );

    onProgress?.({
      phase: 'finalizing',
      current: frameCount,
      total: frameCount,
      percentage: 100,
    });

    return {
      image: imageBlob,
      metadata: JSON.stringify(metadata, null, 2),
    };
  } finally {
    frameRenderer.dispose();
  }
}
