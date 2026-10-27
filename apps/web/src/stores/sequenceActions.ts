/**
 * Animation Sequence store actions — the per-page, PowerPoint-style numbered
 * list of preset steps. The sequence is live-linked: every edit recompiles it
 * into the timeline and refreshes the affected objects at the playhead.
 */

import {
  applyAnimatedValues,
  captureRestPose,
  compileAnimationSequence,
  createAnimationSequence,
  createClipFromTracks,
  createTrack,
  evaluateNodeAtFrame,
  getPresetBaseValue,
  getProperty,
  isPresetApplicable,
  moveSequenceStep as moveStepInSequence,
  normalizeSequence,
  removeSequenceStep as removeStepFromSequence,
  restPoseForKeyframes,
  scheduleSequence,
  setProperty,
  SEQUENCE_REST_PROPERTIES,
  type AnimationPresetDirection,
  type AnimationPresetId,
  type AnimationSequence,
  type AnimationSequenceStep,
  type SequenceTrigger,
} from '@quar/animation';
import type { Keyframe, Node, PropertyTrack, Timeline } from '@quar/types';
import type { EditorStore, SceneGraphLike } from './editorStore';
import { lengthenedToFit } from './timelineLength';

export interface SequenceStepOptions {
  /** Frames per run of the effect. */
  duration: number;
  /** Frames to wait after the trigger point. */
  delay?: number;
  /** Trigger for the first added step; further objects start with it. */
  trigger?: SequenceTrigger;
  targetStepId?: string;
  /** Extra delay before each further object's step (they start together otherwise). */
  staggerFrames?: number;
  direction?: AnimationPresetDirection;
  intensity?: number;
  repeat?: number | 'untilEnd';
}

export type SequenceStepPatch = Partial<Omit<AnimationSequenceStep, 'id'>>;

export interface SequenceActions {
  /** The active page's Animation Sequence. */
  animationSequence: AnimationSequence;
  /** Whether the floating Animation Sequence window is shown. */
  sequenceWindowOpen: boolean;
  /** Step the window should scroll to and highlight (e.g. after clicking its keyframe). */
  focusedSequenceStepId: string | null;
  /** Open the sequence window at a step. */
  revealSequenceStep: (stepId: string) => void;
  setSequenceWindowOpen: (open: boolean) => void;
  toggleSequenceWindow: () => void;
  /** Append one step per node (skipping nodes the preset can't animate); returns the new step ids. */
  addSequenceSteps: (
    sceneGraph: SceneGraphLike,
    nodeIds: string[],
    presetId: AnimationPresetId,
    options: SequenceStepOptions
  ) => string[];
  /**
   * Turn each object's own (hand-made) keyframes into a clip step, timed to
   * start where the keyframes were. Returns the new step ids.
   */
  addClipSteps: (sceneGraph: SceneGraphLike, nodeIds: string[]) => string[];
  updateSequenceStep: (
    sceneGraph: SceneGraphLike,
    stepId: string,
    patch: SequenceStepPatch
  ) => void;
  /** Remove a step. A clip step's keyframes stay on the timeline as the user's own. */
  removeSequenceStep: (sceneGraph: SceneGraphLike, stepId: string) => void;
  moveSequenceStep: (sceneGraph: SceneGraphLike, fromIndex: number, toIndex: number) => void;
  /**
   * Fold edits the user made to sequenced objects (moving, scaling, ...) into
   * their rest poses, so the whole animation follows instead of snapping back.
   * `shownTimeline` at `shownFrame` is what the objects showed before the edit.
   * Returns true when the sequence changed.
   */
  absorbSequenceEdits: (
    sceneGraph: SceneGraphLike,
    shownTimeline: Timeline,
    shownFrame: number
  ) => boolean;
  /**
   * Absorb edits made since the playback hook last showed a frame (see
   * noteSequenceShown). Call before anything that would discard them: saving,
   * switching pages. No-op when the sequence was replaced since.
   */
  flushSequenceEdits: (sceneGraph: SceneGraphLike) => boolean;
}

/** What the canvas last showed, so later differences are known to be user edits. */
let lastShown: { timeline: Timeline; frame: number; sequence: AnimationSequence } | null = null;

/** Called by the playback hook whenever it applies a frame. */
export function noteSequenceShown(
  timeline: Timeline,
  frame: number,
  sequence: AnimationSequence
): void {
  lastShown = { timeline, frame, sequence };
}

type SequenceState = Pick<
  EditorStore,
  'timeline' | 'timelineDuration' | 'timelineScope' | 'currentFrame' | 'animationSequence'
>;

type SequenceUpdate = Pick<
  EditorStore,
  'animationSequence' | 'timeline' | 'timelineDuration' | 'isDirty'
>;

let nextStepCounter = 1;

function generateStepId(): string {
  return `step-${Date.now().toString(36)}-${nextStepCounter++}`;
}

/** Per node, the properties that carry sequence-generated keyframes. */
function sequenceAnimatedProperties(timeline: Timeline): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const track of timeline.tracks) {
    if (!track.keyframes.some((keyframe) => keyframe.sequenceStepId !== undefined)) continue;
    const properties = result.get(track.nodeId) ?? new Set<string>();
    properties.add(track.property);
    result.set(track.nodeId, properties);
  }
  return result;
}

/**
 * Compile `sequence` into the timeline and refresh the objects it animates (or
 * animated): their sequence-driven properties go back to the rest pose, then
 * the playhead frame is shown — so an object whose step was removed doesn't
 * stay frozen mid-animation. Properties the sequence never animated keep their
 * live values, so moving an object between edits doesn't snap it back.
 */
export function applySequence(
  sceneGraph: SceneGraphLike,
  state: SequenceState,
  sequence: AnimationSequence
): SequenceUpdate {
  const timeline = compileAnimationSequence(state.timeline, sequence, (id) =>
    sceneGraph.getNode(id)
  );

  const before = sequenceAnimatedProperties(state.timeline);
  const after = sequenceAnimatedProperties(timeline);
  for (const nodeId of new Set([...before.keys(), ...after.keys()])) {
    const node = sceneGraph.getNode(nodeId);
    if (!node) continue;
    const pose = sequence.restPoses[nodeId] ?? state.animationSequence.restPoses[nodeId] ?? {};
    let next: Node = node;
    for (const property of new Set([...(before.get(nodeId) ?? []), ...(after.get(nodeId) ?? [])])) {
      const value = pose[property] ?? getPresetBaseValue(node, property);
      if (value !== undefined) next = setProperty(next, property, value);
    }
    next = applyAnimatedValues(next, evaluateNodeAtFrame(timeline, nodeId, state.currentFrame));
    sceneGraph.updateNode(nodeId, next);
  }

  return {
    animationSequence: sequence,
    // Long enough for the steps: the timeline in view (an artboard's, or the page's)
    ...lengthenedToFit(state, timeline, sceneGraph),
    isDirty: true,
  };
}

/**
 * Drop the steps of objects that were deleted (or whose animation was removed)
 * and recompile the rest. Returns null when no step was affected.
 */
export function pruneSequenceSteps(
  sceneGraph: SceneGraphLike,
  state: SequenceState,
  removedNodeIds: Set<string> = new Set()
): SequenceUpdate | null {
  const { steps } = state.animationSequence;
  const kept = steps.filter(
    (step) => !removedNodeIds.has(step.nodeId) && sceneGraph.getNode(step.nodeId) !== undefined
  );
  if (kept.length === steps.length) return null;
  return applySequence(
    sceneGraph,
    state,
    normalizeSequence({ ...state.animationSequence, steps: kept })
  );
}

/** An object's own keyframes, per track (sequence keyframes left out). */
export function ownTracksOf(timeline: Timeline, nodeId: string): PropertyTrack[] {
  return timeline.tracks
    .filter((track) => track.nodeId === nodeId)
    .map((track) => ({
      ...track,
      keyframes: track.keyframes.filter((kf) => kf.sequenceStepId === undefined),
    }))
    .filter((track) => track.keyframes.length > 0);
}

const EDIT_EPSILON = 1e-6;

/**
 * Rest poses updated with what the user changed since `shownTimeline` was shown
 * at `shownFrame`, or null when nothing changed. A sequence-animated property
 * shifts its rest value by the edit (scale by the ratio, opacity clamped); an
 * un-animated property takes its live value. Properties animated only by the
 * user's own keyframes are left alone — they change every frame in playback.
 */
export function absorbedRestPoses(
  sceneGraph: SceneGraphLike,
  sequence: AnimationSequence,
  shownTimeline: Timeline,
  shownFrame: number
): AnimationSequence['restPoses'] | null {
  const animated = sequenceAnimatedProperties(shownTimeline);
  const tracked = new Set(
    shownTimeline.tracks.map((track) => `${track.nodeId}\u0000${track.property}`)
  );
  let changed = false;
  const restPoses: AnimationSequence['restPoses'] = {};
  for (const [nodeId, pose] of Object.entries(sequence.restPoses)) {
    const node = sceneGraph.getNode(nodeId);
    const next = { ...pose };
    restPoses[nodeId] = next;
    if (!node) continue;
    const shown = evaluateNodeAtFrame(shownTimeline, nodeId, shownFrame);
    for (const property of SEQUENCE_REST_PROPERTIES) {
      const live = getProperty(node, property);
      const rest = pose[property];
      if (typeof live !== 'number' || rest === undefined) continue;
      let value = rest;
      if (animated.get(nodeId)?.has(property)) {
        const expected = shown.get(property);
        if (typeof expected !== 'number' || Math.abs(live - expected) <= EDIT_EPSILON) continue;
        if (property.startsWith('transform.scale.')) {
          value = expected === 0 ? rest : rest * (live / expected);
        } else if (property === 'opacity') {
          value = Math.min(1, Math.max(0, rest + live - expected));
        } else {
          value = rest + live - expected;
        }
      } else if (!tracked.has(`${nodeId}\u0000${property}`)) {
        value = live;
      }
      if (Math.abs(value - rest) > EDIT_EPSILON) {
        next[property] = value;
        changed = true;
      }
    }
  }
  return changed ? restPoses : null;
}

export function createSequenceActions(
  set: (partial: Partial<EditorStore> | ((state: EditorStore) => Partial<EditorStore>)) => void,
  get: () => EditorStore
): SequenceActions {
  /** Record undo, then compile and show the edited sequence. Inactive while editing a symbol. */
  const commit = (
    sceneGraph: SceneGraphLike,
    edit: (sequence: AnimationSequence) => AnimationSequence
  ): boolean => {
    if (get().editingSymbolId) return false;
    // Keep edits made to sequenced objects since the playhead last moved
    const before = get();
    get().absorbSequenceEdits(sceneGraph, before.timeline, before.currentFrame);
    const state = get();
    const sequence = edit(structuredClone(state.animationSequence));
    get().pushUndo(sceneGraph);
    set(applySequence(sceneGraph, get(), normalizeSequence(sequence)));
    return true;
  };

  return {
    animationSequence: createAnimationSequence(),
    sequenceWindowOpen: false,
    focusedSequenceStepId: null,
    revealSequenceStep: (stepId) => {
      const step = get().animationSequence.steps.find((candidate) => candidate.id === stepId);
      if (!step) return;
      set({
        sequenceWindowOpen: true,
        focusedSequenceStepId: stepId,
        selectedNodeIds: new Set([step.nodeId]),
      });
    },
    setSequenceWindowOpen: (open) => set({ sequenceWindowOpen: open }),

    absorbSequenceEdits: (sceneGraph, shownTimeline, shownFrame) => {
      const state = get();
      if (state.editingSymbolId || state.animationSequence.steps.length === 0) return false;
      const restPoses = absorbedRestPoses(
        sceneGraph,
        state.animationSequence,
        shownTimeline,
        shownFrame
      );
      if (!restPoses) return false;
      set(applySequence(sceneGraph, state, { ...state.animationSequence, restPoses }));
      return true;
    },

    flushSequenceEdits: (sceneGraph) => {
      const shown = lastShown;
      if (!shown || shown.sequence !== get().animationSequence) return false;
      return get().absorbSequenceEdits(sceneGraph, shown.timeline, shown.frame);
    },
    toggleSequenceWindow: () => set({ sequenceWindowOpen: !get().sequenceWindowOpen }),

    addSequenceSteps: (sceneGraph, nodeIds, presetId, options) => {
      const nodes = nodeIds
        .map((id) => sceneGraph.getNode(id))
        .filter((node): node is Node => node !== undefined && isPresetApplicable(presetId, node));
      if (nodes.length === 0) return [];

      const added: string[] = [];
      const committed = commit(sceneGraph, (sequence) => {
        for (const [index, node] of nodes.entries()) {
          sequence.restPoses[node.id] ??= captureRestPose(node);
          const id = generateStepId();
          const first = index === 0;
          sequence.steps.push({
            id,
            nodeId: node.id,
            presetId,
            trigger: first ? (options.trigger ?? 'afterPrevious') : 'withPrevious',
            ...(first && options.targetStepId ? { targetStepId: options.targetStepId } : {}),
            delay: first ? (options.delay ?? 0) : (options.staggerFrames ?? 0),
            duration: options.duration,
            ...(options.direction ? { direction: options.direction } : {}),
            ...(options.intensity !== undefined ? { intensity: options.intensity } : {}),
            ...(options.repeat !== undefined ? { repeat: options.repeat } : {}),
          });
          added.push(id);
        }
        return sequence;
      });
      return committed ? added : [];
    },

    updateSequenceStep: (sceneGraph, stepId, patch) => {
      if (!get().animationSequence.steps.some((step) => step.id === stepId)) return;
      commit(sceneGraph, (sequence) => {
        sequence.steps = sequence.steps.map((step) =>
          step.id === stepId ? { ...step, ...patch } : step
        );
        const nodeId = patch.nodeId;
        const node = nodeId ? sceneGraph.getNode(nodeId) : undefined;
        if (nodeId && node) sequence.restPoses[nodeId] ??= captureRestPose(node);
        return sequence;
      });
    },

    addClipSteps: (sceneGraph, nodeIds) => {
      if (get().editingSymbolId) return [];
      const before = get();
      before.absorbSequenceEdits(sceneGraph, before.timeline, before.currentFrame);
      const state = get();
      const sequence = structuredClone(state.animationSequence);

      const clips: Array<{ nodeId: string; id: string; start: number; length: number }> = [];
      const captured = new Set<string>();
      for (const nodeId of nodeIds) {
        const node = sceneGraph.getNode(nodeId);
        const tracks = ownTracksOf(state.timeline, nodeId);
        if (!node || tracks.length === 0) continue;
        sequence.restPoses[nodeId] ??= restPoseForKeyframes(node, tracks);
        const result = createClipFromTracks(tracks, sequence.restPoses[nodeId]);
        if (!result) continue;
        const id = generateStepId();
        sequence.steps.push({
          id,
          nodeId,
          clip: result.clip,
          trigger: 'afterPrevious',
          delay: 0,
          duration: Math.max(1, result.clip.length),
        });
        clips.push({ nodeId, id, start: result.start, length: result.clip.length });
        for (const track of tracks) for (const kf of track.keyframes) captured.add(kf.id);
      }
      if (clips.length === 0) return [];

      // Keep the keyframes where they were. The earliest clip follows the
      // sequence so far — or, if it starts during an earlier step, starts with
      // that step plus a delay; the other clips start with it.
      clips.sort((a, b) => a.start - b.start);
      const first = clips[0]!;
      const existing = sequence.steps.filter((step) => !clips.some((c) => c.id === step.id));
      const schedule = scheduleSequence({ ...sequence, steps: existing }, state.timeline.duration);
      const previous = schedule.at(-1);
      const anchor = schedule
        .filter((entry) => entry.start <= first.start)
        .sort((a, b) => b.start - a.start)[0];
      for (const clip of clips) {
        const step = sequence.steps.find((candidate) => candidate.id === clip.id);
        if (!step) continue;
        if (clip !== first) {
          step.trigger = 'with';
          step.targetStepId = first.id;
          step.delay = clip.start - first.start;
        } else if (!previous || previous.release <= clip.start || !anchor) {
          step.delay = Math.max(0, clip.start - (previous?.release ?? 0));
        } else if (anchor === previous) {
          step.trigger = 'withPrevious';
          step.delay = clip.start - anchor.start;
        } else {
          step.trigger = 'with';
          step.targetStepId = anchor.stepId;
          step.delay = clip.start - anchor.start;
        }
      }
      // Clip steps go in time order after the existing steps
      const clipIds = clips.map((clip) => clip.id);
      sequence.steps = [
        ...sequence.steps.filter((step) => !clipIds.includes(step.id)),
        ...clipIds.flatMap((id) => sequence.steps.filter((step) => step.id === id)),
      ];

      get().pushUndo(sceneGraph);
      // The captured keyframes come back as the clip's (tagged) keyframes
      const timeline: Timeline = {
        ...state.timeline,
        tracks: state.timeline.tracks.map((track) => ({
          ...track,
          keyframes: track.keyframes.filter((kf) => !captured.has(kf.id)),
        })),
      };
      set(applySequence(sceneGraph, { ...get(), timeline }, normalizeSequence(sequence)));
      return clipIds;
    },

    removeSequenceStep: (sceneGraph, stepId) => {
      const step = get().animationSequence.steps.find((candidate) => candidate.id === stepId);
      if (!step) return;
      // A clip is the user's own work: its keyframes stay where they are now
      const baked = step.clip
        ? get()
            .timeline.tracks.filter((track) => track.nodeId === step.nodeId)
            .flatMap((track) =>
              track.keyframes
                .filter((kf) => kf.sequenceStepId === stepId)
                .map((kf) => ({ property: track.property, keyframe: kf }))
            )
        : [];
      if (!commit(sceneGraph, (sequence) => removeStepFromSequence(sequence, stepId))) return;
      if (baked.length === 0) return;

      const state = get();
      const tracks = state.timeline.tracks.map((track) => ({
        ...track,
        keyframes: [...track.keyframes],
      }));
      for (const { property, keyframe } of baked) {
        let track = tracks.find((t) => t.nodeId === step.nodeId && t.property === property);
        if (!track) {
          track = createTrack(step.nodeId, property);
          tracks.push(track);
        }
        // Never overwrite a remaining step's keyframe
        if (track.keyframes.some((kf) => kf.time === keyframe.time)) continue;
        const { sequenceStepId: _owner, ...own } = keyframe;
        const restored: Keyframe = { ...own, id: `kf_${stepId}_${property}_${keyframe.time}` };
        track.keyframes.push(restored);
        track.keyframes.sort((a, b) => a.time - b.time);
      }
      const timeline = { ...state.timeline, tracks };
      const node = sceneGraph.getNode(step.nodeId);
      if (node) {
        sceneGraph.updateNode(
          step.nodeId,
          applyAnimatedValues(node, evaluateNodeAtFrame(timeline, step.nodeId, state.currentFrame))
        );
      }
      set({ timeline });
    },

    moveSequenceStep: (sceneGraph, fromIndex, toIndex) => {
      const { steps } = get().animationSequence;
      if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= steps.length) return;
      commit(sceneGraph, (sequence) => moveStepInSequence(sequence, fromIndex, toIndex));
    },
  };
}
