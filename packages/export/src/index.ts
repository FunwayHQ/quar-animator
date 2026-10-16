/**
 * @quar/export
 * Export pipeline for Quar Animator
 */

export const EXPORT_VERSION = '0.1.0';

// ============================================================================
// Common Types
// ============================================================================

export type ExportFormat =
  | 'lottie'
  | 'dotlottie'
  | 'gif'
  | 'png-sequence'
  | 'mp4'
  | 'webm'
  | 'sprite-sheet';

export interface ExportOptions {
  format: ExportFormat;
  width: number;
  height: number;
  frameRate: number;
  startFrame: number;
  endFrame: number;
  quality?: 'low' | 'medium' | 'high' | 'lossless';
}

export interface ExportProgress {
  phase: 'preparing' | 'rendering' | 'encoding' | 'finalizing';
  current: number;
  total: number;
  percentage: number;
}

// ============================================================================
// Bin Packing
// ============================================================================

export {
  packGrid,
  packMaxRects,
  nextPowerOfTwo,
  assertAllFramesPacked,
  type PackResult,
  type PackedRect,
} from './binPacking';

// ============================================================================
// Export Utilities (Pure)
// ============================================================================

export { getFrameCount, generateFrameFilenames } from './exportUtils';

// ============================================================================
// Frame Renderer
// ============================================================================

export {
  createFrameRenderer,
  type FrameRenderOptions,
  type FrameRenderContext,
  type FrameRendererHandle,
} from './frameRenderer';

// ============================================================================
// PNG Sequence
// ============================================================================

export { exportPngSequence, type PngSequenceOptions } from './pngSequence';

export {
  exportGif,
  gifCompressionSettings,
  gifTiming,
  MAX_GIF_FPS,
  type GifCompressionSettings,
  type GifExportOptions,
  type GifTiming,
} from './gifExporter';

export { exportMp4, type Mp4ExportOptions } from './mp4Exporter';

// ============================================================================
// Sprite Sheet
// ============================================================================

export { exportSpriteSheet, type SpriteSheetOptions } from './spriteSheet';

export {
  generateSpriteSheetMetadata,
  type SpriteSheetMetadata,
  type SpriteFrameData,
} from './spriteSheetMetadata';

// ============================================================================
// Lottie
// ============================================================================

export {
  exportToLottieJson,
  exportLottieBlob,
  analyzeLottieExport,
  type LottieExportOptions,
} from './lottie/lottieExporter';

export type {
  LottieAnimation,
  LottieLayer,
  LottieTransform,
  LottieAnimatedValue,
  LottieAnimatedMulti,
  LottieShapeItem,
} from './lottie/lottieTypes';
