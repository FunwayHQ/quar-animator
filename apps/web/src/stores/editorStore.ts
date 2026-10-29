/**
 * Editor Store for Quar Animator
 * Manages editor state using Zustand
 */

import { create } from 'zustand';
import type {
  ToolType,
  Fill,
  Stroke,
  Color,
  Keyframe,
  Node,
  PathNode,
  PathPoint,
  RectangleNode,
  EllipseNode,
  PolygonNode,
  GroupNode,
  Timeline,
  EasingFunction,
  Effect,
  EffectType,
  BlendMode,
  BrushProfile,
  IKChain,
  IKTargetNode,
  BoneNode,
  SmartBoneAction,
  MorphVertexOffset,
  VitruvianController,
  DynamicChain,
  WindSettings,
  SymbolDefinition,
  SymbolOverride,
  SymbolInstanceNode,
  MaskMode,
  SkinData,
  BoneGroup,
  Matrix3,
  SoundClip,
} from '@quar/types';
import type { AnimationSequence, KeyframeClipboard, GraphViewTransform } from '@quar/animation';
import {
  createAnimationSequence,
  createTimeline,
  KeyframeManager,
  openingScope,
  scopeDuration,
  tangentsToEasing,
  tracksAfterListItemRemoved,
  withScopeDuration,
} from '@quar/animation';
import {
  applySequence,
  createSequenceActions,
  pruneSequenceSteps,
  type SequenceActions,
} from './sequenceActions';
import { createSoundActions, type SoundActions } from './soundActions';
import { createVideoActions, type VideoActions } from './videoActions';
import { createVideoClipActions, type VideoClipActions } from './videoClipActions';
import { keepVideoFiles } from '../services/videoFiles';
import { deleteVideoSoundsToo } from '../services/videoSoundQuestion';
import { soundsLinkedToRemoved, withLinkedSoundsResolved } from './videoSounds';
import { createTransitionActions, type TransitionActions } from './transitionActions';
import {
  captureClipboardExtras,
  cleanupAfterRemoval,
  pastedRigging,
  remapSkinData,
  type ClipboardExtras,
} from './clipboardRig';
import {
  applyPlacement,
  mapPlacement,
  multiply6,
  placementOf,
  remapPlacementTimeline,
  remapRestPose,
  reparentMatrix,
  reparentRestPose,
  reparentTimeline,
  type Placement,
} from './reparent';
import { flipInParentSpace, flipMatrix, flipPlacement, type FlipAxis } from './flip';
import { symbolsUsedBy, type ClipboardPayload } from '../services/systemClipboard';
import { withBuiltInProfiles } from '../services/brushProfiles';
import { canvasViewCenter } from '../services/canvasView';
import { pastedArtboardTimelines, pastedTracks, type RootMove } from './clipboardAnimation';
import {
  closedContour,
  closedShapeTracks,
  hasPointAnimation,
  joinedContours,
  reversedContours,
  reversedTracks,
  simplifiedContours,
  strokeForOpening,
  tracksForCopy,
} from './pathCommands';
import { shapeTracksToOutline } from './shapeToPathAnimation';

/** The selected layers that are unlocked paths. */
function selectedPaths(sceneGraph: SceneGraphLike, ids: Set<string>): PathNode[] {
  return [...ids]
    .map((id) => sceneGraph.getNode(id))
    .filter((node): node is PathNode => node?.type === 'path' && !node.locked);
}
import {
  DEFAULT_ONION_SKIN_SETTINGS,
  DEFAULT_DOCUMENT_BACKGROUND,
  createGroupNode,
  booleanOperation,
  convertTextToPathGroup as convertTextToPathGroupFn,
  outlineStroke as outlineStrokeFn,
  generateBrushOutline,
  reshapedBrushStroke,
  tessellatePathToPoints,
  getShapeOutlinePoints,
  invalidateSymbolCache,
  resolveSymbolInstance,
  cutContour,
  mat3,
  artboardAt,
} from '@quar/core';
import type { OnionSkinSettings, BooleanOp, SceneGraph } from '@quar/core';
import { applySkinSnapshots, DEFAULT_WIND_SETTINGS } from '@quar/rigging';
import { toast } from '../components/common/Toast';
import { skinBinding, type BindOptions } from '../components/canvas/bindToBones';

// ============================================================================
// SceneGraph Interface (subset used by store operations)
// ============================================================================

export interface SceneGraphLike {
  getNode(id: string): Node | undefined;
  getRootNodes(): Node[];
  addNode(node: Node, parentId?: string): void;
  removeNode(id: string): void;
  updateNode(id: string, updates: Partial<Node>): void;
  moveNode(id: string, newParentId: string | null, index?: number): void;
  getDescendants(id: string): Node[];
  traverse(callback: (node: Node, depth: number) => boolean | void): void;
  getWorldTransform(id: string): import('@quar/types').Matrix3;
  toJSON(): { nodes: Node[]; rootNodeIds: string[] };
  fromJSON(data: { nodes: Node[]; rootNodeIds: string[] }): void;
}

// ============================================================================
// Undo/Redo History
// ============================================================================

const MAX_UNDO_STACK_SIZE = 50;

// Keyframes an Animation Sequence step owns are regenerated on every sequence
// edit, so direct edits to them are refused (they would silently revert).
function trackKeyframes(timeline: Timeline, nodeId: string, property: string): Keyframe[] {
  return (
    timeline.tracks.find((track) => track.nodeId === nodeId && track.property === property)
      ?.keyframes ?? []
  );
}

function isManagedAt(timeline: Timeline, nodeId: string, property: string, time: number) {
  return trackKeyframes(timeline, nodeId, property).some(
    (kf) => kf.time === time && kf.sequenceStepId !== undefined
  );
}

function isManagedId(timeline: Timeline, nodeId: string, property: string, keyframeId: string) {
  return trackKeyframes(timeline, nodeId, property).some(
    (kf) => kf.id === keyframeId && kf.sequenceStepId !== undefined
  );
}

interface HistorySnapshot {
  sceneData: { nodes: Node[]; rootNodeIds: string[] };
  selectedNodeIds: string[];
  // Timeline + rigging arrays are mutated by delete/cut (removeAllKeyframesForNode,
  // chain filtering) but live outside the SceneGraph, so undo/redo must snapshot
  // and restore them too or they are lost permanently (F026).
  timeline: Timeline;
  animationSequence: AnimationSequence;
  ikChains: IKChain[];
  smartBoneActions: SmartBoneAction[];
  dynamicChains: DynamicChain[];
  vitruvianControllers: VitruvianController[];
  /**
   * Symbols the step this snapshot undoes (or redoes) added to the library —
   * Create Symbol's, a paste's from another project — taken out on undo, put
   * back on redo.
   * (The library isn't in snapshots: symbol editing keeps its own history.)
   */
  symbolsAdded?: SymbolDefinition[];
  /**
   * Symbols the step deleted from the library (Delete Symbol), and where in
   * it they were: put back on undo, deleted again on redo.
   */
  symbolsRemoved?: Array<{ index: number; symbol: SymbolDefinition }>;
  /**
   * Document-wide settings the step changed, as they were before it: put back
   * on undo, and the step that redoes it holds them as they were undone.
   * (Snapshots don't hold them: a page's history would undo another's.)
   */
  settings?: StepSettings;
}

/** Document-wide settings, by their store fields. */
interface StepSettings {
  documentBackground?: Color;
  globalWind?: WindSettings;
  /** Every page's timeline runs at it (see atFrameRate) */
  frameRate?: number;
}

/** These settings as they are now. */
function settingsNow(state: EditorStore, keys: Array<keyof StepSettings>): StepSettings {
  const now: StepSettings = {};
  for (const key of keys) Object.assign(now, { [key]: structuredClone(state[key]) });
  return now;
}

/** The settings an undo step changed. */
function settingKeys(settings: StepSettings): Array<keyof StepSettings> {
  return Object.keys(settings) as Array<keyof StepSettings>;
}

/**
 * Make a change to a document-wide setting an undo step: push one (or join
 * the edit's) and note the setting as it was, for undo to put back.
 */
function pushSettingUndo(
  get: () => EditorStore,
  sceneGraph: SceneGraphLike,
  key: keyof StepSettings
) {
  get().pushUndo(sceneGraph);
  const state = get();
  const step = state.undoStack[state.undoStack.length - 1];
  if (!step || (step.settings && key in step.settings)) return;
  step.settings = { ...step.settings, ...settingsNow(state, [key]) };
}

/**
 * The settings a step changed back as they were; the step that takes its
 * place (redo for undo, and back) holds them as they are now.
 */
function restoredSettings(
  snapshot: HistorySnapshot,
  now: HistorySnapshot,
  state: EditorStore
): StepSettings {
  if (!snapshot.settings) return {};
  now.settings = settingsNow(state, settingKeys(snapshot.settings));
  return structuredClone(snapshot.settings);
}

/**
 * The library as it was before a step: the symbols it brought in taken out,
 * those it deleted put back where they were. Null when it changed neither.
 */
function libraryBefore(
  symbols: SymbolDefinition[],
  step: HistorySnapshot
): SymbolDefinition[] | null {
  const added = new Set((step.symbolsAdded ?? []).map((symbol) => symbol.id));
  const removed = [...(step.symbolsRemoved ?? [])].sort((a, b) => a.index - b.index);
  if (added.size === 0 && removed.length === 0) return null;
  const library = symbols.filter((symbol) => !added.has(symbol.id));
  for (const { index, symbol } of removed) {
    if (library.some((s) => s.id === symbol.id)) continue;
    library.splice(Math.min(index, library.length), 0, structuredClone(symbol));
    invalidateSymbolCache(symbol.id);
  }
  return library;
}

/** The library as a step left it (its redo): what it deleted gone, what it brought in back. */
function libraryAfter(
  symbols: SymbolDefinition[],
  step: HistorySnapshot
): SymbolDefinition[] | null {
  const removed = new Set((step.symbolsRemoved ?? []).map(({ symbol }) => symbol.id));
  const added = step.symbolsAdded ?? [];
  if (removed.size === 0 && added.length === 0) return null;
  for (const id of removed) invalidateSymbolCache(id);
  const present = new Set(symbols.map((symbol) => symbol.id));
  return [
    ...symbols.filter((symbol) => !removed.has(symbol.id)),
    ...structuredClone(added.filter((symbol) => !present.has(symbol.id))),
  ];
}

/** The step taking a step's place (redo for undo, and back) changes the library alike. */
function carryLibraryChanges(step: HistorySnapshot, now: HistorySnapshot) {
  if (step.symbolsAdded?.length) now.symbolsAdded = step.symbolsAdded;
  if (step.symbolsRemoved?.length) now.symbolsRemoved = step.symbolsRemoved;
}

/** The step the code running now pushed (forgotten once it has run). */
let pushedNow: HistorySnapshot | null = null;

/**
 * An undo group, from beginUndoGroup(): the edits made while it's open — a
 * drag, typing in a field — are one undo step.
 */
export interface UndoGroup {
  /** False once it has ended, or another group began in its place. */
  readonly open: boolean;
}

interface OpenUndoGroup extends UndoGroup {
  open: boolean;
  /** The step it pushed: later pushes join it while it's on top of the stack. */
  step: HistorySnapshot | null;
}

let undoGroup: OpenUndoGroup | null = null;

function closeUndoGroup() {
  if (undoGroup) undoGroup.open = false;
  undoGroup = null;
}

interface HistoryCapturable {
  selectedNodeIds: Set<string>;
  timeline: Timeline;
  animationSequence: AnimationSequence;
  ikChains: IKChain[];
  smartBoneActions: SmartBoneAction[];
  dynamicChains: DynamicChain[];
  vitruvianControllers: VitruvianController[];
}

function makeHistorySnapshot(
  sceneGraph: SceneGraphLike,
  state: HistoryCapturable
): HistorySnapshot {
  return {
    sceneData: structuredClone(sceneGraph.toJSON()),
    selectedNodeIds: Array.from(state.selectedNodeIds),
    timeline: structuredClone(state.timeline),
    animationSequence: structuredClone(state.animationSequence),
    ikChains: structuredClone(state.ikChains),
    smartBoneActions: structuredClone(state.smartBoneActions),
    dynamicChains: structuredClone(state.dynamicChains),
    vitruvianControllers: structuredClone(state.vitruvianControllers),
  };
}

/**
 * Remove layers (and their descendants) with everything that depended on
 * them: keyframe tracks, sequence steps, and rigging — IK chains (and their
 * now inert targets), dynamic chains and Smart Bone actions that lost a bone,
 * Vitruvian group members, and bones in other meshes' bindings (a mesh left
 * with no bones is unbound). Returns the store update; callers record undo.
 */
function removeLayers(
  sceneGraph: SceneGraphLike,
  ids: Set<string>,
  state: EditorStore
): Partial<EditorStore> {
  const removed = new Set<string>();
  for (const id of ids) {
    if (!sceneGraph.getNode(id)) continue;
    removed.add(id);
    for (const descendant of sceneGraph.getDescendants(id)) removed.add(descendant.id);
  }
  const remaining: Node[] = [];
  sceneGraph.traverse((node) => {
    if (!removed.has(node.id)) remaining.push(node);
  });
  const cleanup = cleanupAfterRemoval(removed, state, remaining);
  for (const target of cleanup.orphanedTargets) {
    removed.add(target);
    for (const descendant of sceneGraph.getDescendants(target)) removed.add(descendant.id);
  }

  const timeline = state.timeline;
  const mgr = new KeyframeManager(timeline);
  for (const id of removed) mgr.removeAllKeyframesForNode(id);
  for (const id of [...ids, ...cleanup.orphanedTargets]) {
    if (sceneGraph.getNode(id)) sceneGraph.removeNode(id);
  }
  for (const { nodeId, skinData } of cleanup.skinUpdates) {
    sceneGraph.updateNode(nodeId, { skinData } as Partial<Node>);
  }
  // Drop sequence steps of deleted objects (incl. group descendants)
  const sequenceUpdate = pruneSequenceSteps(sceneGraph, { ...state, timeline });
  return {
    selectedNodeIds: new Set<string>(),
    editingGradient: null,
    timeline: { ...timeline },
    ...sequenceUpdate,
    isDirty: true,
    ikChains: cleanup.ikChains,
    dynamicChains: cleanup.dynamicChains,
    smartBoneActions: cleanup.smartBoneActions,
    vitruvianControllers: cleanup.vitruvianControllers,
  };
}

/**
 * Rigging is kept for the whole project, but each page has its own undo
 * history: restore a snapshot's rigging only for this page's layers (those in
 * the scene now or in the snapshot), and keep other pages' rigging as it is.
 * Entries that reference no layers come from the snapshot.
 */
function pageScoped<T>(
  restored: T[],
  current: T[],
  layersOf: (entry: T) => string[],
  pageLayerIds: Set<string>
): T[] {
  const onPage = (entry: T) => {
    const ids = layersOf(entry);
    return ids.length === 0 || ids.some((id) => pageLayerIds.has(id));
  };
  return [...structuredClone(restored).filter(onPage), ...current.filter((e) => !onPage(e))];
}

/** Store fields to restore from a popped history snapshot (F026). */
function restoredFieldsFrom(
  snapshot: HistorySnapshot,
  current: HistoryCapturable &
    Pick<
      EditorStore,
      'timelineScope' | 'frameRate' | 'timelineDuration' | 'workAreaStart' | 'workAreaEnd'
    >,
  currentScene: { nodes: Node[] }
) {
  // The frame rate is the document's, not the page's: it stays as it is,
  // unless the step changed it (its settings, restoredSettings)
  const timeline = { ...structuredClone(snapshot.timeline), frameRate: current.frameRate };
  const pageLayerIds = new Set([
    ...currentScene.nodes.map((node) => node.id),
    ...snapshot.sceneData.nodes.map((node) => node.id),
  ]);
  // The timeline in view stays so; its length as it was then, and the work area inside it
  const timelineDuration = scopeDuration(timeline, current.timelineScope);
  return {
    selectedNodeIds: new Set(snapshot.selectedNodeIds),
    timeline,
    timelineDuration,
    ...workAreaFor(timelineDuration, current),
    frameRate: current.frameRate,
    animationSequence: structuredClone(snapshot.animationSequence ?? createAnimationSequence()),
    ikChains: pageScoped(
      snapshot.ikChains,
      current.ikChains,
      (chain) => [chain.rootBoneId, chain.endEffectorBoneId, chain.targetNodeId],
      pageLayerIds
    ),
    smartBoneActions: pageScoped(
      snapshot.smartBoneActions,
      current.smartBoneActions,
      (action) => [action.driver.boneId],
      pageLayerIds
    ),
    dynamicChains: pageScoped(
      snapshot.dynamicChains,
      current.dynamicChains,
      (chain) => [chain.rootBoneId, ...chain.boneIds],
      pageLayerIds
    ),
    vitruvianControllers: pageScoped(
      snapshot.vitruvianControllers,
      current.vitruvianControllers,
      (controller) => controller.groups.flatMap((group) => group.boneIds),
      pageLayerIds
    ),
  };
}

/**
 * Everything a popped step puts back: the page as its snapshot has it, and
 * the document-wide settings the step changed (a frame rate on every page).
 */
function restoredState(snapshot: HistorySnapshot, now: HistorySnapshot, state: EditorStore) {
  const fields = restoredFieldsFrom(snapshot, state, now.sceneData);
  const settings = restoredSettings(snapshot, now, state);
  const { frameRate } = settings;
  return {
    ...fields,
    ...settings,
    ...(frameRate !== undefined
      ? atFrameRate(frameRate, { timeline: fields.timeline, pages: state.pages })
      : {}),
  };
}

/**
 * Clone a fully-resolved symbol subtree (definition roots + ALL descendants)
 * into the scene graph under newParentId, remapping every id and rewriting
 * parent/children so no dangling references remain (F028). Adds nodes parent-
 * first (addNode wires each into its parent's children). Returns the new root
 * ids. `rootTransform`, when given, is applied to the root clones.
 */
function cloneResolvedSubtree(
  resolved: Node[],
  rootIds: Set<string>,
  newParentId: string | null | undefined,
  sceneGraph: SceneGraphLike,
  rootTransform?: Node['transform']
): string[] {
  const oldToNewId = new Map<string, string>();
  let idCounter = Date.now();
  for (const n of resolved) {
    oldToNewId.set(n.id, `detached_${idCounter++}_${Math.random().toString(36).slice(2, 8)}`);
  }
  const byOldId = new Map(resolved.map((n) => [n.id, n]));
  const newRootIds: string[] = [];
  const added = new Set<string>();

  const addRecursive = (n: Node) => {
    if (added.has(n.id)) return;
    const isRoot = rootIds.has(n.id);
    // Ensure a same-subtree parent is added before its child.
    const sameSubtreeParent = n.parent ? byOldId.get(n.parent) : undefined;
    if (!isRoot && sameSubtreeParent) addRecursive(sameSubtreeParent);
    const newId = oldToNewId.get(n.id);
    if (!newId) return;
    const clone = structuredClone(n);
    clone.id = newId;
    if (isRoot && rootTransform) clone.transform = { ...rootTransform };
    if (clone.type === 'group' && clone.maskNodeId) {
      clone.maskNodeId = oldToNewId.get(clone.maskNodeId);
      if (!clone.maskNodeId) clone.maskMode = undefined;
    }
    const parentForAdd = isRoot
      ? (newParentId ?? undefined)
      : n.parent
        ? oldToNewId.get(n.parent)
        : undefined;
    // Add with empty children — addNode repopulates the parent link as each
    // child is added below.
    sceneGraph.addNode({ ...clone, children: [] }, parentForAdd ?? undefined);
    added.add(n.id);
    if (isRoot) newRootIds.push(clone.id);
    for (const childId of n.children ?? []) {
      const child = byOldId.get(childId);
      if (child) addRecursive(child);
    }
  };

  for (const n of resolved) addRecursive(n);
  return newRootIds;
}

const MASK_SOURCE_TYPES = new Set<Node['type']>([
  'rectangle',
  'ellipse',
  'polygon',
  'path',
  'text',
  'image',
]);

/**
 * Resolve the selection a mask would be created from, or null if it can't be:
 * the outermost selected nodes (in stacking order) must number at least two,
 * share a parent, and include a shape. The topmost shape becomes the mask.
 */
export function getMaskSelection(
  sceneGraph: SceneGraphLike,
  selectedNodeIds: ReadonlySet<string>
): { nodes: Node[]; parentId: string | null; maskNode: Node } | null {
  if (selectedNodeIds.size < 2) return null;

  const nodes: Node[] = [];
  sceneGraph.traverse((node) => {
    if (!selectedNodeIds.has(node.id)) return;
    // Ignore selected descendants when their ancestor is selected. Moving both
    // would detach children from the selected group while creating the mask.
    let parentId = node.parent;
    while (parentId) {
      if (selectedNodeIds.has(parentId)) return;
      parentId = sceneGraph.getNode(parentId)?.parent ?? null;
    }
    nodes.push(node);
  });
  if (nodes.length < 2) return null;

  const parentId = nodes[0]!.parent;
  if (!nodes.every((node) => node.parent === parentId)) return null;

  const maskNode = [...nodes].reverse().find((node) => MASK_SOURCE_TYPES.has(node.type));
  return maskNode ? { nodes, parentId, maskNode } : null;
}

// ============================================================================
// Eraser Mode Type (matches EraserTool)
// ============================================================================

export type EraserMode = 'stroke' | 'point';

// ============================================================================
// Guide Type
// ============================================================================

export interface Guide {
  id: string;
  axis: 'x' | 'y'; // 'x' = vertical line at x, 'y' = horizontal line at y
  position: number; // world coordinate
}

// ============================================================================
// Page Data
// ============================================================================

export interface PageData {
  id: string;
  name: string;
  sceneGraphJSON: { nodes: Node[]; rootNodeIds: string[] };
  timeline: Timeline;
  animationSequence: AnimationSequence;
  selectedNodeIds: string[];
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
}

let nextPageCounter = 1;

function generatePageId(): string {
  return `page-${Date.now()}-${nextPageCounter++}`;
}

function createDefaultPage(name: string = 'Page 1', frameRate: number = 30): PageData {
  return {
    id: generatePageId(),
    name,
    sceneGraphJSON: { nodes: [], rootNodeIds: [] },
    timeline: createTimeline({ duration: 300, frameRate }),
    animationSequence: createAnimationSequence(),
    selectedNodeIds: [],
    undoStack: [],
    redoStack: [],
  };
}

/**
 * The work area for a timeline `duration` frames long: one that spans the
 * whole timeline still does, a custom one is clamped into it.
 */
function workAreaFor(
  duration: number,
  state: Pick<EditorStore, 'timelineDuration' | 'workAreaStart' | 'workAreaEnd'>
): Pick<EditorStore, 'workAreaStart' | 'workAreaEnd'> {
  let end = state.workAreaEnd;
  let start = state.workAreaStart;
  if (duration > state.timelineDuration && end === state.timelineDuration - 1) end = duration - 1;
  if (end >= duration) end = duration - 1;
  if (start >= duration) start = Math.max(0, duration - 2);
  if (start >= end) start = Math.max(0, end - 1);
  return { workAreaStart: start, workAreaEnd: end };
}

/** The whole document runs at one frame rate: the timeline in view and every page's take it. */
function atFrameRate(
  rate: number,
  state: Pick<EditorStore, 'timeline' | 'pages'>
): Pick<EditorStore, 'frameRate' | 'timeline' | 'pages'> {
  return {
    frameRate: rate,
    timeline: { ...state.timeline, frameRate: rate },
    pages: state.pages.map((page) => ({
      ...page,
      timeline: { ...page.timeline, frameRate: rate },
    })),
  };
}

/**
 * The store fields that put a page's timeline in view (F104): it runs at the
 * document's frame rate, and the frame count and work area follow its length.
 */
function pageTimelineFields(
  timeline: Timeline,
  state: Pick<EditorStore, 'frameRate' | 'timelineDuration' | 'workAreaStart' | 'workAreaEnd'>,
  sceneGraph: SceneGraphLike
): Pick<
  EditorStore,
  'timeline' | 'timelineDuration' | 'timelineScope' | 'workAreaStart' | 'workAreaEnd'
> {
  // The page's own timeline first — or, when only artboards animate, the
  // first one's (selecting a layer brings its artboard's)
  const scope = openingScope(sceneGraph, timeline);
  const duration = scopeDuration(timeline, scope);
  return {
    timeline: { ...structuredClone(timeline), frameRate: state.frameRate },
    timelineScope: scope,
    timelineDuration: duration,
    ...workAreaFor(duration, state),
  };
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_FILL_COLOR: Color = { r: 100, g: 149, b: 237, a: 1 }; // Cornflower blue

const DEFAULT_STROKE_COLOR: Color = { r: 0, g: 0, b: 0, a: 1 }; // Black

export const DEFAULT_FILL: Fill = {
  type: 'solid',
  color: DEFAULT_FILL_COLOR,
  opacity: 1,
  visible: true,
};

export const DEFAULT_STROKE: Stroke = {
  color: DEFAULT_STROKE_COLOR,
  width: 2,
  opacity: 1,
  cap: 'round',
  join: 'round',
  miterLimit: 10,
  visible: true,
  align: 'center',
};

// ============================================================================
// Store Interface
// ============================================================================

export interface EditorStore
  extends SequenceActions, SoundActions, VideoActions, VideoClipActions, TransitionActions {
  // Project state
  projectId: string | null;
  projectName: string;
  isDirty: boolean;
  projectCreatedAt: string | null;
  setProjectId: (id: string | null) => void;
  setProjectName: (name: string) => void;
  setIsDirty: (dirty: boolean) => void;
  setProjectCreatedAt: (date: string | null) => void;
  markDirty: () => void;
  /**
   * An export is running. It draws each frame by posing the scene and putting
   * it back, which is no edit: the project isn't marked dirty meanwhile, and
   * auto-save waits until it's done.
   */
  isExporting: boolean;
  setExporting: (exporting: boolean) => void;

  // Tool state
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;

  // Group entry state (Figma-style group selection)
  enteredGroupId: string | null;
  enterGroup: (groupId: string) => void;
  exitGroup: () => void;

  // Direct selection state (vertex selection for PropertiesPanel)
  directSelectionPoints: Array<{ nodeId: string; pointIndex: number }>;
  setDirectSelectionPoints: (points: Array<{ nodeId: string; pointIndex: number }>) => void;

  // Text editing state
  editingTextNodeId: string | null;
  setEditingTextNodeId: (id: string | null) => void;

  // Selection state
  selectedNodeIds: Set<string>;
  lastSelectedNodeId: string | null;
  setSelection: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
  selectRange: (toId: string, sceneGraph: SceneGraphLike) => void;

  // Default fill/stroke for new shapes
  defaultFill: Fill;
  defaultStroke: Stroke;
  setDefaultFill: (fill: Fill) => void;
  setDefaultStroke: (stroke: Stroke) => void;

  // Canvas state
  isDrawing: boolean;
  setIsDrawing: (isDrawing: boolean) => void;

  // Brush tool settings
  brushSize: number;
  brushSmoothing: number;
  setBrushSize: (size: number) => void;
  setBrushSmoothing: (smoothing: number) => void;

  // Eraser tool settings
  eraserSize: number;
  eraserMode: EraserMode;
  setEraserSize: (size: number) => void;
  setEraserMode: (mode: EraserMode) => void;

  // Brush profiles
  brushProfiles: BrushProfile[];
  activeBrushProfileId: string | null;
  addBrushProfile: (profile: BrushProfile) => void;
  removeBrushProfile: (id: string) => void;
  setActiveBrushProfile: (id: string | null) => void;
  applyBrushProfileToSelection: (sceneGraph: SceneGraphLike) => void;
  applyBrushStrokeProfile: (sceneGraph: SceneGraphLike, profileId: string | null) => void;
  setBrushStrokeBaseWidth: (sceneGraph: SceneGraphLike, baseWidth: number) => void;
  createBrushProfileFromSelection: (
    sceneGraph: SceneGraphLike,
    name: string
  ) => BrushProfile | null;

  // Weight painting
  weightPaintBoneId: string | null;
  setWeightPaintBoneId: (id: string | null) => void;
  weightPaintBrushSize: number;
  setWeightPaintBrushSize: (size: number) => void;
  weightPaintBrushStrength: number;
  setWeightPaintBrushStrength: (strength: number) => void;
  /** Add weight to the bone, or take it away */
  weightPaintMode: 'add' | 'subtract';
  setWeightPaintMode: (mode: 'add' | 'subtract') => void;
  bindMeshToBones: (
    sceneGraph: SceneGraphLike,
    nodeId: string,
    boneIds: string[],
    tessellatedVertices?: Float32Array,
    options?: BindOptions
  ) => void;
  unbindMesh: (sceneGraph: SceneGraphLike, nodeId: string) => void;

  // IK chains
  ikChains: IKChain[];
  createIKChain: (
    sceneGraph: SceneGraphLike,
    endEffectorBoneId: string,
    chainDepth?: number
  ) => void;
  removeIKChain: (sceneGraph: SceneGraphLike, chainId: string) => void;
  setIKChainEnabled: (sceneGraph: SceneGraphLike, chainId: string, enabled: boolean) => void;
  setIKChainSettings: (
    chainId: string,
    settings: { maxIterations?: number; tolerance?: number }
  ) => void;

  // Smart Bones (corrective morph targets)
  smartBoneActions: SmartBoneAction[];
  smartBoneRecordingActionId: string | null;
  smartBoneRecordingTargetId: string | null;
  smartBoneRecordingPrevTool: ToolType | null;
  smartBoneRecordingPrevRotation: number | null;
  /** The recording ending now is cancelled: its offsets aren't saved */
  smartBoneRecordingDiscard: boolean;
  createSmartBoneAction: (sceneGraph: SceneGraphLike, boneId: string) => void;
  removeSmartBoneAction: (sceneGraph: SceneGraphLike, actionId: string) => void;
  setSmartBoneActionEnabled: (
    sceneGraph: SceneGraphLike,
    actionId: string,
    enabled: boolean
  ) => void;
  /** A Smart Bone's driver range; undoable (part of a morph recording's step during one). */
  updateSmartBoneDriver: (
    actionId: string,
    updates: { rangeMin?: number; rangeMax?: number },
    sceneGraph: SceneGraphLike
  ) => void;
  addMorphTarget: (sceneGraph: SceneGraphLike, actionId: string, driverValue: number) => void;
  removeMorphTarget: (sceneGraph: SceneGraphLike, actionId: string, targetId: string) => void;
  startSmartBoneRecording: (actionId: string, targetId: string, sceneGraph: SceneGraphLike) => void;
  /**
   * End the Smart Bone recording: the driver bone gets its rotation back and
   * the previous tool (or `nextTool`) returns. `discard` drops what was recorded.
   */
  stopSmartBoneRecording: (
    sceneGraph: SceneGraphLike,
    options?: { discard?: boolean; nextTool?: ToolType }
  ) => void;
  saveMorphTargetOffsets: (
    actionId: string,
    targetId: string,
    offsets: Record<string, MorphVertexOffset[]>
  ) => void;

  // Vitruvian Bones (bone group switching)
  vitruvianControllers: VitruvianController[];
  createVitruvianController: (sceneGraph: SceneGraphLike, name?: string) => string;
  removeVitruvianController: (sceneGraph: SceneGraphLike, controllerId: string) => void;
  setVitruvianControllerEnabled: (
    sceneGraph: SceneGraphLike,
    controllerId: string,
    enabled: boolean
  ) => void;
  setVitruvianActiveGroup: (
    sceneGraph: SceneGraphLike,
    controllerId: string,
    groupId: string
  ) => void;
  addVitruvianGroup: (
    sceneGraph: SceneGraphLike,
    controllerId: string,
    name: string,
    boneIds: string[]
  ) => string;
  removeVitruvianGroup: (sceneGraph: SceneGraphLike, controllerId: string, groupId: string) => void;
  /** Put bones in a group (`member`), or take them out */
  setVitruvianGroupBones: (
    sceneGraph: SceneGraphLike,
    controllerId: string,
    groupId: string,
    boneIds: string[],
    member: boolean
  ) => void;
  captureVitruvianSkinSnapshots: (
    controllerId: string,
    groupId: string,
    sceneGraph: SceneGraphLike
  ) => void;

  // Dynamic Bone Chains (physics)
  dynamicChains: DynamicChain[];
  globalWind: WindSettings;
  createDynamicChain: (sceneGraph: SceneGraphLike, rootBoneId: string) => void;
  removeDynamicChain: (sceneGraph: SceneGraphLike, chainId: string) => void;
  setDynamicChainEnabled: (sceneGraph: SceneGraphLike, chainId: string, enabled: boolean) => void;
  /** A dynamic chain's physics; undoable (a slider drag in an undo group is one step). */
  updateDynamicChainSettings: (
    chainId: string,
    settings: Partial<Omit<DynamicChain, 'id' | 'name' | 'rootBoneId' | 'boneIds'>>,
    sceneGraph: SceneGraphLike
  ) => void;
  /** The wind on every dynamic chain; undoable. */
  setGlobalWind: (settings: Partial<WindSettings>, sceneGraph: SceneGraphLike) => void;

  // Aspect ratio lock
  aspectRatioLocked: boolean;
  toggleAspectRatioLock: () => void;

  // Clipboard & node operations
  clipboard: Node[] | null;
  /** Where the copied roots sat, and the rigging among the copied layers. */
  clipboardExtras: ClipboardExtras | null;
  copySelection: (sceneGraph: SceneGraphLike) => void;
  pasteClipboard: (sceneGraph: SceneGraphLike) => void;
  /** The clipboard as it goes on the system clipboard (with the symbols it uses). */
  clipboardPayload: () => ClipboardPayload | null;
  /**
   * Paste layers from the system clipboard (another window, or browser):
   * symbols this project lacks are added first. Undoable, like any paste.
   */
  pastePayload: (sceneGraph: SceneGraphLike, payload: ClipboardPayload) => void;
  duplicateSelection: (sceneGraph: SceneGraphLike) => void;
  /**
   * Delete the selected layers. With video layers whose sounds are on the
   * Sound lane it first asks whether those go too (else they stay,
   * unlinked), and deletes once answered: one undo step either way.
   */
  deleteSelection: (sceneGraph: SceneGraphLike) => void;
  selectAll: (sceneGraph: SceneGraphLike) => void;
  groupSelection: (sceneGraph: SceneGraphLike) => void;
  createMask: (sceneGraph: SceneGraphLike, mode: MaskMode) => void;
  setMaskMode: (sceneGraph: SceneGraphLike, groupId: string, mode: MaskMode) => void;
  removeMask: (sceneGraph: SceneGraphLike, groupId: string) => void;
  ungroupSelection: (sceneGraph: SceneGraphLike) => void;
  /**
   * Move a node to another parent (or the root) without it moving on screen:
   * its transform, transform keyframes and sequence rest pose are re-expressed
   * in the new parent's space. Callers record undo.
   */
  moveNodeKeepingPlacement: (
    sceneGraph: SceneGraphLike,
    id: string,
    parentId: string | null,
    index?: number
  ) => void;
  /** Reverse the selected paths' direction (keyframes follow); undoable. */
  reverseSelectedPaths: (sceneGraph: SceneGraphLike) => void;
  /**
   * Join (Ctrl+J): one open path closes (its ends one point if they meet);
   * several join end to end into the first, nearest ends first. Undoable.
   */
  joinSelectedPaths: (sceneGraph: SceneGraphLike) => void;
  /** Cut paths at the points picked with Direct Selection, into separate paths; undoable. */
  cutPathsAtSelectedPoints: (sceneGraph: SceneGraphLike) => void;
  /** Fewer points for the selected paths, their shape kept; undoable. */
  simplifySelectedPaths: (sceneGraph: SceneGraphLike) => void;
  /** Close or open the selected paths; undoable. */
  setSelectedPathsClosed: (sceneGraph: SceneGraphLike, closed: boolean) => void;
  /** How the selected paths fill where their contours overlap; undoable. */
  setSelectedPathsFillRule: (sceneGraph: SceneGraphLike, rule: 'nonzero' | 'evenodd') => void;
  /**
   * Mirror these layers across a vertical (horizontal flip) or horizontal
   * line through `center` on the canvas, keyframes and Animation Sequence
   * rest pose too; undoable.
   */
  flipLayers: (
    sceneGraph: SceneGraphLike,
    ids: string[],
    axis: FlipAxis,
    center: import('@quar/types').Vector2
  ) => void;

  // Timeline state
  currentFrame: number;
  isPlaying: boolean;
  isLooping: boolean;
  /** The length of the timeline in view (the page's, or an artboard's) */
  timelineDuration: number;
  /**
   * The timeline in view, played and edited: an artboard's (its id), or the
   * page's own (null), which layers outside every artboard play on
   */
  timelineScope: string | null;
  setTimelineScope: (scope: string | null) => void;
  frameRate: number;
  timelineExpanded: boolean;
  setCurrentFrame: (frame: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setIsLooping: (looping: boolean) => void;
  /** With the scene graph, a change of length is an undo step (the Frames field) */
  setTimelineDuration: (duration: number, sceneGraph?: SceneGraphLike) => void;
  /** With the scene graph, a change of rate is an undo step (the FPS field) */
  setFrameRate: (rate: number, sceneGraph?: SceneGraphLike) => void;
  setTimelineExpanded: (expanded: boolean) => void;
  toggleTimelineExpanded: () => void;

  // Keyframe state
  timeline: Timeline;
  autoKeyframe: boolean;
  selectedKeyframeIds: Set<string>;
  keyframeClipboard: KeyframeClipboard | null;
  toggleAutoKeyframe: () => void;
  selectKeyframe: (id: string) => void;
  addKeyframeToSelection: (id: string) => void;
  clearKeyframeSelection: () => void;
  setSelectedKeyframeIds: (ids: string[]) => void;
  addKeyframeAtFrame: (
    nodeId: string,
    property: string,
    frame: number,
    value: unknown,
    easing?: EasingFunction
  ) => void;
  /** Delete the selected keyframes (not a sequence's); undoable. */
  removeSelectedKeyframes: (
    keyframeMap: Map<string, { nodeId: string; property: string }>,
    sceneGraph: SceneGraphLike
  ) => void;
  /** Remove every animation track of these layers (not their children); undoable. */
  deleteLayerAnimation: (sceneGraph: SceneGraphLike, nodeIds: string[]) => void;
  /** One keyframe's easing, no undo step: edits use setSelectedKeyframesEasing. */
  setKeyframeEasing: (
    nodeId: string,
    property: string,
    keyframeId: string,
    easing: EasingFunction
  ) => void;
  /** Ease every selected keyframe (not a sequence's) alike; one undo step. */
  setSelectedKeyframesEasing: (easing: EasingFunction, sceneGraph: SceneGraphLike) => void;
  copySelectedKeyframes: (keyframeMap: Map<string, { nodeId: string; property: string }>) => void;
  /** Paste the copied keyframes onto a layer from a frame on; undoable. */
  pasteKeyframes: (nodeId: string, frame: number, sceneGraph: SceneGraphLike) => void;
  /** Move the selected keyframes; undoable (a drag in an undo group is one step). */
  moveSelectedKeyframes: (
    keyframeMap: Map<string, { nodeId: string; property: string }>,
    deltaFrames: number,
    sceneGraph: SceneGraphLike
  ) => void;
  removeKeyframeAtFrame: (nodeId: string, property: string, frame: number) => void;
  /**
   * Keep a node's keyframe tracks on their fills, strokes or effects when one
   * is removed: its tracks go, the later ones' tracks move down a place.
   */
  removeListItemTracks: (
    nodeId: string,
    list: 'fills' | 'strokes' | 'effects',
    removedIndex: number
  ) => void;

  // Work area (loop region)
  workAreaEnabled: boolean;
  workAreaStart: number;
  workAreaEnd: number;
  setWorkAreaEnabled: (enabled: boolean) => void;
  toggleWorkArea: () => void;
  setWorkAreaStart: (frame: number) => void;
  setWorkAreaEnd: (frame: number) => void;
  setWorkAreaRange: (start: number, end: number) => void;
  setWorkAreaToCurrentFrame: (boundary: 'start' | 'end') => void;
  clearWorkArea: () => void;

  // Graph editor state
  timelineViewMode: 'dopeSheet' | 'graph';
  graphVisibleTracks: string[]; // track IDs ("nodeId:property")
  graphViewTransform: GraphViewTransform;
  setTimelineViewMode: (mode: 'dopeSheet' | 'graph') => void;
  toggleTimelineViewMode: () => void;
  setGraphVisibleTracks: (trackIds: string[]) => void;
  toggleGraphTrackVisibility: (trackId: string) => void;
  setGraphViewTransform: (partial: Partial<GraphViewTransform>) => void;
  updateKeyframeValue: (nodeId: string, property: string, time: number, newValue: number) => void;
  updateKeyframeTimeAndValue: (
    nodeId: string,
    property: string,
    oldTime: number,
    newTime: number,
    newValue: number
  ) => void;
  /** Id-based, dedup-safe variant for graph-editor drags (F020). */
  updateKeyframeTimeAndValueById: (
    nodeId: string,
    property: string,
    keyframeId: string,
    newTime: number,
    newValue: number
  ) => void;
  setKeyframeTangents: (
    nodeId: string,
    property: string,
    time: number,
    tangentIn: { x: number; y: number } | undefined,
    tangentOut: { x: number; y: number } | undefined,
    tangentMode: 'auto' | 'smooth' | 'aligned' | 'free' | 'linear'
  ) => void;

  // Snap-to-grid
  snapToGrid: boolean;
  gridSize: number;
  setSnapToGrid: (snap: boolean) => void;
  setGridSize: (size: number) => void;
  toggleSnapToGrid: () => void;

  // Rulers
  showRulers: boolean;
  setShowRulers: (show: boolean) => void;
  toggleShowRulers: () => void;

  // Document background: the canvas color behind everything
  documentBackground: Color;
  /** The document's background; undoable when given the scene graph (an edit's). */
  setDocumentBackground: (color: Color, sceneGraph?: SceneGraphLike) => void;

  // Guides
  guides: Guide[];
  showGuides: boolean;
  snapToGuides: boolean;
  addGuide: (axis: 'x' | 'y', position: number) => void;
  removeGuide: (id: string) => void;
  updateGuidePosition: (id: string, position: number) => void;
  clearGuides: () => void;
  toggleShowGuides: () => void;
  toggleSnapToGuides: () => void;

  // Gradient editing
  editingGradient: { nodeId: string; fillIndex: number; source: 'fill' | 'stroke' } | null;
  setEditingGradient: (
    editing: { nodeId: string; fillIndex: number; source: 'fill' | 'stroke' } | null
  ) => void;
  clearEditingGradient: () => void;

  // Onion skin
  onionSkin: OnionSkinSettings;
  setOnionSkinEnabled: (enabled: boolean) => void;
  toggleOnionSkin: () => void;
  setOnionSkinBeforeCount: (count: number) => void;
  setOnionSkinAfterCount: (count: number) => void;
  setOnionSkinBeforeColor: (color: string) => void;
  setOnionSkinAfterColor: (color: string) => void;
  setOnionSkinOpacity: (opacity: number) => void;
  setOnionSkinFalloff: (falloff: number) => void;
  setOnionSkinShowDuringPlayback: (show: boolean) => void;

  // Z-order operations
  bringForward: (sceneGraph: SceneGraphLike) => void;
  sendBackward: (sceneGraph: SceneGraphLike) => void;
  bringToFront: (sceneGraph: SceneGraphLike) => void;
  sendToBack: (sceneGraph: SceneGraphLike) => void;

  // Effects & blend modes
  addEffect: (sceneGraph: SceneGraphLike, nodeId: string, effectType: EffectType) => void;
  removeEffect: (sceneGraph: SceneGraphLike, nodeId: string, effectIndex: number) => void;
  updateEffect: (
    sceneGraph: SceneGraphLike,
    nodeId: string,
    effectIndex: number,
    updates: Partial<Effect>
  ) => void;
  toggleEffectVisibility: (sceneGraph: SceneGraphLike, nodeId: string, effectIndex: number) => void;
  reorderEffect: (
    sceneGraph: SceneGraphLike,
    nodeId: string,
    fromIndex: number,
    toIndex: number
  ) => void;
  setBlendMode: (sceneGraph: SceneGraphLike, nodeId: string, blendMode: BlendMode) => void;

  // Boolean operations (non-destructive)
  booleanUnion: (sceneGraph: SceneGraphLike) => void;
  booleanSubtract: (sceneGraph: SceneGraphLike) => void;
  booleanIntersect: (sceneGraph: SceneGraphLike) => void;
  booleanExclude: (sceneGraph: SceneGraphLike) => void;
  flattenBooleanGroup: (sceneGraph: SceneGraphLike) => void;
  releaseBooleanGroup: (sceneGraph: SceneGraphLike) => void;
  changeBooleanOp: (sceneGraph: SceneGraphLike, op: BooleanOp) => void;

  // Convert operations
  convertTextToPath: (sceneGraph: SceneGraphLike) => void;
  /** Edit > Convert to Path: the selected shapes in place, the selected text as letters. */
  convertSelectionToPaths: (sceneGraph: SceneGraphLike) => void;
  convertShapeToPath: (sceneGraph: SceneGraphLike, nodeId: string) => string | null;
  /**
   * Rectangles, ellipses and polygons to paths, in place (same layer, its
   * size animation as outline keyframes); returns the ids converted. Undoable.
   */
  convertShapesToPaths: (sceneGraph: SceneGraphLike, nodeIds: string[]) => string[];
  outlineStroke: (sceneGraph: SceneGraphLike) => void;

  // Undo/Redo history
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
  canUndo: boolean;
  canRedo: boolean;
  pushUndo: (sceneGraph: SceneGraphLike) => void;
  /**
   * Push an undo step for an edit about to be made, unless it's part of one
   * pushed already: by the undo group open, or by the code making it (an
   * action that pushed, then edits). Panels' edits record undo this way.
   */
  pushUndoStep: (sceneGraph: SceneGraphLike) => void;
  /**
   * Begin an undo group: until it ends, the edits made are one undo step (the
   * first push lands, later ones join it). Takes the place of any group open.
   */
  beginUndoGroup: () => UndoGroup;
  /** End this undo group if it's still open (none given: whichever is). */
  endUndoGroup: (group?: UndoGroup) => void;
  undo: (sceneGraph: SceneGraphLike) => void;
  redo: (sceneGraph: SceneGraphLike) => void;
  clearHistory: () => void;
  /** Reset all project-scoped state to a fresh empty project (F024). */
  resetProject: () => void;
  cutSelection: (sceneGraph: SceneGraphLike) => void;

  // Pages
  pages: PageData[];
  activePageId: string;
  addPage: (sceneGraph: SceneGraphLike) => void;
  deletePage: (pageId: string, sceneGraph: SceneGraphLike) => void;
  renamePage: (pageId: string, name: string) => void;
  duplicatePage: (pageId: string, sceneGraph: SceneGraphLike) => void;
  switchPage: (pageId: string, sceneGraph: SceneGraphLike) => void;
  reorderPages: (fromIndex: number, toIndex: number) => void;

  // Symbols (reusable components)
  symbols: SymbolDefinition[];
  editingSymbolId: string | null;
  editingSymbolPrevState: {
    sceneData: { nodes: Node[]; rootNodeIds: string[] };
    selectedNodeIds: string[];
    undoStack: HistorySnapshot[];
    redoStack: HistorySnapshot[];
  } | null;
  createSymbol: (sceneGraph: SceneGraphLike) => string | null;
  deleteSymbol: (symbolId: string, sceneGraph: SceneGraphLike) => void;
  renameSymbol: (symbolId: string, name: string) => void;
  detachInstance: (sceneGraph: SceneGraphLike) => void;
  /**
   * An instance of the symbol, in the middle of the canvas view (`at`, when
   * given) and in the artboard there if any; selected, one undo step.
   */
  placeSymbolInstance: (
    sceneGraph: SceneGraphLike,
    symbolId: string,
    at?: import('@quar/types').Vector2
  ) => void;
  enterSymbolEdit: (symbolId: string, sceneGraph: SceneGraphLike) => void;
  exitSymbolEdit: (sceneGraph: SceneGraphLike) => void;
  setInstanceOverride: (
    sceneGraph: SceneGraphLike,
    instanceId: string,
    override: SymbolOverride
  ) => void;
  resetInstanceOverrides: (sceneGraph: SceneGraphLike, instanceId: string) => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useEditorStore = create<EditorStore>((set, get) => ({
  // Project state
  projectId: null,
  projectName: 'Untitled Project',
  isDirty: false,
  projectCreatedAt: null,
  setProjectId: (id: string | null) => set({ projectId: id }),
  setProjectName: (name: string) => set({ projectName: name }),
  setIsDirty: (dirty: boolean) => set({ isDirty: dirty }),
  setProjectCreatedAt: (date: string | null) => set({ projectCreatedAt: date }),
  markDirty: () => set({ isDirty: true }),
  isExporting: false,
  setExporting: (exporting: boolean) => set({ isExporting: exporting }),

  // Tool state
  activeTool: 'selection',
  setActiveTool: (tool: ToolType) => set({ activeTool: tool }),

  // Group entry state (Figma-style group selection)
  enteredGroupId: null,
  enterGroup: (groupId: string) =>
    set({ enteredGroupId: groupId, selectedNodeIds: new Set<string>() }),
  exitGroup: () => set({ enteredGroupId: null }),

  // Direct selection state
  directSelectionPoints: [],
  setDirectSelectionPoints: (points: Array<{ nodeId: string; pointIndex: number }>) =>
    set({ directSelectionPoints: points }),

  editingTextNodeId: null,
  setEditingTextNodeId: (id: string | null) => set({ editingTextNodeId: id }),

  // Selection state
  selectedNodeIds: new Set<string>(),
  lastSelectedNodeId: null,
  setSelection: (ids: string[]) =>
    set((state) => {
      const newSet = new Set(ids);
      const editingGradient =
        state.editingGradient && newSet.has(state.editingGradient.nodeId)
          ? state.editingGradient
          : null;
      return {
        selectedNodeIds: newSet,
        lastSelectedNodeId: ids.length > 0 ? ids[ids.length - 1] : null,
        editingGradient,
      };
    }),
  addToSelection: (id: string) =>
    set((state) => ({
      selectedNodeIds: new Set([...state.selectedNodeIds, id]),
      lastSelectedNodeId: id,
    })),
  removeFromSelection: (id: string) =>
    set((state) => {
      const newSet = new Set(state.selectedNodeIds);
      newSet.delete(id);
      return { selectedNodeIds: newSet };
    }),
  toggleSelection: (id: string) =>
    set((state) => {
      const newSet = new Set(state.selectedNodeIds);
      if (newSet.has(id)) {
        newSet.delete(id);
        return { selectedNodeIds: newSet };
      } else {
        newSet.add(id);
        return { selectedNodeIds: newSet, lastSelectedNodeId: id };
      }
    }),
  clearSelection: () =>
    set({ selectedNodeIds: new Set<string>(), lastSelectedNodeId: null, editingGradient: null }),
  isSelected: (id: string) => get().selectedNodeIds.has(id),
  selectRange: (toId: string, sceneGraph: SceneGraphLike) => {
    const { lastSelectedNodeId } = get();
    if (!lastSelectedNodeId) {
      // No anchor — just select the target
      set({ selectedNodeIds: new Set([toId]), lastSelectedNodeId: toId });
      return;
    }
    // The layers in the order the Layers panel lists them: each stack
    // topmost first, a group's layers under it
    const flatOrder: string[] = [];
    const visit = (node: Node) => {
      flatOrder.push(node.id);
      for (const childId of [...node.children].reverse()) {
        const child = sceneGraph.getNode(childId);
        if (child) visit(child);
      }
    };
    for (const root of [...sceneGraph.getRootNodes()].reverse()) visit(root);
    const fromIndex = flatOrder.indexOf(lastSelectedNodeId);
    const toIndex = flatOrder.indexOf(toId);
    if (fromIndex === -1 || toIndex === -1) {
      set({ selectedNodeIds: new Set([toId]), lastSelectedNodeId: toId });
      return;
    }
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    const rangeIds = flatOrder.slice(start, end + 1);
    set({ selectedNodeIds: new Set(rangeIds) });
    // Keep lastSelectedNodeId unchanged (anchor stays)
  },

  // Default fill/stroke
  defaultFill: DEFAULT_FILL,
  defaultStroke: DEFAULT_STROKE,
  setDefaultFill: (fill: Fill) => set({ defaultFill: fill }),
  setDefaultStroke: (stroke: Stroke) => set({ defaultStroke: stroke }),

  // Canvas state
  isDrawing: false,
  setIsDrawing: (isDrawing: boolean) => set({ isDrawing }),

  // Brush tool settings
  brushSize: 5,
  brushSmoothing: 50,
  setBrushSize: (size: number) => set({ brushSize: Math.max(1, Math.min(100, size)) }),
  setBrushSmoothing: (smoothing: number) =>
    set({ brushSmoothing: Math.max(0, Math.min(100, smoothing)) }),

  // Eraser tool settings
  eraserSize: 10,
  eraserMode: 'stroke',
  setEraserSize: (size: number) => set({ eraserSize: Math.max(1, Math.min(100, size)) }),
  setEraserMode: (mode: EraserMode) => set({ eraserMode: mode }),

  // Brush profiles
  // The built-in ones, then the document's own (saved with it)
  brushProfiles: withBuiltInProfiles([]),
  activeBrushProfileId: null,
  addBrushProfile: (profile: BrushProfile) =>
    set((state) => ({ brushProfiles: [...state.brushProfiles, profile] })),
  removeBrushProfile: (id: string) =>
    set((state) => ({
      brushProfiles: state.brushProfiles.filter((p) => p.id !== id),
      activeBrushProfileId: state.activeBrushProfileId === id ? null : state.activeBrushProfileId,
    })),
  setActiveBrushProfile: (id: string | null) => set({ activeBrushProfileId: id }),
  applyBrushProfileToSelection: (sceneGraph: SceneGraphLike) => {
    const state = get();
    const profile = state.brushProfiles.find((p) => p.id === state.activeBrushProfileId);
    if (!profile) return;

    const selectedIds = state.selectedNodeIds;
    if (selectedIds.size === 0) return;

    // Push undo before modifying
    const pushUndo = (get() as any).pushUndo;
    if (pushUndo) pushUndo(sceneGraph);

    for (const nodeId of selectedIds) {
      const node = sceneGraph.getNode(nodeId);
      if (!node) continue;

      const strokes = (node as any).strokes as Stroke[] | undefined;
      if (strokes && strokes.length > 0) {
        const isUniform = profile.id === 'uniform';
        const newStrokes = strokes.map((s: Stroke, i: number) =>
          i === 0 ? { ...s, widthProfile: isUniform ? undefined : [...profile.samples] } : s
        );
        sceneGraph.updateNode(nodeId, { strokes: newStrokes });
      }
    }
  },
  applyBrushStrokeProfile: (sceneGraph: SceneGraphLike, profileId: string | null) => {
    const state = get();
    const selectedIds = state.selectedNodeIds;
    if (selectedIds.size === 0) return;
    const profile = profileId
      ? (state.brushProfiles.find((p) => p.id === profileId) ?? null)
      : null;

    const pushUndo = (get() as any).pushUndo;
    if (pushUndo) pushUndo(sceneGraph);

    for (const nodeId of selectedIds) {
      const node = sceneGraph.getNode(nodeId);
      if (!node || node.type !== 'path' || !(node as any).brushData) continue;
      const bd = (node as any).brushData as {
        spine: any[];
        widths: number[];
        baseWidth?: number;
        profileId: string | null;
      };
      const { spine, widths } = bd;
      // If baseWidth is set, use uniform widths array instead of pressure-based widths
      const effectiveWidths =
        bd.baseWidth != null && bd.baseWidth > 0 ? spine.map(() => bd.baseWidth as number) : widths;
      const newOutline = generateBrushOutline(spine, effectiveWidths, profile ?? undefined);
      sceneGraph.updateNode(nodeId, {
        // What the Eraser took out stays out
        ...reshapedBrushStroke(newOutline, node),
        brushData: { ...bd, profileId },
      } as any);
    }
    set({ isDirty: true });
  },
  setBrushStrokeBaseWidth: (sceneGraph: SceneGraphLike, baseWidth: number) => {
    const state = get();
    const selectedIds = state.selectedNodeIds;
    if (selectedIds.size === 0) return;

    const pushUndo = (get() as any).pushUndo;
    if (pushUndo) pushUndo(sceneGraph);

    for (const nodeId of selectedIds) {
      const node = sceneGraph.getNode(nodeId);
      if (!node || node.type !== 'path' || !(node as any).brushData) continue;
      const bd = (node as any).brushData as {
        spine: any[];
        widths: number[];
        baseWidth?: number;
        profileId: string | null;
      };
      const { spine } = bd;
      const profile = bd.profileId
        ? (state.brushProfiles.find((p) => p.id === bd.profileId) ?? null)
        : null;
      const effectiveWidths = spine.map(() => baseWidth);
      const newOutline = generateBrushOutline(spine, effectiveWidths, profile ?? undefined);
      sceneGraph.updateNode(nodeId, {
        // What the Eraser took out stays out
        ...reshapedBrushStroke(newOutline, node),
        brushData: { ...bd, baseWidth },
      } as any);
    }
    set({ isDirty: true });
  },
  createBrushProfileFromSelection: (
    sceneGraph: SceneGraphLike,
    name: string
  ): BrushProfile | null => {
    const state = get();
    const selectedIds = state.selectedNodeIds;
    if (selectedIds.size === 0) return null;

    // Find first selected shape node (path, rectangle, ellipse, polygon)
    let shapeNode: Node | null = null;
    for (const nodeId of selectedIds) {
      const node = sceneGraph.getNode(nodeId);
      if (
        node &&
        (node.type === 'path' ||
          node.type === 'rectangle' ||
          node.type === 'ellipse' ||
          node.type === 'polygon')
      ) {
        shapeNode = node;
        break;
      }
    }
    if (!shapeNode) return null;

    // Extract outline points from any shape type via getShapeOutlinePoints
    const outline = getShapeOutlinePoints(shapeNode);
    if (!outline || outline.points.length < 2) return null;

    // Tessellate outline into point samples
    const rawPoints = tessellatePathToPoints(outline.points, outline.closed, 0.25);
    if (outline.subpaths) {
      for (const sp of outline.subpaths) {
        const sub = tessellatePathToPoints(sp, true, 0.25);
        rawPoints.push(...sub);
      }
    }
    if (rawPoints.length < 2) return null;

    // Densify: tessellatePathToPoints only returns endpoints for straight-line
    // segments (no handles). For shapes like triangles this gives just 3 points,
    // making cross-sectional analysis impossible. Add intermediate points along
    // every edge so we have dense coverage.
    const tessellated: { x: number; y: number }[] = [];
    const maxSegLen = 2; // add a point every ~2 units
    for (let i = 0; i < rawPoints.length; i++) {
      const curr = rawPoints[i]!;
      const next = rawPoints[(i + 1) % rawPoints.length]!;
      tessellated.push(curr);
      // Only densify between consecutive points (not wrap-around for open paths)
      if (i < rawPoints.length - 1 || outline.closed) {
        const dx = next.x - curr.x;
        const dy = next.y - curr.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.max(1, Math.ceil(dist / maxSegLen));
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          tessellated.push({ x: curr.x + t * dx, y: curr.y + t * dy });
        }
      }
    }
    if (tessellated.length < 2) return null;

    // Compute bounding box
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const pt of tessellated) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    if (rangeX < 0.001 && rangeY < 0.001) return null;

    // Slice along the major axis (longer dimension) and measure
    // cross-sectional width in the minor axis.
    // For vertical shapes, reverse so top→bottom = profile start→end.
    const vertical = rangeY > rangeX;
    const majorMin = vertical ? minY : minX;
    const majorRange = vertical ? rangeY : rangeX;
    const sampleCount = 48;
    const samples: number[] = [];
    const halfBin = (majorRange / sampleCount) * 0.75;

    for (let i = 0; i < sampleCount; i++) {
      const t = i / (sampleCount - 1);
      const slicePos = majorMin + t * majorRange;

      // Collect all points within this slice
      let crossMin = Infinity;
      let crossMax = -Infinity;
      for (const pt of tessellated) {
        const major = vertical ? pt.y : pt.x;
        if (Math.abs(major - slicePos) <= halfBin) {
          const cross = vertical ? pt.x : pt.y;
          if (cross < crossMin) crossMin = cross;
          if (cross > crossMax) crossMax = cross;
        }
      }

      if (crossMin <= crossMax) {
        samples.push(crossMax - crossMin);
      } else {
        samples.push(0);
      }
    }

    // For vertical shapes, reverse so visual top = profile start
    // (Y-up: maxY is top, but we sampled minY→maxY, so reverse)
    if (vertical) {
      samples.reverse();
    }

    // Fill any zero-gaps by linear interpolation from neighbors
    for (let i = 0; i < samples.length; i++) {
      if (samples[i] === 0) {
        let prev = 0;
        let next = 0;
        for (let j = i - 1; j >= 0; j--) {
          if (samples[j]! > 0) {
            prev = samples[j]!;
            break;
          }
        }
        for (let j = i + 1; j < samples.length; j++) {
          if (samples[j]! > 0) {
            next = samples[j]!;
            break;
          }
        }
        samples[i] = (prev + next) / 2;
      }
    }

    // Normalize to 0-1 range
    const maxW = Math.max(...samples);
    if (maxW > 0) {
      for (let i = 0; i < samples.length; i++) {
        samples[i] = samples[i]! / maxW;
      }
    }

    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const profile: BrushProfile = { id, name, samples };

    // The document's own: saved with it, so there's something to save
    set((s) => ({ brushProfiles: [...s.brushProfiles, profile], isDirty: true }));
    return profile;
  },

  // Weight painting
  weightPaintBoneId: null,
  setWeightPaintBoneId: (id: string | null) => set({ weightPaintBoneId: id }),
  weightPaintBrushSize: 30,
  setWeightPaintBrushSize: (size: number) =>
    set({ weightPaintBrushSize: Math.max(5, Math.min(200, size)) }),
  weightPaintBrushStrength: 0.3,
  setWeightPaintBrushStrength: (strength: number) =>
    set({ weightPaintBrushStrength: Math.max(0.01, Math.min(1.0, strength)) }),
  weightPaintMode: 'add',
  setWeightPaintMode: (mode: 'add' | 'subtract') => set({ weightPaintMode: mode }),
  bindMeshToBones: (
    sceneGraph: SceneGraphLike,
    nodeId: string,
    boneIds: string[],
    tessellatedVertices?: Float32Array,
    options?: BindOptions
  ) => {
    const node = sceneGraph.getNode(nodeId);
    if (!node) return;
    if (boneIds.length === 0) return;
    get().pushUndo(sceneGraph);
    const weighted = skinBinding(sceneGraph, nodeId, boneIds, tessellatedVertices, options);
    if (!weighted) return;
    sceneGraph.updateNode(nodeId, { skinData: weighted } as any);
    set({ isDirty: true });
  },
  unbindMesh: (sceneGraph: SceneGraphLike, nodeId: string) => {
    const node = sceneGraph.getNode(nodeId);
    if (!node) return;
    get().pushUndo(sceneGraph);
    sceneGraph.updateNode(nodeId, { skinData: undefined } as any);
    set({ isDirty: true });
  },

  // IK chains
  ikChains: [],
  createIKChain: (sceneGraph: SceneGraphLike, endEffectorBoneId: string, chainDepth?: number) => {
    const endBone = sceneGraph.getNode(endEffectorBoneId);
    if (!endBone || endBone.type !== 'bone') {
      toast.error('Selected node is not a bone');
      return;
    }

    // Walk up the parent bones, up to where the skeleton branches: the hand of
    // one arm shouldn't bend the spine both arms hang from
    const boneChildren = (id: string) =>
      (sceneGraph.getNode(id)?.children ?? []).filter(
        (childId) => sceneGraph.getNode(childId)?.type === 'bone'
      ).length;
    const chain: BoneNode[] = [];
    let currentId: string | null = endEffectorBoneId;
    while (currentId) {
      const node = sceneGraph.getNode(currentId);
      if (!node || node.type !== 'bone') break;
      chain.unshift(node);
      currentId = node.parent;
      if (chainDepth != null && chain.length >= chainDepth) break;
      if (currentId && boneChildren(currentId) > 1) break;
    }

    if (chain.length === 0) {
      toast.error('No valid bone chain found');
      return;
    }

    const rootBoneId = chain[0]!.id;

    // Check for overlapping chains
    const { ikChains } = get();
    const boneIds = new Set(chain.map((b) => b.id));
    for (const existing of ikChains) {
      // Walk existing chain bones
      let cId: string | null = existing.endEffectorBoneId;
      while (cId) {
        if (boneIds.has(cId)) {
          toast.error('Bone is already part of an IK chain');
          return;
        }
        const n = sceneGraph.getNode(cId);
        if (!n || n.type !== 'bone' || cId === existing.rootBoneId) break;
        cId = n.parent;
      }
    }

    get().pushUndo(sceneGraph);

    // Compute end effector tip in world space for target placement
    const endBoneWT = sceneGraph.getWorldTransform(endEffectorBoneId);
    const boneLen = endBone.length;
    const tip = {
      x: endBoneWT.a * boneLen + endBoneWT.tx,
      y: endBoneWT.b * boneLen + endBoneWT.ty,
    };

    // The target goes where the skeleton is — the artboard or group holding
    // the bones the chain hangs from — at the tip on screen, so it's keyed on
    // that artboard's timeline
    let targetParent = chain[0]!.parent;
    while (targetParent && sceneGraph.getNode(targetParent)?.type === 'bone') {
      targetParent = sceneGraph.getNode(targetParent)?.parent ?? null;
    }
    const fromParent = targetParent
      ? mat3.invert(sceneGraph.getWorldTransform(targetParent))
      : null;
    if (!fromParent) targetParent = null;
    const { x: tipX, y: tipY } = fromParent ? mat3.transformPoint(fromParent, tip) : tip;

    const chainId = `ik_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const targetId = `ikt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Create IK target node at end effector tip
    const targetNode: IKTargetNode = {
      id: targetId,
      name: `IK Target (${endBone.name})`,
      type: 'ik-target',
      parent: targetParent,
      children: [],
      transform: {
        position: { x: tipX, y: tipY },
        rotation: 0,
        scale: { x: 1, y: 1 },
        anchor: { x: 0, y: 0 },
        skew: { x: 0, y: 0 },
      },
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      ikChainId: chainId,
      targetType: 'effector',
    };

    sceneGraph.addNode(targetNode as any, targetParent ?? undefined);

    const newChain: IKChain = {
      id: chainId,
      name: `IK Chain (${chain.map((b) => b.name).join(' → ')})`,
      rootBoneId,
      endEffectorBoneId,
      targetNodeId: targetId,
      maxIterations: 10,
      tolerance: 0.5,
      enabled: true,
    };

    set({
      ikChains: [...ikChains, newChain],
      selectedNodeIds: new Set([targetId]),
      isDirty: true,
    });

    toast.success('IK chain created');
  },

  removeIKChain: (sceneGraph: SceneGraphLike, chainId: string) => {
    const { ikChains } = get();
    const chain = ikChains.find((c) => c.id === chainId);
    if (!chain) return;

    get().pushUndo(sceneGraph);

    // Remove target nodes from scene graph
    if (sceneGraph.getNode(chain.targetNodeId)) {
      sceneGraph.removeNode(chain.targetNodeId);
    }
    if (chain.poleTargetNodeId && sceneGraph.getNode(chain.poleTargetNodeId)) {
      sceneGraph.removeNode(chain.poleTargetNodeId);
    }

    set({
      ikChains: ikChains.filter((c) => c.id !== chainId),
      isDirty: true,
    });

    toast.info('IK chain removed');
  },

  setIKChainEnabled: (sceneGraph, chainId, enabled) => {
    get().pushUndo(sceneGraph);
    const { ikChains } = get();
    set({
      ikChains: ikChains.map((c) => (c.id === chainId ? { ...c, enabled } : c)),
      isDirty: true,
    });
  },

  setIKChainSettings: (
    chainId: string,
    settings: { maxIterations?: number; tolerance?: number }
  ) => {
    const { ikChains } = get();
    set({
      ikChains: ikChains.map((c) =>
        c.id === chainId
          ? {
              ...c,
              ...(settings.maxIterations != null ? { maxIterations: settings.maxIterations } : {}),
              ...(settings.tolerance != null ? { tolerance: settings.tolerance } : {}),
            }
          : c
      ),
      isDirty: true,
    });
  },

  // Smart Bones (corrective morph targets)
  smartBoneActions: [] as SmartBoneAction[],
  smartBoneRecordingActionId: null as string | null,
  smartBoneRecordingTargetId: null as string | null,
  smartBoneRecordingPrevTool: null as ToolType | null,
  smartBoneRecordingPrevRotation: null as number | null,
  smartBoneRecordingDiscard: false,

  createSmartBoneAction: (sceneGraph, boneId) => {
    get().pushUndo(sceneGraph);
    const id = `sba_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const action: SmartBoneAction = {
      id,
      name: `Smart Bone ${get().smartBoneActions.length + 1}`,
      driver: { boneId, property: 'transform.rotation', rangeMin: 0, rangeMax: 90 },
      targets: [],
      enabled: true,
    };
    set({ smartBoneActions: [...get().smartBoneActions, action], isDirty: true });
  },

  removeSmartBoneAction: (sceneGraph, actionId) => {
    // A recording of it ends first, giving the bone its rotation back
    if (get().smartBoneRecordingActionId === actionId) {
      get().stopSmartBoneRecording(sceneGraph, { discard: true });
    }
    get().pushUndo(sceneGraph);
    set({
      smartBoneActions: get().smartBoneActions.filter((a) => a.id !== actionId),
      isDirty: true,
    });
  },

  setSmartBoneActionEnabled: (sceneGraph, actionId, enabled) => {
    get().pushUndo(sceneGraph);
    set({
      smartBoneActions: get().smartBoneActions.map((a) =>
        a.id === actionId ? { ...a, enabled } : a
      ),
      isDirty: true,
    });
  },

  updateSmartBoneDriver: (actionId, updates, sceneGraph) => {
    // A morph recording is one step, whatever changes during it
    if (!get().smartBoneRecordingActionId) get().pushUndo(sceneGraph);
    set({
      smartBoneActions: get().smartBoneActions.map((a) =>
        a.id === actionId
          ? {
              ...a,
              driver: {
                ...a.driver,
                ...(updates.rangeMin != null ? { rangeMin: updates.rangeMin } : {}),
                ...(updates.rangeMax != null ? { rangeMax: updates.rangeMax } : {}),
              },
            }
          : a
      ),
      isDirty: true,
    });
  },

  addMorphTarget: (sceneGraph, actionId, driverValue) => {
    get().pushUndo(sceneGraph);
    const targetId = `mt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    set({
      smartBoneActions: get().smartBoneActions.map((a) =>
        a.id === actionId
          ? {
              ...a,
              targets: [
                ...a.targets,
                { id: targetId, name: `Target at ${driverValue}°`, driverValue, offsets: {} },
              ].sort((x, y) => x.driverValue - y.driverValue),
            }
          : a
      ),
      isDirty: true,
    });
  },

  removeMorphTarget: (sceneGraph, actionId, targetId) => {
    // A recording of it ends first, giving the bone its rotation back
    if (get().smartBoneRecordingTargetId === targetId) {
      get().stopSmartBoneRecording(sceneGraph, { discard: true });
    }
    get().pushUndo(sceneGraph);
    set({
      smartBoneActions: get().smartBoneActions.map((a) =>
        a.id === actionId ? { ...a, targets: a.targets.filter((t) => t.id !== targetId) } : a
      ),
      isDirty: true,
    });
  },

  startSmartBoneRecording: (actionId: string, targetId: string, sceneGraph: SceneGraphLike) => {
    const state = get();
    const action = state.smartBoneActions.find((a) => a.id === actionId);
    if (!action) return;
    const target = action.targets.find((t) => t.id === targetId);
    if (!target) return;
    // The whole recording is one undo step, back to before it started
    get().pushUndo(sceneGraph);

    // Find the driver bone and save its current rotation
    const boneId = action.driver.boneId;
    const bone = sceneGraph.getNode(boneId);
    const prevRotation = bone ? bone.transform.rotation : 0;

    // Save previous tool and bone rotation for restoration on stop
    const prevTool = state.activeTool;

    // Rotate bone to the target's driver value
    if (bone) {
      sceneGraph.updateNode(boneId, {
        transform: { ...bone.transform, rotation: target.driverValue },
      });
    }

    set({
      smartBoneRecordingActionId: actionId,
      smartBoneRecordingTargetId: targetId,
      smartBoneRecordingPrevTool: prevTool,
      smartBoneRecordingPrevRotation: prevRotation,
      activeTool: 'point-magnet' as ToolType,
    });
  },

  stopSmartBoneRecording: (sceneGraph, options = {}) => {
    const state = get();

    // Restore bone rotation
    if (state.smartBoneRecordingActionId != null) {
      const action = state.smartBoneActions.find((a) => a.id === state.smartBoneRecordingActionId);
      if (action && state.smartBoneRecordingPrevRotation != null) {
        const bone = sceneGraph.getNode(action.driver.boneId);
        if (bone) {
          sceneGraph.updateNode(action.driver.boneId, {
            transform: { ...bone.transform, rotation: state.smartBoneRecordingPrevRotation },
          });
        }
      }
    }

    set({
      smartBoneRecordingDiscard: options.discard ?? false,
      smartBoneRecordingActionId: null,
      smartBoneRecordingTargetId: null,
      activeTool: options.nextTool ?? state.smartBoneRecordingPrevTool ?? 'selection',
      smartBoneRecordingPrevTool: null,
      smartBoneRecordingPrevRotation: null,
    });
    if (state.smartBoneRecordingDiscard || options.discard)
      set({ smartBoneRecordingDiscard: false });
  },

  saveMorphTargetOffsets: (
    actionId: string,
    targetId: string,
    offsets: Record<string, MorphVertexOffset[]>
  ) => {
    set({
      smartBoneActions: get().smartBoneActions.map((a) =>
        a.id === actionId
          ? {
              ...a,
              targets: a.targets.map((t) => (t.id === targetId ? { ...t, offsets } : t)),
            }
          : a
      ),
      isDirty: true,
    });
  },

  // Vitruvian Bones (bone group switching)
  vitruvianControllers: [] as VitruvianController[],

  createVitruvianController: (sceneGraph, name) => {
    get().pushUndo(sceneGraph);
    const id = `vit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const groupId = `vg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const controller: VitruvianController = {
      id,
      name: name ?? `Vitruvian ${get().vitruvianControllers.length + 1}`,
      groups: [
        {
          id: groupId,
          name: 'Default',
          boneIds: [],
          skinSnapshots: [],
        },
      ],
      activeGroupId: groupId,
      enabled: true,
    };
    set({
      vitruvianControllers: [...get().vitruvianControllers, controller],
      isDirty: true,
    });
    toast.success('Vitruvian controller created');
    return id;
  },

  removeVitruvianController: (sceneGraph, controllerId) => {
    get().pushUndo(sceneGraph);
    set({
      vitruvianControllers: get().vitruvianControllers.filter((c) => c.id !== controllerId),
      isDirty: true,
    });
    toast.info('Vitruvian controller removed');
  },

  setVitruvianControllerEnabled: (sceneGraph, controllerId, enabled) => {
    get().pushUndo(sceneGraph);
    const controller = get().vitruvianControllers.find((c) => c.id === controllerId);
    // Switched on: its active group's bindings take over
    const active = controller?.groups.find((g) => g.id === controller.activeGroupId);
    if (enabled && active) applySkinSnapshots(active.skinSnapshots, sceneGraph);
    set({
      vitruvianControllers: get().vitruvianControllers.map((c) =>
        c.id === controllerId ? { ...c, enabled } : c
      ),
      isDirty: true,
    });
  },

  setVitruvianActiveGroup: (sceneGraph, controllerId, groupId) => {
    const controller = get().vitruvianControllers.find((c) => c.id === controllerId);
    if (!controller || controller.activeGroupId === groupId) return;
    get().pushUndo(sceneGraph);
    // The group being left keeps the bindings it has now (weights painted
    // while it was active), and the group switched to brings back its own
    const keep = (group: BoneGroup): BoneGroup => ({
      ...group,
      skinSnapshots: group.skinSnapshots.map((snapshot) => {
        const skinData = (sceneGraph.getNode(snapshot.nodeId) as { skinData?: SkinData })?.skinData;
        return skinData ? { ...snapshot, skinData: structuredClone(skinData) } : snapshot;
      }),
    });
    const groups = controller.groups.map((g) => (g.id === controller.activeGroupId ? keep(g) : g));
    const incoming = groups.find((g) => g.id === groupId);
    if (controller.enabled && incoming) applySkinSnapshots(incoming.skinSnapshots, sceneGraph);
    set({
      vitruvianControllers: get().vitruvianControllers.map((c) =>
        c.id === controllerId ? { ...c, groups, activeGroupId: groupId } : c
      ),
      isDirty: true,
    });
  },

  setVitruvianGroupBones: (sceneGraph, controllerId, groupId, boneIds, member) => {
    get().pushUndo(sceneGraph);
    set({
      vitruvianControllers: get().vitruvianControllers.map((c) =>
        c.id === controllerId
          ? {
              ...c,
              groups: c.groups.map((g) =>
                g.id === groupId
                  ? {
                      ...g,
                      boneIds: member
                        ? [...new Set([...g.boneIds, ...boneIds])]
                        : g.boneIds.filter((id) => !boneIds.includes(id)),
                    }
                  : g
              ),
            }
          : c
      ),
      isDirty: true,
    });
  },

  addVitruvianGroup: (sceneGraph, controllerId, name, boneIds) => {
    get().pushUndo(sceneGraph);
    const groupId = `vg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    set({
      vitruvianControllers: get().vitruvianControllers.map((c) =>
        c.id === controllerId
          ? {
              ...c,
              groups: [...c.groups, { id: groupId, name, boneIds, skinSnapshots: [] }],
            }
          : c
      ),
      isDirty: true,
    });
    return groupId;
  },

  removeVitruvianGroup: (sceneGraph, controllerId, groupId) => {
    get().pushUndo(sceneGraph);
    set({
      vitruvianControllers: get().vitruvianControllers.map((c) => {
        if (c.id !== controllerId) return c;
        const newGroups = c.groups.filter((g) => g.id !== groupId);
        return {
          ...c,
          groups: newGroups,
          // If active group was removed, switch to first remaining
          activeGroupId:
            c.activeGroupId === groupId ? (newGroups[0]?.id ?? c.activeGroupId) : c.activeGroupId,
        };
      }),
      isDirty: true,
    });
  },

  captureVitruvianSkinSnapshots: (
    controllerId: string,
    groupId: string,
    sceneGraph: SceneGraphLike
  ) => {
    // Capture current skinData from all skinned nodes
    const snapshots: import('@quar/types').BoneGroupSkinSnapshot[] = [];
    sceneGraph.traverse((node) => {
      if ((node as any).skinData) {
        snapshots.push({
          nodeId: node.id,
          skinData: structuredClone((node as any).skinData),
        });
      }
    });
    set({
      vitruvianControllers: get().vitruvianControllers.map((c) =>
        c.id === controllerId
          ? {
              ...c,
              groups: c.groups.map((g) =>
                g.id === groupId ? { ...g, skinSnapshots: snapshots } : g
              ),
            }
          : c
      ),
      isDirty: true,
    });
    toast.success(`Captured ${snapshots.length} skin snapshots`);
  },

  // Dynamic Bone Chains (physics)
  dynamicChains: [] as DynamicChain[],
  globalWind: { ...DEFAULT_WIND_SETTINGS } as WindSettings,

  createDynamicChain: (sceneGraph: SceneGraphLike, rootBoneId: string) => {
    get().pushUndo(sceneGraph);
    const rootBone = sceneGraph.getNode(rootBoneId);
    if (!rootBone || rootBone.type !== 'bone') {
      toast.error('Selected node is not a bone');
      return;
    }

    // Walk child chain from root bone
    const boneIds: string[] = [rootBoneId];
    let currentId = rootBoneId;
    for (let i = 0; i < 100; i++) {
      const node = sceneGraph.getNode(currentId);
      if (!node) break;
      const childBones = node.children.filter((cId) => {
        const child = sceneGraph.getNode(cId);
        return child && child.type === 'bone';
      });
      if (childBones.length === 0) break;
      // Follow first bone child
      currentId = childBones[0]!;
      boneIds.push(currentId);
    }

    const id = `dc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const chain: DynamicChain = {
      id,
      name: `Dynamic Chain (${rootBone.name})`,
      rootBoneId,
      boneIds,
      enabled: true,
      stiffness: 0.3,
      damping: 0.2,
      gravity: 98,
      gravityAngle: -90,
      windInfluence: 0.5,
      elasticity: 0.1,
      collisionRadius: 0,
    };
    set({
      dynamicChains: [...get().dynamicChains, chain],
      isDirty: true,
    });
    toast.success('Dynamic chain created');
  },

  removeDynamicChain: (sceneGraph, chainId) => {
    get().pushUndo(sceneGraph);
    set({
      dynamicChains: get().dynamicChains.filter((c) => c.id !== chainId),
      isDirty: true,
    });
    toast.info('Dynamic chain removed');
  },

  setDynamicChainEnabled: (sceneGraph, chainId, enabled) => {
    get().pushUndo(sceneGraph);
    set({
      dynamicChains: get().dynamicChains.map((c) => (c.id === chainId ? { ...c, enabled } : c)),
      isDirty: true,
    });
  },

  updateDynamicChainSettings: (chainId, settings, sceneGraph) => {
    get().pushUndo(sceneGraph);
    set({
      dynamicChains: get().dynamicChains.map((c) => (c.id === chainId ? { ...c, ...settings } : c)),
      isDirty: true,
    });
  },

  setGlobalWind: (settings, sceneGraph) => {
    pushSettingUndo(get, sceneGraph, 'globalWind');
    set({
      globalWind: { ...get().globalWind, ...settings },
      isDirty: true,
    });
  },

  // Aspect ratio lock
  aspectRatioLocked: false,
  toggleAspectRatioLock: () => set((state) => ({ aspectRatioLocked: !state.aspectRatioLocked })),

  // Clipboard & node operations
  clipboard: null,
  clipboardExtras: null,
  copySelection: (sceneGraph: SceneGraphLike) => {
    const { selectedNodeIds } = get();
    if (selectedNodeIds.size === 0) return;
    const clones: Node[] = [];
    const clonedIds = new Set<string>();
    for (const id of selectedNodeIds) {
      const node = sceneGraph.getNode(id);
      if (node) {
        clones.push(structuredClone(node));
        clonedIds.add(id);
        // Also clone descendants so paste can reconstruct hierarchy
        for (const desc of sceneGraph.getDescendants(id)) {
          if (!clonedIds.has(desc.id)) {
            clones.push(structuredClone(desc));
            clonedIds.add(desc.id);
          }
        }
      }
    }
    if (clones.length > 0) {
      set({
        clipboard: clones,
        clipboardExtras: captureClipboardExtras(sceneGraph, clones, clonedIds, get()),
      });
    }
  },
  pasteClipboard: (sceneGraph: SceneGraphLike) => {
    const { clipboard, clipboardExtras } = get();
    if (!clipboard || clipboard.length === 0) return;
    get().pushUndo(sceneGraph);

    // Build old-id → cloned-node map for the entire clipboard
    const oldIdToClone = new Map<string, Node>();
    for (const original of clipboard) {
      oldIdToClone.set(original.id, structuredClone(original));
    }

    // Generate new IDs for every cloned node
    const oldToNewId = new Map<string, string>();
    let idCounter = Date.now();
    const nextId = (prefix: string) =>
      `${prefix}_${idCounter++}_${Math.random().toString(36).slice(2, 8)}`;
    for (const oldId of oldIdToClone.keys()) oldToNewId.set(oldId, nextId('node'));

    // The copied rigging, for the pasted layers. An IK target copied without
    // its chain's bones would drive nothing, so it isn't pasted.
    const rig = clipboardExtras
      ? pastedRigging(clipboardExtras, oldToNewId, nextId)
      : { ikChains: [], dynamicChains: [], smartBoneActions: [], chainIdForTarget: new Map() };
    const skipped = new Set<string>();
    for (const [oldId, clone] of oldIdToClone) {
      if (clone.type === 'ik-target' && !rig.chainIdForTarget.has(oldId)) skipped.add(oldId);
    }

    // Remap IDs, parent refs, children refs and bindings
    const newNodes: Node[] = [];
    const pastedRoots = new Set<string>();
    for (const [oldId, clone] of oldIdToClone) {
      const newId = oldToNewId.get(oldId);
      if (skipped.has(oldId) || !newId) continue;
      clone.id = newId;
      clone.children = clone.children.flatMap((childId: string) => {
        const newChildId = skipped.has(childId) ? undefined : oldToNewId.get(childId);
        return newChildId ? [newChildId] : [];
      });
      const newParentId = clone.parent ? oldToNewId.get(clone.parent) : undefined;
      if (newParentId) {
        clone.parent = newParentId;
      } else {
        // A copied root goes back under its parent if that's still there
        // (keeping its parent-relative placement); otherwise to the top level,
        // placed where it was
        pastedRoots.add(clone.id);
        const root = clipboardExtras?.roots[oldId];
        const parentId = root?.parentId ?? null;
        if (parentId && sceneGraph.getNode(parentId)) {
          clone.parent = parentId;
        } else {
          clone.parent = null;
          if (root) clone.transform = structuredClone(root.rootTransform);
        }
      }
      if (clone.type === 'group' && clone.maskNodeId) {
        clone.maskNodeId = oldToNewId.get(clone.maskNodeId);
        if (!clone.maskNodeId) clone.maskMode = undefined;
      }
      if (clone.type === 'ik-target') {
        // Targets without their chain were skipped above
        clone.ikChainId = rig.chainIdForTarget.get(oldId) ?? clone.ikChainId;
      }
      const skin = (clone as { skinData?: SkinData }).skinData;
      if (skin) (clone as { skinData?: SkinData }).skinData = remapSkinData(skin, oldToNewId);
      newNodes.push(clone);
    }

    // Offset the pasted roots — except a bound mesh pasted with its bones,
    // which they carry
    const PASTE_OFFSET = { x: 20, y: -20 };
    const pastedIds = new Set(newNodes.map((node) => node.id));
    const newToOldId = new Map([...oldToNewId].map(([oldId, newId]) => [newId, oldId]));
    const rootMoves = new Map<string, RootMove>();
    for (const node of newNodes) {
      if (!pastedRoots.has(node.id)) continue;
      const oldId = newToOldId.get(node.id);
      const original = clipboard.find((copied) => copied.id === oldId);
      if (oldId === undefined || !original) continue;
      const root = clipboardExtras?.roots[oldId];
      const skin = (node as { skinData?: SkinData }).skinData;
      const carried =
        !!skin && Object.keys(skin.inverseBindMatrices).some((id) => pastedIds.has(id));
      // Its keyframes go where the layer went: to the top level, and offset
      rootMoves.set(oldId, {
        base: placementOf(original.transform),
        toTopLevel: node.parent === null ? root?.toTopLevel : null,
        offset: carried ? undefined : PASTE_OFFSET,
      });
      if (carried) continue;
      node.transform = {
        ...node.transform,
        position: {
          x: node.transform.position.x + PASTE_OFFSET.x,
          y: node.transform.position.y + PASTE_OFFSET.y,
        },
      };
    }

    // The copied animation, for the pasted layers (timed for this project's frame rate)
    const newIds = new Map([...oldToNewId].filter(([oldId]) => !skipped.has(oldId)));
    const frameScale = get().frameRate / (clipboardExtras?.frameRate ?? get().frameRate);
    const tracks = clipboardExtras?.tracks?.length
      ? pastedTracks(clipboardExtras.tracks, newIds, rootMoves, frameScale, nextId)
      : [];

    // Pasted artboards bring their own timelines, and the sounds on them
    const library = get().sounds;
    const known = new Set(library.map((sound) => sound.id));
    const brought = (clipboardExtras?.sounds ?? []).filter((sound) => !known.has(sound.id));
    const playable = new Set([...known, ...brought.map((sound) => sound.id)]);
    const artboardTimelines = pastedArtboardTimelines(
      clipboardExtras?.artboardTimelines,
      newIds,
      frameScale,
      (soundId) => playable.has(soundId),
      nextId
    );
    const played = new Set(
      Object.values(artboardTimelines)
        .flatMap((entry) => entry.sounds ?? [])
        .map((c) => c.soundId)
    );
    const soundsAdded = brought.filter((sound) => played.has(sound.id));

    // Add nodes in parent-first order (roots first, then children)
    const byId = new Map(newNodes.map((node) => [node.id, node]));
    const added = new Set<string>();
    const addRecursive = (node: Node) => {
      if (added.has(node.id)) return;
      sceneGraph.addNode({ ...node, children: [] }, node.parent ?? undefined);
      added.add(node.id);
      for (const childId of node.children) {
        const child = byId.get(childId);
        if (child) addRecursive(child);
      }
    };
    for (const node of newNodes) {
      if (pastedRoots.has(node.id)) addRecursive(node);
    }

    const timeline = get().timeline;
    set({
      selectedNodeIds: new Set(pastedRoots),
      ikChains: [...get().ikChains, ...rig.ikChains],
      dynamicChains: [...get().dynamicChains, ...rig.dynamicChains],
      smartBoneActions: [...get().smartBoneActions, ...rig.smartBoneActions],
      ...(tracks.length > 0 || Object.keys(artboardTimelines).length > 0
        ? {
            timeline: {
              ...timeline,
              tracks: [...timeline.tracks, ...tracks],
              ...(Object.keys(artboardTimelines).length > 0
                ? { artboards: { ...timeline.artboards, ...artboardTimelines } }
                : {}),
            },
          }
        : {}),
      ...(soundsAdded.length > 0 ? { sounds: [...library, ...soundsAdded] } : {}),
      isDirty: true,
    });
    // A longer animation than this timeline holds: the timeline grows to fit it
    const lastFrame = Math.max(0, ...tracks.flatMap((t) => t.keyframes.map((k) => k.time)));
    if (lastFrame >= get().timelineDuration) get().setTimelineDuration(lastFrame + 1);
  },
  clipboardPayload: () => {
    const { clipboard, clipboardExtras, symbols } = get();
    if (!clipboard || clipboard.length === 0) return null;
    return {
      nodes: clipboard,
      extras: clipboardExtras,
      symbols: symbolsUsedBy(clipboard, symbols),
    };
  },
  pastePayload: (sceneGraph: SceneGraphLike, payload: ClipboardPayload) => {
    const { symbols } = get();
    const known = new Set(symbols.map((symbol) => symbol.id));
    const missing = payload.symbols.filter((symbol) => !known.has(symbol.id));
    set({
      clipboard: payload.nodes,
      clipboardExtras: payload.extras,
      ...(missing.length > 0 ? { symbols: [...symbols, ...structuredClone(missing)] } : {}),
    });
    get().pasteClipboard(sceneGraph);
    if (missing.length > 0) {
      // Undoing the paste takes out the symbols it brought in
      const undoStack = [...get().undoStack];
      const step = undoStack.pop();
      if (step)
        set({ undoStack: [...undoStack, { ...step, symbolsAdded: structuredClone(missing) }] });
    }
  },
  duplicateSelection: (sceneGraph: SceneGraphLike) => {
    const { copySelection } = get();
    // pushUndo is called inside pasteClipboard, so no extra push needed here
    copySelection(sceneGraph);
    get().pasteClipboard(sceneGraph);
  },
  deleteSelection: (sceneGraph: SceneGraphLike) => {
    const ids = new Set(get().selectedNodeIds);
    if (ids.size === 0) return;
    const remove = (linkedSounds: SoundClip[], keepSounds: boolean) => {
      if (![...ids].some((id) => sceneGraph.getNode(id))) return;
      const { enteredGroupId } = get();
      get().pushUndo(sceneGraph);
      // The videos' sounds kept as sounds of their own, or deleted with them
      set({ timeline: withLinkedSoundsResolved(get().timeline, linkedSounds, keepSounds) });
      set(removeLayers(sceneGraph, ids, get()));
      // Clear enteredGroupId if the entered group no longer exists
      if (enteredGroupId && !sceneGraph.getNode(enteredGroupId)) set({ enteredGroupId: null });
    };
    // Video layers whose sounds are on the Sound lane: asked about once
    const linked = soundsLinkedToRemoved(sceneGraph, get().timeline, ids);
    if (linked.length === 0) remove([], true);
    else void deleteVideoSoundsToo(linked.length).then((deleteToo) => remove(linked, !deleteToo));
  },
  selectAll: (sceneGraph: SceneGraphLike) => {
    const allIds: string[] = [];
    const rootNodes = sceneGraph.getRootNodes();
    for (const node of rootNodes) {
      allIds.push(node.id);
      const descendants = sceneGraph.getDescendants(node.id);
      for (const desc of descendants) {
        allIds.push(desc.id);
      }
    }
    set({ selectedNodeIds: new Set(allIds) });
  },
  groupSelection: (sceneGraph: SceneGraphLike) => {
    const { selectedNodeIds } = get();
    if (selectedNodeIds.size < 2) return;
    get().flushSequenceEdits(sceneGraph);
    get().pushUndo(sceneGraph);

    // Flatten scene graph order, filter to selected IDs
    const orderedSelected: string[] = [];
    sceneGraph.traverse((node) => {
      if (selectedNodeIds.has(node.id)) {
        orderedSelected.push(node.id);
      }
    });
    if (orderedSelected.length < 2) return;

    // Find common parent among all selected nodes
    const firstNode = sceneGraph.getNode(orderedSelected[0]!);
    if (!firstNode) return;
    const commonParent = orderedSelected.every((id) => {
      const n = sceneGraph.getNode(id);
      return n && n.parent === firstNode.parent;
    })
      ? firstNode.parent
      : null;

    // Find insertion index: position of the first selected node among its siblings
    const siblings = commonParent
      ? (sceneGraph.getNode(commonParent)?.children ?? [])
      : sceneGraph.getRootNodes().map((n) => n.id);
    const firstIndex = siblings.indexOf(orderedSelected[0]!);
    const insertIndex = firstIndex !== -1 ? firstIndex : 0;

    // Create and add the group node
    const groupId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const group = createGroupNode(groupId, 'Group');
    // An identity transform: children keep their numbers (a 0.5 anchor offsets
    // the group's space by half a unit)
    group.transform.anchor = { x: 0, y: 0 };
    sceneGraph.addNode(group, commonParent ?? undefined);

    // Move group to the correct insertion index
    sceneGraph.moveNode(groupId, commonParent, insertIndex);

    // Move each selected node (in scene-graph order) into the group; nodes
    // from other groups keep their place on screen
    for (const id of orderedSelected) {
      get().moveNodeKeepingPlacement(sceneGraph, id, groupId);
    }

    set({ selectedNodeIds: new Set([groupId]), isDirty: true });
  },
  createMask: (sceneGraph: SceneGraphLike, mode: MaskMode) => {
    const selection = getMaskSelection(sceneGraph, get().selectedNodeIds);
    if (!selection) return;
    const { nodes: orderedSelected, parentId, maskNode } = selection;

    get().flushSequenceEdits(sceneGraph);
    get().pushUndo(sceneGraph);
    const siblings = parentId
      ? (sceneGraph.getNode(parentId)?.children ?? [])
      : sceneGraph.getRootNodes().map((node) => node.id);
    // Keep the masked group at the mask layer's former stacking position.
    const maskIndex = siblings.indexOf(maskNode.id);
    const insertIndex = maskIndex >= 0 ? maskIndex : siblings.length;
    const groupId = `mask_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const group = createGroupNode(groupId, 'Mask');
    group.transform.anchor = { x: 0, y: 0 };
    group.maskNodeId = maskNode.id;
    group.maskMode = mode;
    sceneGraph.addNode(group, parentId ?? undefined);
    sceneGraph.moveNode(groupId, parentId, insertIndex);

    for (const node of orderedSelected) {
      get().moveNodeKeepingPlacement(sceneGraph, node.id, groupId);
    }

    set({ selectedNodeIds: new Set([groupId]), isDirty: true });
  },
  setMaskMode: (sceneGraph: SceneGraphLike, groupId: string, mode: MaskMode) => {
    const group = sceneGraph.getNode(groupId);
    if (!group || group.type !== 'group' || !group.maskNodeId) return;
    get().pushUndo(sceneGraph);
    sceneGraph.updateNode(groupId, { maskMode: mode });
    set({ isDirty: true });
  },
  removeMask: (sceneGraph: SceneGraphLike, groupId: string) => {
    const group = sceneGraph.getNode(groupId);
    if (!group || group.type !== 'group' || !group.maskNodeId) return;
    get().pushUndo(sceneGraph);
    sceneGraph.updateNode(groupId, { maskNodeId: undefined, maskMode: undefined });
    set({ isDirty: true });
  },
  ungroupSelection: (sceneGraph: SceneGraphLike) => {
    const { selectedNodeIds, enteredGroupId } = get();
    if (selectedNodeIds.size === 0) return;
    get().flushSequenceEdits(sceneGraph);
    get().pushUndo(sceneGraph);

    const movedChildIds: string[] = [];
    let clearGroup = false;

    for (const id of selectedNodeIds) {
      const node = sceneGraph.getNode(id);
      if (!node || node.type !== 'group') continue;

      // If ungrouping the entered group, exit it
      if (id === enteredGroupId) clearGroup = true;

      const parentId = node.parent;
      // Find the group's index among its siblings
      const siblings = parentId
        ? (sceneGraph.getNode(parentId)?.children ?? [])
        : sceneGraph.getRootNodes().map((n) => n.id);
      const groupIndex = siblings.indexOf(id);
      const insertAt = groupIndex !== -1 ? groupIndex : siblings.length;

      // Move children out to the group's parent, preserving order and their
      // place on screen (the group's transform is folded into theirs)
      const childIds = [...node.children];
      for (let i = 0; i < childIds.length; i++) {
        get().moveNodeKeepingPlacement(sceneGraph, childIds[i]!, parentId ?? null, insertAt + i);
        movedChildIds.push(childIds[i]!);
      }

      // Remove the now-empty group
      sceneGraph.removeNode(id);
    }

    if (movedChildIds.length > 0) {
      set({
        selectedNodeIds: new Set(movedChildIds),
        isDirty: true,
        ...(clearGroup ? { enteredGroupId: null } : {}),
      });
    }
  },
  moveNodeKeepingPlacement: (sceneGraph, id, parentId, index) => {
    const node = sceneGraph.getNode(id);
    if (!node) return;
    const m = reparentMatrix(sceneGraph, id, parentId);
    sceneGraph.moveNode(id, parentId, index);
    if (!m) return;

    const base = placementOf(node.transform);
    // A bound mesh's binding remembers its local transform: re-express that too,
    // or the change of parent would read as the mesh moving
    const skin = (node as { skinData?: SkinData }).skinData;
    const skinData = skin?.meshBindLocal
      ? { ...skin, meshBindLocal: multiply6(m, skin.meshBindLocal) }
      : undefined;
    sceneGraph.updateNode(id, {
      transform: applyPlacement(node.transform, mapPlacement(base, m)),
      ...(skinData ? ({ skinData } as Partial<Node>) : {}),
    });
    const state = get();
    const timeline = reparentTimeline(state.timeline, id, base, m);
    const pose = state.animationSequence.restPoses[id];
    if (pose) {
      // Recompile so the sequence's own keyframes follow the moved rest pose
      const sequence = {
        ...state.animationSequence,
        restPoses: { ...state.animationSequence.restPoses, [id]: reparentRestPose(pose, base, m) },
      };
      set(applySequence(sceneGraph, { ...state, timeline }, sequence));
    } else {
      set({ timeline, isDirty: true });
    }
  },

  reverseSelectedPaths: (sceneGraph) => {
    const paths = selectedPaths(sceneGraph, get().selectedNodeIds);
    if (paths.length === 0) return;
    get().pushUndo(sceneGraph);
    let timeline = get().timeline;
    for (const path of paths) {
      sceneGraph.updateNode(path.id, reversedContours(path));
      timeline = reversedTracks(timeline, path);
    }
    set({ timeline, isDirty: true });
  },
  joinSelectedPaths: (sceneGraph) => {
    const open = selectedPaths(sceneGraph, get().selectedNodeIds).filter((path) => !path.closed);
    if (open.length === 0) {
      toast.info('Select open paths to join');
      return;
    }
    const { timeline } = get();

    if (open.length === 1) {
      const path = open[0]!;
      // Ends that meet become one point, unless that would lose point animation
      const points = hasPointAnimation(timeline, path.id)
        ? path.points
        : closedContour(path.points);
      get().pushUndo(sceneGraph);
      const fill = path.fills.length === 0 ? { fills: [{ ...get().defaultFill }] } : {};
      sceneGraph.updateNode(path.id, { points, closed: true, ...fill });
      set({ directSelectionPoints: [], isDirty: true });
      return;
    }

    const animated = open.filter((path) => hasPointAnimation(timeline, path.id));
    if (animated.length > 0) {
      toast.info(
        'Paths whose points are animated are left out: joining would lose that animation.'
      );
    }
    // In layer order: the lowest one takes in the others
    const joinable = new Set(open.filter((path) => !animated.includes(path)).map((p) => p.id));
    const ordered: PathNode[] = [];
    sceneGraph.traverse((node) => {
      if (joinable.has(node.id) && node.type === 'path') ordered.push(node);
    });
    if (ordered.length < 2) return;
    const [base, ...rest] = ordered as [PathNode, ...PathNode[]];
    const fromWorld = mat3.invert(sceneGraph.getWorldTransform(base.id));
    if (!fromWorld) return;

    get().pushUndo(sceneGraph);
    sceneGraph.updateNode(
      base.id,
      joinedContours(
        base,
        rest.map((node) => ({
          node,
          toBase: mat3.multiply(fromWorld, sceneGraph.getWorldTransform(node.id)),
        }))
      )
    );
    set(removeLayers(sceneGraph, new Set(rest.map((node) => node.id)), get()));
    set({ selectedNodeIds: new Set([base.id]), directSelectionPoints: [], isDirty: true });
  },
  cutPathsAtSelectedPoints: (sceneGraph) => {
    const cutsByPath = new Map<string, number[]>();
    for (const { nodeId, pointIndex } of get().directSelectionPoints) {
      cutsByPath.set(nodeId, [...(cutsByPath.get(nodeId) ?? []), pointIndex]);
    }
    let { timeline } = get();
    const notes = new Set<string>();
    const plans: Array<{ node: PathNode; pieces: PathPoint[][] }> = [];
    for (const [nodeId, cuts] of cutsByPath) {
      const node = sceneGraph.getNode(nodeId);
      if (node?.type !== 'path' || node.locked) continue;
      if (node.subpaths && node.subpaths.length > 0) {
        notes.add('Paths of several contours (with holes) can’t be cut yet.');
        continue;
      }
      if (hasPointAnimation(timeline, nodeId)) {
        notes.add(
          'Paths whose points are animated are left as they are: cutting would lose that animation.'
        );
        continue;
      }
      const pieces = cutContour(node.points, node.closed, cuts);
      if (pieces.length > 1 || node.closed) plans.push({ node, pieces });
    }
    for (const note of notes) toast.info(note);
    if (plans.length === 0) {
      if (notes.size === 0) toast.info('Pick points along a path (not its ends) to cut it there.');
      return;
    }

    get().pushUndo(sceneGraph);
    const selected: string[] = [];
    for (const { node, pieces } of plans) {
      // Open pieces aren't filled: they keep the shape visible as outlines
      const stroke = strokeForOpening(node, get().defaultStroke);
      // The first piece stays this layer; each other one a copy just above it
      sceneGraph.updateNode(node.id, { points: pieces[0]!, closed: false, ...stroke });
      selected.push(node.id);
      const siblings = node.parent
        ? (sceneGraph.getNode(node.parent)?.children ?? [])
        : sceneGraph.getRootNodes().map((n: Node) => n.id);
      const index = siblings.indexOf(node.id);
      pieces.slice(1).forEach((piece, k) => {
        const id = `cut_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const copy: PathNode = {
          ...structuredClone(node),
          id,
          name: `${node.name} ${k + 2}`,
          children: [],
          points: piece,
          closed: false,
          ...structuredClone(stroke),
        };
        sceneGraph.addNode(copy, node.parent ?? undefined);
        if (index >= 0) sceneGraph.moveNode(id, node.parent ?? null, index + 1 + k);
        // It moves as the layer did
        timeline = {
          ...timeline,
          tracks: [...timeline.tracks, ...tracksForCopy(timeline, node.id, id)],
        };
        selected.push(id);
      });
    }
    set({
      timeline,
      selectedNodeIds: new Set(selected),
      directSelectionPoints: [],
      isDirty: true,
    });
  },
  simplifySelectedPaths: (sceneGraph) => {
    const paths = selectedPaths(sceneGraph, get().selectedNodeIds);
    if (paths.length === 0) return;
    // Simplifying replaces the points, which animated points couldn't follow
    const animated = paths.filter((path) => hasPointAnimation(get().timeline, path.id));
    const results = paths
      .filter((path) => !animated.includes(path))
      .flatMap((path) => {
        const simpler = simplifiedContours(path);
        return simpler ? [[path, simpler] as const] : [];
      });
    if (animated.length > 0) {
      toast.info(
        'Paths whose points are animated are left as they are: simplifying would lose that animation.'
      );
    }
    if (results.length === 0) {
      if (animated.length === 0) toast.info('Already as simple as it gets.');
      return;
    }
    get().pushUndo(sceneGraph);
    for (const [path, simpler] of results) sceneGraph.updateNode(path.id, simpler);
    set({ isDirty: true });
  },
  setSelectedPathsClosed: (sceneGraph, closed) => {
    const paths = selectedPaths(sceneGraph, get().selectedNodeIds).filter(
      (path) => path.closed !== closed
    );
    if (paths.length === 0) return;
    get().pushUndo(sceneGraph);
    let timeline = get().timeline;
    for (const path of paths) {
      timeline = closedShapeTracks(timeline, path, closed);
      // Closed, a path without a fill gets the default one, as when the Pen closes it
      const fill = closed && path.fills.length === 0 ? { fills: [{ ...get().defaultFill }] } : {};
      // Open paths aren't filled: one without a stroke is outlined in its fill's color
      const stroke = closed ? {} : strokeForOpening(path, get().defaultStroke);
      sceneGraph.updateNode(path.id, { closed, ...fill, ...stroke });
    }
    set({ timeline, isDirty: true });
  },
  setSelectedPathsFillRule: (sceneGraph, rule) => {
    const paths = selectedPaths(sceneGraph, get().selectedNodeIds).filter(
      (path) => (path.fillRule ?? 'nonzero') !== rule
    );
    if (paths.length === 0) return;
    get().pushUndo(sceneGraph);
    for (const path of paths) sceneGraph.updateNode(path.id, { fillRule: rule });
    set({ isDirty: true });
  },
  flipLayers: (sceneGraph, ids, axis, center) => {
    const layers = ids.filter((id) => sceneGraph.getNode(id));
    if (layers.length === 0) return;
    get().pushUndo(sceneGraph);

    const state = get();
    const flip = flipMatrix(axis, center);
    let timeline = state.timeline;
    let restPoses = state.animationSequence.restPoses;
    for (const id of layers) {
      const node = sceneGraph.getNode(id);
      if (!node) continue;
      const m = flipInParentSpace(
        flip,
        node.parent ? sceneGraph.getWorldTransform(node.parent) : null
      );
      const map = (placement: Placement) => flipPlacement(placement, m, axis);
      const base = placementOf(node.transform);
      sceneGraph.updateNode(id, { transform: applyPlacement(node.transform, map(base)) });
      timeline = remapPlacementTimeline(timeline, id, base, map);
      const pose = restPoses[id];
      if (pose) restPoses = { ...restPoses, [id]: remapRestPose(pose, base, map) };
    }

    if (restPoses !== state.animationSequence.restPoses) {
      // Recompile so the sequence's own keyframes follow the flipped rest pose
      const sequence = { ...state.animationSequence, restPoses };
      set(applySequence(sceneGraph, { ...state, timeline }, sequence));
    } else {
      set({ timeline, isDirty: true });
    }
  },

  // Timeline state
  currentFrame: 0,
  isPlaying: false,
  isLooping: true,
  timelineDuration: 300,
  timelineScope: null,
  setTimelineScope: (scope: string | null) =>
    set((state) => {
      if (scope === state.timelineScope) return {};
      const duration = scopeDuration(state.timeline, scope);
      return {
        timelineScope: scope,
        timelineDuration: duration,
        currentFrame: Math.min(state.currentFrame, duration - 1),
        isPlaying: false,
        // The new timeline's whole length
        workAreaEnabled: false,
        workAreaStart: 0,
        workAreaEnd: duration - 1,
      };
    }),
  frameRate: 30,
  timelineExpanded: true,
  setCurrentFrame: (frame: number) =>
    set((state) => ({
      currentFrame: Math.max(0, Math.min(state.timelineDuration - 1, Math.round(frame))),
    })),
  setIsPlaying: (playing: boolean) => set({ isPlaying: playing }),
  setIsLooping: (looping: boolean) => set({ isLooping: looping }),
  setTimelineDuration: (duration, sceneGraph) => {
    const d = Number.isFinite(duration)
      ? Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.round(duration)))
      : 1;
    if (sceneGraph && d !== get().timelineDuration) get().pushUndo(sceneGraph);
    set((state) => {
      if (d === state.timelineDuration) return {};
      return {
        timelineDuration: d,
        timeline: withScopeDuration(state.timeline, state.timelineScope, d),
        currentFrame: Math.min(state.currentFrame, d - 1),
        ...workAreaFor(d, state),
        isDirty: true,
      };
    });
  },
  setFrameRate: (rate, sceneGraph) => {
    const r = Number.isFinite(rate) ? Math.max(1, Math.min(120, Math.round(rate))) : 30;
    // A document-wide setting: its undo step notes it (a page's history mustn't undo it)
    if (sceneGraph && r !== get().frameRate) pushSettingUndo(get, sceneGraph, 'frameRate');
    set((state) => {
      if (r === state.frameRate && r === state.timeline.frameRate) return {};
      return { ...atFrameRate(r, state), isDirty: true };
    });
  },
  setTimelineExpanded: (expanded: boolean) => set({ timelineExpanded: expanded }),
  toggleTimelineExpanded: () => set((state) => ({ timelineExpanded: !state.timelineExpanded })),

  // Work area (loop region)
  workAreaEnabled: false,
  workAreaStart: 0,
  workAreaEnd: 299, // timelineDuration - 1
  setWorkAreaEnabled: (enabled: boolean) => set({ workAreaEnabled: enabled }),
  toggleWorkArea: () => set((state) => ({ workAreaEnabled: !state.workAreaEnabled })),
  setWorkAreaStart: (frame: number) =>
    set((state) => {
      const clamped = Math.max(0, Math.min(state.workAreaEnd - 1, Math.round(frame)));
      return { workAreaStart: clamped };
    }),
  setWorkAreaEnd: (frame: number) =>
    set((state) => {
      const clamped = Math.max(
        state.workAreaStart + 1,
        Math.min(state.timelineDuration - 1, Math.round(frame))
      );
      return { workAreaEnd: clamped };
    }),
  setWorkAreaRange: (start: number, end: number) =>
    set((state) => {
      const s = Math.max(0, Math.round(start));
      const e = Math.min(state.timelineDuration - 1, Math.round(end));
      if (s >= e) return {};
      return { workAreaStart: s, workAreaEnd: e };
    }),
  setWorkAreaToCurrentFrame: (boundary: 'start' | 'end') =>
    set((state) => {
      if (boundary === 'start') {
        const clamped = Math.max(0, Math.min(state.workAreaEnd - 1, state.currentFrame));
        return { workAreaStart: clamped, workAreaEnabled: true };
      } else {
        const clamped = Math.max(
          state.workAreaStart + 1,
          Math.min(state.timelineDuration - 1, state.currentFrame)
        );
        return { workAreaEnd: clamped, workAreaEnabled: true };
      }
    }),
  clearWorkArea: () =>
    set((state) => ({
      workAreaEnabled: false,
      workAreaStart: 0,
      workAreaEnd: state.timelineDuration - 1,
    })),

  // Graph editor state
  timelineViewMode: 'dopeSheet',
  graphVisibleTracks: [],
  graphViewTransform: {
    offsetX: 0,
    offsetY: 0,
    scaleX: 10,
    scaleY: 50,
    viewWidth: 800,
    viewHeight: 200,
  },
  setTimelineViewMode: (mode: 'dopeSheet' | 'graph') => set({ timelineViewMode: mode }),
  toggleTimelineViewMode: () =>
    set((state) => ({
      timelineViewMode: state.timelineViewMode === 'dopeSheet' ? 'graph' : 'dopeSheet',
    })),
  setGraphVisibleTracks: (trackIds: string[]) => set({ graphVisibleTracks: trackIds }),
  toggleGraphTrackVisibility: (trackId: string) =>
    set((state) => {
      const current = state.graphVisibleTracks;
      if (current.includes(trackId)) {
        return { graphVisibleTracks: current.filter((t) => t !== trackId) };
      }
      return { graphVisibleTracks: [...current, trackId] };
    }),
  setGraphViewTransform: (partial: Partial<GraphViewTransform>) =>
    set((state) => ({
      graphViewTransform: { ...state.graphViewTransform, ...partial },
    })),
  updateKeyframeValue: (nodeId: string, property: string, time: number, newValue: number) => {
    const { timeline } = get();
    if (isManagedAt(timeline, nodeId, property, time)) return;
    const track = timeline.tracks.find((t) => t.nodeId === nodeId && t.property === property);
    if (!track) return;
    const kfIndex = track.keyframes.findIndex((kf) => kf.time === time);
    if (kfIndex === -1) return;
    const newKeyframes = [...track.keyframes];
    newKeyframes[kfIndex] = { ...newKeyframes[kfIndex]!, value: newValue };
    const newTracks = timeline.tracks.map((t) =>
      t.id === track.id ? { ...t, keyframes: newKeyframes } : t
    );
    set({ timeline: { ...timeline, tracks: newTracks }, isDirty: true });
  },
  updateKeyframeTimeAndValue: (
    nodeId: string,
    property: string,
    oldTime: number,
    newTime: number,
    newValue: number
  ) => {
    // Move the keyframe on oldTime the id-based way, so one already on the
    // destination frame is replaced rather than stacked under it (F102)
    const keyframe = trackKeyframes(get().timeline, nodeId, property).find(
      (kf) => kf.time === oldTime
    );
    if (!keyframe) return;
    get().updateKeyframeTimeAndValueById(nodeId, property, keyframe.id, newTime, newValue);
  },
  updateKeyframeTimeAndValueById: (nodeId, property, keyframeId, newTime, newValue) => {
    const { timeline } = get();
    const track = timeline.tracks.find((t) => t.nodeId === nodeId && t.property === property);
    if (!track) return;
    if (!track.keyframes.some((kf) => kf.id === keyframeId)) return;
    const roundedTime = Math.max(0, Math.round(newTime));
    // Neither move a sequence keyframe nor drop one sitting on the destination
    if (
      isManagedId(timeline, nodeId, property, keyframeId) ||
      isManagedAt(timeline, nodeId, property, roundedTime)
    ) {
      return;
    }
    // Drop any DIFFERENT keyframe already sitting on the destination frame so the
    // moved keyframe replaces it — keeps the sorted-unique invariant instead of
    // silently stacking two keyframes on one frame (F020).
    const newKeyframes = track.keyframes
      .filter((kf) => kf.id === keyframeId || kf.time !== roundedTime)
      .map((kf) => (kf.id === keyframeId ? { ...kf, time: roundedTime, value: newValue } : kf))
      .sort((a, b) => a.time - b.time);
    const newTracks = timeline.tracks.map((t) =>
      t.id === track.id ? { ...t, keyframes: newKeyframes } : t
    );
    set({ timeline: { ...timeline, tracks: newTracks }, isDirty: true });
  },
  setKeyframeTangents: (
    nodeId: string,
    property: string,
    time: number,
    tangentIn: { x: number; y: number } | undefined,
    tangentOut: { x: number; y: number } | undefined,
    tangentMode: 'auto' | 'smooth' | 'aligned' | 'free' | 'linear'
  ) => {
    const { timeline } = get();
    const track = timeline.tracks.find((t) => t.nodeId === nodeId && t.property === property);
    if (!track) return;
    const kfIndex = track.keyframes.findIndex((kf) => kf.time === time);
    if (kfIndex === -1) return;

    const kf = track.keyframes[kfIndex]!;
    // Tangents also set the next keyframe's easing
    const nextKf = track.keyframes[kfIndex + 1];
    if (kf.sequenceStepId !== undefined || nextKf?.sequenceStepId !== undefined) return;
    const newKeyframes = [...track.keyframes];
    const updated: Keyframe = {
      ...kf,
      tangentIn,
      tangentOut,
      tangentMode,
    };

    // Derive easing from tangents if both tangentOut and tangentIn are set
    // and there's a next keyframe
    if (tangentOut && kfIndex < track.keyframes.length - 1) {
      const nextKf = track.keyframes[kfIndex + 1]!;
      const dt = nextKf.time - kf.time;
      const dv = (nextKf.value as number) - (kf.value as number);
      // Get the tangentIn of the next keyframe for the easing
      const nextTangentIn = tangentIn ?? nextKf.tangentIn;
      if (nextTangentIn) {
        // Store easing on the NEXT keyframe (after.easing convention)
        const newEasing = tangentsToEasing(tangentOut, nextTangentIn, dt, dv);
        const nextUpdated = { ...nextKf, easing: newEasing };
        if (tangentIn) {
          nextUpdated.tangentIn = tangentIn;
        }
        newKeyframes[kfIndex + 1] = nextUpdated;
      }
    }

    newKeyframes[kfIndex] = updated;
    const newTracks = timeline.tracks.map((t) =>
      t.id === track.id ? { ...t, keyframes: newKeyframes } : t
    );
    set({ timeline: { ...timeline, tracks: newTracks }, isDirty: true });
  },

  // Keyframe state
  timeline: createTimeline({ duration: 300, frameRate: 30 }),
  autoKeyframe: false,
  selectedKeyframeIds: new Set<string>(),
  keyframeClipboard: null,
  toggleAutoKeyframe: () => set((state) => ({ autoKeyframe: !state.autoKeyframe })),
  selectKeyframe: (id: string) =>
    set({ selectedKeyframeIds: new Set([id]), selectedSoundClipId: null }),
  addKeyframeToSelection: (id: string) =>
    set((state) => ({
      selectedKeyframeIds: new Set([...state.selectedKeyframeIds, id]),
      selectedSoundClipId: null,
    })),
  clearKeyframeSelection: () => set({ selectedKeyframeIds: new Set<string>() }),
  setSelectedKeyframeIds: (ids: string[]) =>
    set({
      selectedKeyframeIds: new Set(ids),
      ...(ids.length > 0 ? { selectedSoundClipId: null } : {}),
    }),
  addKeyframeAtFrame: (
    nodeId: string,
    property: string,
    frame: number,
    value: unknown,
    easing: EasingFunction = 'linear'
  ) => {
    const { timeline } = get();
    if (isManagedAt(timeline, nodeId, property, frame)) return;
    const mgr = new KeyframeManager(timeline);
    // Use setKeyframeAtFrame to preserve existing easing when updating a keyframe
    // (e.g., auto-keyframe mode adjusting a value at a frame that already has custom easing)
    const existing = mgr.getKeyframeAt(nodeId, property, frame);
    if (existing) {
      mgr.setKeyframeAtFrame(nodeId, property, frame, value);
    } else {
      mgr.addKeyframe(nodeId, property, frame, value, easing);
    }
    // Trigger re-render by creating a new timeline reference
    set({ timeline: { ...timeline }, isDirty: true });
  },
  removeSelectedKeyframes: (keyframeMap, sceneGraph) => {
    const { timeline, selectedKeyframeIds } = get();
    if (selectedKeyframeIds.size === 0) return;
    const mgr = new KeyframeManager(timeline);
    const toRemove: Array<{ nodeId: string; property: string; keyframeId: string }> = [];
    for (const kfId of selectedKeyframeIds) {
      const info = keyframeMap.get(kfId);
      if (info && !isManagedId(timeline, info.nodeId, info.property, kfId)) {
        toRemove.push({ nodeId: info.nodeId, property: info.property, keyframeId: kfId });
      }
    }
    if (toRemove.length > 0) get().pushUndo(sceneGraph);
    mgr.removeKeyframes(toRemove);
    set({ timeline: { ...timeline }, selectedKeyframeIds: new Set<string>(), isDirty: true });
  },
  deleteLayerAnimation: (sceneGraph: SceneGraphLike, nodeIds: string[]) => {
    const { timeline, selectedKeyframeIds } = get();
    const targets = new Set(nodeIds);
    const removedTracks = timeline.tracks.filter((track) => targets.has(track.nodeId));
    if (removedTracks.length === 0) return;
    get().pushUndo(sceneGraph);

    // Their sequence steps go too, or the next recompile would bring them back.
    // Pruned first, while the timeline still shows which properties the
    // sequence animated, so those return to the rest pose.
    const sequenceUpdate = pruneSequenceSteps(sceneGraph, get(), targets);
    const remaining = sequenceUpdate?.timeline ?? timeline;

    // Otherwise the layers keep their current (evaluated) values; only the animation goes.
    const mgr = new KeyframeManager(remaining);
    for (const nodeId of targets) mgr.removeAllKeyframesForNode(nodeId);
    const removedKeyframeIds = new Set(
      removedTracks.flatMap((track) => track.keyframes.map((kf) => kf.id))
    );
    set({
      ...sequenceUpdate,
      timeline: { ...remaining },
      selectedKeyframeIds: new Set(
        [...selectedKeyframeIds].filter((id) => !removedKeyframeIds.has(id))
      ),
      isDirty: true,
    });
  },
  setKeyframeEasing: (
    nodeId: string,
    property: string,
    keyframeId: string,
    easing: EasingFunction
  ) => {
    const { timeline } = get();
    if (isManagedId(timeline, nodeId, property, keyframeId)) return;
    const mgr = new KeyframeManager(timeline);
    mgr.setKeyframeEasing(nodeId, property, keyframeId, easing);
    set({ timeline: { ...timeline }, isDirty: true });
  },
  setSelectedKeyframesEasing: (easing, sceneGraph) => {
    const { timeline, selectedKeyframeIds } = get();
    const targets = timeline.tracks.flatMap((track) =>
      track.keyframes
        .filter((kf) => selectedKeyframeIds.has(kf.id) && kf.sequenceStepId === undefined)
        .map((kf) => ({ nodeId: track.nodeId, property: track.property, keyframeId: kf.id }))
    );
    if (targets.length === 0) return;
    get().pushUndo(sceneGraph);
    const mgr = new KeyframeManager(timeline);
    for (const { nodeId, property, keyframeId } of targets) {
      mgr.setKeyframeEasing(nodeId, property, keyframeId, easing);
    }
    set({ timeline: { ...timeline }, isDirty: true });
  },
  copySelectedKeyframes: (keyframeMap: Map<string, { nodeId: string; property: string }>) => {
    const { timeline, selectedKeyframeIds } = get();
    if (selectedKeyframeIds.size === 0) return;
    const mgr = new KeyframeManager(timeline);
    const entries: Array<{ nodeId: string; property: string; keyframeId: string }> = [];
    for (const kfId of selectedKeyframeIds) {
      const info = keyframeMap.get(kfId);
      if (info) {
        entries.push({ nodeId: info.nodeId, property: info.property, keyframeId: kfId });
      }
    }
    const clipboard = mgr.copyKeyframes(entries);
    if (clipboard) set({ keyframeClipboard: clipboard });
  },
  pasteKeyframes: (nodeId, frame, sceneGraph) => {
    const { timeline, keyframeClipboard } = get();
    if (!keyframeClipboard) return;
    get().pushUndo(sceneGraph);
    const mgr = new KeyframeManager(timeline);
    const pasted = mgr.pasteKeyframes(keyframeClipboard, nodeId, frame);
    set({
      timeline: { ...timeline },
      selectedKeyframeIds: new Set(pasted.map((kf: Keyframe) => kf.id)),
      isDirty: true,
    });
  },
  moveSelectedKeyframes: (keyframeMap, deltaFrames, sceneGraph) => {
    const { timeline, selectedKeyframeIds } = get();
    if (selectedKeyframeIds.size === 0) return;
    const mgr = new KeyframeManager(timeline);
    const entries: Array<{ nodeId: string; property: string; keyframeId: string }> = [];
    for (const kfId of selectedKeyframeIds) {
      const info = keyframeMap.get(kfId);
      if (!info || isManagedId(timeline, info.nodeId, info.property, kfId)) continue;
      // A move must not land on (and replace) a sequence keyframe
      const kf = trackKeyframes(timeline, info.nodeId, info.property).find((k) => k.id === kfId);
      if (kf && isManagedAt(timeline, info.nodeId, info.property, kf.time + deltaFrames)) return;
      entries.push({ nodeId: info.nodeId, property: info.property, keyframeId: kfId });
    }
    if (entries.length === 0) return;
    get().pushUndo(sceneGraph);
    mgr.moveKeyframes(entries, deltaFrames);
    set({ timeline: { ...timeline }, isDirty: true });
  },
  removeKeyframeAtFrame: (nodeId: string, property: string, frame: number) => {
    const { timeline } = get();
    const mgr = new KeyframeManager(timeline);
    const kf = mgr.getKeyframeAt(nodeId, property, frame);
    if (!kf || kf.sequenceStepId !== undefined) return;
    mgr.removeKeyframe(nodeId, property, kf.id);
    set({ timeline: { ...timeline }, isDirty: true });
  },
  removeListItemTracks: (nodeId, list, removedIndex) => {
    const { timeline, selectedKeyframeIds } = get();
    const tracks = tracksAfterListItemRemoved(timeline.tracks, nodeId, list, removedIndex);
    if (tracks === timeline.tracks) return;
    const kept = new Set(tracks.flatMap((track) => track.keyframes.map((kf) => kf.id)));
    set({
      timeline: { ...timeline, tracks },
      selectedKeyframeIds: new Set([...selectedKeyframeIds].filter((id) => kept.has(id))),
      isDirty: true,
    });
  },

  // Snap-to-grid
  snapToGrid: false,
  gridSize: 20,
  setSnapToGrid: (snap: boolean) => set({ snapToGrid: snap }),
  setGridSize: (size: number) => set({ gridSize: Math.max(1, size) }),
  toggleSnapToGrid: () => set((state) => ({ snapToGrid: !state.snapToGrid })),

  // Rulers
  showRulers: true,
  setShowRulers: (show: boolean) => set({ showRulers: show }),
  toggleShowRulers: () => set((state) => ({ showRulers: !state.showRulers })),

  // Document background
  documentBackground: { ...DEFAULT_DOCUMENT_BACKGROUND },
  setDocumentBackground: (color, sceneGraph) => {
    if (sceneGraph) pushSettingUndo(get, sceneGraph, 'documentBackground');
    set({ documentBackground: { ...color }, isDirty: true });
  },

  // Guides
  guides: [],
  showGuides: true,
  snapToGuides: true,
  addGuide: (axis: 'x' | 'y', position: number) => {
    const id = `guide-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((state) => ({ guides: [...state.guides, { id, axis, position }] }));
  },
  removeGuide: (id: string) =>
    set((state) => ({ guides: state.guides.filter((g) => g.id !== id) })),
  updateGuidePosition: (id: string, position: number) =>
    set((state) => ({
      guides: state.guides.map((g) => (g.id === id ? { ...g, position } : g)),
    })),
  clearGuides: () => set({ guides: [] }),
  toggleShowGuides: () => set((state) => ({ showGuides: !state.showGuides })),
  toggleSnapToGuides: () => set((state) => ({ snapToGuides: !state.snapToGuides })),

  // Gradient editing
  editingGradient: null,
  setEditingGradient: (editing) => set({ editingGradient: editing }),
  clearEditingGradient: () => set({ editingGradient: null }),

  // Onion skin
  onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
  setOnionSkinEnabled: (enabled: boolean) =>
    set((state) => ({ onionSkin: { ...state.onionSkin, enabled } })),
  toggleOnionSkin: () =>
    set((state) => ({ onionSkin: { ...state.onionSkin, enabled: !state.onionSkin.enabled } })),
  setOnionSkinBeforeCount: (count: number) =>
    set((state) => ({
      onionSkin: { ...state.onionSkin, beforeCount: Math.max(1, Math.min(5, Math.round(count))) },
    })),
  setOnionSkinAfterCount: (count: number) =>
    set((state) => ({
      onionSkin: { ...state.onionSkin, afterCount: Math.max(1, Math.min(5, Math.round(count))) },
    })),
  setOnionSkinBeforeColor: (color: string) =>
    set((state) => ({ onionSkin: { ...state.onionSkin, beforeColor: color } })),
  setOnionSkinAfterColor: (color: string) =>
    set((state) => ({ onionSkin: { ...state.onionSkin, afterColor: color } })),
  setOnionSkinOpacity: (opacity: number) =>
    set((state) => ({
      onionSkin: { ...state.onionSkin, opacity: Math.max(0, Math.min(1, opacity)) },
    })),
  setOnionSkinFalloff: (falloff: number) =>
    set((state) => ({
      onionSkin: { ...state.onionSkin, opacityFalloff: Math.max(0, Math.min(1, falloff)) },
    })),
  setOnionSkinShowDuringPlayback: (show: boolean) =>
    set((state) => ({ onionSkin: { ...state.onionSkin, showDuringPlayback: show } })),

  // Effects & blend modes
  ...createEffectActions(set, get),

  // Z-order operations
  ...createZOrderActions(set, get),

  // Boolean operations
  ...createBooleanActions(set, get),

  // Undo/Redo history
  ...createHistoryActions(set, get),

  // Pages
  ...createPageActions(set, get),

  // Symbols
  ...createSymbolActions(set, get),

  // Animation Sequence (PowerPoint-style numbered steps)
  ...createSequenceActions(set, get),
  ...createSoundActions(set, get),
  ...createVideoActions(set),
  ...createVideoClipActions(set, get),
  ...createTransitionActions(set, get),
}));

// ============================================================================
// Effect & Blend Mode Actions
// ============================================================================

function createDefaultEffect(effectType: EffectType): Effect {
  const id = `fx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  switch (effectType) {
    case 'drop-shadow':
      return {
        id,
        type: 'drop-shadow',
        visible: true,
        color: { r: 0, g: 0, b: 0, a: 1 },
        offsetX: 4,
        offsetY: -4,
        blur: 8,
        spread: 0,
        opacity: 0.25,
      };
    case 'inner-shadow':
      return {
        id,
        type: 'inner-shadow',
        visible: true,
        color: { r: 0, g: 0, b: 0, a: 1 },
        offsetX: 2,
        offsetY: -2,
        blur: 4,
        spread: 0,
        opacity: 0.5,
      };
    case 'layer-blur':
      return {
        id,
        type: 'layer-blur',
        visible: true,
        radius: 4,
      };
  }
}

function createEffectActions(
  set: (partial: Partial<EditorStore> | ((state: EditorStore) => Partial<EditorStore>)) => void,
  get: () => EditorStore
) {
  return {
    addEffect: (sceneGraph: SceneGraphLike, nodeId: string, effectType: EffectType) => {
      const node = sceneGraph.getNode(nodeId);
      if (!node) return;
      get().pushUndo(sceneGraph);
      const effects = [...(node.effects ?? []), createDefaultEffect(effectType)];
      sceneGraph.updateNode(nodeId, { effects } as Partial<Node>);
      set({ isDirty: true });
    },

    removeEffect: (sceneGraph: SceneGraphLike, nodeId: string, effectIndex: number) => {
      const node = sceneGraph.getNode(nodeId);
      if (!node || !node.effects) return;
      get().pushUndo(sceneGraph);
      const effects = node.effects.filter((_, i) => i !== effectIndex);
      sceneGraph.updateNode(nodeId, {
        effects: effects.length > 0 ? effects : undefined,
      } as Partial<Node>);
      get().removeListItemTracks(nodeId, 'effects', effectIndex);
      set({ isDirty: true });
    },

    updateEffect: (
      sceneGraph: SceneGraphLike,
      nodeId: string,
      effectIndex: number,
      updates: Partial<Effect>
    ) => {
      const node = sceneGraph.getNode(nodeId);
      if (!node || !node.effects || !node.effects[effectIndex]) return;
      get().pushUndo(sceneGraph);
      const effects = [...node.effects];
      effects[effectIndex] = { ...effects[effectIndex], ...updates } as Effect;
      sceneGraph.updateNode(nodeId, { effects } as Partial<Node>);
      set({ isDirty: true });
    },

    toggleEffectVisibility: (sceneGraph: SceneGraphLike, nodeId: string, effectIndex: number) => {
      const node = sceneGraph.getNode(nodeId);
      if (!node || !node.effects || !node.effects[effectIndex]) return;
      get().pushUndo(sceneGraph);
      const effects = [...node.effects];
      const effect = effects[effectIndex]!;
      effects[effectIndex] = { ...effect, visible: !effect.visible } as Effect;
      sceneGraph.updateNode(nodeId, { effects } as Partial<Node>);
      set({ isDirty: true });
    },

    reorderEffect: (
      sceneGraph: SceneGraphLike,
      nodeId: string,
      fromIndex: number,
      toIndex: number
    ) => {
      const node = sceneGraph.getNode(nodeId);
      if (!node || !node.effects) return;
      get().pushUndo(sceneGraph);
      const effects = [...node.effects];
      const [removed] = effects.splice(fromIndex, 1);
      if (removed) {
        effects.splice(toIndex, 0, removed);
        sceneGraph.updateNode(nodeId, { effects } as Partial<Node>);
        set({ isDirty: true });
      }
    },

    setBlendMode: (sceneGraph: SceneGraphLike, nodeId: string, blendMode: BlendMode) => {
      get().pushUndo(sceneGraph);
      sceneGraph.updateNode(nodeId, { blendMode } as Partial<Node>);
      set({ isDirty: true });
    },
  };
}

// ============================================================================
// Z-Order Actions (extracted to keep store creation concise)
// ============================================================================

function createZOrderActions(
  set: (partial: Partial<EditorStore> | ((state: EditorStore) => Partial<EditorStore>)) => void,
  get: () => EditorStore
) {
  function getSiblings(node: Node, sceneGraph: SceneGraphLike): string[] {
    if (node.parent) {
      const parent = sceneGraph.getNode(node.parent);
      return parent ? [...parent.children] : [];
    }
    return sceneGraph.getRootNodes().map((n) => n.id);
  }

  return {
    bringForward: (sceneGraph: SceneGraphLike) => {
      const { selectedNodeIds } = get();
      if (selectedNodeIds.size === 0) return;
      get().pushUndo(sceneGraph);

      // Process from highest index first to avoid shifting issues
      const entries: Array<{ id: string; parentId: string | null; index: number }> = [];
      for (const id of selectedNodeIds) {
        const node = sceneGraph.getNode(id);
        if (!node) continue;
        const siblings = getSiblings(node, sceneGraph);
        const idx = siblings.indexOf(id);
        entries.push({ id, parentId: node.parent, index: idx });
      }
      entries.sort((a, b) => b.index - a.index);

      for (const { id, parentId, index } of entries) {
        const node = sceneGraph.getNode(id);
        if (!node) continue;
        const siblings = getSiblings(node, sceneGraph);
        if (index >= siblings.length - 1) continue; // Already at top
        // moveNode removes the node before splicing, shifting later indices left
        // by one, so index+1 lands exactly one slot forward (not index+2).
        sceneGraph.moveNode(id, parentId, index + 1);
      }
      set({ isDirty: true });
    },

    sendBackward: (sceneGraph: SceneGraphLike) => {
      const { selectedNodeIds } = get();
      if (selectedNodeIds.size === 0) return;
      get().pushUndo(sceneGraph);

      // Process from lowest index first to avoid shifting issues
      const entries: Array<{ id: string; parentId: string | null; index: number }> = [];
      for (const id of selectedNodeIds) {
        const node = sceneGraph.getNode(id);
        if (!node) continue;
        const siblings = getSiblings(node, sceneGraph);
        const idx = siblings.indexOf(id);
        entries.push({ id, parentId: node.parent, index: idx });
      }
      entries.sort((a, b) => a.index - b.index);

      for (const { id, parentId, index } of entries) {
        if (index <= 0) continue; // Already at bottom
        sceneGraph.moveNode(id, parentId, index - 1);
      }
      set({ isDirty: true });
    },

    bringToFront: (sceneGraph: SceneGraphLike) => {
      const { selectedNodeIds } = get();
      if (selectedNodeIds.size === 0) return;
      get().pushUndo(sceneGraph);

      // Process from highest index first
      const entries: Array<{ id: string; parentId: string | null; index: number }> = [];
      for (const id of selectedNodeIds) {
        const node = sceneGraph.getNode(id);
        if (!node) continue;
        const siblings = getSiblings(node, sceneGraph);
        const idx = siblings.indexOf(id);
        entries.push({ id, parentId: node.parent, index: idx });
      }
      entries.sort((a, b) => b.index - a.index);

      for (const { id, parentId } of entries) {
        const node = sceneGraph.getNode(id);
        if (!node) continue;
        const siblings = getSiblings(node, sceneGraph);
        sceneGraph.moveNode(id, parentId, siblings.length);
      }
      set({ isDirty: true });
    },

    sendToBack: (sceneGraph: SceneGraphLike) => {
      const { selectedNodeIds } = get();
      if (selectedNodeIds.size === 0) return;
      get().pushUndo(sceneGraph);

      // Process from lowest index first
      const entries: Array<{ id: string; parentId: string | null; index: number }> = [];
      for (const id of selectedNodeIds) {
        const node = sceneGraph.getNode(id);
        if (!node) continue;
        const siblings = getSiblings(node, sceneGraph);
        const idx = siblings.indexOf(id);
        entries.push({ id, parentId: node.parent, index: idx });
      }
      entries.sort((a, b) => a.index - b.index);

      let insertAt = 0;
      for (const { id } of entries) {
        const node = sceneGraph.getNode(id);
        if (!node) continue;
        sceneGraph.moveNode(id, node.parent, insertAt);
        insertAt++;
      }
      set({ isDirty: true });
    },
  };
}

// ============================================================================
// Boolean Operation Actions (extracted to keep store creation concise)
// ============================================================================

function createBooleanActions(
  set: (partial: Partial<EditorStore> | ((state: EditorStore) => Partial<EditorStore>)) => void,
  get: () => EditorStore
) {
  const SHAPE_TYPES = new Set(['rectangle', 'ellipse', 'polygon', 'path']);

  /** Check if a node is a valid boolean input (shape or boolean group) */
  function isBooleanInput(node: Node): boolean {
    if (SHAPE_TYPES.has(node.type)) return true;
    if (node.type === 'group' && node.booleanOp) return true;
    return false;
  }

  /**
   * Non-destructive boolean operation: creates a boolean group containing the source nodes.
   */
  function performBooleanOp(sceneGraph: SceneGraphLike, op: BooleanOp): void {
    const { selectedNodeIds } = get();
    if (selectedNodeIds.size < 2) {
      toast.error('Select at least 2 shapes for boolean operations');
      return;
    }
    get().flushSequenceEdits(sceneGraph);
    get().pushUndo(sceneGraph);

    // Collect selected nodes in scene graph z-order
    const orderedNodes: Node[] = [];
    sceneGraph.traverse((node) => {
      if (selectedNodeIds.has(node.id) && isBooleanInput(node)) {
        orderedNodes.push(node);
      }
    });

    if (orderedNodes.length < 2) {
      toast.error('Select at least 2 shape nodes (rectangles, ellipses, polygons, or paths)');
      return;
    }

    // Get fills/strokes from the first node for the group's appearance
    const firstNode = orderedNodes[0]!;
    const fills: Fill[] = 'fills' in firstNode ? (firstNode as { fills: Fill[] }).fills : [];
    const strokes: Stroke[] =
      'strokes' in firstNode ? (firstNode as { strokes: Stroke[] }).strokes : [];

    // Determine common parent
    const commonParent = orderedNodes.every((n) => n.parent === firstNode.parent)
      ? firstNode.parent
      : null;

    // Find insertion index: position of the first selected node among its siblings
    const siblings = commonParent
      ? (sceneGraph.getNode(commonParent)?.children ?? [])
      : sceneGraph.getRootNodes().map((n) => n.id);
    const insertIndex = siblings.indexOf(firstNode.id);

    // Create group node with booleanOp
    const groupId = `boolgrp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const group = createGroupNode(groupId, `Boolean ${op.charAt(0).toUpperCase() + op.slice(1)}`);
    // Boolean groups use identity transform — anchor (0,0) avoids any offset
    group.transform.anchor = { x: 0, y: 0 };
    group.booleanOp = op;
    group.fills =
      fills.length > 0
        ? structuredClone(fills)
        : [{ type: 'solid', color: { r: 100, g: 149, b: 237, a: 1 }, opacity: 1, visible: true }];
    group.strokes = strokes.length > 0 ? structuredClone(strokes) : [];

    // Add group at the first node's parent position
    sceneGraph.addNode(group, commonParent ?? undefined);
    if (insertIndex >= 0) {
      sceneGraph.moveNode(groupId, commonParent ?? null, insertIndex);
    }

    // Move all source nodes INTO the group (preserve them, don't delete!)
    for (const node of orderedNodes) {
      get().moveNodeKeepingPlacement(sceneGraph, node.id, groupId);
    }

    set({ selectedNodeIds: new Set([groupId]), isDirty: true });
  }

  return {
    booleanUnion: (sceneGraph: SceneGraphLike) => performBooleanOp(sceneGraph, 'union'),
    booleanSubtract: (sceneGraph: SceneGraphLike) => performBooleanOp(sceneGraph, 'subtract'),
    booleanIntersect: (sceneGraph: SceneGraphLike) => performBooleanOp(sceneGraph, 'intersect'),
    booleanExclude: (sceneGraph: SceneGraphLike) => performBooleanOp(sceneGraph, 'exclude'),

    flattenBooleanGroup: (sceneGraph: SceneGraphLike) => {
      const { selectedNodeIds } = get();
      if (selectedNodeIds.size !== 1) return;

      const groupId = [...selectedNodeIds][0]!;
      const node = sceneGraph.getNode(groupId);
      if (!node || node.type !== 'group' || !node.booleanOp) {
        toast.error('Select a boolean group to flatten');
        return;
      }

      const groupNode = node;
      const op = node.booleanOp;
      const children: Node[] = [];
      for (const childId of groupNode.children) {
        const child = sceneGraph.getNode(childId);
        if (child) children.push(child);
      }

      if (children.length < 2) {
        toast.error('Boolean group needs at least 2 children');
        return;
      }

      // Get world transforms
      const worldTransforms = children.map((c) => sceneGraph.getWorldTransform(c.id));
      const generateId = () => `bool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Resolve nested boolean groups so their geometry is preserved.
      const resolveGroupChildren = (group: Node) => {
        const kids: Node[] = [];
        for (const id of group.children) {
          const kid = sceneGraph.getNode(id);
          if (kid) kids.push(kid);
        }
        if (kids.length < 2) return null;
        return {
          children: kids,
          worldTransforms: kids.map((k) => sceneGraph.getWorldTransform(k.id)),
        };
      };

      const resultNode = booleanOperation(
        children,
        worldTransforms,
        op,
        generateId,
        resolveGroupChildren
      );
      if (!resultNode) {
        toast.info('Boolean operation produced an empty result');
        return;
      }

      // Push undo only now that we know the operation will mutate the scene
      // (the early returns above no longer leave a spurious no-op undo entry).
      get().pushUndo(sceneGraph);

      // Use the group's fills/strokes for the flattened result
      resultNode.fills = groupNode.fills ?? resultNode.fills;
      resultNode.strokes = groupNode.strokes ?? resultNode.strokes;

      // Find insertion point
      const parentId = groupNode.parent;
      const siblings = parentId
        ? (sceneGraph.getNode(parentId)?.children ?? [])
        : sceneGraph.getRootNodes().map((n) => n.id);
      const insertIndex = siblings.indexOf(groupId);

      // Add result, remove group (which also removes children)
      sceneGraph.addNode(resultNode, parentId ?? undefined);
      if (insertIndex >= 0) {
        sceneGraph.moveNode(resultNode.id, parentId ?? null, insertIndex);
      }
      sceneGraph.removeNode(groupId);

      set({ selectedNodeIds: new Set([resultNode.id]), isDirty: true });
    },

    releaseBooleanGroup: (sceneGraph: SceneGraphLike) => {
      const { selectedNodeIds } = get();
      if (selectedNodeIds.size === 0) return;
      get().flushSequenceEdits(sceneGraph);
      get().pushUndo(sceneGraph);

      const movedChildIds: string[] = [];
      for (const id of selectedNodeIds) {
        const node = sceneGraph.getNode(id);
        if (!node || node.type !== 'group' || !node.booleanOp) continue;

        const parentId = node.parent;
        const siblings = parentId
          ? (sceneGraph.getNode(parentId)?.children ?? [])
          : sceneGraph.getRootNodes().map((n) => n.id);
        const groupIndex = siblings.indexOf(id);
        const insertAt = groupIndex !== -1 ? groupIndex : siblings.length;

        // Move children out, keeping their place on screen
        const childIds = [...node.children];
        for (let i = 0; i < childIds.length; i++) {
          get().moveNodeKeepingPlacement(sceneGraph, childIds[i]!, parentId ?? null, insertAt + i);
          movedChildIds.push(childIds[i]!);
        }

        // Remove the now-empty group
        sceneGraph.removeNode(id);
      }

      if (movedChildIds.length > 0) {
        set({ selectedNodeIds: new Set(movedChildIds), isDirty: true });
      }
    },

    changeBooleanOp: (sceneGraph: SceneGraphLike, op: BooleanOp) => {
      get().pushUndo(sceneGraph);
      const { selectedNodeIds } = get();
      for (const id of selectedNodeIds) {
        const node = sceneGraph.getNode(id);
        if (node && node.type === 'group' && node.booleanOp) {
          sceneGraph.updateNode(id, { booleanOp: op } as Partial<Node>);
        }
      }
      set({ isDirty: true });
    },

    convertSelectionToPaths: (sceneGraph: SceneGraphLike) => {
      const selected = [...get().selectedNodeIds].flatMap((id) => {
        const node = sceneGraph.getNode(id);
        return node ? [node] : [];
      });
      const shapeIds = selected
        .filter((n) => n.type === 'rectangle' || n.type === 'ellipse' || n.type === 'polygon')
        .map((n) => n.id);
      const hasText = selected.some((n) => n.type === 'text');
      if (shapeIds.length === 0 && !hasText) {
        toast.info('Select text or shapes to convert to paths');
        return;
      }
      const converted = shapeIds.length > 0 ? get().convertShapesToPaths(sceneGraph, shapeIds) : [];
      if (hasText) {
        // Text is converted from the selection: keep it in (shapes done stay selected too)
        const textIds = selected.filter((n) => n.type === 'text').map((n) => n.id);
        set({ selectedNodeIds: new Set(textIds) });
        get().convertTextToPath(sceneGraph);
        set({ selectedNodeIds: new Set([...get().selectedNodeIds, ...converted]) });
      }
    },

    convertTextToPath: (sceneGraph: SceneGraphLike) => {
      const { selectedNodeIds } = get();
      if (selectedNodeIds.size === 0) return;

      const textIds = [...selectedNodeIds].filter((id) => {
        const n = sceneGraph.getNode(id);
        return n && n.type === 'text';
      });
      if (textIds.length === 0) {
        toast.info('Select a text node to convert to path');
        return;
      }

      get().pushUndo(sceneGraph);
      const generateId = () => `txt2p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const newIds: string[] = [];

      for (const id of textIds) {
        const node = sceneGraph.getNode(id);
        if (!node || node.type !== 'text') continue;

        const result = convertTextToPathGroupFn(node, generateId);
        if (!result) {
          toast.error(`Could not convert "${node.name}" — font not loaded`);
          continue;
        }

        // Find insertion point
        const parentId = node.parent;
        const siblings = parentId
          ? (sceneGraph.getNode(parentId)?.children ?? [])
          : sceneGraph.getRootNodes().map((n) => n.id);
        const insertIndex = siblings.indexOf(id);

        // Add group, then children
        sceneGraph.addNode(result.group, parentId ?? undefined);
        for (const child of result.children) {
          sceneGraph.addNode(child, result.group.id);
        }
        if (insertIndex >= 0) {
          sceneGraph.moveNode(result.group.id, parentId ?? null, insertIndex);
        }
        sceneGraph.removeNode(id);
        newIds.push(result.group.id);
      }

      if (newIds.length > 0) {
        set({ selectedNodeIds: new Set(newIds), isDirty: true });
      }
    },

    convertShapeToPath: (sceneGraph: SceneGraphLike, nodeId: string): string | null => {
      const converted = get().convertShapesToPaths(sceneGraph, [nodeId]);
      return converted[0] ?? null;
    },

    convertShapesToPaths: (sceneGraph: SceneGraphLike, nodeIds: string[]): string[] => {
      const shapes = nodeIds
        .map((id) => sceneGraph.getNode(id))
        .filter(
          (node): node is RectangleNode | EllipseNode | PolygonNode =>
            !!node &&
            !node.locked &&
            (node.type === 'rectangle' || node.type === 'ellipse' || node.type === 'polygon')
        );
      const outlines = shapes.map((node) => getShapeOutlinePoints(node));
      if (!outlines.some((outline) => outline && outline.points.length >= 2)) return [];

      get().pushUndo(sceneGraph);
      let timeline = get().timeline;
      const converted: string[] = [];
      shapes.forEach((node, i) => {
        const outline = outlines[i];
        if (!outline || outline.points.length < 2) return;
        // In place: the same layer (id, name, place, transform), so its
        // keyframes, mask and bindings carry on; its size keyframes become
        // outline keyframes
        const pathNode: PathNode = {
          id: node.id,
          name: node.name,
          type: 'path',
          parent: node.parent,
          children: [],
          transform: structuredClone(node.transform),
          visible: node.visible,
          locked: node.locked,
          opacity: node.opacity,
          blendMode: node.blendMode,
          effects: node.effects ? [...node.effects] : undefined,
          points: outline.points,
          subpaths: outline.subpaths,
          closed: outline.closed,
          fills: structuredClone(node.fills ?? []),
          strokes: structuredClone(node.strokes ?? []),
          ...(node.exports ? { exports: structuredClone(node.exports) } : {}),
          // Still bound to its bones (the weights refit to the path's mesh)
          ...(node.skinData ? { skinData: structuredClone(node.skinData) } : {}),
        };
        const siblings = node.parent
          ? (sceneGraph.getNode(node.parent)?.children ?? [])
          : sceneGraph.getRootNodes().map((n: Node) => n.id);
        const index = siblings.indexOf(node.id);
        sceneGraph.removeNode(node.id);
        sceneGraph.addNode(pathNode, node.parent ?? undefined);
        if (index >= 0) sceneGraph.moveNode(node.id, node.parent ?? null, index);
        timeline = shapeTracksToOutline(timeline, node);
        converted.push(node.id);
      });

      set({ timeline, selectedNodeIds: new Set(converted), isDirty: true });
      return converted;
    },

    outlineStroke: (sceneGraph: SceneGraphLike) => {
      const { selectedNodeIds } = get();
      if (selectedNodeIds.size === 0) return;

      const validIds = [...selectedNodeIds].filter((id) => {
        const n = sceneGraph.getNode(id);
        if (!n) return false;
        const strokes = (n as { strokes?: import('@quar/types').Stroke[] }).strokes;
        return strokes && strokes.some((s) => s.visible);
      });
      if (validIds.length === 0) {
        toast.info('Select a node with visible strokes');
        return;
      }

      get().pushUndo(sceneGraph);
      const generateId = () => `so_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const newIds: string[] = [];

      for (const id of validIds) {
        const node = sceneGraph.getNode(id);
        if (!node) continue;

        // Outline the first visible stroke
        const strokes = (node as { strokes?: import('@quar/types').Stroke[] }).strokes;
        if (!strokes) continue;
        const strokeIdx = strokes.findIndex((s) => s.visible);
        if (strokeIdx < 0) continue;

        const outlinePath = outlineStrokeFn(node, strokeIdx, generateId);
        if (!outlinePath) {
          toast.error(`Could not outline stroke on "${node.name}"`);
          continue;
        }

        // Remove the outlined stroke from the original node
        const updatedStrokes = [...strokes];
        updatedStrokes.splice(strokeIdx, 1);
        sceneGraph.updateNode(id, { strokes: updatedStrokes } as Partial<
          import('@quar/types').Node
        >);

        // Add as sibling after original
        const parentId = node.parent;
        const siblings = parentId
          ? (sceneGraph.getNode(parentId)?.children ?? [])
          : sceneGraph.getRootNodes().map((n) => n.id);
        const insertIndex = siblings.indexOf(id);

        sceneGraph.addNode(outlinePath, parentId ?? undefined);
        if (insertIndex >= 0) {
          sceneGraph.moveNode(outlinePath.id, parentId ?? null, insertIndex + 1);
        }
        newIds.push(outlinePath.id);
      }

      if (newIds.length > 0) {
        set({
          selectedNodeIds: new Set([...selectedNodeIds, ...newIds]),
          isDirty: true,
        });
      }
    },
  };
}

// ============================================================================
// History (Undo/Redo) Actions
// ============================================================================

function createHistoryActions(
  set: (partial: Partial<EditorStore> | ((state: EditorStore) => Partial<EditorStore>)) => void,
  get: () => EditorStore
) {
  return {
    undoStack: [] as HistorySnapshot[],
    redoStack: [] as HistorySnapshot[],
    canUndo: false,
    canRedo: false,

    pushUndo: (sceneGraph: SceneGraphLike) => {
      const state = get();
      const { undoStack } = state;
      // In an undo group, the step it pushed takes this edit too (until it's undone)
      if (undoGroup?.step && undoGroup.step === undoStack[undoStack.length - 1]) return;
      const snapshot = makeHistorySnapshot(sceneGraph, state);
      const newStack = [...undoStack, snapshot];
      if (newStack.length > MAX_UNDO_STACK_SIZE) {
        newStack.shift();
      }
      if (undoGroup) undoGroup.step = snapshot;
      pushedNow = snapshot;
      queueMicrotask(() => {
        if (pushedNow === snapshot) pushedNow = null;
      });
      set({
        undoStack: newStack,
        redoStack: [],
        canUndo: true,
        canRedo: false,
      });
    },

    pushUndoStep: (sceneGraph: SceneGraphLike) => {
      const { undoStack } = get();
      // Outside an undo group, the edit joins the step the code making it just pushed
      if (!undoGroup && pushedNow && pushedNow === undoStack[undoStack.length - 1]) return;
      get().pushUndo(sceneGraph);
    },

    beginUndoGroup: (): UndoGroup => {
      closeUndoGroup();
      undoGroup = { open: true, step: null };
      return undoGroup;
    },

    endUndoGroup: (group?: UndoGroup) => {
      if (!group || group === undoGroup) closeUndoGroup();
    },

    undo: (sceneGraph: SceneGraphLike) => {
      // Undo during a Smart Bone recording takes it all back: cancel it
      if (get().smartBoneRecordingActionId) {
        get().stopSmartBoneRecording(sceneGraph, { discard: true });
      }
      const state = get();
      const { undoStack, redoStack } = state;
      if (undoStack.length === 0) return;

      // Save current state to redo stack
      const now = makeHistorySnapshot(sceneGraph, state);
      const newRedoStack = [...redoStack, now];

      // Pop and restore from undo stack
      const newUndoStack = [...undoStack];
      const snapshot = newUndoStack.pop();
      if (!snapshot) return;
      sceneGraph.fromJSON(structuredClone(snapshot.sceneData));
      // Symbols that step brought in go, those it deleted come back (redo turns both round)
      const symbols = libraryBefore(state.symbols, snapshot);
      carryLibraryChanges(snapshot, now);

      set({
        undoStack: newUndoStack,
        redoStack: newRedoStack,
        ...(symbols ? { symbols } : {}),
        canUndo: newUndoStack.length > 0,
        canRedo: true,
        enteredGroupId: null,
        isDirty: true,
        ...restoredState(snapshot, now, state),
      });
    },

    redo: (sceneGraph: SceneGraphLike) => {
      if (get().smartBoneRecordingActionId) {
        get().stopSmartBoneRecording(sceneGraph, { discard: true });
      }
      const state = get();
      const { undoStack, redoStack } = state;
      if (redoStack.length === 0) return;

      // Save current state to undo stack
      const now = makeHistorySnapshot(sceneGraph, state);
      const newUndoStack = [...undoStack, now];

      // Pop and restore from redo stack
      const newRedoStack = [...redoStack];
      const snapshot = newRedoStack.pop();
      if (!snapshot) return;
      sceneGraph.fromJSON(structuredClone(snapshot.sceneData));
      // Symbols the step brought in come back, those it deleted go again
      const symbols = libraryAfter(state.symbols, snapshot);
      carryLibraryChanges(snapshot, now);

      set({
        undoStack: newUndoStack,
        redoStack: newRedoStack,
        ...(symbols ? { symbols } : {}),
        canUndo: true,
        canRedo: newRedoStack.length > 0,
        enteredGroupId: null,
        isDirty: true,
        ...restoredState(snapshot, now, state),
      });
    },

    clearHistory: () => {
      closeUndoGroup();
      set({
        undoStack: [],
        redoStack: [],
        canUndo: false,
        canRedo: false,
        smartBoneRecordingActionId: null,
        smartBoneRecordingTargetId: null,
        smartBoneRecordingPrevTool: null,
        smartBoneRecordingPrevRotation: null,
      });
    },

    resetProject: () => {
      // Single source of truth for a fresh project. The Zustand store is a global
      // singleton, so New Project must clear every project-scoped field or the
      // previous project's pages/symbols/timeline/rigging leak into the new one.
      closeUndoGroup();
      // The last project's video files go with its library
      keepVideoFiles(new Set());
      const defaultPage = createDefaultPage();
      set({
        projectId: null,
        projectName: 'Untitled Project',
        isDirty: false,
        projectCreatedAt: null,
        currentFrame: 0,
        isPlaying: false,
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        animationSequence: createAnimationSequence(),
        timelineDuration: 300,
        timelineScope: null,
        frameRate: 30,
        autoKeyframe: false,
        selectedNodeIds: new Set<string>(),
        selectedKeyframeIds: new Set<string>(),
        keyframeClipboard: null,
        clipboard: null,
        clipboardExtras: null,
        enteredGroupId: null,
        editingSymbolId: null,
        editingSymbolPrevState: null,
        symbols: [],
        sounds: [],
        videos: [],
        selectedSoundClipId: null,
        brushProfiles: withBuiltInProfiles([]),
        guides: [],
        documentBackground: { ...DEFAULT_DOCUMENT_BACKGROUND },
        ikChains: [],
        smartBoneActions: [],
        smartBoneRecordingActionId: null,
        smartBoneRecordingTargetId: null,
        smartBoneRecordingPrevTool: null,
        smartBoneRecordingPrevRotation: null,
        vitruvianControllers: [],
        dynamicChains: [],
        globalWind: { strength: 0, direction: 0, turbulence: 0, frequency: 1, enabled: false },
        onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        pages: [defaultPage],
        activePageId: defaultPage.id,
        undoStack: [],
        redoStack: [],
        canUndo: false,
        canRedo: false,
      });
    },

    cutSelection: (sceneGraph: SceneGraphLike) => {
      const { selectedNodeIds, copySelection } = get();
      if (selectedNodeIds.size === 0) return;

      // Push undo snapshot before cut
      get().pushUndo(sceneGraph);

      // Copy to clipboard
      copySelection(sceneGraph);

      // Delete selection (inline to avoid double pushUndo), the videos' sounds
      // with them: they're on the clipboard with their layers
      const linked = soundsLinkedToRemoved(sceneGraph, get().timeline, selectedNodeIds);
      set({ timeline: withLinkedSoundsResolved(get().timeline, linked, false) });
      set(removeLayers(sceneGraph, selectedNodeIds, get()));
    },
  };
}

// ============================================================================
// Page Actions
// ============================================================================

function createPageActions(
  set: (partial: Partial<EditorStore> | ((state: EditorStore) => Partial<EditorStore>)) => void,
  get: () => EditorStore
) {
  const defaultPage = createDefaultPage();
  return {
    pages: [defaultPage] as PageData[],
    activePageId: defaultPage.id,

    addPage: (sceneGraph: SceneGraphLike) => {
      // If a symbol is being edited, exit first so the live scene is the real
      // page content (not the symbol) before we snapshot the active page.
      if (get().editingSymbolId) get().exitSymbolEdit(sceneGraph);
      get().flushSequenceEdits(sceneGraph);
      const state = get();
      // Save current page state first (immutable update)
      const updatedPages = state.pages.map((p) => {
        if (p.id !== state.activePageId) return p;
        return {
          ...p,
          sceneGraphJSON: structuredClone(sceneGraph.toJSON()),
          timeline: structuredClone(state.timeline),
          animationSequence: structuredClone(state.animationSequence),
          selectedNodeIds: Array.from(state.selectedNodeIds),
          undoStack: state.undoStack,
          redoStack: state.redoStack,
        };
      });

      const pageNum = state.pages.length + 1;
      const newPage = createDefaultPage(`Page ${pageNum}`, state.frameRate);

      // Switch scene graph to empty
      sceneGraph.fromJSON(newPage.sceneGraphJSON);

      set({
        pages: [...updatedPages, newPage],
        activePageId: newPage.id,
        ...pageTimelineFields(newPage.timeline, state, sceneGraph),
        animationSequence: structuredClone(newPage.animationSequence ?? createAnimationSequence()),
        selectedNodeIds: new Set<string>(),
        selectedKeyframeIds: new Set<string>(),
        undoStack: [],
        redoStack: [],
        canUndo: false,
        canRedo: false,
        enteredGroupId: null,
        clipboard: null,
        clipboardExtras: null,
        currentFrame: 0,
        isPlaying: false,
        isDirty: true,
      });
    },

    deletePage: (pageId: string, sceneGraph: SceneGraphLike) => {
      // Exit symbol-edit first so the live scene is the real page content and
      // editingSymbolId is cleared before page records are rewritten.
      if (get().editingSymbolId) get().exitSymbolEdit(sceneGraph);
      const state = get();
      if (state.pages.length <= 1) return; // Must keep at least 1 page

      const pageIndex = state.pages.findIndex((p) => p.id === pageId);
      if (pageIndex === -1) return;

      const newPages = state.pages.filter((p) => p.id !== pageId);

      // If deleting the active page, switch to adjacent
      if (state.activePageId === pageId) {
        const switchToIndex = Math.min(pageIndex, newPages.length - 1);
        const switchTo = newPages[switchToIndex]!;

        sceneGraph.fromJSON(structuredClone(switchTo.sceneGraphJSON));

        set({
          pages: newPages,
          activePageId: switchTo.id,
          ...pageTimelineFields(switchTo.timeline, state, sceneGraph),
          animationSequence: structuredClone(
            switchTo.animationSequence ?? createAnimationSequence()
          ),
          selectedNodeIds: new Set(switchTo.selectedNodeIds),
          selectedKeyframeIds: new Set<string>(),
          undoStack: switchTo.undoStack,
          redoStack: switchTo.redoStack,
          canUndo: switchTo.undoStack.length > 0,
          canRedo: switchTo.redoStack.length > 0,
          enteredGroupId: null,
          clipboard: null,
          clipboardExtras: null,
          currentFrame: 0,
          isPlaying: false,
          isDirty: true,
        });
      } else {
        set({ pages: newPages, isDirty: true });
      }
    },

    renamePage: (pageId: string, name: string) => {
      set((state) => ({
        pages: state.pages.map((p) => (p.id === pageId ? { ...p, name } : p)),
        isDirty: true,
      }));
    },

    duplicatePage: (pageId: string, sceneGraph: SceneGraphLike) => {
      // Exit symbol-edit first so a duplicate of the active page captures the
      // real page scene, not the symbol being edited.
      if (get().editingSymbolId) get().exitSymbolEdit(sceneGraph);
      get().flushSequenceEdits(sceneGraph);
      const state = get();
      let sourcePage = state.pages.find((p) => p.id === pageId);
      if (!sourcePage) return;

      // If duplicating the active page, save current state first (immutable)
      let updatedPages = state.pages;
      if (pageId === state.activePageId) {
        updatedPages = state.pages.map((p) => {
          if (p.id !== pageId) return p;
          return {
            ...p,
            sceneGraphJSON: structuredClone(sceneGraph.toJSON()),
            timeline: structuredClone(state.timeline),
            animationSequence: structuredClone(state.animationSequence),
            selectedNodeIds: Array.from(state.selectedNodeIds),
            undoStack: state.undoStack,
            redoStack: state.redoStack,
          };
        });
        sourcePage = updatedPages.find((p) => p.id === pageId) ?? sourcePage;
      }

      const newPage: PageData = {
        id: generatePageId(),
        name: `${sourcePage.name} Copy`,
        sceneGraphJSON: structuredClone(sourcePage.sceneGraphJSON),
        timeline: structuredClone(sourcePage.timeline),
        animationSequence: structuredClone(
          sourcePage.animationSequence ?? createAnimationSequence()
        ),
        selectedNodeIds: [],
        undoStack: [],
        redoStack: [],
      };

      // Insert after source page
      const sourceIndex = updatedPages.findIndex((p) => p.id === pageId);
      const newPages = [...updatedPages];
      newPages.splice(sourceIndex + 1, 0, newPage);

      set({ pages: newPages, isDirty: true });
    },

    switchPage: (pageId: string, sceneGraph: SceneGraphLike) => {
      const initial = get();
      if (pageId === initial.activePageId) return;

      // If a symbol is being edited, exit first so the live scene and the
      // page's undo/redo stacks are restored before we snapshot the active page.
      if (initial.editingSymbolId) {
        get().exitSymbolEdit(sceneGraph);
      }
      // A Smart Bone recording belongs to this page's bones: finish it here
      if (initial.smartBoneRecordingActionId) {
        get().stopSmartBoneRecording(sceneGraph);
      }
      get().flushSequenceEdits(sceneGraph);

      const state = get();
      const targetPage = state.pages.find((p) => p.id === pageId);
      if (!targetPage) return;

      // Force-stop Smart Bone recording before switching pages
      if (state.smartBoneRecordingActionId) {
        set({
          smartBoneRecordingActionId: null,
          smartBoneRecordingTargetId: null,
          smartBoneRecordingPrevTool: null,
          smartBoneRecordingPrevRotation: null,
          activeTool: state.smartBoneRecordingPrevTool ?? 'selection',
        });
      }

      // Save current page state (immutable update)
      const updatedPages = state.pages.map((p) => {
        if (p.id !== state.activePageId) return p;
        return {
          ...p,
          sceneGraphJSON: structuredClone(sceneGraph.toJSON()),
          timeline: structuredClone(state.timeline),
          animationSequence: structuredClone(state.animationSequence),
          selectedNodeIds: Array.from(state.selectedNodeIds),
          undoStack: state.undoStack,
          redoStack: state.redoStack,
        };
      });

      // Load target page
      sceneGraph.fromJSON(structuredClone(targetPage.sceneGraphJSON));

      set({
        pages: updatedPages,
        activePageId: pageId,
        ...pageTimelineFields(targetPage.timeline, state, sceneGraph),
        animationSequence: structuredClone(
          targetPage.animationSequence ?? createAnimationSequence()
        ),
        selectedNodeIds: new Set(targetPage.selectedNodeIds),
        selectedKeyframeIds: new Set<string>(),
        undoStack: targetPage.undoStack,
        redoStack: targetPage.redoStack,
        canUndo: targetPage.undoStack.length > 0,
        canRedo: targetPage.redoStack.length > 0,
        enteredGroupId: null,
        clipboard: null,
        clipboardExtras: null,
        currentFrame: 0,
        isPlaying: false,
        // Opening another page changes nothing in the project: unsaved
        // changes stay unsaved, and none are made (a save keeps it open)
      });
    },

    reorderPages: (fromIndex: number, toIndex: number) => {
      set((state) => {
        if (
          fromIndex < 0 ||
          fromIndex >= state.pages.length ||
          toIndex < 0 ||
          toIndex >= state.pages.length ||
          fromIndex === toIndex
        ) {
          return {};
        }
        const newPages = [...state.pages];
        const [moved] = newPages.splice(fromIndex, 1);
        if (!moved) return {};
        newPages.splice(toIndex, 0, moved);
        return { pages: newPages, isDirty: true };
      });
    },
  };
}

// ============================================================================
// Symbol Actions
// ============================================================================

let nextSymbolCounter = 1;

function generateSymbolId(): string {
  return `sym-${Date.now()}-${nextSymbolCounter++}`;
}

function createSymbolActions(
  set: (partial: Partial<EditorStore> | ((state: EditorStore) => Partial<EditorStore>)) => void,
  get: () => EditorStore
) {
  return {
    symbols: [] as SymbolDefinition[],
    editingSymbolId: null as string | null,
    editingSymbolPrevState: null as {
      sceneData: { nodes: Node[]; rootNodeIds: string[] };
      selectedNodeIds: string[];
      undoStack: HistorySnapshot[];
      redoStack: HistorySnapshot[];
    } | null,

    createSymbol: (sceneGraph: SceneGraphLike): string | null => {
      const state = get();
      const selectedIds = Array.from(state.selectedNodeIds);
      if (selectedIds.length === 0) return null;

      // Push undo
      state.pushUndo(sceneGraph);

      // Collect selected nodes + descendants
      const allNodeIds = new Set<string>();
      for (const id of selectedIds) {
        allNodeIds.add(id);
        const descendants = sceneGraph.getDescendants(id);
        for (const d of descendants) {
          allNodeIds.add(d.id);
        }
      }

      // Get root-level selected nodes (not descendants of other selected nodes)
      const rootSelectedIds = selectedIds.filter((id) => {
        const node = sceneGraph.getNode(id);
        if (!node) return false;
        // Walk up to see if any ancestor is also selected
        let current = node.parent;
        while (current) {
          if (allNodeIds.has(current)) return false;
          const parentNode = sceneGraph.getNode(current);
          current = parentNode?.parent ?? null;
        }
        return true;
      });

      // Collect all nodes for definition
      const nodesForDef: Node[] = [];
      for (const id of allNodeIds) {
        const node = sceneGraph.getNode(id);
        if (node) nodesForDef.push(structuredClone(node));
      }

      // The instance takes the selection's place: in the group the selected
      // layers share (the top level when they're in different ones), where the
      // first of them was. Each layer is placed in that group's space, so the
      // artwork stays where it is on the canvas
      const parentIds = new Set(
        rootSelectedIds.map((id) => sceneGraph.getNode(id)?.parent ?? null)
      );
      const instanceParent: string | null =
        parentIds.size === 1 ? (parentIds.values().next().value ?? null) : null;
      const siblings = instanceParent
        ? (sceneGraph.getNode(instanceParent)?.children ?? [])
        : sceneGraph.getRootNodes().map((n) => n.id);
      const placeAmongSiblings = (id: string): number => {
        // The layer's own place, or that of the sibling it's inside
        let current: string | null = id;
        while (current) {
          const index = siblings.indexOf(current);
          if (index !== -1) return index;
          current = sceneGraph.getNode(current)?.parent ?? null;
        }
        return -1;
      };
      const places = rootSelectedIds.map(placeAmongSiblings).filter((index) => index !== -1);
      // The selected layers before it are removed too, so this is its place after
      const instanceIndex = places.length > 0 ? Math.min(...places) : undefined;
      const toInstanceSpace = new Map<string, Matrix3 | null>(
        rootSelectedIds.map((id) => [id, reparentMatrix(sceneGraph, id, instanceParent)])
      );
      const placedTransform = (node: Node): Node['transform'] => {
        const m = toInstanceSpace.get(node.id);
        return m
          ? applyPlacement(node.transform, mapPlacement(placementOf(node.transform), m))
          : node.transform;
      };

      // Compute center of selected root nodes for instance position
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      for (const id of rootSelectedIds) {
        const node = sceneGraph.getNode(id);
        if (node) {
          const { position } = placedTransform(node);
          sumX += position.x;
          sumY += position.y;
          count++;
        }
      }
      const centerX = count > 0 ? sumX / count : 0;
      const centerY = count > 0 ? sumY / count : 0;

      // Make definition nodes root-relative (clear parent for root nodes)
      // and re-center positions relative to instance center so rendering
      // and hit-testing don't double-count the position offset.
      for (const node of nodesForDef) {
        if (rootSelectedIds.includes(node.id)) {
          node.parent = null;
          const transform = placedTransform(node);
          node.transform = {
            ...transform,
            position: {
              x: transform.position.x - centerX,
              y: transform.position.y - centerY,
            },
          };
          // A bound mesh's binding remembers its local transform (see moveNodeKeepingPlacement)
          const m = toInstanceSpace.get(node.id);
          const skin = (node as { skinData?: SkinData }).skinData;
          if (m && skin?.meshBindLocal) {
            (node as { skinData?: SkinData }).skinData = {
              ...skin,
              meshBindLocal: multiply6(m, skin.meshBindLocal),
            };
          }
        }
      }

      // Create symbol name from first node name or selection
      const firstNode = sceneGraph.getNode(rootSelectedIds[0]!);
      const symbolName =
        rootSelectedIds.length === 1 && firstNode
          ? firstNode.name
          : `Symbol ${state.symbols.length + 1}`;

      const symbolId = generateSymbolId();
      const definition: SymbolDefinition = {
        id: symbolId,
        name: symbolName,
        sceneGraphJSON: {
          nodes: nodesForDef,
          rootNodeIds: rootSelectedIds,
        },
      };

      // Remove original nodes from scene graph
      for (const id of rootSelectedIds) {
        sceneGraph.removeNode(id);
      }

      // Create instance node at center
      const instanceId = `inst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const instanceNode: SymbolInstanceNode = {
        id: instanceId,
        name: symbolName,
        type: 'symbol-instance',
        parent: instanceParent,
        children: [],
        transform: {
          position: { x: centerX, y: centerY },
          rotation: 0,
          scale: { x: 1, y: 1 },
          anchor: { x: 0, y: 0 },
          skew: { x: 0, y: 0 },
        },
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        symbolId,
        overrides: [],
      };

      sceneGraph.addNode(instanceNode, instanceParent ?? undefined);
      if (instanceIndex !== undefined)
        sceneGraph.moveNode(instanceId, instanceParent, instanceIndex);

      // Undo takes the new symbol out of the library as well (snapshots don't hold it)
      const step = get().undoStack[get().undoStack.length - 1];
      if (step) {
        step.symbolsAdded = [...(step.symbolsAdded ?? []), structuredClone(definition)];
      }

      set({
        symbols: [...state.symbols, definition],
        selectedNodeIds: new Set([instanceId]),
        isDirty: true,
      });

      return symbolId;
    },

    deleteSymbol: (symbolId: string, sceneGraph: SceneGraphLike) => {
      const state = get();
      const definition = state.symbols.find((s) => s.id === symbolId);
      if (!definition) return;

      state.pushUndo(sceneGraph);
      // Undo brings the symbol back as well as its instances (snapshots don't hold the library)
      const step = get().undoStack[get().undoStack.length - 1];
      if (step) {
        step.symbolsRemoved = [
          ...(step.symbolsRemoved ?? []),
          { index: state.symbols.indexOf(definition), symbol: structuredClone(definition) },
        ];
      }

      // Find all instances referencing this symbol and detach them
      const instancesToDetach: string[] = [];
      sceneGraph.traverse((node) => {
        if (node.type === 'symbol-instance' && node.symbolId === symbolId) {
          instancesToDetach.push(node.id);
        }
      });

      // Detach each instance (convert to group)
      for (const instId of instancesToDetach) {
        const inst = sceneGraph.getNode(instId) as SymbolInstanceNode | undefined;
        if (!inst) continue;

        const resolved = resolveSymbolInstance(inst, definition);
        const rootIds = new Set(definition.sceneGraphJSON.rootNodeIds);
        const rootNodes = resolved.filter((n) => rootIds.has(n.id));

        if (rootNodes.length === 1) {
          // Single root: the root replaces the instance (with its transform), and
          // its full subtree comes along (F028).
          sceneGraph.removeNode(instId);
          cloneResolvedSubtree(resolved, rootIds, inst.parent, sceneGraph, inst.transform);
        } else {
          // Multiple roots: wrap in group
          const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const group: GroupNode = {
            id: groupId,
            name: inst.name,
            type: 'group',
            parent: inst.parent,
            children: [],
            transform: { ...inst.transform },
            visible: inst.visible,
            locked: inst.locked,
            opacity: inst.opacity,
            blendMode: inst.blendMode,
          };
          sceneGraph.removeNode(instId);
          sceneGraph.addNode(group, inst.parent ?? undefined);

          // Full subtree, not just roots (F028).
          cloneResolvedSubtree(resolved, rootIds, groupId, sceneGraph);
        }
      }

      // Remove definition
      invalidateSymbolCache(symbolId);
      set({
        symbols: state.symbols.filter((s) => s.id !== symbolId),
        isDirty: true,
      });
    },

    renameSymbol: (symbolId: string, name: string) => {
      set((state) => ({
        symbols: state.symbols.map((s) => (s.id === symbolId ? { ...s, name } : s)),
        isDirty: true,
      }));
    },

    detachInstance: (sceneGraph: SceneGraphLike) => {
      const state = get();
      const selectedIds = Array.from(state.selectedNodeIds);
      if (selectedIds.length !== 1) return;

      const inst = sceneGraph.getNode(selectedIds[0]!) as SymbolInstanceNode | undefined;
      if (!inst || inst.type !== 'symbol-instance') return;

      const definition = state.symbols.find((s) => s.id === inst.symbolId);
      if (!definition) return;

      state.pushUndo(sceneGraph);

      const resolved = resolveSymbolInstance(inst, definition);
      const rootIds = new Set(definition.sceneGraphJSON.rootNodeIds);

      // Create a group with the resolved children
      const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const group: GroupNode = {
        id: groupId,
        name: inst.name,
        type: 'group',
        parent: inst.parent,
        children: [],
        transform: { ...inst.transform },
        visible: inst.visible,
        locked: inst.locked,
        opacity: inst.opacity,
        blendMode: inst.blendMode,
      };

      sceneGraph.removeNode(inst.id);
      sceneGraph.addNode(group, inst.parent ?? undefined);

      // Clone the FULL subtree (roots + descendants), not just the roots, so
      // nested artwork survives and no child ids dangle (F028).
      cloneResolvedSubtree(resolved, rootIds, groupId, sceneGraph);

      set({
        selectedNodeIds: new Set([groupId]),
        isDirty: true,
      });
    },

    placeSymbolInstance: (
      sceneGraph: SceneGraphLike,
      symbolId: string,
      at?: import('@quar/types').Vector2
    ) => {
      const state = get();
      const definition = state.symbols.find((s) => s.id === symbolId);
      if (!definition) return;

      state.pushUndo(sceneGraph);

      // In the middle of what the canvas shows (the origin with no canvas)
      const place = at ?? canvasViewCenter() ?? { x: 0, y: 0 };
      const instanceId = `inst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const instanceNode: SymbolInstanceNode = {
        id: instanceId,
        name: definition.name,
        type: 'symbol-instance',
        parent: null,
        children: [],
        transform: {
          position: { x: place.x, y: place.y },
          rotation: 0,
          scale: { x: 1, y: 1 },
          anchor: { x: 0, y: 0 },
          skew: { x: 0, y: 0 },
        },
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        symbolId,
        overrides: [],
      };

      sceneGraph.addNode(instanceNode);
      // Into the artboard there, keeping its place, as a layer drawn there goes
      const artboard = artboardAt(sceneGraph as unknown as SceneGraph, place);
      if (artboard) get().moveNodeKeepingPlacement(sceneGraph, instanceId, artboard.id);

      set({
        selectedNodeIds: new Set([instanceId]),
        isDirty: true,
      });
    },

    enterSymbolEdit: (symbolId: string, sceneGraph: SceneGraphLike) => {
      const state = get();
      const definition = state.symbols.find((s) => s.id === symbolId);
      if (!definition) return;

      // Save current scene state and stash the page's undo/redo history so
      // symbol edits get their own isolated history (restored on exit).
      const prevState = {
        sceneData: structuredClone(sceneGraph.toJSON()),
        selectedNodeIds: Array.from(state.selectedNodeIds),
        undoStack: state.undoStack,
        redoStack: state.redoStack,
      };

      // Load symbol definition into scene graph
      sceneGraph.fromJSON(structuredClone(definition.sceneGraphJSON));

      // Opening it changes nothing: only edits made inside are unsaved changes
      // (the scene's own events mark those, see useDirtyTracking)
      set({
        editingSymbolId: symbolId,
        editingSymbolPrevState: prevState,
        selectedNodeIds: new Set<string>(),
        enteredGroupId: null,
        undoStack: [],
        redoStack: [],
        canUndo: false,
        canRedo: false,
      });
    },

    exitSymbolEdit: (sceneGraph: SceneGraphLike) => {
      const state = get();
      if (!state.editingSymbolId || !state.editingSymbolPrevState) return;

      // Save edited symbol definition
      const updatedSceneJSON = structuredClone(sceneGraph.toJSON());
      const updatedSymbols = state.symbols.map((s) =>
        s.id === state.editingSymbolId ? { ...s, sceneGraphJSON: updatedSceneJSON } : s
      );

      // Restore previous scene
      sceneGraph.fromJSON(structuredClone(state.editingSymbolPrevState.sceneData));

      // Invalidate cache for this symbol
      invalidateSymbolCache(state.editingSymbolId);

      // Restore the page's undo/redo history stashed on enter.
      const restoredUndo = state.editingSymbolPrevState.undoStack;
      const restoredRedo = state.editingSymbolPrevState.redoStack;

      // Closing it is no change either: edits made inside marked the project
      set({
        symbols: updatedSymbols,
        editingSymbolId: null,
        editingSymbolPrevState: null,
        selectedNodeIds: new Set(state.editingSymbolPrevState.selectedNodeIds),
        enteredGroupId: null,
        undoStack: restoredUndo,
        redoStack: restoredRedo,
        canUndo: restoredUndo.length > 0,
        canRedo: restoredRedo.length > 0,
      });
    },

    setInstanceOverride: (
      sceneGraph: SceneGraphLike,
      instanceId: string,
      override: SymbolOverride
    ) => {
      const state = get();
      state.pushUndo(sceneGraph);

      const inst = sceneGraph.getNode(instanceId) as SymbolInstanceNode | undefined;
      if (!inst || inst.type !== 'symbol-instance') return;

      // Update or add override
      const existingIdx = inst.overrides.findIndex((o) => o.nodeId === override.nodeId);
      const newOverrides = [...inst.overrides];
      if (existingIdx >= 0) {
        // Merge properties
        newOverrides[existingIdx] = {
          nodeId: override.nodeId,
          properties: { ...newOverrides[existingIdx]!.properties, ...override.properties },
        };
      } else {
        newOverrides.push(override);
      }

      sceneGraph.updateNode(instanceId, { overrides: newOverrides } as Partial<Node>);
      invalidateSymbolCache(inst.symbolId);
      set({ isDirty: true });
    },

    resetInstanceOverrides: (sceneGraph: SceneGraphLike, instanceId: string) => {
      const state = get();
      state.pushUndo(sceneGraph);

      const inst = sceneGraph.getNode(instanceId) as SymbolInstanceNode | undefined;
      if (!inst || inst.type !== 'symbol-instance') return;

      sceneGraph.updateNode(instanceId, { overrides: [] } as Partial<Node>);
      invalidateSymbolCache(inst.symbolId);
      set({ isDirty: true });
    },
  };
}

// ============================================================================
// Selector Hooks
// ============================================================================

export const useActiveTool = (): ToolType =>
  useEditorStore((state: EditorStore) => state.activeTool);
export const useSetActiveTool = (): ((tool: ToolType) => void) =>
  useEditorStore((state: EditorStore) => state.setActiveTool);
export const useSelectedNodeIds = (): Set<string> =>
  useEditorStore((state: EditorStore) => state.selectedNodeIds);
export const useDefaultFill = (): Fill => useEditorStore((state: EditorStore) => state.defaultFill);
export const useDefaultStroke = (): Stroke =>
  useEditorStore((state: EditorStore) => state.defaultStroke);
export const useIsDrawing = (): boolean => useEditorStore((state: EditorStore) => state.isDrawing);

// Brush tool selectors
export const useBrushSize = (): number => useEditorStore((state: EditorStore) => state.brushSize);
export const useBrushSmoothing = (): number =>
  useEditorStore((state: EditorStore) => state.brushSmoothing);
export const useSetBrushSize = (): ((size: number) => void) =>
  useEditorStore((state: EditorStore) => state.setBrushSize);
export const useSetBrushSmoothing = (): ((smoothing: number) => void) =>
  useEditorStore((state: EditorStore) => state.setBrushSmoothing);

// Eraser tool selectors
export const useEraserSize = (): number => useEditorStore((state: EditorStore) => state.eraserSize);
export const useEraserMode = (): EraserMode =>
  useEditorStore((state: EditorStore) => state.eraserMode);
export const useSetEraserSize = (): ((size: number) => void) =>
  useEditorStore((state: EditorStore) => state.setEraserSize);
export const useSetEraserMode = (): ((mode: EraserMode) => void) =>
  useEditorStore((state: EditorStore) => state.setEraserMode);

// Brush profile selectors
export const useBrushProfiles = (): BrushProfile[] =>
  useEditorStore((state: EditorStore) => state.brushProfiles);
export const useActiveBrushProfileId = (): string | null =>
  useEditorStore((state: EditorStore) => state.activeBrushProfileId);
export const useSetActiveBrushProfile = (): ((id: string | null) => void) =>
  useEditorStore((state: EditorStore) => state.setActiveBrushProfile);
export const useApplyBrushProfileToSelection = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.applyBrushProfileToSelection);
export const useApplyBrushStrokeProfile = (): ((
  sceneGraph: SceneGraphLike,
  profileId: string | null
) => void) => useEditorStore((state: EditorStore) => state.applyBrushStrokeProfile);
export const useCreateBrushProfileFromSelection = (): ((
  sceneGraph: SceneGraphLike,
  name: string
) => BrushProfile | null) =>
  useEditorStore((state: EditorStore) => state.createBrushProfileFromSelection);

// Aspect ratio lock selectors
export const useAspectRatioLocked = (): boolean =>
  useEditorStore((state: EditorStore) => state.aspectRatioLocked);
export const useToggleAspectRatioLock = (): (() => void) =>
  useEditorStore((state: EditorStore) => state.toggleAspectRatioLock);

// Clipboard selectors
export const useClipboard = (): Node[] | null =>
  useEditorStore((state: EditorStore) => state.clipboard);
export const useCopySelection = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.copySelection);
export const usePasteClipboard = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.pasteClipboard);
export const useDuplicateSelection = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.duplicateSelection);
export const useDeleteSelection = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.deleteSelection);
export const useSelectAll = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.selectAll);
export const useGroupSelection = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.groupSelection);
export const useUngroupSelection = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.ungroupSelection);

// Timeline selectors
export const useCurrentFrame = (): number =>
  useEditorStore((state: EditorStore) => state.currentFrame);
export const useIsPlaying = (): boolean => useEditorStore((state: EditorStore) => state.isPlaying);
export const useIsLooping = (): boolean => useEditorStore((state: EditorStore) => state.isLooping);
export const useTimelineDuration = (): number =>
  useEditorStore((state: EditorStore) => state.timelineDuration);
export const useFrameRate = (): number => useEditorStore((state: EditorStore) => state.frameRate);
export const useTimelineExpanded = (): boolean =>
  useEditorStore((state: EditorStore) => state.timelineExpanded);
export const useSetCurrentFrame = (): ((frame: number) => void) =>
  useEditorStore((state: EditorStore) => state.setCurrentFrame);
export const useSetIsPlaying = (): ((playing: boolean) => void) =>
  useEditorStore((state: EditorStore) => state.setIsPlaying);
export const useSetIsLooping = (): ((looping: boolean) => void) =>
  useEditorStore((state: EditorStore) => state.setIsLooping);
export const useToggleTimelineExpanded = (): (() => void) =>
  useEditorStore((state: EditorStore) => state.toggleTimelineExpanded);

// Keyframe selectors
export const useTimeline = (): Timeline => useEditorStore((state: EditorStore) => state.timeline);
export const useAutoKeyframe = (): boolean =>
  useEditorStore((state: EditorStore) => state.autoKeyframe);
export const useToggleAutoKeyframe = (): (() => void) =>
  useEditorStore((state: EditorStore) => state.toggleAutoKeyframe);
export const useSelectedKeyframeIds = (): Set<string> =>
  useEditorStore((state: EditorStore) => state.selectedKeyframeIds);

// Snap-to-grid selectors
export const useSnapToGrid = (): boolean =>
  useEditorStore((state: EditorStore) => state.snapToGrid);
export const useGridSize = (): number => useEditorStore((state: EditorStore) => state.gridSize);
export const useToggleSnapToGrid = (): (() => void) =>
  useEditorStore((state: EditorStore) => state.toggleSnapToGrid);

// Ruler selectors
export const useShowRulers = (): boolean =>
  useEditorStore((state: EditorStore) => state.showRulers);
export const useToggleShowRulers = (): (() => void) =>
  useEditorStore((state: EditorStore) => state.toggleShowRulers);

// Guide selectors
export const useGuides = (): Guide[] => useEditorStore((state: EditorStore) => state.guides);
export const useShowGuides = (): boolean =>
  useEditorStore((state: EditorStore) => state.showGuides);
export const useSnapToGuides = (): boolean =>
  useEditorStore((state: EditorStore) => state.snapToGuides);

// Gradient editing selectors
export const useEditingGradient = () =>
  useEditorStore((state: EditorStore) => state.editingGradient);
export const useClearEditingGradient = () =>
  useEditorStore((state: EditorStore) => state.clearEditingGradient);

// Onion skin selectors
export const useOnionSkin = (): OnionSkinSettings =>
  useEditorStore((state: EditorStore) => state.onionSkin);
export const useToggleOnionSkin = (): (() => void) =>
  useEditorStore((state: EditorStore) => state.toggleOnionSkin);

// Project selectors
export const useProjectId = (): string | null =>
  useEditorStore((state: EditorStore) => state.projectId);
export const useProjectName = (): string =>
  useEditorStore((state: EditorStore) => state.projectName);
export const useIsDirty = (): boolean => useEditorStore((state: EditorStore) => state.isDirty);

// Z-order selectors
export const useBringForward = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.bringForward);
export const useSendBackward = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.sendBackward);
export const useBringToFront = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.bringToFront);
export const useSendToBack = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.sendToBack);

// Boolean operation selectors
export const useBooleanUnion = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.booleanUnion);
export const useBooleanSubtract = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.booleanSubtract);
export const useBooleanIntersect = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.booleanIntersect);
export const useBooleanExclude = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.booleanExclude);
export const useFlattenBooleanGroup = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.flattenBooleanGroup);
export const useReleaseBooleanGroup = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.releaseBooleanGroup);
export const useChangeBooleanOp = (): ((sceneGraph: SceneGraphLike, op: BooleanOp) => void) =>
  useEditorStore((state: EditorStore) => state.changeBooleanOp);
export const useConvertTextToPath = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.convertTextToPath);
export const useOutlineStroke = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.outlineStroke);

// History (undo/redo) selectors
export const useCanUndo = (): boolean => useEditorStore((state: EditorStore) => state.canUndo);
export const useCanRedo = (): boolean => useEditorStore((state: EditorStore) => state.canRedo);
export const useUndo = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.undo);
export const useRedo = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.redo);
export const usePushUndo = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.pushUndo);
export const useCutSelection = (): ((sceneGraph: SceneGraphLike) => void) =>
  useEditorStore((state: EditorStore) => state.cutSelection);

// Group entry selectors
export const useEnteredGroupId = (): string | null =>
  useEditorStore((state: EditorStore) => state.enteredGroupId);
export const useEnterGroup = (): ((groupId: string) => void) =>
  useEditorStore((state: EditorStore) => state.enterGroup);
export const useExitGroup = (): (() => void) =>
  useEditorStore((state: EditorStore) => state.exitGroup);

// Text editing selectors
export const useEditingTextNodeId = (): string | null =>
  useEditorStore((state: EditorStore) => state.editingTextNodeId);
export const useSetEditingTextNodeId = (): ((id: string | null) => void) =>
  useEditorStore((state: EditorStore) => state.setEditingTextNodeId);

// Weight painting selectors
export const useWeightPaintBoneId = (): string | null =>
  useEditorStore((state: EditorStore) => state.weightPaintBoneId);
export const useSetWeightPaintBoneId = (): ((id: string | null) => void) =>
  useEditorStore((state: EditorStore) => state.setWeightPaintBoneId);
export const useWeightPaintBrushSize = (): number =>
  useEditorStore((state: EditorStore) => state.weightPaintBrushSize);
export const useWeightPaintBrushStrength = (): number =>
  useEditorStore((state: EditorStore) => state.weightPaintBrushStrength);
export const useBindMeshToBones = (): ((
  sceneGraph: SceneGraphLike,
  nodeId: string,
  boneIds: string[]
) => void) => useEditorStore((state: EditorStore) => state.bindMeshToBones);
export const useUnbindMesh = (): ((sceneGraph: SceneGraphLike, nodeId: string) => void) =>
  useEditorStore((state: EditorStore) => state.unbindMesh);

// Page selectors
export const usePages = (): PageData[] => useEditorStore((state: EditorStore) => state.pages);
export const useActivePageId = (): string =>
  useEditorStore((state: EditorStore) => state.activePageId);
