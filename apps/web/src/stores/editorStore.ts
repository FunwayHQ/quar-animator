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
} from '@quar/types';
import type { KeyframeClipboard } from '@quar/animation';
import { createTimeline, KeyframeManager } from '@quar/animation';
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
}

// ============================================================================
// Eraser Mode Type (matches EraserTool)
// ============================================================================

export type EraserMode = 'stroke' | 'point';

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
      chain.unshift(node as BoneNode);
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
    const boneLen = (endBone as BoneNode).length;
    const tipX = endBoneWT.a * boneLen + endBoneWT.tx;
    const tipY = endBoneWT.b * boneLen + endBoneWT.ty;

    const chainId = `ik_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const targetId = `ikt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Create IK target node at end effector tip
    const targetNode: IKTargetNode = {
      id: targetId,
      name: `IK Target (${(endBone as BoneNode).name})`,
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

  // Aspect ratio lock
  aspectRatioLocked: false,
  toggleAspectRatioLock: () => set((state) => ({ aspectRatioLocked: !state.aspectRatioLocked })),

  // Clipboard & node operations
  clipboard: null,
  copySelection: (sceneGraph: SceneGraphLike) => {
    const { selectedNodeIds } = get();
    if (selectedNodeIds.size === 0) return;
    const clones: Node[] = [];
    for (const id of selectedNodeIds) {
      const node = sceneGraph.getNode(id);
      if (node) clones.push(structuredClone(node));
    }
    if (clones.length > 0) set({ clipboard: clones });
  },
  pasteClipboard: (sceneGraph: SceneGraphLike) => {
    const { clipboard } = get();
    if (!clipboard || clipboard.length === 0) return;
    get().pushUndo(sceneGraph);
    const newIds: string[] = [];
    for (const original of clipboard) {
      const newNode = structuredClone(original);
      newNode.id = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      newNode.parent = null;
      newNode.children = [];
      // Offset position
      newNode.transform = {
        ...newNode.transform,
        position: {
          x: newNode.transform.position.x + 20,
          y: newNode.transform.position.y - 20,
        },
      };
      sceneGraph.addNode(newNode);
      newIds.push(newNode.id);
    }
    set({ selectedNodeIds: new Set(newIds) });
  },
  duplicateSelection: (sceneGraph: SceneGraphLike) => {
    const { copySelection } = get();
    // pushUndo is called inside pasteClipboard, so no extra push needed here
    copySelection(sceneGraph);
    get().pasteClipboard(sceneGraph);
  },
  deleteSelection: (sceneGraph: SceneGraphLike) => {
    const { selectedNodeIds, timeline, enteredGroupId, ikChains } = get();
    if (selectedNodeIds.size === 0) return;
    get().pushUndo(sceneGraph);
    // Clean up keyframe tracks for deleted nodes
    const mgr = new KeyframeManager(timeline);
    // Clean up IK chains if deleting IK target nodes
    let newIkChains = ikChains;
    for (const id of selectedNodeIds) {
      const node = sceneGraph.getNode(id);
      if (node && node.type === 'ik-target') {
        const chainId = (node as IKTargetNode).ikChainId;
        newIkChains = newIkChains.filter((c) => c.id !== chainId);
      }
      mgr.removeAllKeyframesForNode(id);
      sceneGraph.removeNode(id);
    }
    // Clear enteredGroupId if the entered group no longer exists
    const clearGroup = enteredGroupId && !sceneGraph.getNode(enteredGroupId);
    set({
      selectedNodeIds: new Set<string>(),
      editingGradient: null,
      timeline: { ...timeline },
      isDirty: true,
      ikChains: newIkChains,
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
        sceneGraph.moveNode(id, parentId, index + 2);
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
    (group as GroupNode).booleanOp = op;
    (group as GroupNode).fills =
      fills.length > 0
        ? structuredClone(fills)
        : [{ type: 'solid', color: { r: 100, g: 149, b: 237, a: 1 }, opacity: 1, visible: true }];
    (group as GroupNode).strokes = strokes.length > 0 ? structuredClone(strokes) : [];

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
      get().pushUndo(sceneGraph);

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

      const resultNode = booleanOperation(
        children,
        worldTransforms,
        groupNode.booleanOp!,
        generateId
      );
      if (!resultNode) {
        toast.info('Boolean operation produced an empty result');
        return;
      }

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
      const { undoStack, selectedNodeIds } = get();
      const snapshot: HistorySnapshot = {
        sceneData: structuredClone(sceneGraph.toJSON()),
        selectedNodeIds: Array.from(selectedNodeIds),
      };
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
      const { undoStack, redoStack, selectedNodeIds } = get();
      if (undoStack.length === 0) return;

      // Save current state to redo stack
      const currentSnapshot: HistorySnapshot = {
        sceneData: structuredClone(sceneGraph.toJSON()),
        selectedNodeIds: Array.from(selectedNodeIds),
      };
      const newRedoStack = [...redoStack, currentSnapshot];

      // Pop and restore from undo stack
      const newUndoStack = [...undoStack];
      const snapshot = newUndoStack.pop()!;
      sceneGraph.fromJSON(structuredClone(snapshot.sceneData));

      set({
        undoStack: newUndoStack,
        redoStack: newRedoStack,
        canUndo: newUndoStack.length > 0,
        canRedo: true,
        selectedNodeIds: new Set(snapshot.selectedNodeIds),
        enteredGroupId: null,
        isDirty: true,
      });
    },

    redo: (sceneGraph: SceneGraphLike) => {
      const { undoStack, redoStack, selectedNodeIds } = get();
      if (redoStack.length === 0) return;

      // Save current state to undo stack
      const currentSnapshot: HistorySnapshot = {
        sceneData: structuredClone(sceneGraph.toJSON()),
        selectedNodeIds: Array.from(selectedNodeIds),
      };
      const newUndoStack = [...undoStack, currentSnapshot];

      // Pop and restore from redo stack
      const newRedoStack = [...redoStack];
      const snapshot = newRedoStack.pop()!;
      sceneGraph.fromJSON(structuredClone(snapshot.sceneData));

      set({
        undoStack: newUndoStack,
        redoStack: newRedoStack,
        canUndo: true,
        canRedo: newRedoStack.length > 0,
        selectedNodeIds: new Set(snapshot.selectedNodeIds),
        enteredGroupId: null,
        isDirty: true,
      });
    },

    clearHistory: () => {
      set({
        undoStack: [],
        redoStack: [],
        canUndo: false,
        canRedo: false,
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
