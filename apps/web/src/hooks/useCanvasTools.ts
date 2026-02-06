/**
 * useCanvasTools Hook
 * Manages ToolManager lifecycle and bridges EditorStore with canvas tools
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { ToolManager, SceneGraph, Camera, PenTool } from '@quar/core';
import type { TransformType } from '@quar/core';
import type { CanvasPointerEvent, Node, PathPoint, Vector2 } from '@quar/types';
import { useEditorStore } from '../stores/editorStore';

// ============================================================================
// Types
// ============================================================================

export interface UseCanvasToolsOptions {
  camera: Camera | null;
  sceneGraph: SceneGraph;
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
  const { camera, sceneGraph } = options;

  // Use the externally-provided SceneGraph
  const sceneGraphRef = useRef<SceneGraph>(sceneGraph);
  sceneGraphRef.current = sceneGraph;
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
  const setActiveTool = useEditorStore((state) => state.setActiveTool);

  // Auto-keyframe store actions
  const autoKeyframeRef = useRef(useEditorStore.getState().autoKeyframe);
  const addKeyframeAtFrameRef = useRef(useEditorStore.getState().addKeyframeAtFrame);
  const currentFrameRef = useRef(useEditorStore.getState().currentFrame);

  // Keep state values in refs for stable callbacks
  // This prevents ToolManager from being recreated on every state change
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  selectedNodeIdsRef.current = selectedNodeIds;
  const defaultFillRef = useRef(defaultFill);
  defaultFillRef.current = defaultFill;
  const defaultStrokeRef = useRef(defaultStroke);
  defaultStrokeRef.current = defaultStroke;
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;

  // Subscribe to store to keep auto-keyframe refs fresh
  useEffect(() => {
    return useEditorStore.subscribe((state) => {
      autoKeyframeRef.current = state.autoKeyframe;
      addKeyframeAtFrameRef.current = state.addKeyframeAtFrame;
      currentFrameRef.current = state.currentFrame;
    });
  }, []);

  // Create stable callbacks for ToolManager options (using refs, no dependencies)
  const getSelectedIds = useCallback(() => selectedNodeIdsRef.current, []);
  const setSelectedIds = useCallback((ids: string[]) => setSelection(ids), [setSelection]);
  const addToSelectionCb = useCallback((id: string) => addToSelection(id), [addToSelection]);
  const clearSelectionCb = useCallback(() => clearSelection(), [clearSelection]);
  const getDefaultFill = useCallback(() => defaultFillRef.current, []);
  const getDefaultStroke = useCallback(() => defaultStrokeRef.current, []);

  // Auto-keyframe callback for canvas transform operations (move/resize/rotate)
  const onTransformComplete = useCallback((nodeIds: Set<string>, type: TransformType) => {
    if (!autoKeyframeRef.current) return;

    const frame = currentFrameRef.current;
    const sg = sceneGraphRef.current;
    const addKf = addKeyframeAtFrameRef.current;

    for (const nodeId of nodeIds) {
      const node = sg.getNode(nodeId);
      if (!node) continue;

      if (type === 'move') {
        addKf(nodeId, 'transform.position.x', frame, node.transform.position.x);
        addKf(nodeId, 'transform.position.y', frame, node.transform.position.y);
      } else if (type === 'resize') {
        // Position may change during resize (e.g. top-left handle drag)
        addKf(nodeId, 'transform.position.x', frame, node.transform.position.x);
        addKf(nodeId, 'transform.position.y', frame, node.transform.position.y);

        if (node.type === 'rectangle') {
          addKf(nodeId, 'width', frame, node.width);
          addKf(nodeId, 'height', frame, node.height);
        } else if (node.type === 'ellipse') {
          addKf(nodeId, 'radiusX', frame, node.radiusX);
          addKf(nodeId, 'radiusY', frame, node.radiusY);
        } else if (node.type === 'polygon') {
          addKf(nodeId, 'transform.scale.x', frame, node.transform.scale.x);
          addKf(nodeId, 'transform.scale.y', frame, node.transform.scale.y);
        }
      } else if (type === 'rotate') {
        addKf(nodeId, 'transform.rotation', frame, node.transform.rotation);
      }
    }
  }, []);

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
      onToolChange: (tool) => {
        setActiveTool(tool);
        setCursor((toolManagerRef.current?.getCursor() as string) ?? 'default');
      },
      onTransformComplete,
    });

    // Set the active tool from EditorStore (ToolManager defaults to 'selection')
    manager.setActiveTool(activeToolRef.current);

    toolManagerRef.current = manager;
    setCursor(manager.getCursor() as string);

    return () => {
      manager.dispose();
      toolManagerRef.current = null;
    };
    // Callbacks are now stable (use refs), so only camera triggers recreation
  }, [
    camera,
    setActiveTool,
    getSelectedIds,
    setSelectedIds,
    addToSelectionCb,
    clearSelectionCb,
    getDefaultFill,
    getDefaultStroke,
    onTransformComplete,
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

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!toolManagerRef.current) return;
      toolManagerRef.current.handleKeyDown(event.nativeEvent);
      // Sync PenTool state after key events (Enter/Escape can finalize/cancel path)
      syncPenToolState();
    },
    [syncPenToolState]
  );

  const handleKeyUp = useCallback(
    (event: React.KeyboardEvent) => {
      if (!toolManagerRef.current) return;
      toolManagerRef.current.handleKeyUp(event.nativeEvent);
      // Sync PenTool state after key events
      syncPenToolState();
    },
    [syncPenToolState]
  );

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
