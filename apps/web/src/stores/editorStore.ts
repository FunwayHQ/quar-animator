/**
 * Editor Store for Quar Animator
 * Manages editor state using Zustand
 */

import { create } from 'zustand';
import type { ToolType, Fill, Stroke, Color, Node, Timeline, EasingFunction } from '@quar/types';
import type { KeyframeClipboard } from '@quar/animation';
import { createTimeline, KeyframeManager } from '@quar/animation';
import { DEFAULT_ONION_SKIN_SETTINGS } from '@quar/core';
import type { OnionSkinSettings } from '@quar/core';

// ============================================================================
// SceneGraph Interface (subset used by store operations)
// ============================================================================

interface SceneGraphLike {
  getNode(id: string): Node | undefined;
  getRootNodes(): Node[];
  addNode(node: Node, parentId?: string): void;
  removeNode(id: string): void;
  getDescendants(id: string): Node[];
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

  // Selection state
  selectedNodeIds: Set<string>;
  setSelection: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;

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

  // Selection state
  selectedNodeIds: new Set<string>(),
  setSelection: (ids: string[]) => set({ selectedNodeIds: new Set(ids) }),
  addToSelection: (id: string) =>
    set((state) => ({
      selectedNodeIds: new Set([...state.selectedNodeIds, id]),
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
      } else {
        newSet.add(id);
      }
      return { selectedNodeIds: newSet };
    }),
  clearSelection: () => set({ selectedNodeIds: new Set<string>() }),
  isSelected: (id: string) => get().selectedNodeIds.has(id),

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
    const { copySelection, pasteClipboard } = get();
    copySelection(sceneGraph);
    pasteClipboard(sceneGraph);
  },
  deleteSelection: (sceneGraph: SceneGraphLike) => {
    const { selectedNodeIds } = get();
    if (selectedNodeIds.size === 0) return;
    for (const id of selectedNodeIds) {
      sceneGraph.removeNode(id);
    }
    set({ selectedNodeIds: new Set<string>() });
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

  // Timeline state
  currentFrame: 0,
  isPlaying: false,
  isLooping: false,
  timelineDuration: 300,
  frameRate: 30,
  timelineExpanded: true,
  setCurrentFrame: (frame: number) =>
    set((state) => ({
      currentFrame: Math.max(0, Math.min(state.timelineDuration - 1, Math.round(frame))),
    })),
  setIsPlaying: (playing: boolean) => set({ isPlaying: playing }),
  setIsLooping: (looping: boolean) => set({ isLooping: looping }),
  setTimelineDuration: (duration: number) =>
    set({ timelineDuration: Math.max(1, Math.round(duration)) }),
  setFrameRate: (rate: number) => set({ frameRate: Math.max(1, Math.min(120, Math.round(rate))) }),
  setTimelineExpanded: (expanded: boolean) => set({ timelineExpanded: expanded }),
  toggleTimelineExpanded: () => set((state) => ({ timelineExpanded: !state.timelineExpanded })),

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
    mgr.addKeyframe(nodeId, property, frame, value, easing);
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
      selectedKeyframeIds: new Set(pasted.map((kf) => kf.id)),
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
}));

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
