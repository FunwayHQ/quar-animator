/**
 * @quar/animation
 * Timeline, keyframes, and interpolation for Quar Animator
 */

export * from './Timeline';
export * from './TimelineScope';
export * from './SoundClips';
export * from './VideoClips';
export * from './SlideTransitions';
export * from './AnimationPresets';
export * from './AnimationSequence';
export * from './AnimationSpans';
export * from './Easing';
export * from './PropertyBinding';
export { KeyframeManager } from './KeyframeManager';
export type { KeyframeClipboard } from './KeyframeManager';
export { PlaybackController, playbackEndFrame } from './PlaybackController';
export type { PlaybackOptions } from './PlaybackController';

export * from './GraphEditorUtils';

// Re-export types
export type {
  Timeline,
  PropertyTrack,
  Keyframe,
  EasingFunction,
  Marker,
  TangentMode,
  Sound,
  SoundClip,
  SlideTransition,
  SlideTransitionType,
  SlideTransitionDirection,
} from '@quar/types';
