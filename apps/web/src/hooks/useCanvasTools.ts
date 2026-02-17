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
  WeightPaintTool,
  PointMagnetTool,
  getAllPoints,
} from '@quar/core';
import type { TransformType } from '@quar/core';
import { findTrack } from '@quar/animation';
import { compactMorphOffsets } from '@quar/rigging';
import type { MorphVertexOffset } from '@quar/types';
import type {
  CanvasPointerEvent,
  Node,
  PathNode,
  ImageNode,
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
  getTessellatedVertices?: (nodeId: string) => Float32Array | null;
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
  /** All visible image nodes with vertex editing (for DirectSelection overlay) */
  directSelectionImageNodes: ImageNode[];
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
  const { camera, sceneGraph, getTessellatedVertices } = options;

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
  const [directSelectionImageNodes, setDirectSelectionImageNodes] = useState<ImageNode[]>([]);

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
  // Also creates keyframes when auto-keyframe is OFF but the property already has keyframes
  const onTransformComplete = useCallback((nodeIds: Set<string>, type: TransformType) => {
    const autoKf = autoKeyframeRef.current;
    const frame = currentFrameRef.current;
    const sg = sceneGraphRef.current;
    const addKf = addKeyframeAtFrameRef.current;
    const { timeline } = useEditorStore.getState();

    /** Returns true if auto-keyframe is on OR the property already has keyframes */
    const shouldKf = (nodeId: string, property: string): boolean => {
      if (autoKf) return true;
      if (!timeline) return false;
      const track = findTrack(timeline, nodeId, property);
      return track != null && track.keyframes.length > 0;
    };

    for (const nodeId of nodeIds) {
      const node = sg.getNode(nodeId);
      if (!node) continue;

      if (type === 'move') {
        if (shouldKf(nodeId, 'transform.position.x'))
          addKf(nodeId, 'transform.position.x', frame, node.transform.position.x);
        if (shouldKf(nodeId, 'transform.position.y'))
          addKf(nodeId, 'transform.position.y', frame, node.transform.position.y);
      } else if (type === 'resize') {
        // Position may change during resize (e.g. top-left handle drag)
        if (shouldKf(nodeId, 'transform.position.x'))
          addKf(nodeId, 'transform.position.x', frame, node.transform.position.x);
        if (shouldKf(nodeId, 'transform.position.y'))
          addKf(nodeId, 'transform.position.y', frame, node.transform.position.y);

        if (node.type === 'rectangle' || node.type === 'artboard') {
          if (shouldKf(nodeId, 'width')) addKf(nodeId, 'width', frame, node.width);
          if (shouldKf(nodeId, 'height')) addKf(nodeId, 'height', frame, node.height);
        } else if (node.type === 'ellipse') {
          if (shouldKf(nodeId, 'radiusX')) addKf(nodeId, 'radiusX', frame, node.radiusX);
          if (shouldKf(nodeId, 'radiusY')) addKf(nodeId, 'radiusY', frame, node.radiusY);
        } else if (
          node.type === 'polygon' ||
          node.type === 'path' ||
          node.type === 'text' ||
          node.type === 'group'
        ) {
          if (shouldKf(nodeId, 'transform.scale.x'))
            addKf(nodeId, 'transform.scale.x', frame, node.transform.scale.x);
          if (shouldKf(nodeId, 'transform.scale.y'))
            addKf(nodeId, 'transform.scale.y', frame, node.transform.scale.y);
        } else if (node.type === 'image') {
          if (shouldKf(nodeId, 'width')) addKf(nodeId, 'width', frame, (node as ImageNode).width);
          if (shouldKf(nodeId, 'height'))
            addKf(nodeId, 'height', frame, (node as ImageNode).height);
        }
      } else if (type === 'rotate') {
        if (shouldKf(nodeId, 'transform.rotation'))
          addKf(nodeId, 'transform.rotation', frame, node.transform.rotation);
      } else if (type === 'vertex-move') {
        // Keyframe ALL vertex positions/handles/cornerRadius for the affected path node
        // to prevent un-keyframed vertices from snapping to base state during interpolation.
        // Check if auto-keyframe is on OR any vertex property already has keyframes.
        const hasVertexTracks =
          autoKf ||
          (timeline != null &&
            timeline.tracks.some(
              (t) =>
                t.nodeId === nodeId &&
                t.keyframes.length > 0 &&
                (t.property.startsWith('points.') ||
                  t.property.startsWith('subpaths.') ||
                  t.property.startsWith('vertexOffsets.'))
            ));
        if (!hasVertexTracks) continue;

        if (node.type === 'path') {
          const pathNode = node as PathNode;
          const allPts = getAllPoints(pathNode);

          // Determine if node uses subpaths
          const hasSubpaths = pathNode.subpaths && pathNode.subpaths.length > 0;

          if (hasSubpaths) {
            // Primary contour
            for (let i = 0; i < pathNode.points.length; i++) {
              const pt = pathNode.points[i];
              addKf(nodeId, `points.${i}.position.x`, frame, pt.position.x);
              addKf(nodeId, `points.${i}.position.y`, frame, pt.position.y);
              if (pt.cornerRadius !== undefined) {
                addKf(nodeId, `points.${i}.cornerRadius`, frame, pt.cornerRadius);
              }
              if (pt.handleIn) {
                addKf(nodeId, `points.${i}.handleIn.x`, frame, pt.handleIn.x);
                addKf(nodeId, `points.${i}.handleIn.y`, frame, pt.handleIn.y);
              }
              if (pt.handleOut) {
                addKf(nodeId, `points.${i}.handleOut.x`, frame, pt.handleOut.x);
                addKf(nodeId, `points.${i}.handleOut.y`, frame, pt.handleOut.y);
              }
            }
            // Subpaths
            for (let s = 0; s < pathNode.subpaths!.length; s++) {
              const sp = pathNode.subpaths![s];
              for (let i = 0; i < sp.length; i++) {
                const pt = sp[i];
                addKf(nodeId, `subpaths.${s}.${i}.position.x`, frame, pt.position.x);
                addKf(nodeId, `subpaths.${s}.${i}.position.y`, frame, pt.position.y);
                if (pt.cornerRadius !== undefined) {
                  addKf(nodeId, `subpaths.${s}.${i}.cornerRadius`, frame, pt.cornerRadius);
                }
                if (pt.handleIn) {
                  addKf(nodeId, `subpaths.${s}.${i}.handleIn.x`, frame, pt.handleIn.x);
                  addKf(nodeId, `subpaths.${s}.${i}.handleIn.y`, frame, pt.handleIn.y);
                }
                if (pt.handleOut) {
                  addKf(nodeId, `subpaths.${s}.${i}.handleOut.x`, frame, pt.handleOut.x);
                  addKf(nodeId, `subpaths.${s}.${i}.handleOut.y`, frame, pt.handleOut.y);
                }
              }
            }
          } else {
            // Simple path — no subpaths
            for (let i = 0; i < allPts.length; i++) {
              const pt = allPts[i];
              addKf(nodeId, `points.${i}.position.x`, frame, pt.position.x);
              addKf(nodeId, `points.${i}.position.y`, frame, pt.position.y);
              if (pt.cornerRadius !== undefined) {
                addKf(nodeId, `points.${i}.cornerRadius`, frame, pt.cornerRadius);
              }
              if (pt.handleIn) {
                addKf(nodeId, `points.${i}.handleIn.x`, frame, pt.handleIn.x);
                addKf(nodeId, `points.${i}.handleIn.y`, frame, pt.handleIn.y);
              }
              if (pt.handleOut) {
                addKf(nodeId, `points.${i}.handleOut.x`, frame, pt.handleOut.x);
                addKf(nodeId, `points.${i}.handleOut.y`, frame, pt.handleOut.y);
              }
            }
          }
        } else if (node.type === 'image') {
          // Keyframe all 4 vertex offsets for image distortion
          const imgNode = node as ImageNode;
          const vo = imgNode.vertexOffsets;
          if (vo) {
            for (let i = 0; i < 4; i++) {
              addKf(nodeId, `vertexOffsets.${i}.x`, frame, vo[i].x);
              addKf(nodeId, `vertexOffsets.${i}.y`, frame, vo[i].y);
            }
          }
        }
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
      getTessellatedVertices: (nodeId: string) => {
        return getTessellatedVertices?.(nodeId) ?? null;
      },
      convertShapeToPath: (nodeId: string) => {
        return useEditorStore.getState().convertShapeToPath(sceneGraphRef.current, nodeId);
      },
      getGuides: () => useEditorStore.getState().guides,
      getSnapToGuides: () => useEditorStore.getState().snapToGuides,
      getSymbolDefinitions: () => useEditorStore.getState().symbols,
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
      const selPts = dsTool.getSelectedPoints();
      setDirectSelectionPoints(selPts);

      // Push to editor store so PropertiesPanel can access vertex selection
      useEditorStore.getState().setDirectSelectionPoints(selPts);

      // Collect only selected path/image nodes for overlay rendering
      const selected = selectedNodeIdsRef.current;
      const paths: PathNode[] = [];
      const images: ImageNode[] = [];
      sceneGraphRef.current.traverseVisible((node: Node) => {
        if (node.type === 'path' && selected.has(node.id)) {
          paths.push(node);
        } else if (node.type === 'image' && selected.has(node.id)) {
          images.push(node);
        }
      });
      setDirectSelectionPathNodes(paths);
      setDirectSelectionImageNodes(images);
    } else {
      setIsDirectSelectionActive(false);
      setDirectSelectionPoints([]);
      setDirectSelectionPathNodes([]);
      setDirectSelectionImageNodes([]);
      useEditorStore.getState().setDirectSelectionPoints([]);
    }
  }, []);

  // Sync active tool with ToolManager when it changes
  useEffect(() => {
    if (toolManagerRef.current) {
      toolManagerRef.current.setActiveTool(activeTool);
      setCursor(toolManagerRef.current.getCursor() as string);
      syncDirectSelectionState();

      // Sync weight paint tool state to store
      if (activeTool === 'weight-paint') {
        const wpTool = toolManagerRef.current.getActiveTool();
        if (wpTool && wpTool.type === 'weight-paint') {
          const boneId = wpTool.getActiveBoneId();
          if (boneId) {
            useEditorStore.getState().setWeightPaintBoneId(boneId);
          }
        }
      } else {
        // Clear weight paint bone when leaving weight paint mode
        if (useEditorStore.getState().weightPaintBoneId) {
          useEditorStore.getState().setWeightPaintBoneId(null);
        }
      }
    }
  }, [activeTool, syncDirectSelectionState]);

  // Bridge Smart Bone recording: load existing offsets on start, save on stop
  useEffect(() => {
    // Track previous recording state to detect transitions
    let prevActionId: string | null = null;
    let prevTargetId: string | null = null;

    const unsubscribe = useEditorStore.subscribe((state) => {
      const { smartBoneRecordingActionId, smartBoneRecordingTargetId } = state;

      // Transition: null → value (recording started)
      if (smartBoneRecordingActionId && !prevActionId) {
        const pmTool = toolManagerRef.current?.getTool<PointMagnetTool>('point-magnet');
        if (pmTool) {
          // Load existing target offsets into the tool
          const action = state.smartBoneActions.find((a) => a.id === smartBoneRecordingActionId);
          const target = action?.targets.find((t) => t.id === smartBoneRecordingTargetId);
          if (target && target.offsets && Object.keys(target.offsets).length > 0) {
            const existingOffsets = new Map<string, MorphVertexOffset[]>();
            for (const [nodeId, nodeOffsets] of Object.entries(target.offsets)) {
              existingOffsets.set(nodeId, nodeOffsets);
            }
            pmTool.setWorkingOffsets(existingOffsets);
          } else {
            pmTool.setWorkingOffsets(new Map());
          }
        }
      }

      // Transition: value → null (recording stopped)
      // Capture and clear prev IDs BEFORE calling saveMorphTargetOffsets to
      // prevent re-entrant infinite recursion (set() triggers subscribe again)
      if (!smartBoneRecordingActionId && prevActionId && prevTargetId) {
        const savedActionId = prevActionId;
        const savedTargetId = prevTargetId;
        prevActionId = null;
        prevTargetId = null;

        const pmTool = toolManagerRef.current?.getTool<PointMagnetTool>('point-magnet');
        if (pmTool) {
          // Extract, compact, and save working offsets
          const workingOffsets = pmTool.getWorkingOffsets();
          const compacted: Record<string, MorphVertexOffset[]> = {};
          for (const [nodeId, offsets] of workingOffsets) {
            const clean = compactMorphOffsets(offsets);
            if (clean.length > 0) {
              compacted[nodeId] = clean;
            }
          }
          useEditorStore.getState().saveMorphTargetOffsets(savedActionId, savedTargetId, compacted);

          // Clear the tool's working offsets
          pmTool.setWorkingOffsets(new Map());
        }
        return;
      }

      prevActionId = smartBoneRecordingActionId;
      prevTargetId = smartBoneRecordingTargetId;
    });

    return unsubscribe;
  }, []);

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
    directSelectionImageNodes,
    deleteDirectSelectionPoints,
    marqueeRect,
  };
}
