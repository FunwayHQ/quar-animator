/**
 * useCanvasTools Hook
 * Manages ToolManager lifecycle and bridges EditorStore with canvas tools
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  ToolManager,
  SceneGraph,
  Camera,
  PenTool,
  DirectSelectionTool,
  SelectionTool,
} from '@quar/core';
import type { TransformType } from '@quar/core';
import type {
  CanvasPointerEvent,
  Node,
  PathNode,
  PathPoint,
  Rect,
  ToolType,
  Vector2,
} from '@quar/types';
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
  handlePointerDown: (
    screenPos: Vector2,
    worldPos: Vector2,
    event: React.PointerEvent,
    clickCount?: number
  ) => void;
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
  /** Whether DirectSelectionTool is currently active */
  isDirectSelectionActive: boolean;
  /** Selected point indices when DirectSelectionTool is active */
  directSelectionPoints: Array<{ nodeId: string; pointIndex: number }>;
  /** All visible path nodes (for DirectSelection overlay) */
  directSelectionPathNodes: PathNode[];
  /** Current marquee selection rectangle in world coordinates (null when not marquee-selecting) */
  marqueeRect: Rect | null;
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
  event: React.PointerEvent,
  clickCount?: number
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
    clickCount,
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

  // Track marquee selection rect for overlay
  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null);

  // Track DirectSelectionTool state for overlay
  const [isDirectSelectionActive, setIsDirectSelectionActive] = useState(false);
  const [directSelectionPoints, setDirectSelectionPoints] = useState<
    Array<{ nodeId: string; pointIndex: number }>
  >([]);
  const [directSelectionPathNodes, setDirectSelectionPathNodes] = useState<PathNode[]>([]);

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

  // Snap-to-grid refs
  const snapToGridRef = useRef(useEditorStore.getState().snapToGrid);
  const gridSizeRef = useRef(useEditorStore.getState().gridSize);

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

  // Subscribe to store to keep refs fresh
  useEffect(() => {
    return useEditorStore.subscribe((state) => {
      autoKeyframeRef.current = state.autoKeyframe;
      addKeyframeAtFrameRef.current = state.addKeyframeAtFrame;
      currentFrameRef.current = state.currentFrame;
      snapToGridRef.current = state.snapToGrid;
      gridSizeRef.current = state.gridSize;
    });
  }, []);

  // Create stable callbacks for ToolManager options (using refs, no dependencies)
  const getSelectedIds = useCallback(() => selectedNodeIdsRef.current, []);
  const setSelectedIds = useCallback((ids: string[]) => setSelection(ids), [setSelection]);
  const addToSelectionCb = useCallback((id: string) => addToSelection(id), [addToSelection]);
  const clearSelectionCb = useCallback(() => clearSelection(), [clearSelection]);
  const getDefaultFill = useCallback(() => defaultFillRef.current, []);
  const getDefaultStroke = useCallback(() => defaultStrokeRef.current, []);
  const getSnapToGrid = useCallback(() => snapToGridRef.current, []);
  // Compute adaptive grid size matching the visible Grid rendering
  const getGridSize = useCallback(() => {
    if (!camera) return gridSizeRef.current;
    const zoom = camera.zoom;
    const majorSpacing = 100;
    const minorDivisions = 5;
    let spacing = majorSpacing;
    // Match Grid.calculateAdaptiveSpacing logic
    while (spacing * zoom < 50) spacing *= 2;
    while (spacing * zoom > 200) spacing /= 2;
    return spacing / minorDivisions;
  }, [camera]);

  // Undo snapshot before canvas transform operations (move/resize/rotate/shape create)
  const onTransformStart = useCallback(() => {
    useEditorStore.getState().pushUndo(sceneGraphRef.current);
  }, []);

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
      onToolChange: (tool: ToolType) => {
        setActiveTool(tool);
        setCursor((toolManagerRef.current?.getCursor() as string) ?? 'default');
      },
      onTransformStart,
      onTransformComplete,
      getSnapToGrid,
      getGridSize,
      getEnteredGroupId: () => useEditorStore.getState().enteredGroupId,
      setEnteredGroupId: (id: string | null) => {
        if (id === null) {
          useEditorStore.getState().exitGroup();
        } else {
          useEditorStore.getState().enterGroup(id);
        }
      },
      onEnterTextEdit: (nodeId: string) => {
        useEditorStore.getState().setEditingTextNodeId(nodeId);
      },
    });

    // Set the active tool from EditorStore (ToolManager defaults to 'selection')
    manager.setActiveTool(activeToolRef.current);

    toolManagerRef.current = manager;
    setCursor(manager.getCursor() as string);

    return () => {
      manager.dispose();
      toolManagerRef.current = null;
    };
    // Callbacks are stable (use refs), so only camera triggers recreation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  // Sync marquee rect state for overlay
  const syncMarqueeState = useCallback(() => {
    if (!toolManagerRef.current) {
      setMarqueeRect(null);
      return;
    }
    const tool = toolManagerRef.current.getActiveTool();
    if (tool?.type === 'selection') {
      setMarqueeRect((tool as SelectionTool).getMarqueeRect());
    } else {
      setMarqueeRect(null);
    }
  }, []);

  // Sync PenTool path state for overlay
  const syncPenToolState = useCallback(() => {
    if (!toolManagerRef.current) return;

    const tool = toolManagerRef.current.getActiveTool();
    if (tool?.type === 'pen') {
      const penTool = tool as PenTool;
      setPenToolPath(penTool.getCurrentPath());
      setIsPenToolDrawing(penTool.isCurrentlyDrawing());
    } else {
      setPenToolPath([]);
      setIsPenToolDrawing(false);
    }
  }, []);

  // Sync DirectSelectionTool state for overlay
  const syncDirectSelectionState = useCallback(() => {
    if (!toolManagerRef.current) {
      setIsDirectSelectionActive(false);
      return;
    }

    const tool = toolManagerRef.current.getActiveTool();
    if (tool?.type === 'direct-selection') {
      const dsTool = tool as DirectSelectionTool;
      setIsDirectSelectionActive(true);
      setDirectSelectionPoints(dsTool.getSelectedPoints());

      // Collect only selected path nodes for overlay rendering
      const selected = selectedNodeIdsRef.current;
      const paths: PathNode[] = [];
      sceneGraphRef.current.traverseVisible((node: Node) => {
        if (node.type === 'path' && selected.has(node.id)) {
          paths.push(node);
        }
      });
      setDirectSelectionPathNodes(paths);
    } else {
      setIsDirectSelectionActive(false);
      setDirectSelectionPoints([]);
      setDirectSelectionPathNodes([]);
    }
  }, []);

  // Sync active tool with ToolManager when it changes
  useEffect(() => {
    if (toolManagerRef.current) {
      toolManagerRef.current.setActiveTool(activeTool);
      setCursor(toolManagerRef.current.getCursor() as string);
      syncDirectSelectionState();
    }
  }, [activeTool, syncDirectSelectionState]);

  // Event handlers
  const handlePointerDown = useCallback(
    (screenPos: Vector2, worldPos: Vector2, event: React.PointerEvent, clickCount?: number) => {
      if (!toolManagerRef.current) return;

      const canvasEvent = createCanvasPointerEvent(screenPos, worldPos, event, clickCount);
      toolManagerRef.current.handlePointerDown(canvasEvent);

      setIsDrawing(true);

      // Update preview
      const preview = toolManagerRef.current.getPreviewNode();
      setPreviewNode(preview);

      // Sync tool overlay state
      syncPenToolState();
      syncDirectSelectionState();
      syncMarqueeState();
    },
    [setIsDrawing, syncPenToolState, syncDirectSelectionState, syncMarqueeState]
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

      // Sync tool overlay state during drag
      syncPenToolState();
      syncDirectSelectionState();
      syncMarqueeState();
    },
    [syncPenToolState, syncDirectSelectionState, syncMarqueeState]
  );

  const handlePointerUp = useCallback(
    (screenPos: Vector2, worldPos: Vector2, event: React.PointerEvent) => {
      if (!toolManagerRef.current) return;

      const canvasEvent = createCanvasPointerEvent(screenPos, worldPos, event);
      toolManagerRef.current.handlePointerUp(canvasEvent);

      setIsDrawing(false);

      // Clear preview
      setPreviewNode(null);

      // Sync tool overlay state
      syncPenToolState();
      syncDirectSelectionState();
      syncMarqueeState();
    },
    [setIsDrawing, syncPenToolState, syncDirectSelectionState, syncMarqueeState]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!toolManagerRef.current) return;
      toolManagerRef.current.handleKeyDown(event.nativeEvent);
      // Sync tool overlay state after key events
      syncPenToolState();
      syncDirectSelectionState();
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

  // Delete selected points in DirectSelectionTool (for context menu)
  const deleteDirectSelectionPoints = useCallback(() => {
    if (!toolManagerRef.current) return;
    const activeTool = toolManagerRef.current.getActiveTool();
    if (activeTool?.type === 'direct-selection') {
      // Dispatch a synthetic Delete key event to the tool
      toolManagerRef.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'Delete' }));
      syncDirectSelectionState();
    }
  }, [syncDirectSelectionState]);

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
    isDirectSelectionActive,
    directSelectionPoints,
    directSelectionPathNodes,
    deleteDirectSelectionPoints,
    marqueeRect,
  };
}
