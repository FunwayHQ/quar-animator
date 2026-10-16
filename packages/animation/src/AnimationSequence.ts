/**
 * Animation Sequence — a PowerPoint-style numbered list of preset effects.
 *
 * Each step starts after or with the previous step (or a chosen earlier step),
 * plus a delay. The sequence compiles into ordinary timeline keyframes tagged
 * with their step id; every compile replaces all tagged keyframes, so the
 * timeline always mirrors the sequence.
 */

import type { Node, PropertyTrack, Timeline } from '@quar/types';
import {
  ANIMATION_PRESETS,
  createAnimationPresetKeyframes,
  getPresetDurationFrames,
  type AnimationPresetDirection,
  type AnimationPresetId,
  type PresetKeyframe,
} from './AnimationPresets';
import { addKeyframe, createTrack } from './Timeline';
import { getProperty, setProperty } from './PropertyBinding';

// ============================================================================
// Types
// ============================================================================

/**
 * When a step starts: after / with the previous step, or after / with a chosen
 * earlier step (`targetStepId`). The step's delay is added to that point.
 */
export type SequenceTrigger = 'afterPrevious' | 'withPrevious' | 'after' | 'with';

export interface AnimationSequenceStep {
  id: string;
  nodeId: string;
  presetId: AnimationPresetId;
  trigger: SequenceTrigger;
  /** The earlier step an 'after' / 'with' trigger is timed against. */
  targetStepId?: string;
  /** Frames to wait after the trigger point. */
  delay: number;
  /** Requested length of one run of the effect, in frames. */
  duration: number;
  direction?: AnimationPresetDirection;
  intensity?: number;
  /** Loop presets only: number of cycles, or repeat until the timeline ends. */
  repeat?: number | 'untilEnd';
}

/** A node's resting values, keyed by property path. */
export type SequenceRestPose = Record<string, number>;

export interface AnimationSequence {
  steps: AnimationSequenceStep[];
  /**
   * Resting pose per node id — the values effects animate from and back to.
   * Kept here because playback overwrites a node's animated properties.
   */
  restPoses: Record<string, SequenceRestPose>;
}

export interface ScheduledStep {
  stepId: string;
  /** 1-based position shown in the UI. */
  number: number;
  /** First frame of the step's keyframes. */
  start: number;
  /** Last frame of the step's keyframes. */
  end: number;
  /**
   * Frame that steps timed 'after' this one measure from. Equals `end`, except
   * for loops repeating until the end, which release dependents after one cycle.
   */
  release: number;
  /** Frames in one run of the effect. */
  cycleFrames: number;
  /** Number of runs (more than one only for repeating loop presets). */
  cycles: number;
}

/** Properties captured as a node's rest pose — everything presets animate from. */
export const SEQUENCE_REST_PROPERTIES = [
  'opacity',
  'transform.position.x',
  'transform.position.y',
  'transform.rotation',
  'transform.scale.x',
  'transform.scale.y',
] as const;

export function createAnimationSequence(): AnimationSequence {
  return { steps: [], restPoses: {} };
}

/** Snapshot the node's current values as its rest pose. */
export function captureRestPose(node: Node): SequenceRestPose {
  const pose: SequenceRestPose = {};
  for (const property of SEQUENCE_REST_PROPERTIES) {
    const value = getProperty(node, property);
    if (typeof value === 'number') pose[property] = value;
  }
  return pose;
}

function isLoopPreset(presetId: AnimationPresetId): boolean {
  return ANIMATION_PRESETS.find((preset) => preset.id === presetId)?.category === 'Loop';
}

/** Whether the preset can animate this node (text/path-only presets). */
export function isPresetApplicable(presetId: AnimationPresetId, node: Node): boolean {
  const preset = ANIMATION_PRESETS.find((candidate) => candidate.id === presetId);
  return preset !== undefined && (!preset.nodeType || preset.nodeType === node.type);
}

// ============================================================================
// Editing helpers
// ============================================================================

/**
 * Repair step references after steps were removed or reordered: a step can
 * only be timed against an earlier step, so an 'after' / 'with' trigger whose
 * target is gone or no longer earlier falls back to the previous step, keeping
 * its after/with flavor. Rest poses of nodes without steps are dropped.
 */
export function normalizeSequence(sequence: AnimationSequence): AnimationSequence {
  const earlier = new Set<string>();
  const steps = sequence.steps.map((step) => {
    let next = step;
    if (step.trigger === 'after' || step.trigger === 'with') {
      if (!step.targetStepId || !earlier.has(step.targetStepId)) {
        const { targetStepId: _dropped, ...rest } = step;
        next = { ...rest, trigger: step.trigger === 'after' ? 'afterPrevious' : 'withPrevious' };
      }
    }
    earlier.add(step.id);
    return next;
  });

  const nodeIds = new Set(steps.map((step) => step.nodeId));
  const restPoses: Record<string, SequenceRestPose> = {};
  for (const [nodeId, pose] of Object.entries(sequence.restPoses)) {
    if (nodeIds.has(nodeId)) restPoses[nodeId] = pose;
  }
  return { steps, restPoses };
}

/** Remove a step; steps timed against it fall back to the previous step. */
export function removeSequenceStep(sequence: AnimationSequence, stepId: string): AnimationSequence {
  return normalizeSequence({
    ...sequence,
    steps: sequence.steps.filter((step) => step.id !== stepId),
  });
}

/** Move the step at `fromIndex` to `toIndex`, repairing references it breaks. */
export function moveSequenceStep(
  sequence: AnimationSequence,
  fromIndex: number,
  toIndex: number
): AnimationSequence {
  const steps = [...sequence.steps];
  if (fromIndex < 0 || fromIndex >= steps.length) return sequence;
  const target = Math.max(0, Math.min(steps.length - 1, toIndex));
  const [moved] = steps.splice(fromIndex, 1);
  steps.splice(target, 0, moved!);
  return normalizeSequence({ ...sequence, steps });
}

// ============================================================================
// Scheduling
// ============================================================================

/**
 * Resolve every step's start and end frame from its trigger and delay.
 * `timelineDuration` bounds loops that repeat until the end.
 */
export function scheduleSequence(
  sequence: AnimationSequence,
  timelineDuration: number = 0
): ScheduledStep[] {
  const scheduled: ScheduledStep[] = [];
  const byId = new Map<string, ScheduledStep>();

  for (const [index, step] of sequence.steps.entries()) {
    const previous = scheduled[index - 1];
    // Only earlier steps are in byId, so a missing or later target falls back
    // to the previous step.
    const target = step.targetStepId ? byId.get(step.targetStepId) : undefined;
    let anchor: number;
    switch (step.trigger) {
      case 'with':
        anchor = target ? target.start : (previous?.start ?? 0);
        break;
      case 'withPrevious':
        anchor = previous?.start ?? 0;
        break;
      case 'after':
        anchor = target ? target.release : (previous?.release ?? 0);
        break;
      case 'afterPrevious':
      default:
        anchor = previous?.release ?? 0;
        break;
    }

    const start = anchor + Math.max(0, Math.round(step.delay));
    const cycleFrames = getPresetDurationFrames(step.presetId, step.duration, step.intensity);
    const cycles =
      isLoopPreset(step.presetId) && typeof step.repeat === 'number'
        ? Math.max(1, Math.round(step.repeat))
        : 1;
    const end = start + cycleFrames * cycles;
    const entry: ScheduledStep = {
      stepId: step.id,
      number: index + 1,
      start,
      end,
      release: end,
      cycleFrames,
      cycles,
    };
    scheduled.push(entry);
    byId.set(step.id, entry);
  }

  // Loops repeating until the end fill whole cycles up to the last frame of the
  // timeline (or of the sequence, if it runs longer).
  const lastFrame = Math.max(timelineDuration - 1, ...scheduled.map((entry) => entry.end));
  for (const [index, step] of sequence.steps.entries()) {
    if (step.repeat !== 'untilEnd' || !isLoopPreset(step.presetId)) continue;
    const entry = scheduled[index]!;
    entry.cycles = Math.max(1, Math.floor((lastFrame - entry.start) / entry.cycleFrames));
    entry.end = entry.start + entry.cycleFrames * entry.cycles;
  }

  return scheduled;
}

// ============================================================================
// Compilation
// ============================================================================

function applyRestPose(node: Node, pose: SequenceRestPose | undefined): Node {
  if (!pose) return node;
  let posed = node;
  for (const [property, value] of Object.entries(pose)) {
    posed = setProperty(posed, property, value);
  }
  return posed;
}

/**
 * Render the sequence into the timeline. Keyframes from a previous compile are
 * removed first; each step then writes its preset keyframes, tagged with its
 * id, and owns its time range on the properties it animates (keyframes inside
 * that range are replaced). A track's first keyframe holds before it, so an
 * entrance effect keeps its object hidden until the step starts.
 */
export function compileAnimationSequence(
  timeline: Timeline,
  sequence: AnimationSequence,
  getNode: (nodeId: string) => Node | undefined
): Timeline {
  const tracks: PropertyTrack[] = timeline.tracks.map((track) => ({
    ...track,
    keyframes: track.keyframes.filter((keyframe) => keyframe.sequenceStepId === undefined),
  }));
  const findOrCreateTrack = (nodeId: string, property: string): PropertyTrack => {
    let track = tracks.find(
      (candidate) => candidate.nodeId === nodeId && candidate.property === property
    );
    if (!track) {
      track = createTrack(nodeId, property);
      tracks.push(track);
    }
    return track;
  };

  const schedule = scheduleSequence(sequence, timeline.duration);
  // Later-starting steps win where ranges overlap; list order breaks ties.
  const order = schedule
    .map((entry, index) => ({ entry, step: sequence.steps[index]! }))
    .sort((a, b) => a.entry.start - b.entry.start || a.entry.number - b.entry.number);

  let lastFrame = -1;
  for (const { entry, step } of order) {
    const node = getNode(step.nodeId);
    if (!node || !isPresetApplicable(step.presetId, node)) continue;
    const restNode = applyRestPose(node, sequence.restPoses[step.nodeId]);

    const generated: PresetKeyframe[] = [];
    for (let cycle = 0; cycle < entry.cycles; cycle++) {
      const { keyframes } = createAnimationPresetKeyframes(
        restNode,
        step.presetId,
        entry.start + cycle * entry.cycleFrames,
        step.duration,
        { direction: step.direction, intensity: step.intensity }
      );
      generated.push(...keyframes);
    }
    if (generated.length === 0) continue;

    for (const property of new Set(generated.map((keyframe) => keyframe.property))) {
      const track = findOrCreateTrack(step.nodeId, property);
      track.keyframes = track.keyframes.filter(
        (keyframe) => keyframe.time < entry.start || keyframe.time > entry.end
      );
    }
    for (const { property, time, value, easing } of generated) {
      const keyframe = addKeyframe(findOrCreateTrack(step.nodeId, property), time, value, easing);
      // Stable ids keep selection and React keys steady across recompiles.
      keyframe.id = `seq_${step.id}_${property}_${time}`;
      keyframe.sequenceStepId = step.id;
    }
    lastFrame = Math.max(lastFrame, entry.end);
  }

  return {
    ...timeline,
    duration: Math.max(timeline.duration, lastFrame + 1),
    tracks: tracks.filter((track) => track.keyframes.length > 0 || track.expression !== undefined),
  };
}
