/**
 * @quar/animation
 * Timeline, keyframes, and interpolation for Quar Animator
 */

export * from './Timeline';
export * from './Easing';
export * from './PropertyBinding';
export { KeyframeManager } from './KeyframeManager';
export type { KeyframeClipboard } from './KeyframeManager';
export { PlaybackController } from './PlaybackController';
export type { PlaybackOptions } from './PlaybackController';

// Re-export types
export type { Timeline, PropertyTrack, Keyframe, EasingFunction, Marker } from '@quar/types';
