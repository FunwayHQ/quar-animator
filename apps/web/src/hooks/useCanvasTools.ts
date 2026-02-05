/**
 * useCanvasTools Hook
 * Manages ToolManager lifecycle and bridges EditorStore with canvas tools
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { ToolManager, SceneGraph, Camera, PenTool } from '@quar/core';
import type { CanvasPointerEvent, Node, PathPoint, Vector2 } from '@quar/types';
import { useEditorStore } from '../stores/editorStore';

// ============================================================================
// Types
// ============================================================================

export interface UseCanvasToolsOptions {
  camera: Camera | null;
}

export interface UseCanvasToolsReturn {
  /** Reference to the ToolManager instance */
  toolManagerRef: React.RefObject<ToolManager | null>;
  /** Reference to the SceneGraph instance */
  sceneGraphRef: React.RefObject<SceneGraph>;
  /** Handle pointer down event on canvas */
  handlePointerDown: (screenPos: Vector2, worldPos: Vector2, event: React.PointerEvent) => void;
  /** Handle pointer move event on canvas */
  handlePointerMove: (screenPos: Vector2, worldPos: Vector2, event: React.PointerEvent) => void;
  /** Handle pointer up event on canvas */
  handlePointerUp: (screenPos: Vector2, worldPos: Vector2, event: React.PointerEvent) => void;
  /** Handle key down event on canvas */
  handleKeyDown: (event: React.KeyboardEvent) => void;
  /** Handle key up event on canvas */
  handleKeyUp: (event: React.KeyboardEvent) => void;
  /** Current preview node from active tool (null when not dragging) */
  previewNode: Node | null;
  /** Current cursor for active tool */
  cursor: string;
  /** Current path points when using PenTool */
  penToolPath: PathPoint[];
  /** Whether PenTool is currently drawing */
  isPenToolDrawing: boolean;
  /** Start dragging a handle in PenTool */
  startPenHandleDrag: (pointIndex: number, handleType: 'in' | 'out') => void;
  /** Start dragging a point in PenTool. Returns true if path was closed. */
  startPenPointDrag: (pointIndex: number) => boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert React pointer event to CanvasPointerEvent
 */
function createCanvasPointerEvent(
  screenPos: Vector2,
  worldPos: Vector2,
  event: React.PointerEvent
): CanvasPointerEvent {
  return {
    screenPosition: screenPos,
    worldPosition: worldPos,
    button: event.button,
    buttons: event.buttons,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    pressure: event.pressure,
    timestamp: event.timeStamp,
  };
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook that manages the ToolManager lifecycle and bridges it with EditorStore
 *
 * @param options Configuration options including camera reference
 * @returns Tool management handlers and state
 */
export function useCanvasTools(options: UseCanvasToolsOptions): UseCanvasToolsReturn {
  const { camera } = options;

  // Create stable references for SceneGraph and ToolManager
  const sceneGraphRef = useRef<SceneGraph>(new SceneGraph());
  const toolManagerRef = useRef<ToolManager | null>(null);

  // Track preview node for rendering
  const [previewNode, setPreviewNode] = useState<Node | null>(null);
  const [cursor, setCursor] = useState<string>('default');

  // Track PenTool state for overlay
  const [penToolPath, setPenToolPath] = useState<PathPoint[]>([]);
  const [isPenToolDrawing, setIsPenToolDrawing] = useState(false);

  // Get store methods and state
  const activeTool = useEditorStore((state) => state.activeTool);
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
  const setSelection = useEditorStore((state) => state.setSelection);
  const addToSelection = useEditorStore((state) => state.addToSelection);
  const clearSelection = useEditorStore((state) => state.clearSelection);
  const defaultFill = useEditorStore((state) => state.defaultFill);
  const defaultStroke = useEditorStore((state) => state.defaultStroke);
  const setIsDrawing = useEditorStore((state) => state.setIsDrawing);

  // Create stable callbacks for ToolManager options
  const getSelectedIds = useCallback(() => selectedNodeIds, [selectedNodeIds]);
  const setSelectedIds = useCallback((ids: string[]) => setSelection(ids), [setSelection]);
  const addToSelectionCb = useCallback((id: string) => addToSelection(id), [addToSelection]);
  const clearSelectionCb = useCallback(() => clearSelection(), [clearSelection]);
  const getDefaultFill = useCallback(() => defaultFill, [defaultFill]);
  const getDefaultStroke = useCallback(() => defaultStroke, [defaultStroke]);

  // Initialize ToolManager when camera is available
  useEffect(() => {
    if (!camera) {
      return;
    }

    const manager = new ToolManager({
      sceneGraph: sceneGraphRef.current,
      camera,
      getSelectedIds,
      setSelectedIds,
      addToSelection: addToSelectionCb,
      clearSelection: clearSelectionCb,
      getDefaultFill,
      getDefaultStroke,
    });

    toolManagerRef.current = manager;
    setCursor(manager.getCursor() as string);

    return () => {
      manager.dispose();
      toolManagerRef.current = null;
    };
  }, [
    camera,
    getSelectedIds,
    setSelectedIds,
    addToSelectionCb,
    clearSelectionCb,
    getDefaultFill,
    getDefaultStroke,
  ]);

  // Sync active tool with ToolManager when it changes
  useEffect(() => {
    if (toolManagerRef.current) {
      toolManagerRef.current.setActiveTool(activeTool);
      setCursor(toolManagerRef.current.getCursor() as string);
    }
  }, [activeTool]);

  // Sync PenTool path state for overlay
  const syncPenToolState = useCallback(() => {
    if (!toolManagerRef.current) return;

    const activeTool = toolManagerRef.current.getActiveTool();
    if (activeTool?.type === 'pen') {
      const penTool = activeTool as PenTool;
      setPenToolPath(penTool.getCurrentPath());
      setIsPenToolDrawing(penTool.isCurrentlyDrawing());
    } else {
      setPenToolPath([]);
      setIsPenToolDrawing(false);
    }
  }, []);

  // Event handlers
  const handlePointerDown = useCallback(
    (screenPos: Vector2, worldPos: Vector2, event: React.PointerEvent) => {
      if (!toolManagerRef.current) return;

      const canvasEvent = createCanvasPointerEvent(screenPos, worldPos, event);
      toolManagerRef.current.handlePointerDown(canvasEvent);

      setIsDrawing(true);

      // Update preview
      const preview = toolManagerRef.current.getPreviewNode();
      setPreviewNode(preview);

      // Sync PenTool state for overlay
      syncPenToolState();
    },
    [setIsDrawing, syncPenToolState]
  );

  const handlePointerMove = useCallback(
    (screenPos: Vector2, worldPos: Vector2, event: React.PointerEvent) => {
      if (!toolManagerRef.current) return;

      const canvasEvent = createCanvasPointerEvent(screenPos, worldPos, event);
      toolManagerRef.current.handlePointerMove(canvasEvent);

      // Update preview
      const preview = toolManagerRef.current.getPreviewNode();
      setPreviewNode(preview);

      // Update cursor (for dynamic cursors like resize handles)
      setCursor(toolManagerRef.current.getCursor() as string);

      // Sync PenTool state for overlay during handle drag
      syncPenToolState();
    },
    [syncPenToolState]
  );

  const handlePointerUp = useCallback(
    (screenPos: Vector2, worldPos: Vector2, event: React.PointerEvent) => {
      if (!toolManagerRef.current) return;

      const canvasEvent = createCanvasPointerEvent(screenPos, worldPos, event);
      toolManagerRef.current.handlePointerUp(canvasEvent);

      setIsDrawing(false);

      // Clear preview
      setPreviewNode(null);

      // Sync PenTool state for overlay
      syncPenToolState();
    },
    [setIsDrawing, syncPenToolState]
  );

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!toolManagerRef.current) return;
    toolManagerRef.current.handleKeyDown(event.nativeEvent);
  }, []);

  const handleKeyUp = useCallback((event: React.KeyboardEvent) => {
    if (!toolManagerRef.current) return;
    toolManagerRef.current.handleKeyUp(event.nativeEvent);
  }, []);

  // Callbacks for PenTool handle/point manipulation
  const startPenHandleDrag = useCallback((pointIndex: number, handleType: 'in' | 'out') => {
    if (!toolManagerRef.current) return;

    const activeTool = toolManagerRef.current.getActiveTool();
    if (activeTool?.type === 'pen') {
      const penTool = activeTool as PenTool;
      penTool.startHandleDrag(pointIndex, handleType);
    }
  }, []);

  const startPenPointDrag = useCallback(
    (pointIndex: number): boolean => {
      if (!toolManagerRef.current) return false;

      const activeTool = toolManagerRef.current.getActiveTool();
      if (activeTool?.type === 'pen') {
        const penTool = activeTool as PenTool;
        const pathClosed = penTool.startPointDrag(pointIndex);
        if (pathClosed) {
          // Path was closed, sync the state
          syncPenToolState();
        }
        return pathClosed;
      }
      return false;
    },
    [syncPenToolState]
  );

  return {
    toolManagerRef,
    sceneGraphRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleKeyDown,
    handleKeyUp,
    previewNode,
    cursor,
    penToolPath,
    isPenToolDrawing,
    startPenHandleDrag,
    startPenPointDrag,
  };
}
