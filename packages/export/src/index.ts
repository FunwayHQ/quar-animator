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

// ============================================================================
// Video Files (imported: probed, their strips and sounds, their frames decoded)
// ============================================================================

export { probeVideo, type VideoInfo, type VideoProbe, type VideoProblem } from './video/probe';
export { GIF_TYPE, isAnimatedGif } from './video/gif';
export {
  makeVideoStrip,
  stillIndexAt,
  stripRate,
  stripTimes,
  STRIP_HEIGHT,
  STRIP_RATE,
  STRIP_STILLS,
} from './video/strip';
export {
  encodeWav,
  extractVideoSound,
  soundContainerFor,
  type VideoSoundFile,
  type VideoSoundOptions,
} from './video/sound';
export {
  createVideoFrameSource,
  type DecodedFrame,
  type FramePick,
  type VideoFrameSource,
  type VideoFrameSourceOptions,
} from './video/frameSource';
export {
  countVideoLayers,
  drawVideoStills,
  videoMoments,
  videoMomentsAtFrame,
  videoStillPicture,
  type VideoMoment,
  type VideoStillLoader,
  type VideoStills,
} from './videoStills';
export {
  decodeVideoStill,
  stillDataUri,
  stripStillAt,
  videoStillsAt,
  type StillCanvas,
  type VideoStillOptions,
  type VideoStillSource,
} from './video/still';
export {
  createExportVideoFrames,
  type ExportVideoFrames,
  type ExportVideoFramesOptions,
  type ExportVideoSize,
  type VideoExportSources,
} from './video/exportFrames';

export {
  stretch,
  stretchedLength,
  stretching,
  stretchInSteps,
  STRETCH_FRAME_SECONDS,
  STRETCH_SEARCH_SECONDS,
  type StretchInStepsOptions,
} from './audio/timeStretch';

export {
  decodeSound,
  mixSoundtrack,
  slideSoundtrackParts,
  soundAtSpeed,
  soundBytes,
  soundtrackPlays,
  SOUNDTRACK_RATE,
  type SoundDecoder,
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
  lottieVideoMoments,
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
