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
  BrushTool,
  EraserTool,
  getAllPoints,
  pathShapeOf,
  type SmartGuide,
} from '@quar/core';
import type { TransformType, PathPointsChange, ErasedLayer } from '@quar/core';
import { findTrack } from '@quar/animation';
import { compactMorphOffsets, getBoneVisibility } from '@quar/rigging';
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
import { remapVertexTracks } from '../stores/vertexTracks';
import { tracksAfterErase } from '../stores/eraseTracks';
import { backdropColorAt, strokeAgainst } from '../components/canvas/backdrop';
import { toast } from '../components/common/Toast';

// ============================================================================
// Types
// ============================================================================

export interface UseCanvasToolsOptions {
  camera: Camera | null;
  sceneGraph: SceneGraph;
  getTessellatedVertices?: (nodeId: string) => Float32Array | null;
  getDeformedVertices?: (nodeId: string) => Float32Array | null;
  getVertexSkinMatrices?: (nodeId: string) => Float32Array | null;
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
  /** Handle key down event on canvas (or a key pressed elsewhere meant for it) */
  handleKeyDown: (event: React.KeyboardEvent | KeyboardEvent) => void;
  /** Handle key up event on canvas (or a key let go elsewhere meant for it) */
  handleKeyUp: (event: React.KeyboardEvent | KeyboardEvent) => void;
  /** Current preview node from active tool (null when not dragging) */
  previewNode: Node | null;
  /** Current cursor for active tool */
  cursor: string;
  /** Current path points when using PenTool */
  penToolPath: PathPoint[];
  /** The Pen's line to the pointer, and whether a click would close the path */
  penRubberBand: { to: Vector2; closing: boolean } | null;
  /** Dynamic alignment and spacing guides shown while moving a selection */
  smartGuides: SmartGuide[];
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
  /** Delete selected points in DirectSelectionTool */
  deleteDirectSelectionPoints: () => void;
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

/**
 * State updater that empties a list, keeping it as it is when already empty:
 * a new empty list each pointer move would redraw the canvas every time.
 */
function emptied<T>(list: T[]): T[] {
  return list.length === 0 ? list : [];
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
/** The panel's weight paint bone (if the layers are bound to it), brush and mode, on the tool. */
function applyWeightPaintSettings(tool: WeightPaintTool): void {
  const state = useEditorStore.getState();
  const boneId = state.weightPaintBoneId;
  if (boneId && tool.getPaintableBoneIds().includes(boneId)) tool.setActiveBoneId(boneId);
  tool.setBrushRadius(state.weightPaintBrushSize);
  tool.setBrushStrength(state.weightPaintBrushStrength);
  tool.setPaintMode(state.weightPaintMode);
}

/** The tool's bone, brush and mode, shown in the panel. */
function reportWeightPaintSettings(tool: WeightPaintTool): void {
  const state = useEditorStore.getState();
  if (tool.getActiveBoneId() !== state.weightPaintBoneId) {
    state.setWeightPaintBoneId(tool.getActiveBoneId());
  }
  if (tool.getBrushRadius() !== state.weightPaintBrushSize) {
    state.setWeightPaintBrushSize(tool.getBrushRadius());
  }
  if (tool.getBrushStrength() !== state.weightPaintBrushStrength) {
    state.setWeightPaintBrushStrength(tool.getBrushStrength());
  }
  if (tool.getPaintMode() !== state.weightPaintMode) state.setWeightPaintMode(tool.getPaintMode());
}

/** The panel's Brush size and smoothing, and Eraser size and mode, on their tools. */
function applyBrushAndEraserSettings(manager: ToolManager): void {
  const state = useEditorStore.getState();
  const brush = manager.getTool<BrushTool>('brush');
  brush?.setSize(state.brushSize);
  brush?.setSmoothing(state.brushSmoothing);
  const eraser = manager.getTool<EraserTool>('eraser');
  eraser?.setSize(state.eraserSize);
  eraser?.setMode(state.eraserMode);
}

/** The Eraser's size, as its keys ([ ]) left it, shown in the panel. */
function reportEraserSettings(tool: EraserTool): void {
  const state = useEditorStore.getState();
  const { size } = tool.getOptions();
  if (size !== state.eraserSize) state.setEraserSize(size);
}

export function useCanvasTools(options: UseCanvasToolsOptions): UseCanvasToolsReturn {
  const { camera, sceneGraph, getTessellatedVertices, getDeformedVertices, getVertexSkinMatrices } =
    options;

  // Use the externally-provided SceneGraph
  const sceneGraphRef = useRef<SceneGraph>(sceneGraph);
  sceneGraphRef.current = sceneGraph;
  const toolManagerRef = useRef<ToolManager | null>(null);

  // Track preview node for rendering
  const [previewNode, setPreviewNode] = useState<Node | null>(null);
  const [cursor, setCursor] = useState<string>('default');
  const [smartGuides, setSmartGuides] = useState<SmartGuide[]>([]);

  // Track PenTool state for overlay
  const [penToolPath, setPenToolPath] = useState<PathPoint[]>([]);
  const [penRubberBand, setPenRubberBand] = useState<{ to: Vector2; closing: boolean } | null>(
    null
  );
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
  const onSmartGuidesChange = useCallback((guides: SmartGuide[]) => setSmartGuides(guides), []);
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
    // A Smart Bone recording is one undo step, taken when it started: strokes
    // during it sculpt the brush's working set, which store undo can't revert
    if (useEditorStore.getState().smartBoneRecordingActionId) return;
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
      const track = timeline ? findTrack(timeline, nodeId, property) : undefined;
      // Sequence-animated: the edit shifts the object's rest pose instead
      if (track?.keyframes.some((kf) => kf.sequenceStepId !== undefined)) return false;
      if (autoKf) return true;
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
          node.type === 'group' ||
          node.type === 'symbol-instance'
        ) {
          if (shouldKf(nodeId, 'transform.scale.x'))
            addKf(nodeId, 'transform.scale.x', frame, node.transform.scale.x);
          if (shouldKf(nodeId, 'transform.scale.y'))
            addKf(nodeId, 'transform.scale.y', frame, node.transform.scale.y);
        } else if (node.type === 'image') {
          if (shouldKf(nodeId, 'width')) addKf(nodeId, 'width', frame, node.width);
          if (shouldKf(nodeId, 'height')) addKf(nodeId, 'height', frame, node.height);
        }
      } else if (type === 'rotate') {
        if (shouldKf(nodeId, 'transform.rotation'))
          addKf(nodeId, 'transform.rotation', frame, node.transform.rotation);
      } else if (type === 'vertex-move') {
        // A path whose Shape is keyed: the edit keys its whole shape here
        const shapeKeyed =
          node.type === 'path' &&
          timeline != null &&
          timeline.tracks.some(
            (t) => t.nodeId === nodeId && t.property === 'points' && t.keyframes.length > 0
          );
        if (shapeKeyed) addKf(nodeId, 'points', frame, pathShapeOf(node));

        // Keyframe ALL vertex positions/handles/cornerRadius for the affected path node
        // to prevent un-keyframed vertices from snapping to base state during interpolation.
        // Check if auto-keyframe is on OR any vertex property already has keyframes.
        const hasVertexTracks =
          (autoKf && !shapeKeyed) ||
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
          const pathNode = node;
          const allPts = getAllPoints(pathNode);

          // Determine if node uses subpaths
          const hasSubpaths = pathNode.subpaths && pathNode.subpaths.length > 0;

          if (hasSubpaths) {
            // Primary contour
            for (let i = 0; i < pathNode.points.length; i++) {
              const pt = pathNode.points[i]!;
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
            const subpaths = pathNode.subpaths ?? [];
            for (let s = 0; s < subpaths.length; s++) {
              const sp = subpaths[s]!;
              for (let i = 0; i < sp.length; i++) {
                const pt = sp[i]!;
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
              const pt = allPts[i]!;
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
          const imgNode = node;
          const vo = imgNode.vertexOffsets;
          if (vo) {
            for (let i = 0; i < 4; i++) {
              addKf(nodeId, `vertexOffsets.${i}.x`, frame, vo[i]!.x);
              addKf(nodeId, `vertexOffsets.${i}.y`, frame, vo[i]!.y);
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
      strokeAt: (point: Vector2) =>
        strokeAgainst(
          defaultStrokeRef.current,
          backdropColorAt(
            sceneGraphRef.current,
            point,
            useEditorStore.getState().documentBackground
          )
        ),
      onPathPointsChange: (nodeId: string, before: PathNode, change: PathPointsChange) => {
        // Keep the path's per-point keyframes on their points
        const { timeline } = useEditorStore.getState();
        const next = remapVertexTracks(timeline, nodeId, before, change);
        if (next !== timeline) useEditorStore.setState({ timeline: next, isDirty: true });
      },
      onErase: (cuts: ErasedLayer[]) => {
        // The cut layers keep their animation, and the pieces cut off get it
        const { timeline } = useEditorStore.getState();
        const next = tracksAfterErase(timeline, cuts);
        if (next !== timeline) useEditorStore.setState({ timeline: next, isDirty: true });
      },
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
      getDeformedVertices: (nodeId: string) => {
        return getDeformedVertices?.(nodeId) ?? null;
      },
      isHiddenOnCanvas: (nodeId: string) => {
        const { vitruvianControllers } = useEditorStore.getState();
        return (
          vitruvianControllers.length > 0 && getBoneVisibility(vitruvianControllers).has(nodeId)
        );
      },
      getVertexSkinMatrices: (nodeId: string) => {
        return getVertexSkinMatrices?.(nodeId) ?? null;
      },
      convertShapeToPath: (nodeId: string) => {
        return useEditorStore.getState().convertShapeToPath(sceneGraphRef.current, nodeId);
      },
      moveNodeKeepingPlacement: (id: string, parentId: string | null, index?: number) => {
        useEditorStore
          .getState()
          .moveNodeKeepingPlacement(sceneGraphRef.current, id, parentId, index);
      },
      getGuides: () => useEditorStore.getState().guides,
      getSnapToGuides: () => useEditorStore.getState().snapToGuides,
      getSymbolDefinitions: () => useEditorStore.getState().symbols,
      onSmartGuidesChange,
    });

    // Set the active tool from EditorStore (ToolManager defaults to 'selection')
    manager.setActiveTool(activeToolRef.current);
    applyBrushAndEraserSettings(manager);

    toolManagerRef.current = manager;
    setCursor(manager.getCursor());

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
    } else if (tool?.type === 'direct-selection') {
      setMarqueeRect((tool as DirectSelectionTool).getMarqueeRect());
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
      setPenRubberBand(penTool.getRubberBand());
    } else {
      setPenToolPath(emptied);
      setIsPenToolDrawing(false);
      setPenRubberBand(null);
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
      setDirectSelectionPoints(emptied);
      setDirectSelectionPathNodes(emptied);
      setDirectSelectionImageNodes(emptied);
      // Panels showing the points needn't redraw either
      const store = useEditorStore.getState();
      if (store.directSelectionPoints.length > 0) store.setDirectSelectionPoints([]);
    }
  }, []);

  // Sync active tool with ToolManager when it changes
  useEffect(() => {
    if (toolManagerRef.current) {
      toolManagerRef.current.setActiveTool(activeTool);
      setCursor(toolManagerRef.current.getCursor());
      syncDirectSelectionState();

      // Leaving the Point Magnet finishes a Smart Bone recording
      const recording = useEditorStore.getState();
      if (recording.smartBoneRecordingActionId && activeTool !== 'point-magnet') {
        recording.stopSmartBoneRecording(sceneGraphRef.current, { nextTool: activeTool });
      }

      // Weight paint starts with the panel's bone, brush and mode
      if (activeTool === 'weight-paint') {
        const wpTool = toolManagerRef.current.getActiveTool();
        if (useEditorStore.getState().activeTool !== 'weight-paint') {
          toast.info('Select a layer bound to bones to weight paint it');
        } else if (wpTool && wpTool.type === 'weight-paint') {
          applyWeightPaintSettings(wpTool as WeightPaintTool);
          reportWeightPaintSettings(wpTool as WeightPaintTool);
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
        // Saved unless cancelled, or its target is gone (removed, another project)
        const kept =
          !state.smartBoneRecordingDiscard &&
          state.smartBoneActions.some(
            (a) => a.id === savedActionId && a.targets.some((t) => t.id === savedTargetId)
          );
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
          if (kept) {
            useEditorStore
              .getState()
              .saveMorphTargetOffsets(savedActionId, savedTargetId, compacted);
          }

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
      setCursor(toolManagerRef.current.getCursor());

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

  // Points picked by the app (none, after a cut or join) reach Direct Selection
  useEffect(
    () =>
      useEditorStore.subscribe((state, prev) => {
        if (state.directSelectionPoints === prev.directSelectionPoints) return;
        const tool = toolManagerRef.current?.getActiveTool();
        if (tool?.type !== 'direct-selection') return;
        const dsTool = tool as DirectSelectionTool;
        const key = (points: Array<{ nodeId: string; pointIndex: number }>) =>
          points.map((p) => `${p.nodeId}:${p.pointIndex}`).join(',');
        if (key(dsTool.getSelectedPoints()) === key(state.directSelectionPoints)) return;
        dsTool.setSelectedPoints(state.directSelectionPoints);
        selectedNodeIdsRef.current = state.selectedNodeIds;
        syncDirectSelectionState();
      }),
    [syncDirectSelectionState]
  );

  // Weight paint follows the panel: its bone, brush, mode, and the layers selected
  useEffect(
    () =>
      useEditorStore.subscribe((state, prev) => {
        if (state.activeTool !== 'weight-paint') return;
        const tool = toolManagerRef.current?.getActiveTool();
        if (tool?.type !== 'weight-paint') return;
        const wpTool = tool as WeightPaintTool;
        if (state.selectedNodeIds !== prev.selectedNodeIds) {
          wpTool.onActivate();
          if (useEditorStore.getState().activeTool !== 'weight-paint') return;
        } else if (
          state.weightPaintBoneId === prev.weightPaintBoneId &&
          state.weightPaintBrushSize === prev.weightPaintBrushSize &&
          state.weightPaintBrushStrength === prev.weightPaintBrushStrength &&
          state.weightPaintMode === prev.weightPaintMode
        ) {
          return;
        }
        applyWeightPaintSettings(wpTool);
        reportWeightPaintSettings(wpTool);
      }),
    []
  );

  // The Brush and Eraser follow the panel: their size, smoothing and mode
  useEffect(
    () =>
      useEditorStore.subscribe((state, prev) => {
        if (
          state.brushSize === prev.brushSize &&
          state.brushSmoothing === prev.brushSmoothing &&
          state.eraserSize === prev.eraserSize &&
          state.eraserMode === prev.eraserMode
        ) {
          return;
        }
        if (toolManagerRef.current) applyBrushAndEraserSettings(toolManagerRef.current);
      }),
    []
  );

  // The canvas's key events, or keys pressed elsewhere meant for it (useEditShortcuts)
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent | KeyboardEvent) => {
      if (!toolManagerRef.current) return;
      toolManagerRef.current.handleKeyDown('nativeEvent' in event ? event.nativeEvent : event);
      // Brush keys ([ ] X) change the tool's brush, [ ] the Eraser's size: show it in the panel
      const tool = toolManagerRef.current.getActiveTool();
      if (tool?.type === 'weight-paint') reportWeightPaintSettings(tool as WeightPaintTool);
      if (tool?.type === 'eraser') reportEraserSettings(tool as EraserTool);
      // Sync tool overlay state after key events
      syncPenToolState();
      syncDirectSelectionState();
    },
    [syncPenToolState, syncDirectSelectionState]
  );

  const handleKeyUp = useCallback(
    (event: React.KeyboardEvent | KeyboardEvent) => {
      if (!toolManagerRef.current) return;
      toolManagerRef.current.handleKeyUp('nativeEvent' in event ? event.nativeEvent : event);
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
    penRubberBand,
    smartGuides,
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
