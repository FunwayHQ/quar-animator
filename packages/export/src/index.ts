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
  sampleSlides,
  hasTransitions,
  type ExportSlide,
  type PlaybackTiming,
  type Shot,
  type ShotTransition,
} from './exportUtils';

// ============================================================================
// Slide Transitions (one compositor for every output)
// ============================================================================

export {
  createShotRenderer,
  drawTransition,
  transitionDraw,
  type PixelRect,
  type ShotRenderer,
  type ShotRendererOptions,
  type TransitionDraw,
  type TransitionLayer,
  type TransitionTarget,
} from './slideTransition';

// ============================================================================
// Frame Renderer
// ============================================================================

export {
  createFrameRenderer,
  type FrameRenderOptions,
  type FrameRenderContext,
  type FrameRendererHandle,
  type FrameRig,
  type FrameSlide,
  type FramePlan,
  framePlan,
  preloadShots,
} from './frameRenderer';

// ============================================================================
// Scene Posing (the rig, for exports that can't skin)
// ============================================================================

export {
  copyScene,
  createScenePoser,
  rigHasPhysics,
  type PosedOutline,
  type ScenePoser,
} from './scenePosing';

export { getAnimatedArtworkBounds, sampleFrames } from './sceneExtent';

export { exportSvgFrame, type SvgFrameOptions } from './svgFrame';

// ============================================================================
// PDF (vector pages: slides, or the artwork, at a frame)
// ============================================================================

export {
  exportPdf,
  POINTS_PER_UNIT,
  type PdfExportOptions,
  type PdfPageSource,
} from './pdf/pdfExport';
export type { PdfRasterizer } from './pdf/pdfScene';

// ============================================================================
// PNG Sequence
// ============================================================================

export { exportPngSequence, slideFrames, type PngSequenceOptions } from './pngSequence';

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

export {
  decodeSound,
  mixSoundtrack,
  slideSoundtrackParts,
  soundBytes,
  soundtrackPlays,
  SOUNDTRACK_RATE,
  type SoundtrackPart,
} from './soundtrack';

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
