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
  BoneGroup,
  DynamicChain,
  WindSettings,
  SymbolDefinition,
  SymbolOverride,
  SymbolInstanceNode,
} from '@quar/types';
import type { KeyframeClipboard, GraphViewTransform } from '@quar/animation';
import { createTimeline, KeyframeManager, tangentsToEasing } from '@quar/animation';
import {
  DEFAULT_ONION_SKIN_SETTINGS,
  createGroupNode,
  booleanOperation,
  createBooleanResultNode,
  computeBooleanGroupResult,
  convertTextToPathGroup as convertTextToPathGroupFn,
  outlineStroke as outlineStrokeFn,
  generateBrushOutline,
  tessellatePathToPoints,
  getShapeOutlinePoints,
  invalidateSymbolCache,
  resolveSymbolInstance,
} from '@quar/core';
import type { OnionSkinSettings, BooleanOp } from '@quar/core';
import {
  createSkinBinding,
  computeAutoWeights,
  computeFKChain,
  evaluateIKChains,
} from '@quar/rigging';
import type { FKBoneState } from '@quar/rigging';
import { toast } from '../components/common/Toast';

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

interface HistorySnapshot {
  sceneData: { nodes: Node[]; rootNodeIds: string[] };
  selectedNodeIds: string[];
  // Timeline + rigging arrays are mutated by delete/cut (removeAllKeyframesForNode,
  // chain filtering) but live outside the SceneGraph, so undo/redo must snapshot
  // and restore them too or they are lost permanently (F026).
  timeline: Timeline;
  ikChains: IKChain[];
  smartBoneActions: SmartBoneAction[];
  dynamicChains: DynamicChain[];
  vitruvianControllers: VitruvianController[];
}

interface HistoryCapturable {
  selectedNodeIds: Set<string>;
  timeline: Timeline;
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
    ikChains: structuredClone(state.ikChains),
    smartBoneActions: structuredClone(state.smartBoneActions),
    dynamicChains: structuredClone(state.dynamicChains),
    vitruvianControllers: structuredClone(state.vitruvianControllers),
  };
}

/** Store fields to restore from a popped history snapshot (F026). */
function restoredFieldsFrom(snapshot: HistorySnapshot) {
  const timeline = structuredClone(snapshot.timeline);
  return {
    selectedNodeIds: new Set(snapshot.selectedNodeIds),
    timeline,
    timelineDuration: timeline.duration,
    frameRate: timeline.frameRate,
    ikChains: structuredClone(snapshot.ikChains),
    smartBoneActions: structuredClone(snapshot.smartBoneActions),
    dynamicChains: structuredClone(snapshot.dynamicChains),
    vitruvianControllers: structuredClone(snapshot.vitruvianControllers),
  };
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
  selectedNodeIds: string[];
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
}

let nextPageCounter = 1;

function generatePageId(): string {
  return `page-${Date.now()}-${nextPageCounter++}`;
}

function createDefaultPage(name: string = 'Page 1'): PageData {
  return {
    id: generatePageId(),
    name,
    sceneGraphJSON: { nodes: [], rootNodeIds: [] },
    timeline: createTimeline({ duration: 300, frameRate: 30 }),
    selectedNodeIds: [],
    undoStack: [],
    redoStack: [],
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

export interface EditorStore {
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
  bindMeshToBones: (
    sceneGraph: SceneGraphLike,
    nodeId: string,
    boneIds: string[],
    tessellatedVertices?: Float32Array
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
  setIKChainEnabled: (chainId: string, enabled: boolean) => void;
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
  createSmartBoneAction: (boneId: string) => void;
  removeSmartBoneAction: (actionId: string) => void;
  setSmartBoneActionEnabled: (actionId: string, enabled: boolean) => void;
  updateSmartBoneDriver: (
    actionId: string,
    updates: { rangeMin?: number; rangeMax?: number }
  ) => void;
  addMorphTarget: (actionId: string, driverValue: number) => void;
  removeMorphTarget: (actionId: string, targetId: string) => void;
  startSmartBoneRecording: (actionId: string, targetId: string, sceneGraph: SceneGraphLike) => void;
  stopSmartBoneRecording: (sceneGraph: SceneGraphLike) => void;
  saveMorphTargetOffsets: (
    actionId: string,
    targetId: string,
    offsets: Record<string, MorphVertexOffset[]>
  ) => void;

  // Vitruvian Bones (bone group switching)
  vitruvianControllers: VitruvianController[];
  createVitruvianController: (name?: string) => string;
  removeVitruvianController: (controllerId: string) => void;
  setVitruvianControllerEnabled: (controllerId: string, enabled: boolean) => void;
  setVitruvianActiveGroup: (controllerId: string, groupId: string) => void;
  addVitruvianGroup: (controllerId: string, name: string, boneIds: string[]) => string;
  removeVitruvianGroup: (controllerId: string, groupId: string) => void;
  captureVitruvianSkinSnapshots: (
    controllerId: string,
    groupId: string,
    sceneGraph: SceneGraphLike
  ) => void;

  // Dynamic Bone Chains (physics)
  dynamicChains: DynamicChain[];
  globalWind: WindSettings;
  createDynamicChain: (sceneGraph: SceneGraphLike, rootBoneId: string) => void;
  removeDynamicChain: (chainId: string) => void;
  setDynamicChainEnabled: (chainId: string, enabled: boolean) => void;
  updateDynamicChainSettings: (
    chainId: string,
    settings: Partial<Omit<DynamicChain, 'id' | 'name' | 'rootBoneId' | 'boneIds'>>
  ) => void;
  setGlobalWind: (settings: Partial<WindSettings>) => void;

  // Aspect ratio lock
  aspectRatioLocked: boolean;
  toggleAspectRatioLock: () => void;

  // Clipboard & node operations
  clipboard: Node[] | null;
  copySelection: (sceneGraph: SceneGraphLike) => void;
  pasteClipboard: (sceneGraph: SceneGraphLike) => void;
  duplicateSelection: (sceneGraph: SceneGraphLike) => void;
  deleteSelection: (sceneGraph: SceneGraphLike) => void;
  selectAll: (sceneGraph: SceneGraphLike) => void;
  groupSelection: (sceneGraph: SceneGraphLike) => void;
  ungroupSelection: (sceneGraph: SceneGraphLike) => void;

  // Timeline state
  currentFrame: number;
  isPlaying: boolean;
  isLooping: boolean;
  timelineDuration: number;
  frameRate: number;
  timelineExpanded: boolean;
  setCurrentFrame: (frame: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setIsLooping: (looping: boolean) => void;
  setTimelineDuration: (duration: number) => void;
  setFrameRate: (rate: number) => void;
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
  removeSelectedKeyframes: (keyframeMap: Map<string, { nodeId: string; property: string }>) => void;
  setKeyframeEasing: (
    nodeId: string,
    property: string,
    keyframeId: string,
    easing: EasingFunction
  ) => void;
  copySelectedKeyframes: (keyframeMap: Map<string, { nodeId: string; property: string }>) => void;
  pasteKeyframes: (nodeId: string, frame: number) => void;
  moveSelectedKeyframes: (
    keyframeMap: Map<string, { nodeId: string; property: string }>,
    deltaFrames: number
  ) => void;
  removeKeyframeAtFrame: (nodeId: string, property: string, frame: number) => void;

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
  convertShapeToPath: (sceneGraph: SceneGraphLike, nodeId: string) => string | null;
  outlineStroke: (sceneGraph: SceneGraphLike) => void;

  // Undo/Redo history
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
  canUndo: boolean;
  canRedo: boolean;
  pushUndo: (sceneGraph: SceneGraphLike) => void;
  undo: (sceneGraph: SceneGraphLike) => void;
  redo: (sceneGraph: SceneGraphLike) => void;
  clearHistory: () => void;
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
  placeSymbolInstance: (sceneGraph: SceneGraphLike, symbolId: string) => void;
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
    // Flatten scene graph in depth-first order
    const flatOrder: string[] = [];
    sceneGraph.traverse((node) => {
      flatOrder.push(node.id);
    });
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
  brushProfiles: [
    { id: 'uniform', name: 'Uniform', samples: [1, 1] },
    { id: 'taper-out', name: 'Taper Out', samples: [1, 1, 0.8, 0.5, 0.2, 0] },
    { id: 'taper-in', name: 'Taper In', samples: [0, 0.2, 0.5, 0.8, 1, 1] },
    { id: 'taper-both', name: 'Taper Both', samples: [0, 0.3, 0.8, 1, 1, 0.8, 0.3, 0] },
    { id: 'bulge', name: 'Bulge', samples: [0.3, 0.7, 1, 1, 0.7, 0.3] },
    { id: 'calligraphic', name: 'Calligraphic', samples: [0.2, 0.8, 1, 0.6, 0.3] },
  ],
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
      const newOutline = generateBrushOutline(spine, effectiveWidths, profile);
      sceneGraph.updateNode(nodeId, {
        points: newOutline,
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
      const newOutline = generateBrushOutline(spine, effectiveWidths, profile);
      sceneGraph.updateNode(nodeId, {
        points: newOutline,
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
      const curr = rawPoints[i];
      const next = rawPoints[(i + 1) % rawPoints.length];
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
          if (samples[j] > 0) {
            prev = samples[j];
            break;
          }
        }
        for (let j = i + 1; j < samples.length; j++) {
          if (samples[j] > 0) {
            next = samples[j];
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
        samples[i] = samples[i] / maxW;
      }
    }

    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const profile: BrushProfile = { id, name, samples };

    set((s) => ({ brushProfiles: [...s.brushProfiles, profile] }));
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
  bindMeshToBones: (
    sceneGraph: SceneGraphLike,
    nodeId: string,
    boneIds: string[],
    tessellatedVertices?: Float32Array
  ) => {
    const node = sceneGraph.getNode(nodeId);
    if (!node) return;
    if (boneIds.length === 0) return;
    get().pushUndo(sceneGraph);

    // Use actual tessellated vertex count if available (from ShapeRenderer geometry cache).
    // This is critical for path nodes where tessellation subdivides bezier curves into
    // many more vertices than the control point count.
    let vertexCount: number;
    if (tessellatedVertices) {
      vertexCount = tessellatedVertices.length / 2;
    } else {
      // Fallback: approximate from node geometry
      vertexCount = 4; // default for rectangles
      if (node.type === 'ellipse') vertexCount = 64;
      else if (node.type === 'polygon')
        vertexCount = (node as any).sides * (((node as any).innerRadius ?? 0) > 0 ? 2 : 1);
      else if (node.type === 'path') vertexCount = (node as any).points?.length ?? 4;
    }

    const skin = createSkinBinding(nodeId, boneIds, vertexCount, sceneGraph);
    if (!skin) return;

    // Auto-weight based on bone positions
    // Compute bone states for all bones
    const allStates: FKBoneState[] = [];
    const rootBones = new Set<string>();
    for (const boneId of boneIds) {
      // Walk to root bone
      let rootId = boneId;
      let boneNode = sceneGraph.getNode(rootId);
      while (boneNode && boneNode.parent) {
        const parent = sceneGraph.getNode(boneNode.parent);
        if (!parent || parent.type !== 'bone') break;
        rootId = boneNode.parent;
        boneNode = parent;
      }
      if (!rootBones.has(rootId)) {
        rootBones.add(rootId);
        allStates.push(...computeFKChain(rootId, sceneGraph));
      }
    }

    // Use actual tessellated vertex positions (in local space, need world transform)
    // or generate approximate positions for auto-weighting
    let positions: Float32Array;
    if (tessellatedVertices) {
      // Transform tessellated vertices (local space) to world space for auto-weighting
      const meshWorld = sceneGraph.getWorldTransform(nodeId);
      positions = new Float32Array(tessellatedVertices.length);
      for (let i = 0; i < vertexCount; i++) {
        const lx = tessellatedVertices[i * 2];
        const ly = tessellatedVertices[i * 2 + 1];
        positions[i * 2] = meshWorld.a * lx + meshWorld.c * ly + meshWorld.tx;
        positions[i * 2 + 1] = meshWorld.b * lx + meshWorld.d * ly + meshWorld.ty;
      }
    } else {
      const meshWorld = sceneGraph.getWorldTransform(nodeId);
      positions = new Float32Array(vertexCount * 2);
      for (let i = 0; i < vertexCount; i++) {
        const t = vertexCount > 1 ? i / (vertexCount - 1) : 0.5;
        positions[i * 2] = meshWorld.tx + (t - 0.5) * 100;
        positions[i * 2 + 1] = meshWorld.ty;
      }
    }

    const weighted = computeAutoWeights(skin, positions, allStates);

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

    // Walk parent chain to find root
    const chain: BoneNode[] = [];
    let currentId: string | null = endEffectorBoneId;
    while (currentId) {
      const node = sceneGraph.getNode(currentId);
      if (!node || node.type !== 'bone') break;
      chain.unshift(node);
      currentId = node.parent;
      if (chainDepth != null && chain.length >= chainDepth) break;
    }

    if (chain.length === 0) {
      toast.error('No valid bone chain found');
      return;
    }

    const rootBoneId = chain[0].id;

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
    const tipX = endBoneWT.a * boneLen + endBoneWT.tx;
    const tipY = endBoneWT.b * boneLen + endBoneWT.ty;

    const chainId = `ik_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const targetId = `ikt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Create IK target node at end effector tip
    const targetNode: IKTargetNode = {
      id: targetId,
      name: `IK Target (${endBone.name})`,
      type: 'ik-target',
      parent: null,
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

    sceneGraph.addNode(targetNode as any);

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

  setIKChainEnabled: (chainId: string, enabled: boolean) => {
    const { ikChains } = get();
    set({
      ikChains: ikChains.map((c) => (c.id === chainId ? { ...c, enabled } : c)),
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
    });
  },

  // Smart Bones (corrective morph targets)
  smartBoneActions: [] as SmartBoneAction[],
  smartBoneRecordingActionId: null as string | null,
  smartBoneRecordingTargetId: null as string | null,
  smartBoneRecordingPrevTool: null as ToolType | null,
  smartBoneRecordingPrevRotation: null as number | null,

  createSmartBoneAction: (boneId: string) => {
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

  removeSmartBoneAction: (actionId: string) => {
    set({
      smartBoneActions: get().smartBoneActions.filter((a) => a.id !== actionId),
      isDirty: true,
      // Stop recording if the removed action was being recorded
      ...(get().smartBoneRecordingActionId === actionId
        ? {
            smartBoneRecordingActionId: null,
            smartBoneRecordingTargetId: null,
            smartBoneRecordingPrevTool: null,
            smartBoneRecordingPrevRotation: null,
          }
        : {}),
    });
  },

  setSmartBoneActionEnabled: (actionId: string, enabled: boolean) => {
    set({
      smartBoneActions: get().smartBoneActions.map((a) =>
        a.id === actionId ? { ...a, enabled } : a
      ),
    });
  },

  updateSmartBoneDriver: (actionId: string, updates: { rangeMin?: number; rangeMax?: number }) => {
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

  addMorphTarget: (actionId: string, driverValue: number) => {
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

  removeMorphTarget: (actionId: string, targetId: string) => {
    set({
      smartBoneActions: get().smartBoneActions.map((a) =>
        a.id === actionId ? { ...a, targets: a.targets.filter((t) => t.id !== targetId) } : a
      ),
      isDirty: true,
      // Stop recording if the removed target was being recorded
      ...(get().smartBoneRecordingTargetId === targetId
        ? {
            smartBoneRecordingActionId: null,
            smartBoneRecordingTargetId: null,
            smartBoneRecordingPrevTool: null,
            smartBoneRecordingPrevRotation: null,
          }
        : {}),
    });
  },

  startSmartBoneRecording: (actionId: string, targetId: string, sceneGraph: SceneGraphLike) => {
    const state = get();
    const action = state.smartBoneActions.find((a) => a.id === actionId);
    if (!action) return;
    const target = action.targets.find((t) => t.id === targetId);
    if (!target) return;

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

  stopSmartBoneRecording: (sceneGraph: SceneGraphLike) => {
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
      smartBoneRecordingActionId: null,
      smartBoneRecordingTargetId: null,
      activeTool: state.smartBoneRecordingPrevTool ?? 'selection',
      smartBoneRecordingPrevTool: null,
      smartBoneRecordingPrevRotation: null,
    });
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

  createVitruvianController: (name?: string) => {
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

  removeVitruvianController: (controllerId: string) => {
    set({
      vitruvianControllers: get().vitruvianControllers.filter((c) => c.id !== controllerId),
      isDirty: true,
    });
    toast.info('Vitruvian controller removed');
  },

  setVitruvianControllerEnabled: (controllerId: string, enabled: boolean) => {
    set({
      vitruvianControllers: get().vitruvianControllers.map((c) =>
        c.id === controllerId ? { ...c, enabled } : c
      ),
    });
  },

  setVitruvianActiveGroup: (controllerId: string, groupId: string) => {
    set({
      vitruvianControllers: get().vitruvianControllers.map((c) =>
        c.id === controllerId ? { ...c, activeGroupId: groupId } : c
      ),
      isDirty: true,
    });
  },

  addVitruvianGroup: (controllerId: string, name: string, boneIds: string[]) => {
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

  removeVitruvianGroup: (controllerId: string, groupId: string) => {
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
  globalWind: {
    strength: 0,
    direction: 0,
    turbulence: 0,
    frequency: 1,
    enabled: false,
  } as WindSettings,

  createDynamicChain: (sceneGraph: SceneGraphLike, rootBoneId: string) => {
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
      currentId = childBones[0];
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

  removeDynamicChain: (chainId: string) => {
    set({
      dynamicChains: get().dynamicChains.filter((c) => c.id !== chainId),
      isDirty: true,
    });
    toast.info('Dynamic chain removed');
  },

  setDynamicChainEnabled: (chainId: string, enabled: boolean) => {
    set({
      dynamicChains: get().dynamicChains.map((c) => (c.id === chainId ? { ...c, enabled } : c)),
    });
  },

  updateDynamicChainSettings: (
    chainId: string,
    settings: Partial<Omit<DynamicChain, 'id' | 'name' | 'rootBoneId' | 'boneIds'>>
  ) => {
    set({
      dynamicChains: get().dynamicChains.map((c) => (c.id === chainId ? { ...c, ...settings } : c)),
      isDirty: true,
    });
  },

  setGlobalWind: (settings: Partial<WindSettings>) => {
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
    if (clones.length > 0) set({ clipboard: clones });
  },
  pasteClipboard: (sceneGraph: SceneGraphLike) => {
    const { clipboard } = get();
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
    for (const oldId of oldIdToClone.keys()) {
      oldToNewId.set(oldId, `node_${idCounter++}_${Math.random().toString(36).slice(2, 8)}`);
    }

    // Remap IDs, parent refs, and children refs
    const newNodes: Node[] = [];
    for (const [oldId, clone] of oldIdToClone) {
      clone.id = oldToNewId.get(oldId)!;
      // Remap children to new IDs (keep only those present in clipboard)
      clone.children = clone.children
        .filter((childId: string) => oldToNewId.has(childId))
        .map((childId: string) => oldToNewId.get(childId)!);
      // Remap parent
      if (clone.parent && oldToNewId.has(clone.parent)) {
        clone.parent = oldToNewId.get(clone.parent)!;
      } else {
        clone.parent = null;
      }
      newNodes.push(clone);
    }

    // Find root nodes (those with parent = null) and offset their positions
    const rootIds: string[] = [];
    for (const node of newNodes) {
      if (node.parent === null) {
        rootIds.push(node.id);
        node.transform = {
          ...node.transform,
          position: {
            x: node.transform.position.x + 20,
            y: node.transform.position.y - 20,
          },
        };
      }
    }

    // Add nodes in parent-first order (roots first, then children)
    const added = new Set<string>();
    const addRecursive = (node: Node) => {
      if (added.has(node.id)) return;
      // Ensure parent is added first
      if (node.parent) {
        const parent = newNodes.find((n) => n.id === node.parent);
        if (parent && !added.has(parent.id)) {
          addRecursive(parent);
        }
      }
      sceneGraph.addNode({ ...node, children: [] }, node.parent ?? undefined);
      added.add(node.id);
      // Add children in order
      for (const childId of node.children) {
        const child = newNodes.find((n) => n.id === childId);
        if (child) addRecursive(child);
      }
    };
    for (const node of newNodes) {
      if (node.parent === null) addRecursive(node);
    }

    set({ selectedNodeIds: new Set(rootIds) });
  },
  duplicateSelection: (sceneGraph: SceneGraphLike) => {
    const { copySelection } = get();
    // pushUndo is called inside pasteClipboard, so no extra push needed here
    copySelection(sceneGraph);
    get().pasteClipboard(sceneGraph);
  },
  deleteSelection: (sceneGraph: SceneGraphLike) => {
    const { selectedNodeIds, timeline, enteredGroupId, ikChains, smartBoneActions, dynamicChains } =
      get();
    if (selectedNodeIds.size === 0) return;
    get().pushUndo(sceneGraph);
    // Clean up keyframe tracks for deleted nodes
    const mgr = new KeyframeManager(timeline);
    // Clean up IK chains if deleting IK target nodes
    let newIkChains = ikChains;
    for (const id of selectedNodeIds) {
      const node = sceneGraph.getNode(id);
      if (node && node.type === 'ik-target') {
        const chainId = node.ikChainId;
        newIkChains = newIkChains.filter((c) => c.id !== chainId);
      }
      mgr.removeAllKeyframesForNode(id);
      sceneGraph.removeNode(id);
    }
    // Clean up Smart Bone actions referencing deleted bones
    const newSmartBoneActions = smartBoneActions.filter(
      (a) => !selectedNodeIds.has(a.driver.boneId)
    );
    // Clean up Dynamic Chains referencing deleted bones
    const newDynamicChains = dynamicChains.filter((c) => !selectedNodeIds.has(c.rootBoneId));
    // Clear enteredGroupId if the entered group no longer exists
    const clearGroup = enteredGroupId && !sceneGraph.getNode(enteredGroupId);
    set({
      selectedNodeIds: new Set<string>(),
      editingGradient: null,
      timeline: { ...timeline },
      isDirty: true,
      ikChains: newIkChains,
      smartBoneActions: newSmartBoneActions,
      dynamicChains: newDynamicChains,
      ...(clearGroup ? { enteredGroupId: null } : {}),
    });
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
    const firstIndex = siblings.indexOf(orderedSelected[0]);
    const insertIndex = firstIndex !== -1 ? firstIndex : 0;

    // Create and add the group node
    const groupId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const group = createGroupNode(groupId, 'Group');
    sceneGraph.addNode(group, commonParent ?? undefined);

    // Move group to the correct insertion index
    sceneGraph.moveNode(groupId, commonParent, insertIndex);

    // Move each selected node (in scene-graph order) into the group
    for (const id of orderedSelected) {
      sceneGraph.moveNode(id, groupId);
    }

    set({ selectedNodeIds: new Set([groupId]), isDirty: true });
  },
  ungroupSelection: (sceneGraph: SceneGraphLike) => {
    const { selectedNodeIds, enteredGroupId } = get();
    if (selectedNodeIds.size === 0) return;
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

      // Move children out to the group's parent, preserving order
      const childIds = [...node.children];
      for (let i = 0; i < childIds.length; i++) {
        sceneGraph.moveNode(childIds[i], parentId ?? null, insertAt + i);
        movedChildIds.push(childIds[i]);
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

  // Timeline state
  currentFrame: 0,
  isPlaying: false,
  isLooping: true,
  timelineDuration: 300,
  frameRate: 30,
  timelineExpanded: true,
  setCurrentFrame: (frame: number) =>
    set((state) => ({
      currentFrame: Math.max(0, Math.min(state.timelineDuration - 1, Math.round(frame))),
    })),
  setIsPlaying: (playing: boolean) => set({ isPlaying: playing }),
  setIsLooping: (looping: boolean) => set({ isLooping: looping }),
  setTimelineDuration: (duration: number) => {
    const d = Math.max(1, Math.round(duration));
    set((state) => {
      const updates: Partial<EditorStore> = {
        timelineDuration: d,
        timeline: { ...state.timeline, duration: d },
      };
      // Clamp work area bounds when duration shrinks
      if (state.workAreaEnd >= d) {
        updates.workAreaEnd = d - 1;
      }
      if (state.workAreaStart >= d) {
        updates.workAreaStart = Math.max(0, d - 2);
      }
      const newEnd = (updates.workAreaEnd as number) ?? state.workAreaEnd;
      const newStart = (updates.workAreaStart as number) ?? state.workAreaStart;
      if (newStart >= newEnd) {
        updates.workAreaStart = Math.max(0, newEnd - 1);
      }
      return updates;
    });
  },
  setFrameRate: (rate: number) => {
    const r = Math.max(1, Math.min(120, Math.round(rate)));
    set((state) => ({
      frameRate: r,
      timeline: { ...state.timeline, frameRate: r },
    }));
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
    const track = timeline.tracks.find((t) => t.nodeId === nodeId && t.property === property);
    if (!track) return;
    const kfIndex = track.keyframes.findIndex((kf) => kf.time === time);
    if (kfIndex === -1) return;
    const newKeyframes = [...track.keyframes];
    newKeyframes[kfIndex] = { ...newKeyframes[kfIndex], value: newValue };
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
    const { timeline } = get();
    const track = timeline.tracks.find((t) => t.nodeId === nodeId && t.property === property);
    if (!track) return;
    const kfIndex = track.keyframes.findIndex((kf) => kf.time === oldTime);
    if (kfIndex === -1) return;
    const roundedTime = Math.max(0, Math.round(newTime));
    const newKeyframes = [...track.keyframes];
    newKeyframes[kfIndex] = { ...newKeyframes[kfIndex], time: roundedTime, value: newValue };
    // Sort by time after moving
    newKeyframes.sort((a, b) => a.time - b.time);
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

    const kf = track.keyframes[kfIndex];
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
      const nextKf = track.keyframes[kfIndex + 1];
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
  selectKeyframe: (id: string) => set({ selectedKeyframeIds: new Set([id]) }),
  addKeyframeToSelection: (id: string) =>
    set((state) => ({
      selectedKeyframeIds: new Set([...state.selectedKeyframeIds, id]),
    })),
  clearKeyframeSelection: () => set({ selectedKeyframeIds: new Set<string>() }),
  setSelectedKeyframeIds: (ids: string[]) => set({ selectedKeyframeIds: new Set(ids) }),
  addKeyframeAtFrame: (
    nodeId: string,
    property: string,
    frame: number,
    value: unknown,
    easing: EasingFunction = 'linear'
  ) => {
    const { timeline } = get();
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
  removeSelectedKeyframes: (keyframeMap: Map<string, { nodeId: string; property: string }>) => {
    const { timeline, selectedKeyframeIds } = get();
    if (selectedKeyframeIds.size === 0) return;
    const mgr = new KeyframeManager(timeline);
    const toRemove: Array<{ nodeId: string; property: string; keyframeId: string }> = [];
    for (const kfId of selectedKeyframeIds) {
      const info = keyframeMap.get(kfId);
      if (info) {
        toRemove.push({ nodeId: info.nodeId, property: info.property, keyframeId: kfId });
      }
    }
    mgr.removeKeyframes(toRemove);
    set({ timeline: { ...timeline }, selectedKeyframeIds: new Set<string>(), isDirty: true });
  },
  setKeyframeEasing: (
    nodeId: string,
    property: string,
    keyframeId: string,
    easing: EasingFunction
  ) => {
    const { timeline } = get();
    const mgr = new KeyframeManager(timeline);
    mgr.setKeyframeEasing(nodeId, property, keyframeId, easing);
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
  pasteKeyframes: (nodeId: string, frame: number) => {
    const { timeline, keyframeClipboard } = get();
    if (!keyframeClipboard) return;
    const mgr = new KeyframeManager(timeline);
    const pasted = mgr.pasteKeyframes(keyframeClipboard, nodeId, frame);
    set({
      timeline: { ...timeline },
      selectedKeyframeIds: new Set(pasted.map((kf: Keyframe) => kf.id)),
      isDirty: true,
    });
  },
  moveSelectedKeyframes: (
    keyframeMap: Map<string, { nodeId: string; property: string }>,
    deltaFrames: number
  ) => {
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
    mgr.moveKeyframes(entries, deltaFrames);
    set({ timeline: { ...timeline }, isDirty: true });
  },
  removeKeyframeAtFrame: (nodeId: string, property: string, frame: number) => {
    const { timeline } = get();
    const mgr = new KeyframeManager(timeline);
    const kf = mgr.getKeyframeAt(nodeId, property, frame);
    if (!kf) return;
    mgr.removeKeyframe(nodeId, property, kf.id);
    set({ timeline: { ...timeline }, isDirty: true });
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
      effects[effectIndex] = {
        ...effects[effectIndex],
        visible: !effects[effectIndex].visible,
      } as Effect;
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
    const firstNode = orderedNodes[0];
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
      sceneGraph.moveNode(node.id, groupId);
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

      const groupId = [...selectedNodeIds][0];
      const node = sceneGraph.getNode(groupId);
      if (!node || node.type !== 'group' || !node.booleanOp) {
        toast.error('Select a boolean group to flatten');
        return;
      }

      const groupNode = node;
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
        groupNode.booleanOp!,
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

        // Move children out
        const childIds = [...node.children];
        for (let i = 0; i < childIds.length; i++) {
          sceneGraph.moveNode(childIds[i], parentId ?? null, insertAt + i);
          movedChildIds.push(childIds[i]);
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
      const node = sceneGraph.getNode(nodeId);
      if (!node) return null;
      if (node.type !== 'rectangle' && node.type !== 'ellipse' && node.type !== 'polygon') {
        return null;
      }

      const outline = getShapeOutlinePoints(node);
      if (!outline || outline.points.length < 2) return null;

      get().pushUndo(sceneGraph);

      const newId = `s2p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const fills = 'fills' in node ? (node as any).fills : [];
      const strokes = 'strokes' in node ? (node as any).strokes : [];

      const pathNode: PathNode = {
        id: newId,
        name: `${node.name} (Path)`,
        type: 'path',
        parent: node.parent,
        children: [],
        transform: {
          position: { ...node.transform.position },
          rotation: node.transform.rotation,
          scale: { ...node.transform.scale },
          anchor: { x: 0.5, y: 0.5 },
          skew: { ...node.transform.skew },
        },
        visible: node.visible,
        locked: node.locked,
        opacity: node.opacity,
        blendMode: node.blendMode,
        effects: node.effects ? [...node.effects] : undefined,
        points: outline.points,
        subpaths: outline.subpaths,
        closed: outline.closed,
        fills: fills.length > 0 ? structuredClone(fills) : [],
        strokes: strokes.length > 0 ? structuredClone(strokes) : [],
      };

      // Find insertion point (preserve z-order)
      const parentId = node.parent;
      const siblings = parentId
        ? (sceneGraph.getNode(parentId)?.children ?? [])
        : sceneGraph.getRootNodes().map((n: Node) => n.id);
      const insertIndex = siblings.indexOf(nodeId);

      // Add path node, position it, remove original
      sceneGraph.addNode(pathNode, parentId ?? undefined);
      if (insertIndex >= 0) {
        sceneGraph.moveNode(newId, parentId ?? null, insertIndex);
      }
      sceneGraph.removeNode(nodeId);

      set({ selectedNodeIds: new Set([newId]), isDirty: true });
      return newId;
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
      const snapshot = makeHistorySnapshot(sceneGraph, state);
      const newStack = [...undoStack, snapshot];
      if (newStack.length > MAX_UNDO_STACK_SIZE) {
        newStack.shift();
      }
      set({
        undoStack: newStack,
        redoStack: [],
        canUndo: true,
        canRedo: false,
      });
    },

    undo: (sceneGraph: SceneGraphLike) => {
      const state = get();
      const { undoStack, redoStack } = state;
      if (undoStack.length === 0) return;

      // Save current state to redo stack
      const newRedoStack = [...redoStack, makeHistorySnapshot(sceneGraph, state)];

      // Pop and restore from undo stack
      const newUndoStack = [...undoStack];
      const snapshot = newUndoStack.pop()!;
      sceneGraph.fromJSON(structuredClone(snapshot.sceneData));

      set({
        undoStack: newUndoStack,
        redoStack: newRedoStack,
        canUndo: newUndoStack.length > 0,
        canRedo: true,
        enteredGroupId: null,
        isDirty: true,
        ...restoredFieldsFrom(snapshot),
      });
    },

    redo: (sceneGraph: SceneGraphLike) => {
      const state = get();
      const { undoStack, redoStack } = state;
      if (redoStack.length === 0) return;

      // Save current state to undo stack
      const newUndoStack = [...undoStack, makeHistorySnapshot(sceneGraph, state)];

      // Pop and restore from redo stack
      const newRedoStack = [...redoStack];
      const snapshot = newRedoStack.pop()!;
      sceneGraph.fromJSON(structuredClone(snapshot.sceneData));

      set({
        undoStack: newUndoStack,
        redoStack: newRedoStack,
        canUndo: true,
        canRedo: newRedoStack.length > 0,
        enteredGroupId: null,
        isDirty: true,
        ...restoredFieldsFrom(snapshot),
      });
    },

    clearHistory: () => {
      set({
        undoStack: [],
        redoStack: [],
        canUndo: false,
        canRedo: false,
        smartBoneRecordingActionId: null,
        smartBoneRecordingTargetId: null,
        smartBoneRecordingPrevTool: null,
        smartBoneRecordingPrevRotation: null,
        vitruvianControllers: [],
        dynamicChains: [],
      });
    },

    cutSelection: (sceneGraph: SceneGraphLike) => {
      const { selectedNodeIds, copySelection, timeline } = get();
      if (selectedNodeIds.size === 0) return;

      // Push undo snapshot before cut
      get().pushUndo(sceneGraph);

      // Copy to clipboard
      copySelection(sceneGraph);

      // Delete selection (inline to avoid double pushUndo)
      const mgr = new KeyframeManager(timeline);
      for (const id of selectedNodeIds) {
        mgr.removeAllKeyframesForNode(id);
        sceneGraph.removeNode(id);
      }
      set({
        selectedNodeIds: new Set<string>(),
        editingGradient: null,
        timeline: { ...timeline },
        isDirty: true,
      });
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
      const state = get();
      // Save current page state first (immutable update)
      const updatedPages = state.pages.map((p) => {
        if (p.id !== state.activePageId) return p;
        return {
          ...p,
          sceneGraphJSON: structuredClone(sceneGraph.toJSON()),
          timeline: structuredClone(state.timeline),
          selectedNodeIds: Array.from(state.selectedNodeIds),
          undoStack: state.undoStack,
          redoStack: state.redoStack,
        };
      });

      const pageNum = state.pages.length + 1;
      const newPage = createDefaultPage(`Page ${pageNum}`);

      // Switch scene graph to empty
      sceneGraph.fromJSON(newPage.sceneGraphJSON);

      set({
        pages: [...updatedPages, newPage],
        activePageId: newPage.id,
        timeline: structuredClone(newPage.timeline),
        selectedNodeIds: new Set<string>(),
        selectedKeyframeIds: new Set<string>(),
        undoStack: [],
        redoStack: [],
        canUndo: false,
        canRedo: false,
        enteredGroupId: null,
        clipboard: null,
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
          timeline: structuredClone(switchTo.timeline),
          selectedNodeIds: new Set(switchTo.selectedNodeIds),
          selectedKeyframeIds: new Set<string>(),
          undoStack: switchTo.undoStack,
          redoStack: switchTo.redoStack,
          canUndo: switchTo.undoStack.length > 0,
          canRedo: switchTo.redoStack.length > 0,
          enteredGroupId: null,
          clipboard: null,
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
            selectedNodeIds: Array.from(state.selectedNodeIds),
            undoStack: state.undoStack,
            redoStack: state.redoStack,
          };
        });
        sourcePage = updatedPages.find((p) => p.id === pageId)!;
      }

      const newPage: PageData = {
        id: generatePageId(),
        name: `${sourcePage.name} Copy`,
        sceneGraphJSON: structuredClone(sourcePage.sceneGraphJSON),
        timeline: structuredClone(sourcePage.timeline),
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
        timeline: structuredClone(targetPage.timeline),
        selectedNodeIds: new Set(targetPage.selectedNodeIds),
        selectedKeyframeIds: new Set<string>(),
        undoStack: targetPage.undoStack,
        redoStack: targetPage.redoStack,
        canUndo: targetPage.undoStack.length > 0,
        canRedo: targetPage.redoStack.length > 0,
        enteredGroupId: null,
        clipboard: null,
        currentFrame: 0,
        isPlaying: false,
        isDirty: true,
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
        newPages.splice(toIndex, 0, moved!);
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

      // Compute center of selected root nodes for instance position
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      for (const id of rootSelectedIds) {
        const node = sceneGraph.getNode(id);
        if (node) {
          sumX += node.transform.position.x;
          sumY += node.transform.position.y;
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
          node.transform = {
            ...node.transform,
            position: {
              x: node.transform.position.x - centerX,
              y: node.transform.position.y - centerY,
            },
          };
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
        parent: null,
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

      sceneGraph.addNode(instanceNode);

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
          // Single root: replace instance with the root node
          const replacement = structuredClone(rootNodes[0]);
          replacement.id = `detached-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          replacement.parent = inst.parent;
          replacement.transform = { ...inst.transform };
          sceneGraph.removeNode(instId);
          sceneGraph.addNode(replacement, inst.parent ?? undefined);
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

          for (const child of rootNodes) {
            const clone = structuredClone(child);
            clone.id = `detached-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            clone.parent = groupId;
            sceneGraph.addNode(clone, groupId);
          }
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
      const rootNodes = resolved.filter((n) => rootIds.has(n.id));

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

      for (const child of rootNodes) {
        const clone = structuredClone(child);
        clone.id = `detached-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        sceneGraph.addNode(clone, groupId);
      }

      set({
        selectedNodeIds: new Set([groupId]),
        isDirty: true,
      });
    },

    placeSymbolInstance: (sceneGraph: SceneGraphLike, symbolId: string) => {
      const state = get();
      const definition = state.symbols.find((s) => s.id === symbolId);
      if (!definition) return;

      state.pushUndo(sceneGraph);

      const instanceId = `inst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const instanceNode: SymbolInstanceNode = {
        id: instanceId,
        name: definition.name,
        type: 'symbol-instance',
        parent: null,
        children: [],
        transform: {
          position: { x: 0, y: 0 },
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

      set({
        editingSymbolId: symbolId,
        editingSymbolPrevState: prevState,
        selectedNodeIds: new Set<string>(),
        enteredGroupId: null,
        undoStack: [],
        redoStack: [],
        canUndo: false,
        canRedo: false,
        isDirty: true,
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
        isDirty: true,
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
