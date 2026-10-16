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
  evaluateNodeAtFrame,
  getPresetBaseValue,
  isPresetApplicable,
  moveSequenceStep as moveStepInSequence,
  normalizeSequence,
  removeSequenceStep as removeStepFromSequence,
  setProperty,
  type AnimationPresetDirection,
  type AnimationPresetId,
  type AnimationSequence,
  type AnimationSequenceStep,
  type SequenceTrigger,
} from '@quar/animation';
import type { Node } from '@quar/types';
import type { EditorStore, SceneGraphLike } from './editorStore';

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
  /** Append one step per node (skipping nodes the preset can't animate); returns the new step ids. */
  addSequenceSteps: (
    sceneGraph: SceneGraphLike,
    nodeIds: string[],
    presetId: AnimationPresetId,
    options: SequenceStepOptions
  ) => string[];
  updateSequenceStep: (
    sceneGraph: SceneGraphLike,
    stepId: string,
    patch: SequenceStepPatch
  ) => void;
  removeSequenceStep: (sceneGraph: SceneGraphLike, stepId: string) => void;
  moveSequenceStep: (sceneGraph: SceneGraphLike, fromIndex: number, toIndex: number) => void;
}

type SequenceState = Pick<
  EditorStore,
  'timeline' | 'timelineDuration' | 'currentFrame' | 'animationSequence'
>;

type SequenceUpdate = Pick<
  EditorStore,
  'animationSequence' | 'timeline' | 'timelineDuration' | 'isDirty'
>;

let nextStepCounter = 1;

function generateStepId(): string {
  return `step-${Date.now().toString(36)}-${nextStepCounter++}`;
}

/** Properties outside the rest pose that presets animate. */
const REVEAL_PROPERTIES = ['visibleCharacters', 'strokeProgress'] as const;

/**
 * Compile `sequence` into the timeline and refresh every object it touches (or
 * touched): reset to the rest pose, then show the playhead frame — so an object
 * whose step was removed doesn't stay frozen mid-animation.
 */
export function applySequence(
  sceneGraph: SceneGraphLike,
  state: SequenceState,
  sequence: AnimationSequence
): SequenceUpdate {
  const timeline = compileAnimationSequence(state.timeline, sequence, (id) =>
    sceneGraph.getNode(id)
  );

  const nodeIds = new Set(
    [...state.animationSequence.steps, ...sequence.steps].map((step) => step.nodeId)
  );
  for (const nodeId of nodeIds) {
    const node = sceneGraph.getNode(nodeId);
    if (!node) continue;
    let next: Node = node;
    const pose = sequence.restPoses[nodeId] ?? state.animationSequence.restPoses[nodeId] ?? {};
    for (const [property, value] of Object.entries(pose)) {
      next = setProperty(next, property, value);
    }
    for (const property of REVEAL_PROPERTIES) {
      const value = getPresetBaseValue(next, property);
      if (value !== undefined) next = setProperty(next, property, value);
    }
    next = applyAnimatedValues(next, evaluateNodeAtFrame(timeline, nodeId, state.currentFrame));
    sceneGraph.updateNode(nodeId, next);
  }

  return {
    animationSequence: sequence,
    timeline,
    timelineDuration: Math.max(state.timelineDuration, timeline.duration),
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

export function createSequenceActions(
  set: (partial: Partial<EditorStore> | ((state: EditorStore) => Partial<EditorStore>)) => void,
  get: () => EditorStore
): SequenceActions {
  /** Record undo, then compile and show the edited sequence. Inactive while editing a symbol. */
  const commit = (
    sceneGraph: SceneGraphLike,
    edit: (sequence: AnimationSequence) => AnimationSequence
  ): boolean => {
    const state = get();
    if (state.editingSymbolId) return false;
    const sequence = edit(structuredClone(state.animationSequence));
    get().pushUndo(sceneGraph);
    set(applySequence(sceneGraph, get(), normalizeSequence(sequence)));
    return true;
  };

  return {
    animationSequence: createAnimationSequence(),

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

    removeSequenceStep: (sceneGraph, stepId) => {
      if (!get().animationSequence.steps.some((step) => step.id === stepId)) return;
      commit(sceneGraph, (sequence) => removeStepFromSequence(sequence, stepId));
    },

    moveSequenceStep: (sceneGraph, fromIndex, toIndex) => {
      const { steps } = get().animationSequence;
      if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= steps.length) return;
      commit(sceneGraph, (sequence) => moveStepInSequence(sequence, fromIndex, toIndex));
    },
  };
}
