/**
 * KeyframeManager - High-level keyframe operations
 *
 * Wraps Timeline.ts functions with a class-based API and adds clipboard support.
 */

import type { Timeline, PropertyTrack, Keyframe, EasingFunction } from '@quar/types';
import {
  getOrCreateTrack,
  addKeyframe,
  removeKeyframe,
  moveKeyframe as moveKf,
  findTrack,
  createKeyframe,
} from './Timeline';

// ============================================================================
// Clipboard Types
// ============================================================================

export interface KeyframeClipboard {
  /** Keyframes with times relative to the earliest keyframe */
  entries: Array<{
    property: string;
    time: number; // Relative time (offset from earliest)
    value: unknown;
    easing: EasingFunction;
  }>;
}

// ============================================================================
// KeyframeManager
// ============================================================================

export class KeyframeManager {
  constructor(public timeline: Timeline) {}

  // --------------------------------------------------------------------------
  // Creation
  // --------------------------------------------------------------------------

  /**
   * Add a keyframe at the given frame for a specific property.
   * Creates the track if it doesn't exist.
   */
  addKeyframe<T>(
    nodeId: string,
    property: string,
    frame: number,
    value: T,
    easing: EasingFunction = 'linear'
  ): Keyframe<T> {
    const track = getOrCreateTrack<T>(this.timeline, nodeId, property);
    return addKeyframe(track, frame, value, easing);
  }

  /**
   * Add or update a keyframe at the current frame.
   * If a keyframe already exists at this frame, update its value.
   */
  setKeyframeAtFrame<T>(nodeId: string, property: string, frame: number, value: T): Keyframe<T> {
    const track = getOrCreateTrack<T>(this.timeline, nodeId, property);
    const existing = track.keyframes.find((kf) => kf.time === frame);
    if (existing) {
      // Remove old keyframe and add updated one (immutable)
      removeKeyframe(track, existing.id);
      return addKeyframe(track, existing.time, value, existing.easing);
    }
    return addKeyframe(track, frame, value);
  }

  // --------------------------------------------------------------------------
  // Editing
  // --------------------------------------------------------------------------

  /**
   * Move a keyframe to a new time.
   */
  moveKeyframe(nodeId: string, property: string, keyframeId: string, newTime: number): boolean {
    const track = findTrack(this.timeline, nodeId, property);
    if (!track) return false;
    return moveKf(track, keyframeId, Math.max(0, Math.round(newTime)));
  }

  /**
   * Move multiple keyframes by a delta amount.
   */
  moveKeyframes(
    keyframes: Array<{ nodeId: string; property: string; keyframeId: string }>,
    deltaFrames: number
  ): number {
    let moved = 0;
    for (const kf of keyframes) {
      const track = findTrack(this.timeline, kf.nodeId, kf.property);
      if (!track) continue;
      const keyframe = track.keyframes.find((k) => k.id === kf.keyframeId);
      if (!keyframe) continue;
      const newTime = Math.max(0, Math.round(keyframe.time + deltaFrames));
      if (moveKf(track, kf.keyframeId, newTime)) {
        moved++;
      }
    }
    return moved;
  }

  /**
   * Set the easing function for a keyframe.
   */
  setKeyframeEasing(
    nodeId: string,
    property: string,
    keyframeId: string,
    easing: EasingFunction
  ): boolean {
    const track = findTrack(this.timeline, nodeId, property);
    if (!track) return false;
    const keyframe = track.keyframes.find((kf) => kf.id === keyframeId);
    if (!keyframe) return false;
    keyframe.easing = easing;
    return true;
  }

  // --------------------------------------------------------------------------
  // Deletion
  // --------------------------------------------------------------------------

  /**
   * Remove a single keyframe.
   */
  removeKeyframe(nodeId: string, property: string, keyframeId: string): boolean {
    const track = findTrack(this.timeline, nodeId, property);
    if (!track) return false;
    const removed = removeKeyframe(track, keyframeId);

    // Clean up empty tracks
    if (removed && track.keyframes.length === 0) {
      const index = this.timeline.tracks.indexOf(track as PropertyTrack);
      if (index !== -1) {
        this.timeline.tracks.splice(index, 1);
      }
    }

    return removed;
  }

  /**
   * Remove multiple keyframes.
   */
  removeKeyframes(
    keyframes: Array<{ nodeId: string; property: string; keyframeId: string }>
  ): number {
    let removed = 0;
    for (const kf of keyframes) {
      if (this.removeKeyframe(kf.nodeId, kf.property, kf.keyframeId)) {
        removed++;
      }
    }
    return removed;
  }

  /**
   * Remove all keyframes for a node.
   */
  removeAllKeyframesForNode(nodeId: string): number {
    const before = this.timeline.tracks.length;
    this.timeline.tracks = this.timeline.tracks.filter((t) => t.nodeId !== nodeId);
    return before - this.timeline.tracks.length;
  }

  // --------------------------------------------------------------------------
  // Clipboard
  // --------------------------------------------------------------------------

  /**
   * Copy keyframes to a clipboard object.
   * Times are stored relative to the earliest keyframe.
   */
  copyKeyframes(
    keyframes: Array<{ nodeId: string; property: string; keyframeId: string }>
  ): KeyframeClipboard | null {
    const entries: KeyframeClipboard['entries'] = [];
    let minTime = Infinity;

    // First pass: collect and find min time
    for (const kf of keyframes) {
      const track = findTrack(this.timeline, kf.nodeId, kf.property);
      if (!track) continue;
      const keyframe = track.keyframes.find((k) => k.id === kf.keyframeId);
      if (!keyframe) continue;
      entries.push({
        property: track.property,
        time: keyframe.time,
        value: structuredClone(keyframe.value),
        easing: keyframe.easing,
      });
      if (keyframe.time < minTime) minTime = keyframe.time;
    }

    if (entries.length === 0) return null;

    // Second pass: make times relative
    for (const entry of entries) {
      entry.time -= minTime;
    }

    return { entries };
  }

  /**
   * Paste keyframes from a clipboard at a target frame.
   */
  pasteKeyframes(clipboard: KeyframeClipboard, nodeId: string, targetFrame: number): Keyframe[] {
    const pasted: Keyframe[] = [];

    for (const entry of clipboard.entries) {
      const frame = targetFrame + entry.time;
      const track = getOrCreateTrack(this.timeline, nodeId, entry.property);
      const kf = addKeyframe(track, Math.max(0, Math.round(frame)), entry.value, entry.easing);
      pasted.push(kf as Keyframe);
    }

    return pasted;
  }

  // --------------------------------------------------------------------------
  // Queries
  // --------------------------------------------------------------------------

  /**
   * Get a keyframe at a specific frame for a property.
   */
  getKeyframeAt(nodeId: string, property: string, frame: number): Keyframe | null {
    const track = findTrack(this.timeline, nodeId, property);
    if (!track) return null;
    return (track.keyframes.find((kf) => kf.time === frame) as Keyframe) ?? null;
  }

  /**
   * Get all keyframes in a time range for a property.
   */
  getKeyframesInRange(
    nodeId: string,
    property: string,
    startFrame: number,
    endFrame: number
  ): Keyframe[] {
    const track = findTrack(this.timeline, nodeId, property);
    if (!track) return [];
    return track.keyframes.filter(
      (kf) => kf.time >= startFrame && kf.time <= endFrame
    ) as Keyframe[];
  }

  /**
   * Get all keyframes for a node across all properties.
   */
  getAllKeyframesForNode(nodeId: string): Array<{ property: string; keyframe: Keyframe }> {
    const result: Array<{ property: string; keyframe: Keyframe }> = [];
    for (const track of this.timeline.tracks) {
      if (track.nodeId !== nodeId) continue;
      for (const kf of track.keyframes) {
        result.push({ property: track.property, keyframe: kf as Keyframe });
      }
    }
    return result;
  }

  /**
   * Check if a node has any keyframes.
   */
  hasKeyframes(nodeId: string): boolean {
    return this.timeline.tracks.some((t) => t.nodeId === nodeId && t.keyframes.length > 0);
  }

  /**
   * Get the total number of keyframes in the timeline.
   */
  getKeyframeCount(): number {
    return this.timeline.tracks.reduce((sum, track) => sum + track.keyframes.length, 0);
  }
}
