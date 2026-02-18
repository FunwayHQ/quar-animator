/**
 * Sprite Sheet Metadata Generation (Pure)
 *
 * TexturePacker-compatible JSON metadata for sprite atlases.
 * No DOM or WebGL dependencies.
 */

import type { PackResult } from './binPacking';
import { generateFrameFilenames } from './exportUtils';

// ============================================================================
// Types
// ============================================================================

export interface SpriteSheetMetadata {
  frames: Record<string, SpriteFrameData>;
  meta: {
    app: string;
    version: string;
    image: string;
    format: string;
    size: { w: number; h: number };
    scale: number;
  };
}

export interface SpriteFrameData {
  frame: { x: number; y: number; w: number; h: number };
  rotated: boolean;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}

// ============================================================================
// Metadata Generation
// ============================================================================

/**
 * Generate TexturePacker-compatible sprite sheet metadata from pack result.
 */
export function generateSpriteSheetMetadata(
  packResult: PackResult,
  options: {
    startFrame: number;
    endFrame: number;
    frameWidth: number;
    frameHeight: number;
    filenamePattern?: string;
  },
  imageFilename: string
): SpriteSheetMetadata {
  const { startFrame, endFrame, frameWidth, frameHeight, filenamePattern = 'frame_{N}' } = options;

  const filenames = generateFrameFilenames(filenamePattern, startFrame, endFrame, 'png');
  const frames: Record<string, SpriteFrameData> = {};

  for (const rect of packResult.rects) {
    const name = filenames[rect.frameIndex] ?? `frame_${rect.frameIndex}.png`;
    frames[name] = {
      frame: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      rotated: rect.rotated,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: frameWidth, h: frameHeight },
      sourceSize: { w: frameWidth, h: frameHeight },
    };
  }

  return {
    frames,
    meta: {
      app: 'Quar Animator',
      version: '1.0.0',
      image: imageFilename,
      format: 'RGBA8888',
      size: { w: packResult.atlasWidth, h: packResult.atlasHeight },
      scale: 1,
    },
  };
}
