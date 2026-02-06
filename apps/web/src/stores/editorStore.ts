/**
 * Editor Store for Quar Animator
 * Manages editor state using Zustand
 */

import { create } from 'zustand';
import type { ToolType, Fill, Stroke, Color, Node } from '@quar/types';

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
};

export const DEFAULT_STROKE: Stroke = {
  color: DEFAULT_STROKE_COLOR,
  width: 2,
  opacity: 1,
  cap: 'round',
  join: 'round',
  miterLimit: 10,
};

// ============================================================================
// Store Interface
// ============================================================================

export interface EditorStore {
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
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useEditorStore = create<EditorStore>((set, get) => ({
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
