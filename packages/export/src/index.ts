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

export {
  getFrameCount,
  generateFrameFilenames,
  sampleTimeline,
  type PlaybackTiming,
} from './exportUtils';

// ============================================================================
// Frame Renderer
// ============================================================================

export {
  createFrameRenderer,
  type FrameRenderOptions,
  type FrameRenderContext,
  type FrameRendererHandle,
  type FrameRig,
} from './frameRenderer';

// ============================================================================
// Scene Posing (the rig, for exports that can't skin)
// ============================================================================

export { createScenePoser, rigHasPhysics, type PosedOutline, type ScenePoser } from './scenePosing';

export { getAnimatedArtworkBounds, sampleFrames } from './sceneExtent';

export { exportSvgFrame, type SvgFrameOptions } from './svgFrame';

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

export {
  exportMp4,
  exportVideo,
  exportWebm,
  type Mp4ExportOptions,
  type VideoExportOptions,
  type VideoFormat,
} from './videoExporter';

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
