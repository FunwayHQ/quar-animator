/**
 * Animation Sequence — a PowerPoint-style numbered list of preset effects and
 * clips of the user's own keyframes.
 *
 * Each step starts after or with the previous step (or a chosen earlier step),
 * plus a delay. The sequence compiles into ordinary timeline keyframes tagged
 * with their step id; every compile replaces all tagged keyframes, so the
 * timeline always mirrors the sequence.
 */

import type {
  EasingFunction,
  Keyframe,
  Node,
  PropertyTrack,
  TangentMode,
  Timeline,
  Vector2,
} from '@quar/types';
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

/** How a clip track's values relate to the object's rest pose. */
export type ClipValueMode =
  /** Added to the rest value (position, rotation, opacity). */
  | 'offset'
  /** Multiplied with the rest value (scale). */
  | 'ratio'
  /** Used as-is (colors, sizes, path points, ...). */
  | 'absolute';

export interface SequenceClipKeyframe {
  /** Frames from the start of the clip. */
  time: number;
  value: unknown;
  easing: EasingFunction;
  tangentIn?: Vector2;
  tangentOut?: Vector2;
  tangentMode?: TangentMode;
}

export interface SequenceClipTrack {
  property: string;
  mode: ClipValueMode;
  keyframes: SequenceClipKeyframe[];
}

/** The user's own keyframes for one object, captured as a schedulable step. */
export interface SequenceClip {
  tracks: SequenceClipTrack[];
  /** Frames from the first to the last keyframe. */
  length: number;
}

export interface AnimationSequenceStep {
  id: string;
  nodeId: string;
  /** The preset effect — absent for a clip step. */
  presetId?: AnimationPresetId;
  /** The user's own keyframes — present only for a clip step. */
  clip?: SequenceClip;
  trigger: SequenceTrigger;
  /** The earlier step an 'after' / 'with' trigger is timed against. */
  targetStepId?: string;
  /** Frames to wait after the trigger point. */
  delay: number;
  /** Requested length of one run of the effect, in frames (a clip is stretched to it). */
  duration: number;
  direction?: AnimationPresetDirection;
  intensity?: number;
  /** Loop presets and clips: number of runs, or repeat until the timeline ends. */
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

/** Loop presets and clips can repeat. */
export function isRepeatableStep(step: AnimationSequenceStep): boolean {
  if (step.clip) return true;
  return ANIMATION_PRESETS.find((preset) => preset.id === step.presetId)?.category === 'Loop';
}

function stepCycleFrames(step: AnimationSequenceStep): number {
  if (step.clip || !step.presetId) return Math.max(1, Math.round(step.duration));
  return getPresetDurationFrames(step.presetId, step.duration, step.intensity);
}

// ============================================================================
// Clips of the user's own keyframes
// ============================================================================

function clipValueMode(property: string, rest: number | undefined, value: unknown): ClipValueMode {
  if (typeof value !== 'number' || rest === undefined) return 'absolute';
  if (property.startsWith('transform.scale.')) return rest === 0 ? 'offset' : 'ratio';
  return (SEQUENCE_REST_PROPERTIES as readonly string[]).includes(property) ? 'offset' : 'absolute';
}

function toClipValue(mode: ClipValueMode, value: unknown, rest: number | undefined): unknown {
  if (mode === 'offset') return (value as number) - (rest ?? 0);
  if (mode === 'ratio') return (value as number) / (rest ?? 1);
  return value;
}

/** A clip value turned back into a keyframe value for the given rest value. */
export function fromClipValue(
  mode: ClipValueMode,
  value: unknown,
  rest: number | undefined
): unknown {
  if (mode === 'offset') return (rest ?? 0) + (value as number);
  if (mode === 'ratio') return (rest ?? 1) * (value as number);
  return value;
}

/**
 * The rest pose for an object whose own keyframes become a clip: where its
 * animation starts for the properties the keyframes animate, its current values
 * for the rest.
 */
export function restPoseForKeyframes(node: Node, tracks: PropertyTrack[]): SequenceRestPose {
  const pose = captureRestPose(node);
  for (const track of tracks) {
    const first = track.keyframes[0];
    if (first && typeof first.value === 'number' && track.property in pose) {
      pose[track.property] = first.value;
    }
  }
  return pose;
}

/**
 * Capture keyframes (one object's own tracks) as a clip whose values are stored
 * relative to `restPose`, so moving the object later moves the clip too.
 * Returns null when there are no keyframes.
 */
export function createClipFromTracks(
  tracks: PropertyTrack[],
  restPose: SequenceRestPose
): { clip: SequenceClip; start: number } | null {
  const withKeyframes = tracks.filter((track) => track.keyframes.length > 0);
  if (withKeyframes.length === 0) return null;
  const times = withKeyframes.flatMap((track) => track.keyframes.map((kf) => kf.time));
  const start = Math.min(...times);
  const clipTracks = withKeyframes.map((track): SequenceClipTrack => {
    const rest = restPose[track.property];
    const mode = clipValueMode(track.property, rest, track.keyframes[0]!.value);
    return {
      property: track.property,
      mode,
      keyframes: track.keyframes.map((kf: Keyframe) => ({
        time: kf.time - start,
        value: toClipValue(mode, kf.value, rest),
        easing: kf.easing,
        ...(kf.tangentIn ? { tangentIn: kf.tangentIn } : {}),
        ...(kf.tangentOut ? { tangentOut: kf.tangentOut } : {}),
        ...(kf.tangentMode ? { tangentMode: kf.tangentMode } : {}),
      })),
    };
  });
  return { clip: { tracks: clipTracks, length: Math.max(...times) - start }, start };
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
  if (!moved) return sequence;
  steps.splice(target, 0, moved);
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
    const cycleFrames = stepCycleFrames(step);
    const cycles =
      isRepeatableStep(step) && typeof step.repeat === 'number'
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
    if (step.repeat !== 'untilEnd' || !isRepeatableStep(step)) continue;
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

type GeneratedKeyframe = PresetKeyframe & {
  value: unknown;
  tangentIn?: Vector2;
  tangentOut?: Vector2;
  tangentMode?: TangentMode;
};

/** A clip step's keyframes for one run starting at `start`, stretched to the step's duration. */
function clipKeyframes(
  clip: SequenceClip,
  start: number,
  duration: number,
  pose: SequenceRestPose
): GeneratedKeyframe[] {
  const timeScale = clip.length > 0 ? Math.max(1, Math.round(duration)) / clip.length : 1;
  const generated: GeneratedKeyframe[] = [];
  for (const track of clip.tracks) {
    const rest = pose[track.property];
    const valueScale = track.mode === 'ratio' ? (rest ?? 1) : 1;
    for (const kf of track.keyframes) {
      generated.push({
        property: track.property,
        time: start + Math.round(kf.time * timeScale),
        value: fromClipValue(track.mode, kf.value, rest) as number,
        easing: kf.easing,
        ...(kf.tangentIn
          ? { tangentIn: { x: kf.tangentIn.x * timeScale, y: kf.tangentIn.y * valueScale } }
          : {}),
        ...(kf.tangentOut
          ? { tangentOut: { x: kf.tangentOut.x * timeScale, y: kf.tangentOut.y * valueScale } }
          : {}),
        ...(kf.tangentMode ? { tangentMode: kf.tangentMode } : {}),
      });
    }
  }
  return generated;
}

/**
 * Render the sequence into the timeline. Keyframes from a previous compile are
 * removed first; each step then writes its keyframes, tagged with its id, and
 * owns its time range on the properties it animates (keyframes inside that
 * range are replaced). A track's first keyframe holds before it, so an
 * entrance effect keeps its object hidden until the step starts. A preset
 * starting after a clip of the same object starts from where the clip left it.
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

  // Per node: where each property was left by the latest clip, and when
  const clipEnds = new Map<string, Map<string, { end: number; value: unknown }>>();

  let lastFrame = -1;
  for (const { entry, step } of order) {
    const node = getNode(step.nodeId);
    if (!node) continue;
    const pose = sequence.restPoses[step.nodeId] ?? {};
    const generated: GeneratedKeyframe[] = [];

    if (step.clip) {
      for (let cycle = 0; cycle < entry.cycles; cycle++) {
        generated.push(
          ...clipKeyframes(step.clip, entry.start + cycle * entry.cycleFrames, step.duration, pose)
        );
      }
      const ends = clipEnds.get(step.nodeId) ?? new Map();
      for (const keyframe of generated) {
        const current = ends.get(keyframe.property);
        if (!current || keyframe.time >= current.end) {
          ends.set(keyframe.property, { end: keyframe.time, value: keyframe.value });
        }
      }
      clipEnds.set(step.nodeId, ends);
    } else {
      if (!step.presetId || !isPresetApplicable(step.presetId, node)) continue;
      let restNode = applyRestPose(node, pose);
      for (const [property, { end, value }] of clipEnds.get(step.nodeId) ?? []) {
        if (end <= entry.start) restNode = setProperty(restNode, property, value);
      }
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
    }
    if (generated.length === 0) continue;

    for (const property of new Set(generated.map((keyframe) => keyframe.property))) {
      const track = findOrCreateTrack(step.nodeId, property);
      track.keyframes = track.keyframes.filter(
        (keyframe) => keyframe.time < entry.start || keyframe.time > entry.end
      );
    }
    for (const { property, time, value, easing, tangentIn, tangentOut, tangentMode } of generated) {
      const keyframe = addKeyframe(findOrCreateTrack(step.nodeId, property), time, value, easing);
      // Stable ids keep selection and React keys steady across recompiles.
      keyframe.id = `seq_${step.id}_${property}_${time}`;
      keyframe.sequenceStepId = step.id;
      if (tangentIn) keyframe.tangentIn = tangentIn;
      if (tangentOut) keyframe.tangentOut = tangentOut;
      if (tangentMode) keyframe.tangentMode = tangentMode;
    }
    lastFrame = Math.max(lastFrame, entry.end);
  }

  return {
    ...timeline,
    duration: Math.max(timeline.duration, lastFrame + 1),
    tracks: tracks.filter((track) => track.keyframes.length > 0 || track.expression !== undefined),
  };
}
