/**
 * Editor Store for Quar Animator
 * Manages editor state using Zustand
 */

import { create } from 'zustand';
import type { ToolType, Fill, Stroke, Color } from '@quar/types';

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
