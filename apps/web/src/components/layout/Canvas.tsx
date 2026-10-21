import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  Camera,
  WebGLRenderer,
  Grid,
  ShapeRenderer,
  OnionSkinRenderer,
  SelectionManager,
  TransformHandles,
  importSvg,
  createGroupNode,
  keepTextInPlace,
  gridColorsFor,
  toGlColor,
} from '@quar/core';
import type { SceneGraphEvent } from '@quar/core';
import type { Color, Node, PathNode, Vector2 } from '@quar/types';
import {
  evaluateIKChains,
  evaluateSmartBones,
  morphOffsetsToDense,
  evaluateVitruvianControllers,
  evaluateDynamicChainsAtFrame,
  resetDynamicChainStates,
  type DynamicChainClock,
} from '@quar/rigging';
import type { DynamicChainState } from '@quar/types';
import type { PointMagnetTool, WeightPaintTool } from '@quar/core';
import { useCanvasTools } from '../../hooks/useCanvasTools';
import { useToolShortcuts } from '../../hooks/useToolShortcuts';
import { useEditorStore } from '../../stores/editorStore';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { SelectionOverlay } from '../canvas/SelectionOverlay';
import { PenToolOverlay } from '../canvas/PenToolOverlay';
import { DirectSelectionOverlay } from '../canvas/DirectSelectionOverlay';
import { GradientHandleOverlay } from '../canvas/GradientHandleOverlay';
import { CanvasRuler } from '../canvas/CanvasRuler';
import { TextEditOverlay } from '../canvas/TextEditOverlay';
import { BoneOverlay } from '../canvas/BoneOverlay';
import { GhostSceneCache, poseSceneAtFrame } from '../canvas/onionSkinScenes';
import { poseScene } from '../../stores/scenePosing';
import { fitViewToArtwork } from '../canvas/fitView';
import { deleteKeyTarget } from '../canvas/deleteKeyTarget';
import { flipSelected } from '../canvas/flipSelected';
import { copyLayers } from '../../hooks/useSystemClipboard';
import { decodeClipboard } from '../../services/systemClipboard';
import { bindLayersToBones } from '../canvas/bindToBones';
import { ArtboardOverlay } from '../canvas/ArtboardOverlay';
import { SequenceBadgesOverlay } from '../canvas/SequenceBadgesOverlay';
import { GuideOverlay } from '../canvas/GuideOverlay';
import { SmartGuidesOverlay } from '../canvas/SmartGuidesOverlay';
import { WeightPaintOverlay } from '../canvas/WeightPaintOverlay';
import { PointMagnetOverlay } from '../canvas/PointMagnetOverlay';
import { ContextMenu } from '../common/ContextMenu';
import type { ContextMenuEntry } from '../common/ContextMenu';
import { promptDialog } from '../common/PromptDialog';
import { toast } from '../common/Toast';
import styles from './Canvas.module.css';

// ============================================================================
// Constants
// ============================================================================

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 32;
const ZOOM_SPEED = 0.001;

// ============================================================================
// Canvas Component
// ============================================================================

export function Canvas({
  onProjectFileDrop,
}: {
  onProjectFileDrop?: (file: File) => void | Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isFileDragOver, setIsFileDragOver] = useState(false);

  // Renderer refs (not state to avoid re-renders)
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const gridRef = useRef<Grid | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const shapeRendererRef = useRef<ShapeRenderer | null>(null);
  const onionSkinRendererRef = useRef<OnionSkinRenderer | null>(null);
  // Onion-skin ghosts: posed copies of the scene, kept while it doesn't change
  const ghostScenesRef = useRef(new GhostSceneCache());
  const sceneVersionRef = useRef(0);
  const animationFrameRef = useRef<number>(0);

  // Selection infrastructure (initialized immediately, doesn't depend on WebGL)
  const selectionManagerRef = useRef<SelectionManager>(new SelectionManager());
  const transformHandlesRef = useRef<TransformHandles>(new TransformHandles());

  // Interaction state
  const isPanningRef = useRef(false);
  const isSpaceHeldRef = useRef(false);
  const lastMousePosRef = useRef<Vector2>({ x: 0, y: 0 });

  // Track active drag listener cleanup to prevent leaks on unmount
  const activeDragCleanupRef = useRef<(() => void) | null>(null);
  // Holds setupGlobalDragListeners (defined later) so the canvas mouse-down
  // handler can arm document-level move/up for tool drags without a TDZ ref (F011).
  const setupGlobalDragListenersRef = useRef<(() => void) | null>(null);

  // Dynamic chain physics state (transient, not persisted)
  const dynamicChainStatesRef = useRef<Map<string, DynamicChainState>>(new Map());
  const dynamicChainClockRef = useRef<DynamicChainClock>({ lastFrame: null });

  // Deformed bounds cache — updated in RAF render loop after IK evaluation
  const deformedBoundsRef = useRef<
    Map<string, { x: number; y: number; width: number; height: number }>
  >(new Map());
  const deformedBoundsVersionRef = useRef(0);

  // UI state (for display)
  const [zoomPercent, setZoomPercent] = useState(100);
  const [mouseWorldPos, setMouseWorldPos] = useState<Vector2>({ x: 0, y: 0 });
  const [cameraReady, setCameraReady] = useState(false);
  const [sceneGraphVersion, setSceneGraphVersion] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [cameraVersion, setCameraVersion] = useState(0);
  const [deformedBoundsVersion, setDeformedBoundsVersion] = useState(0);
  const [guideDragPreview, setGuideDragPreview] = useState<{
    axis: 'x' | 'y';
    worldPosition: number;
  } | null>(null);

  // Get selection state from store
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
  const showSequenceBadges = useEditorStore(
    (state) => state.sequenceWindowOpen && state.editingSymbolId === null
  );
  const sequenceSteps = useEditorStore((state) => state.animationSequence.steps);
  const pasteClipboard = useEditorStore((state) => state.pasteClipboard);
  const duplicateSelection = useEditorStore((state) => state.duplicateSelection);
  const deleteSelection = useEditorStore((state) => state.deleteSelection);
  const selectAll = useEditorStore((state) => state.selectAll);
  const groupSelection = useEditorStore((state) => state.groupSelection);
  const ungroupSelection = useEditorStore((state) => state.ungroupSelection);
  const bringForward = useEditorStore((state) => state.bringForward);
  const sendBackward = useEditorStore((state) => state.sendBackward);
  const bringToFront = useEditorStore((state) => state.bringToFront);
  const sendToBack = useEditorStore((state) => state.sendToBack);
  const booleanUnion = useEditorStore((state) => state.booleanUnion);
  const booleanSubtract = useEditorStore((state) => state.booleanSubtract);
  const booleanIntersect = useEditorStore((state) => state.booleanIntersect);
  const booleanExclude = useEditorStore((state) => state.booleanExclude);
  const flattenBooleanGroup = useEditorStore((state) => state.flattenBooleanGroup);
  const releaseBooleanGroup = useEditorStore((state) => state.releaseBooleanGroup);
  const changeBooleanOp = useEditorStore((state) => state.changeBooleanOp);
  const outlineStroke = useEditorStore((state) => state.outlineStroke);
  const editingGradient = useEditorStore((state) => state.editingGradient);
  const showRulers = useEditorStore((state) => state.showRulers);
  const guides = useEditorStore((state) => state.guides);
  const showGuides = useEditorStore((state) => state.showGuides);
  const addGuide = useEditorStore((state) => state.addGuide);
  const removeGuide = useEditorStore((state) => state.removeGuide);
  const updateGuidePosition = useEditorStore((state) => state.updateGuidePosition);
  const editingTextNodeId = useEditorStore((state) => state.editingTextNodeId);
  const setEditingTextNodeId = useEditorStore((state) => state.setEditingTextNodeId);
  const activeTool = useEditorStore((state) => state.activeTool);
  const createBrushProfileFromSelection = useEditorStore(
    (state) => state.createBrushProfileFromSelection
  );
  const bindMeshToBones = useEditorStore((state) => state.bindMeshToBones);
  const unbindMesh = useEditorStore((state) => state.unbindMesh);
  const createIKChain = useEditorStore((state) => state.createIKChain);
  const removeIKChain = useEditorStore((state) => state.removeIKChain);

  // Get shared SceneGraph from context
  const sceneGraph = useSceneGraph();
  useEffect(() => {
    const changed = () => {
      sceneVersionRef.current++;
    };
    const off = (
      ['nodeAdded', 'nodeRemoved', 'nodeChanged', 'nodeMoved', 'graphReplaced'] as const
    ).map((type) => sceneGraph.on(type, changed));
    return () => off.forEach((unsubscribe) => unsubscribe());
  }, [sceneGraph]);

  // Initialize tools hook
  const {
    toolManagerRef: _toolManagerRef,
    sceneGraphRef,
    handlePointerDown: toolPointerDown,
    handlePointerMove: toolPointerMove,
    handlePointerUp: toolPointerUp,
    handleKeyDown: toolKeyDown,
    handleKeyUp: toolKeyUp,
    previewNode,
    cursor: toolCursor,
    penToolPath,
    penRubberBand,
    isPenToolDrawing,
    startPenHandleDrag,
    startPenPointDrag,
    isDirectSelectionActive,
    directSelectionPoints,
    directSelectionPathNodes,
    directSelectionImageNodes,
    deleteDirectSelectionPoints,
    marqueeRect,
    smartGuides,
  } = useCanvasTools({
    camera: cameraReady ? cameraRef.current : null,
    sceneGraph,
    getTessellatedVertices: (nodeId: string) =>
      shapeRendererRef.current?.getTessellatedVertices(nodeId) ?? null,
    getDeformedVertices: (nodeId: string) => {
      const node = sceneGraph.getNode(nodeId);
      return node
        ? (shapeRendererRef.current?.getDeformedVertices(node, sceneGraph) ?? null)
        : null;
    },
    getVertexSkinMatrices: (nodeId: string) => {
      const node = sceneGraph.getNode(nodeId);
      return node
        ? (shapeRendererRef.current?.getVertexSkinMatrices(node, sceneGraph) ?? null)
        : null;
    },
  });

  // Subscribe to scene graph changes to update selection bounds
  useEffect(() => {
    if (!sceneGraphRef.current) return;
    const sceneGraph = sceneGraphRef.current;

    const incrementVersion = () => setSceneGraphVersion((v) => v + 1);

    // Evict the removed node's cached geometry (all node types) and free its
    // texture if it was an image, so the renderer's per-node caches don't grow
    // unbounded as nodes are deleted.
    const handleNodeRemoved = (event: SceneGraphEvent) => {
      incrementVersion();
      const renderer = shapeRendererRef.current;
      if (!renderer) return;
      if (event.nodeId) renderer.invalidateCache(event.nodeId);
      const removed = event.node;
      if (removed?.type === 'image') {
        // The node is already out of the graph here (removeNode emits after
        // deleting), so only free the shared GPU texture when no OTHER image node
        // still references this src — data URLs are commonly shared by duplicates.
        const { src } = removed;
        let stillUsed = false;
        sceneGraph.traverse((n) => {
          if (n.type === 'image' && n.src === src) stillUsed = true;
        });
        if (!stillUsed) renderer.disposeTexture(src);
      }
    };

    // The whole node set was replaced (project/page switch, undo, symbol edit).
    // No per-node nodeRemoved events fire, so purge the renderer's caches wholesale
    // to release every prior scene's geometry and textures.
    const handleGraphReplaced = () => {
      incrementVersion();
      const renderer = shapeRendererRef.current;
      if (!renderer) return;
      renderer.clearCache();
      renderer.clearTextures();
    };

    // Subscribe to all scene graph events that affect selection bounds
    const unsubscribeChanged = sceneGraph.on('nodeChanged', incrementVersion);
    const unsubscribeAdded = sceneGraph.on('nodeAdded', incrementVersion);
    const unsubscribeRemoved = sceneGraph.on('nodeRemoved', handleNodeRemoved);
    const unsubscribeReplaced = sceneGraph.on('graphReplaced', handleGraphReplaced);

    return () => {
      unsubscribeChanged();
      unsubscribeAdded();
      unsubscribeRemoved();
      unsubscribeReplaced();
    };
  }, [sceneGraphRef]);

  // Keep preview node in a ref for the render loop (avoids stale closure)
  const previewNodeRef = useRef(previewNode);
  previewNodeRef.current = previewNode;

  // Keep selectedNodeIds in a ref for the render loop (avoids stale closure)
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  selectedNodeIdsRef.current = selectedNodeIds;

  // Enable tool shortcuts
  useToolShortcuts();

  // Global keyboard shortcuts for group/ungroup and join (work regardless of focus)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // The focused canvas handler already ran group/ungroup and called
      // preventDefault; bail so we don't toggle a second time (F009).
      if (e.defaultPrevented) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key !== 'g' && key !== 'j') return;
      if (key === 'j' && (e.shiftKey || e.altKey)) return;

      // Skip when input is focused
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      e.preventDefault();
      if (key === 'j') {
        useEditorStore.getState().joinSelectedPaths(sceneGraph);
        return;
      }
      if (e.shiftKey) {
        ungroupSelection(sceneGraph);
      } else {
        groupSelection(sceneGraph);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [sceneGraph, groupSelection, ungroupSelection]);

  // Global keyboard shortcuts for boolean operations (Ctrl+Shift+U/D/I/X)
  useEffect(() => {
    const handleBooleanKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;

      // Skip when input is focused
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const key = e.key.toLowerCase();
      switch (key) {
        case 'u':
          e.preventDefault();
          booleanUnion(sceneGraph);
          break;
        case 'd':
          e.preventDefault();
          booleanSubtract(sceneGraph);
          break;
        case 'i':
          e.preventDefault();
          booleanIntersect(sceneGraph);
          break;
        case 'x':
          e.preventDefault();
          booleanExclude(sceneGraph);
          break;
        case 'p':
          e.preventDefault();
          useEditorStore.getState().convertSelectionToPaths(sceneGraph);
          break;
        case 'o':
          e.preventDefault();
          outlineStroke(sceneGraph);
          break;
        case 'k':
          e.preventDefault();
          useEditorStore.getState().createSymbol(sceneGraph);
          break;
      }
    };

    window.addEventListener('keydown', handleBooleanKeyDown);
    return () => window.removeEventListener('keydown', handleBooleanKeyDown);
  }, [sceneGraph, booleanUnion, booleanSubtract, booleanIntersect, booleanExclude, outlineStroke]);

  // Selection bounds for display: un-rotated bounds + rotation angle for single selection,
  // AABB + rotation 0 for multi-selection.
  // For skinned nodes, use deformed vertex bounds instead of the node's own transform.
  const selectionDisplay = useMemo(() => {
    if (!sceneGraphRef.current || selectedNodeIds.size === 0) return null;

    // Read deformed bounds from the ref (updated in RAF render loop after IK evaluation)
    for (const nodeId of selectedNodeIds) {
      const deformedRect = deformedBoundsRef.current.get(nodeId);
      if (deformedRect) {
        return {
          bounds: {
            rect: deformedRect,
            center: {
              x: deformedRect.x + deformedRect.width / 2,
              y: deformedRect.y + deformedRect.height / 2,
            },
          },
          rotation: 0,
        };
      }
    }

    // Pass symbol definitions so selection bounds work for symbol instances
    selectionManagerRef.current.setSymbolDefinitions(useEditorStore.getState().symbols);

    return selectionManagerRef.current.getSelectionBoundsForDisplay(
      selectedNodeIds,
      sceneGraphRef.current
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sceneGraphVersion/deformedBoundsVersion trigger recalculation
  }, [selectedNodeIds, sceneGraphRef, sceneGraphVersion, deformedBoundsVersion]);

  const selectionBounds = selectionDisplay?.bounds ?? null;
  const selectionRotation = selectionDisplay?.rotation ?? 0;

  // Collect bone nodes and IK target nodes for overlay
  const boneNodes = useMemo(() => {
    const graph = sceneGraphRef.current;
    if (!graph) return [];
    const bones: import('@quar/types').BoneNode[] = [];
    const collectBones = (nodes: Node[]) => {
      for (const node of nodes) {
        if (node.type === 'bone') {
          bones.push(node);
        }
        if (node.children.length > 0) {
          const children = node.children.map((id) => graph.getNode(id)).filter(Boolean) as Node[];
          collectBones(children);
        }
      }
    };
    collectBones(sceneGraphRef.current.getRootNodes());
    return bones;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneGraphVersion]);

  const ikTargetNodes = useMemo(() => {
    if (!sceneGraphRef.current) return [];
    const targets: import('@quar/types').IKTargetNode[] = [];
    sceneGraphRef.current.traverse((node) => {
      if (node.type === 'ik-target') {
        targets.push(node);
      }
    });
    return targets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneGraphVersion]);

  // Collect artboard nodes for overlay
  const artboardNodes = useMemo(() => {
    if (!sceneGraphRef.current) return [];
    const artboards: import('@quar/types').ArtboardNode[] = [];
    sceneGraphRef.current.traverse((node) => {
      if (node.type === 'artboard') {
        artboards.push(node);
      }
    });
    return artboards;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneGraphVersion]);

  const ikChains = useEditorStore((state) => state.ikChains);
  const vitruvianControllers = useEditorStore((state) => state.vitruvianControllers);
  const dynamicChains = useEditorStore((state) => state.dynamicChains);

  // Compute hidden bones from Vitruvian controllers
  const hiddenBoneIds = useMemo(() => {
    if (vitruvianControllers.length === 0) return undefined;
    return evaluateVitruvianControllers(vitruvianControllers);
  }, [vitruvianControllers]);

  // Compute dynamic chain bone IDs for overlay
  const dynamicChainBoneIds = useMemo(() => {
    if (dynamicChains.length === 0) return undefined;
    const ids = new Set<string>();
    for (const chain of dynamicChains) {
      if (chain.enabled) {
        for (const boneId of chain.boneIds) ids.add(boneId);
      }
    }
    return ids.size > 0 ? ids : undefined;
  }, [dynamicChains]);

  const transformHandles = useMemo(() => {
    if (!transformHandlesRef.current || !selectionBounds || !cameraRef.current) return [];
    const handles = transformHandlesRef.current.getHandles(selectionBounds, cameraRef.current);
    // Bones have no size to resize: only the rotation handles
    const onlyBones =
      selectedNodeIds.size > 0 &&
      [...selectedNodeIds].every((id) => sceneGraph.getNode(id)?.type === 'bone');
    return onlyBones ? handles.filter((handle) => handle.position.startsWith('rotate')) : handles;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the camera pans and zooms in place: cameraVersion says when
  }, [selectionBounds, cameraVersion, selectedNodeIds, sceneGraph]);

  // Convert selection bounds to screen coordinates for overlay
  const screenBounds = useMemo(() => {
    if (!selectionBounds || !cameraRef.current) return null;
    const camera = cameraRef.current;
    const { rect } = selectionBounds;

    // Convert world bounds to screen
    // Note: Y-axis is flipped between world (Y-up) and screen (Y-down) coordinates
    const p1: Vector2 = camera.worldToScreen({ x: rect.x, y: rect.y });
    const p2: Vector2 = camera.worldToScreen({
      x: rect.x + rect.width,
      y: rect.y + rect.height,
    });

    // Ensure positive dimensions by taking min/max
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Vector2 type is properly typed
    const screenX = Math.min(p1.x, p2.x);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Vector2 type is properly typed
    const screenY = Math.min(p1.y, p2.y);
    const screenWidth = Math.abs(p2.x - p1.x);
    const screenHeight = Math.abs(p2.y - p1.y);

    return {
      rect: {
        x: screenX,
        y: screenY,
        width: screenWidth,
        height: screenHeight,
      },
      center: camera.worldToScreen(selectionBounds.center),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the camera pans and zooms in place: cameraVersion says when
  }, [selectionBounds, cameraVersion]);

  // Convert marquee rect (world coords) to screen coords for overlay
  const screenMarqueeRect = useMemo(() => {
    if (!marqueeRect || !cameraRef.current) return null;
    const camera = cameraRef.current;
    const p1 = camera.worldToScreen({ x: marqueeRect.x, y: marqueeRect.y });
    const p2 = camera.worldToScreen({
      x: marqueeRect.x + marqueeRect.width,
      y: marqueeRect.y + marqueeRect.height,
    });
    return {
      x: Math.min(p1.x, p2.x),
      y: Math.min(p1.y, p2.y),
      width: Math.abs(p2.x - p1.x),
      height: Math.abs(p2.y - p1.y),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the camera pans and zooms in place: cameraVersion says when
  }, [marqueeRect, cameraVersion]);

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Initialize WebGL renderer
    try {
      const renderer = new WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
      });
      rendererRef.current = renderer;

      // Initialize camera
      const camera = new Camera({
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        zoomSensitivity: ZOOM_SPEED,
      });
      cameraRef.current = camera;
      setCameraReady(true);

      // Initialize grid (let: rebuilt on WebGL context restore)
      let grid = new Grid(renderer, {
        majorSpacing: 100,
        minorDivisions: 5,
      });
      gridRef.current = grid;
      // The background the grid's colors were last matched to
      let gridBackground: Color | null = null;

      // Initialize shape renderer (let: rebuilt on WebGL context restore)
      let shapeRenderer = new ShapeRenderer(renderer);
      shapeRendererRef.current = shapeRenderer;

      // Initialize onion skin renderer (let: rebuilt on WebGL context restore)
      let onionSkinRenderer = new OnionSkinRenderer(shapeRenderer);
      onionSkinRendererRef.current = onionSkinRenderer;

      // Listen to camera changes
      const unsubscribe = camera.on('change', () => {
        setZoomPercent(Math.round(camera.zoom * 100));
        setCameraVersion((v) => v + 1);
      });

      // Set up resize observer (track last size to re-apply on context restore)
      let lastWidth = 0;
      let lastHeight = 0;
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const width = Math.round(entry.contentRect.width);
          const height = Math.round(entry.contentRect.height);
          if (width > 0 && height > 0) {
            lastWidth = width;
            lastHeight = height;
            renderer.setViewport(width, height);
            camera.setViewport(width, height);
            setViewportSize({ width, height });
          }
        }
      });

      resizeObserver.observe(container);

      // Start render loop
      const render = () => {
        if (renderer.isContextLost()) {
          animationFrameRef.current = requestAnimationFrame(render);
          return;
        }

        // The document background, with a grid that reads on it
        const { documentBackground } = useEditorStore.getState();
        if (documentBackground !== gridBackground) {
          grid.setConfig(gridColorsFor(documentBackground));
          gridBackground = documentBackground;
        }
        renderer.clear(toGlColor(documentBackground));

        const viewProjectionMatrix = camera.getViewProjectionMatrix();
        const visibleBounds = camera.getVisibleBounds();

        // Render grid
        grid.render(viewProjectionMatrix, visibleBounds, camera.zoom);

        // Render onion skin ghost frames (before current frame shapes)
        if (sceneGraphRef.current && onionSkinRenderer) {
          const {
            onionSkin,
            isPlaying: playing,
            timeline: tl,
            currentFrame: frame,
            timelineDuration: tlDuration,
          } = useEditorStore.getState();
          if (onionSkin.enabled && (!playing || onionSkin.showDuringPlayback)) {
            const sg = sceneGraphRef.current;
            const { ikChains: ghostIK, vitruvianControllers: ghostVit } = useEditorStore.getState();
            // Ghosts show bones as the canvas does
            shapeRenderer.setHiddenBones(
              ghostVit.length > 0 ? evaluateVitruvianControllers(ghostVit) : null
            );
            const inputs = [sceneVersionRef.current, tl, ghostIK];
            const shown = new Set<number>();
            onionSkinRenderer.render(
              onionSkin,
              frame,
              (f) => {
                // Only frames with something animated: else the ghost is the scene itself
                if (tl.tracks.length === 0) return null;
                shown.add(f);
                return ghostScenesRef.current.get(inputs, f, () =>
                  poseSceneAtFrame(sg, tl, f, ghostIK)
                );
              },
              viewProjectionMatrix,
              tlDuration
            );
            ghostScenesRef.current.keepOnly(shown);
          }
        }

        // Evaluate IK chains for interactive posing (when NOT playing)
        if (sceneGraphRef.current) {
          const { ikChains, isPlaying: ikPlaying } = useEditorStore.getState();
          if (ikChains.length > 0 && !ikPlaying) {
            const sg = sceneGraphRef.current;
            // The bones IK poses aren't edits (moving the target is)
            poseScene(() => evaluateIKChains(ikChains, sg));
          }
        }

        // Evaluate Dynamic Bone Chains (physics, after IK, before Smart Bones)
        if (sceneGraphRef.current) {
          const {
            dynamicChains,
            globalWind,
            isPlaying: dcPlaying,
            currentFrame: dcFrame,
            frameRate: dcFrameRate,
          } = useEditorStore.getState();
          const sg = sceneGraphRef.current;
          if (dynamicChains.length > 0 && dcPlaying) {
            // One fixed step per timeline frame, as exports simulate it; physics isn't an edit
            poseScene(() =>
              evaluateDynamicChainsAtFrame(
                dynamicChains,
                dynamicChainStatesRef.current,
                sg as any,
                dcFrame,
                dcFrameRate,
                globalWind,
                dynamicChainClockRef.current
              )
            );
          } else if (!dcPlaying) {
            // Stopped: the bones get their own rotations back, and the next play starts afresh
            if (dynamicChainStatesRef.current.size > 0) {
              poseScene(() => resetDynamicChainStates(dynamicChainStatesRef.current, sg as any));
            }
            dynamicChainClockRef.current.lastFrame = null;
          }
        }

        // Evaluate Smart Bones (corrective morph targets after FK+IK+Physics)
        let morphOffsetsMap: Map<string, Float32Array> | undefined;
        if (sceneGraphRef.current && shapeRenderer) {
          const { smartBoneActions, smartBoneRecordingActionId } = useEditorStore.getState();

          // Build vertex count map (needed for Smart Bones evaluation AND recording preview)
          const needVertexCounts =
            smartBoneActions.length > 0 || smartBoneRecordingActionId != null;
          const nodeVertexCounts = new Map<string, number>();
          if (needVertexCounts) {
            sceneGraphRef.current.traverse((n: Node) => {
              if ((n as any).skinData) {
                const verts = shapeRenderer.getTessellatedVertices(n.id);
                if (verts) nodeVertexCounts.set(n.id, verts.length / 2);
              }
            });
          }

          if (smartBoneActions.length > 0) {
            const result = evaluateSmartBones(
              // The action being recorded shows as the Point Magnet's working offsets
              smartBoneRecordingActionId
                ? smartBoneActions.filter((a) => a.id !== smartBoneRecordingActionId)
                : smartBoneActions,
              sceneGraphRef.current,
              nodeVertexCounts
            );
            if (result.size > 0) morphOffsetsMap = result;
          }

          // During recording, merge PointMagnetTool working offsets for live preview
          if (smartBoneRecordingActionId) {
            const pmTool = _toolManagerRef.current?.getTool<PointMagnetTool>('point-magnet');
            if (pmTool) {
              const workingOffsets = pmTool.getWorkingOffsets();
              if (workingOffsets.size > 0) {
                if (!morphOffsetsMap) morphOffsetsMap = new Map();
                for (const [nodeId, sparseOffsets] of workingOffsets) {
                  const vertCount = nodeVertexCounts.get(nodeId) ?? 0;
                  if (vertCount === 0) continue;
                  const dense = morphOffsetsToDense(sparseOffsets, vertCount);
                  const existing = morphOffsetsMap.get(nodeId);
                  if (existing) {
                    // Merge additively
                    for (let i = 0; i < Math.min(dense.length, existing.length); i++) {
                      existing[i] = existing[i]! + dense[i]!;
                    }
                  } else {
                    morphOffsetsMap.set(nodeId, dense);
                  }
                }
              }
            }
          }
        }

        // Render shapes from scene graph
        if (sceneGraphRef.current && shapeRenderer) {
          // Pass symbol definitions to renderer
          const syms = useEditorStore.getState().symbols;
          if (syms.length > 0) {
            const symMap = new Map<string, import('@quar/types').SymbolDefinition>();
            for (const s of syms) symMap.set(s.id, s);
            shapeRenderer.setSymbolDefinitions(symMap);
          }

          // Bones outside their Vitruvian controller's active group aren't drawn
          const { vitruvianControllers: vitControllers } = useEditorStore.getState();
          shapeRenderer.setHiddenBones(
            vitControllers.length > 0 ? evaluateVitruvianControllers(vitControllers) : null
          );

          shapeRenderer.render(
            sceneGraphRef.current,
            viewProjectionMatrix,
            selectedNodeIdsRef.current,
            useEditorStore.getState().editingTextNodeId,
            morphOffsetsMap
          );

          // Update deformed bounds for selected skinned nodes (post IK + render)
          const selIds = selectedNodeIdsRef.current;
          if (selIds.size > 0) {
            const newBounds = new Map<
              string,
              { x: number; y: number; width: number; height: number }
            >();
            for (const sid of selIds) {
              const sNode = sceneGraphRef.current.getNode(sid);
              if (!sNode) continue;
              if ((sNode as any).skinData) {
                const dr = shapeRenderer.getDeformedBounds(sNode, sceneGraphRef.current);
                if (dr) newBounds.set(sid, dr);
              } else if (sNode.type === 'group') {
                // Group with skinned children
                const children = sceneGraphRef.current.getChildren(sNode.id);
                let minX = Infinity,
                  minY = Infinity,
                  maxX = -Infinity,
                  maxY = -Infinity;
                let hasSkin = false;
                for (const child of children) {
                  if ((child as any).skinData) {
                    const cr = shapeRenderer.getDeformedBounds(child, sceneGraphRef.current);
                    if (cr) {
                      hasSkin = true;
                      if (cr.x < minX) minX = cr.x;
                      if (cr.y < minY) minY = cr.y;
                      if (cr.x + cr.width > maxX) maxX = cr.x + cr.width;
                      if (cr.y + cr.height > maxY) maxY = cr.y + cr.height;
                    }
                  }
                }
                if (hasSkin) {
                  newBounds.set(sid, { x: minX, y: minY, width: maxX - minX, height: maxY - minY });
                }
              }
            }
            // Only bump version if bounds actually changed
            if (newBounds.size > 0) {
              const prev = deformedBoundsRef.current;
              let changed = newBounds.size !== prev.size;
              if (!changed) {
                for (const [k, v] of newBounds) {
                  const pv = prev.get(k);
                  if (
                    !pv ||
                    pv.x !== v.x ||
                    pv.y !== v.y ||
                    pv.width !== v.width ||
                    pv.height !== v.height
                  ) {
                    changed = true;
                    break;
                  }
                }
              }
              if (changed) {
                deformedBoundsRef.current = newBounds;
                deformedBoundsVersionRef.current++;
                setDeformedBoundsVersion(deformedBoundsVersionRef.current);
              }
            } else if (deformedBoundsRef.current.size > 0) {
              deformedBoundsRef.current = newBounds;
              deformedBoundsVersionRef.current++;
              setDeformedBoundsVersion(deformedBoundsVersionRef.current);
            }
          }
        }

        // Render preview node (if drawing)
        if (previewNodeRef.current && shapeRenderer) {
          shapeRenderer.renderNode(previewNodeRef.current, viewProjectionMatrix);
        }

        // Render weight paint visualization overlay
        const edState = useEditorStore.getState();
        if (
          edState.activeTool === 'weight-paint' &&
          edState.weightPaintBoneId &&
          sceneGraphRef.current &&
          shapeRenderer
        ) {
          // The layers being painted (groups' bound layers included)
          const wpTool = _toolManagerRef.current?.getActiveTool();
          const nodeIds: string[] =
            wpTool?.type === 'weight-paint'
              ? (wpTool as WeightPaintTool).getBoundNodeIds()
              : [...edState.selectedNodeIds];
          for (const nodeId of nodeIds) {
            const node = sceneGraphRef.current.getNode(nodeId);
            if (node) {
              shapeRenderer.renderWeightVisualization(
                node,
                edState.weightPaintBoneId,
                viewProjectionMatrix,
                sceneGraphRef.current
              );
            }
          }
        }

        animationFrameRef.current = requestAnimationFrame(render);
      };

      animationFrameRef.current = requestAnimationFrame(render);

      // Rebuild GPU-dependent renderers when the WebGL context is restored.
      // WebGLRenderer has already dropped its stale program/buffer wrappers;
      // recreate the renderers so their programs/VAOs/buffers are re-made on the
      // fresh context, reassign the closure vars (the render loop reads them) and
      // the refs, and re-apply the last known viewport.
      renderer.setContextRestoredHandler(() => {
        grid = new Grid(renderer, { majorSpacing: 100, minorDivisions: 5 });
        gridRef.current = grid;
        gridBackground = null;
        shapeRenderer = new ShapeRenderer(renderer);
        shapeRendererRef.current = shapeRenderer;
        onionSkinRenderer = new OnionSkinRenderer(shapeRenderer);
        onionSkinRendererRef.current = onionSkinRenderer;
        if (lastWidth > 0 && lastHeight > 0) {
          renderer.setViewport(lastWidth, lastHeight);
        }
      });

      // Cleanup
      return () => {
        // Clean up any active drag listeners
        activeDragCleanupRef.current?.();
        activeDragCleanupRef.current = null;

        cancelAnimationFrame(animationFrameRef.current);
        resizeObserver.disconnect();
        unsubscribe();
        grid.dispose();
        shapeRenderer.dispose();
        renderer.dispose();
        setCameraReady(false);
      };
    } catch (error) {
      console.error('Failed to initialize WebGL:', error);
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialization should only run once on mount
  }, []);

  // --------------------------------------------------------------------------
  // MenuBar View Event Listeners
  // --------------------------------------------------------------------------

  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;

    const handleZoomIn = () => camera.zoomTo(camera.zoom * 1.25);
    const handleZoomOut = () => camera.zoomTo(camera.zoom * 0.8);
    const handleZoom100 = () => camera.zoomTo(1);
    const handleFitToWindow = () =>
      fitViewToArtwork(camera, sceneGraph, useEditorStore.getState().symbols);

    window.addEventListener('menubar:zoom-in', handleZoomIn);
    window.addEventListener('menubar:zoom-out', handleZoomOut);
    window.addEventListener('menubar:zoom-100', handleZoom100);
    window.addEventListener('menubar:fit-to-window', handleFitToWindow);

    // Rigging commands from MenuBar
    const handleBindToBones = () => {
      const graph = sceneGraphRef.current;
      if (!graph) return;
      bindLayersToBones(
        graph,
        useEditorStore.getState().selectedNodeIds,
        (node) => shapeRendererRef.current?.getBindVertices(node),
        bindMeshToBones
      );
    };

    const handleUnbindMesh = () => {
      const graph = sceneGraphRef.current;
      if (!graph) return;
      const state = useEditorStore.getState();
      const selectedArr = Array.from(state.selectedNodeIds);
      for (const nodeId of selectedArr) {
        const node = graph.getNode(nodeId);
        if (!node) continue;
        if ((node as any).skinData) {
          unbindMesh(graph, nodeId);
        } else if (node.type === 'group') {
          const children = graph.getChildren(nodeId);
          for (const child of children) {
            if ((child as any).skinData) {
              unbindMesh(graph, child.id);
            }
          }
        }
      }
    };

    const handleCreateIKChain = () => {
      const graph = sceneGraphRef.current;
      if (!graph) return;
      const state = useEditorStore.getState();
      const selectedArr = Array.from(state.selectedNodeIds);
      for (const nodeId of selectedArr) {
        const node = graph.getNode(nodeId);
        if (node && node.type === 'bone') {
          createIKChain(graph, nodeId);
          break;
        }
      }
    };

    const handleRemoveIKChain = () => {
      const graph = sceneGraphRef.current;
      if (!graph) return;
      const state = useEditorStore.getState();
      const selectedArr = Array.from(state.selectedNodeIds);
      for (const nodeId of selectedArr) {
        const node = graph.getNode(nodeId);
        if (!node) continue;
        // If an IK target is selected, remove its chain
        if (node.type === 'ik-target') {
          removeIKChain(graph, (node as any).ikChainId);
          break;
        }
        // If a bone is selected, find its chain
        if (node.type === 'bone') {
          const chain = state.ikChains.find(
            (c) => c.rootBoneId === nodeId || c.endEffectorBoneId === nodeId
          );
          if (chain) {
            removeIKChain(graph, chain.id);
            break;
          }
        }
      }
    };

    window.addEventListener('menubar:bind-to-bones', handleBindToBones);
    window.addEventListener('menubar:unbind-mesh', handleUnbindMesh);
    window.addEventListener('menubar:create-ik-chain', handleCreateIKChain);
    window.addEventListener('menubar:remove-ik-chain', handleRemoveIKChain);

    return () => {
      window.removeEventListener('menubar:zoom-in', handleZoomIn);
      window.removeEventListener('menubar:zoom-out', handleZoomOut);
      window.removeEventListener('menubar:zoom-100', handleZoom100);
      window.removeEventListener('menubar:fit-to-window', handleFitToWindow);
      window.removeEventListener('menubar:bind-to-bones', handleBindToBones);
      window.removeEventListener('menubar:unbind-mesh', handleUnbindMesh);
      window.removeEventListener('menubar:create-ik-chain', handleCreateIKChain);
      window.removeEventListener('menubar:remove-ik-chain', handleRemoveIKChain);
    };
  }, [
    cameraReady,
    sceneGraph,
    sceneGraphRef,
    bindMeshToBones,
    unbindMesh,
    createIKChain,
    removeIKChain,
  ]); // Re-attach when camera becomes ready

  // --------------------------------------------------------------------------
  // Mouse Handlers
  // --------------------------------------------------------------------------

  const getCanvasPositions = useCallback(
    (e: React.MouseEvent): { screenPos: Vector2; worldPos: Vector2 } | null => {
      const camera = cameraRef.current;
      const canvas = canvasRef.current;
      if (!camera || !canvas) return null;

      const rect = canvas.getBoundingClientRect();
      const screenPos: Vector2 = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      const worldPos = camera.screenToWorld(screenPos);

      return { screenPos, worldPos };
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Middle mouse or Space+Left mouse for panning
      if (e.button === 1 || (e.button === 0 && isSpaceHeldRef.current)) {
        e.preventDefault();
        isPanningRef.current = true;
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
        return;
      }

      // Don't pass clicks to tool system while text editing overlay is active
      if (useEditorStore.getState().editingTextNodeId) return;

      // Pass to tool system
      if (e.button === 0) {
        const positions = getCanvasPositions(e);
        if (positions) {
          toolPointerDown(
            positions.screenPos,
            positions.worldPos,
            e as unknown as React.PointerEvent,
            e.detail
          );
          // Arm document-level move/up so a tool drag (marquee, move, resize)
          // still receives its pointer-up when released outside the canvas —
          // otherwise the drag got stuck (F011).
          setupGlobalDragListenersRef.current?.();
        }
      }
    },
    [getCanvasPositions, toolPointerDown]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const camera = cameraRef.current;
      const canvas = canvasRef.current;
      if (!camera || !canvas) return;

      const positions = getCanvasPositions(e);
      if (!positions) return;

      // Update world position display
      setMouseWorldPos({
        x: Math.round(positions.worldPos.x * 10) / 10,
        y: Math.round(positions.worldPos.y * 10) / 10,
      });

      // Handle panning
      if (isPanningRef.current) {
        const delta: Vector2 = {
          x: e.clientX - lastMousePosRef.current.x,
          y: e.clientY - lastMousePosRef.current.y,
        };
        camera.pan(delta);
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // Pass to tool system — unless a global drag is active, in which case the
      // document pointermove handles it (avoids double-dispatch over the canvas).
      if (!activeDragCleanupRef.current) {
        toolPointerMove(
          positions.screenPos,
          positions.worldPos,
          e as unknown as React.PointerEvent
        );
      }

      // Update cursor based on state
      if (!isPanningRef.current && !isSpaceHeldRef.current) {
        canvas.style.cursor = toolCursor;
      }
    },
    [getCanvasPositions, toolPointerMove, toolCursor]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (isPanningRef.current) {
        isPanningRef.current = false;
        canvas.style.cursor = isSpaceHeldRef.current ? 'grab' : toolCursor;
        return;
      }

      // Don't pass events to tool system while text editing overlay is active
      if (useEditorStore.getState().editingTextNodeId) return;

      // A global drag is active — its document pointerup delivers the release
      // (and cleans up), so skip the local dispatch to avoid a double up (F011).
      if (activeDragCleanupRef.current) return;

      // Pass to tool system
      const positions = getCanvasPositions(e);
      if (positions) {
        toolPointerUp(positions.screenPos, positions.worldPos, e as unknown as React.PointerEvent);
      }
    },
    [getCanvasPositions, toolPointerUp, toolCursor]
  );

  const handleMouseLeave = useCallback(() => {
    isPanningRef.current = false;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.cursor = toolCursor;
    }
  }, [toolCursor]);

  // --------------------------------------------------------------------------
  // Wheel Handler (Zoom)
  // --------------------------------------------------------------------------

  const handleWheel = useCallback((e: WheelEvent) => {
    const camera = cameraRef.current;
    const canvas = canvasRef.current;
    if (!camera || !canvas) return;

    const shouldPanHorizontally =
      !e.ctrlKey && !e.metaKey && (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY));
    if (shouldPanHorizontally) {
      let panDelta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) panDelta *= 40;
      if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) panDelta *= canvas.clientWidth;

      e.preventDefault();
      camera.pan({ x: -panDelta, y: 0 });
      return;
    }

    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const screenPos: Vector2 = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    // Zoom toward cursor position
    const zoomDelta = -e.deltaY;
    camera.zoomAt(screenPos, zoomDelta);
  }, []);

  // Attach wheel listener as non-passive so preventDefault() blocks browser zoom (Ctrl+Scroll)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // --------------------------------------------------------------------------
  // Paste from System Clipboard (SVG vector + raster images)
  // --------------------------------------------------------------------------

  // Shared helpers for importing external clipboard content
  const getCanvasCenter = useCallback(() => {
    const camera = cameraRef.current;
    if (!camera) return { x: 0, y: 0 };
    return camera.screenToWorld({
      x: (canvasRef.current?.clientWidth ?? 800) / 2,
      y: (canvasRef.current?.clientHeight ?? 600) / 2,
    });
  }, []);

  const importSvgString = useCallback(
    (svgString: string) => {
      const sg = sceneGraphRef.current;
      if (!sg) return;
      const worldCenter = getCanvasCenter();
      let idCounter = Date.now();
      const generateId = () => `node_${idCounter++}`;
      try {
        useEditorStore.getState().pushUndo(sg);
        const result = importSvg(svgString, sg, generateId, {
          centerAtOrigin: false,
          position: worldCenter,
        });
        if (result.rootIds.length > 1) {
          // Wrap multiple root nodes in a group
          const groupId = generateId();
          const group = createGroupNode(groupId, 'Imported SVG');
          sg.addNode(group);
          for (const rootId of result.rootIds) {
            sg.moveNode(rootId, groupId);
          }
          useEditorStore.setState({ selectedNodeIds: new Set([groupId]) });
        } else if (result.rootIds.length === 1) {
          useEditorStore.setState({ selectedNodeIds: new Set(result.rootIds) });
        }
      } catch {
        // Invalid SVG — ignore
      }
    },
    [getCanvasCenter, sceneGraphRef]
  );

  const importImageBlob = useCallback(
    (blob: Blob) => {
      const sg = sceneGraphRef.current;
      if (!sg || blob.size > 10 * 1024 * 1024) return;

      const reader = new FileReader();
      reader.onload = () => {
        const dataUri = reader.result as string;
        const img = new Image();
        img.onload = () => {
          const worldCenter = getCanvasCenter();
          const nodeId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const imageNode = {
            id: nodeId,
            name: 'Pasted Image',
            type: 'image' as const,
            parent: null,
            children: [],
            transform: {
              position: { x: worldCenter.x, y: worldCenter.y },
              rotation: 0,
              scale: { x: 1, y: 1 },
              anchor: { x: 0.5, y: 0.5 },
              skew: { x: 0, y: 0 },
            },
            visible: true,
            locked: false,
            opacity: 1,
            blendMode: 'normal' as const,
            src: dataUri,
            width: img.naturalWidth,
            height: img.naturalHeight,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            cornerRadius: [0, 0, 0, 0] as [number, number, number, number],
          };

          useEditorStore.getState().pushUndo(sg);
          sg.addNode(imageNode);
          useEditorStore.setState({ selectedNodeIds: new Set([nodeId]) });
        };
        img.src = dataUri;
      };
      reader.readAsDataURL(blob);
    },
    [getCanvasCenter, sceneGraphRef]
  );

  /**
   * Read system clipboard via Clipboard API and import SVG/images.
   * Returns true if external content was found, false if should fall back to internal paste.
   */
  const pasteFromSystemClipboard = useCallback(async (): Promise<boolean> => {
    if (!navigator.clipboard) return false;

    // 1. Try readText() first — auto-grants in user gesture context (no permission prompt).
    //    Handles SVG copied from Figma/Illustrator/Inkscape/browsers as text.
    try {
      const text = await navigator.clipboard.readText();
      // Layers copied in Quar Animator, maybe in another window or browser
      const layers = decodeClipboard(text);
      if (layers && sceneGraphRef.current) {
        useEditorStore.getState().pastePayload(sceneGraphRef.current, layers);
        return true;
      }
      if (text) {
        const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
        if (svgMatch) {
          importSvgString(svgMatch[0]);
          return true;
        }
      }
    } catch {
      // readText denied or unavailable
    }

    // 2. Try read() for text/html (Figma/Illustrator put SVG there) and images.
    //    May show a permission prompt on first use — race with a timeout
    //    so it doesn't hang indefinitely if user ignores the prompt.
    try {
      if (typeof navigator.clipboard.read === 'function') {
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 2000)
        );
        const itemsOrNull = await Promise.race([navigator.clipboard.read(), timeoutPromise]);
        if (itemsOrNull) {
          // Check text/html first (Figma, Illustrator, etc. put SVG in text/html)
          for (const item of itemsOrNull) {
            if (item.types.includes('text/html')) {
              try {
                const htmlBlob = await item.getType('text/html');
                const html = await htmlBlob.text();
                const layers = decodeClipboard(null, html);
                if (layers && sceneGraphRef.current) {
                  useEditorStore.getState().pastePayload(sceneGraphRef.current, layers);
                  return true;
                }
                const svgMatch = html.match(/<svg[\s\S]*?<\/svg>/i);
                if (svgMatch) {
                  importSvgString(svgMatch[0]);
                  return true;
                }
                // Detect Figma proprietary format
                if (html.includes('figmeta') || html.includes('data-buffer')) {
                  toast.info(
                    'Figma uses a proprietary format. In Figma, right-click → Copy/Paste as → Copy as SVG, then paste here.',
                    8000
                  );
                  return true; // Handled (with message), don't fall through to internal paste
                }
              } catch {
                // Failed to read text/html
              }
            }
          }
          // Then check for image content
          for (const item of itemsOrNull) {
            for (const type of item.types) {
              if (type.startsWith('image/')) {
                const imageBlob = await item.getType(type);
                importImageBlob(imageBlob);
                return true;
              }
            }
          }
        }
      }
    } catch {
      // clipboard.read denied or unavailable
    }

    return false;
  }, [importSvgString, importImageBlob, sceneGraphRef]);

  // Handle native paste event (backup for when Clipboard API is unavailable)
  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      // Skip if focus is in an input/textarea
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      e.preventDefault();

      const sg = sceneGraphRef.current;
      if (!sg) return;

      // Layers copied in Quar Animator (another window or browser, or this one)
      const layers = decodeClipboard(
        e.clipboardData?.getData('text/plain'),
        e.clipboardData?.getData('text/html')
      );
      if (layers) {
        useEditorStore.getState().pastePayload(sg, layers);
        return;
      }

      const items = e.clipboardData?.items;
      if (!items || items.length === 0) {
        pasteClipboard(sg);
        return;
      }

      // Scan clipboard items from the paste event
      let imageItem: DataTransferItem | null = null;
      let htmlItem: DataTransferItem | null = null;
      let plainTextItem: DataTransferItem | null = null;
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        if (item.type.startsWith('image/') && !imageItem) imageItem = item;
        if (item.type === 'text/html' && !htmlItem) htmlItem = item;
        if (item.type === 'text/plain' && !plainTextItem) plainTextItem = item;
      }

      const textItem = htmlItem || plainTextItem;

      if (textItem) {
        const capturedImageItem = imageItem;
        textItem.getAsString((text: string) => {
          const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
          if (svgMatch) {
            importSvgString(svgMatch[0]);
            return;
          }
          // Detect Figma/proprietary clipboard formats — show helpful message
          if (text.includes('figmeta') || text.includes('data-buffer')) {
            toast.info(
              'Figma uses a proprietary format. In Figma, right-click → Copy/Paste as → Copy as SVG, then paste here.',
              8000
            );
            return;
          }
          if (capturedImageItem) {
            const file = capturedImageItem.getAsFile();
            if (file) importImageBlob(file);
          } else {
            pasteClipboard(sg);
          }
        });
        return;
      }

      if (imageItem) {
        const file = imageItem.getAsFile();
        if (file) importImageBlob(file);
        return;
      }

      pasteClipboard(sg);
    },
    [pasteClipboard, importSvgString, importImageBlob, sceneGraphRef]
  );

  // Document-level paste handler with dual strategy:
  // 1. Ctrl+V keydown does NOT preventDefault — lets the native paste event fire,
  //    giving handlePaste access to all MIME types (text/html from Figma, images, etc.)
  // 2. Clipboard API fallback fires after 300ms if no paste event was received
  //    (e.g., when no focusable element captures the paste).
  useEffect(() => {
    const pasteHandledRef = { current: false };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'v') return;

      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Don't preventDefault — let the browser fire the native paste event,
      // which gives access to all MIME types (text/html from Figma, images, etc.)
      pasteHandledRef.current = false;

      // Fallback: if no paste event fires within 300ms, use Clipboard API
      setTimeout(() => {
        if (pasteHandledRef.current) return;
        const sg = sceneGraphRef.current;
        if (!sg) return;
        void pasteFromSystemClipboard()
          .then((handled) => {
            if (!handled) pasteClipboard(sg);
          })
          .catch(() => {
            pasteClipboard(sg);
          });
      }, 300);
    };

    const handleGlobalPaste = (e: ClipboardEvent) => {
      pasteHandledRef.current = true;
      handlePaste(e);
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    document.addEventListener('paste', handleGlobalPaste);
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
      document.removeEventListener('paste', handleGlobalPaste);
    };
  }, [handlePaste, pasteFromSystemClipboard, pasteClipboard, sceneGraphRef]);

  // --------------------------------------------------------------------------
  // Keyboard Handlers
  // --------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const camera = cameraRef.current;
      const canvas = canvasRef.current;
      if (!camera || !canvas) return;

      // Skip clipboard shortcuts if active element is an input
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // Space for pan mode
      if (e.code === 'Space' && !isSpaceHeldRef.current) {
        e.preventDefault();
        isSpaceHeldRef.current = true;
        if (!isPanningRef.current) {
          canvas.style.cursor = 'grab';
        }
        return;
      }

      // Escape exits symbol editing mode
      if (e.key === 'Escape' && useEditorStore.getState().editingSymbolId) {
        e.preventDefault();
        useEditorStore.getState().exitSymbolEdit(sceneGraph);
        return;
      }

      // Ctrl+0: Fit to window (frame all the artwork)
      if (e.code === 'Digit0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        fitViewToArtwork(camera, sceneGraph, useEditorStore.getState().symbols);
        return;
      }

      // Ctrl+1: Zoom to 100%
      if (e.code === 'Digit1' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        camera.zoomTo(1);
        return;
      }

      // Ctrl+Plus: Zoom in
      if ((e.code === 'Equal' || e.code === 'NumpadAdd') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        camera.zoomTo(camera.zoom * 1.25);
        return;
      }

      // Ctrl+Minus: Zoom out
      if ((e.code === 'Minus' || e.code === 'NumpadSubtract') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        camera.zoomTo(camera.zoom * 0.8);
        return;
      }

      // Z-order shortcuts (Ctrl+]/[, Ctrl+Shift+]/[)
      if (!isInput && (e.ctrlKey || e.metaKey) && (e.key === ']' || e.key === '[')) {
        e.preventDefault();
        if (e.shiftKey) {
          if (e.key === ']') bringToFront(sceneGraph);
          else sendToBack(sceneGraph);
        } else {
          if (e.key === ']') bringForward(sceneGraph);
          else sendBackward(sceneGraph);
        }
        return;
      }

      // Undo/redo are global (useUndoShortcuts), so they work wherever focus is
      // Cut and copy go through the browser's cut/copy events (useSystemClipboard),
      // which put the layers on the system clipboard too
      if (!isInput && (e.ctrlKey || e.metaKey) && (e.key === 'x' || e.key === 'c') && !e.shiftKey) {
        return;
      }

      // Clipboard shortcuts (skip if active element is an input)
      if (!isInput && (e.ctrlKey || e.metaKey)) {
        if (e.key === 'g' || e.key === 'G') {
          e.preventDefault();
          if (e.shiftKey) {
            ungroupSelection(sceneGraph);
          } else {
            groupSelection(sceneGraph);
          }
          return;
        }
        if (e.key === 'v') {
          // Handled by document-level keydown listener (Clipboard API + fallback)
          return;
        }
        if ((e.key === 'j' || e.key === 'J') && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          useEditorStore.getState().joinSelectedPaths(sceneGraph);
          return;
        }
        if (e.key === 'd' && !e.shiftKey) {
          e.preventDefault();
          duplicateSelection(sceneGraph);
          return;
        }
        if (e.key === 'a') {
          e.preventDefault();
          // Editing a path's points: all its points, not all layers
          const editingPath =
            isDirectSelectionActive &&
            [...useEditorStore.getState().selectedNodeIds].some(
              (id) => sceneGraph.getNode(id)?.type === 'path'
            );
          if (editingPath) toolKeyDown(e);
          else selectAll(sceneGraph);
          return;
        }
      }

      // Delete/Backspace: delete selection (skip if input), unless the tool has
      // something of its own to remove (a Pen point, Direct Selection points)
      if (!isInput && (e.key === 'Delete' || e.key === 'Backspace')) {
        const target = deleteKeyTarget({
          penDrawing: isPenToolDrawing,
          directSelectionActive: isDirectSelectionActive,
          directSelectionPointCount: directSelectionPoints.length,
        });
        if (target === 'tool') {
          toolKeyDown(e);
          return;
        }
        deleteSelection(sceneGraph);
        return;
      }

      // Pass to tool system
      toolKeyDown(e);
    },
    [
      toolKeyDown,
      sceneGraph,
      duplicateSelection,
      deleteSelection,
      selectAll,
      groupSelection,
      ungroupSelection,
      bringForward,
      sendBackward,
      bringToFront,
      sendToBack,
      isPenToolDrawing,
      isDirectSelectionActive,
      directSelectionPoints,
    ]
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpaceHeldRef.current = false;
        const canvas = canvasRef.current;
        if (canvas && !isPanningRef.current) {
          canvas.style.cursor = toolCursor;
        }
        return;
      }

      // Pass to tool system
      toolKeyUp(e);
    },
    [toolKeyUp, toolCursor]
  );

  // --------------------------------------------------------------------------
  // Context Menu
  // --------------------------------------------------------------------------

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const contextMenuItems = useMemo((): ContextMenuEntry[] => {
    // Direct Selection Tool with selected points — show point-specific menu
    if (isDirectSelectionActive && directSelectionPoints.length > 0) {
      const pointCount = directSelectionPoints.length;
      return [
        {
          id: 'cut-at-point',
          label: pointCount === 1 ? 'Cut Path Here' : `Cut Path at ${pointCount} Points`,
          onClick: () => useEditorStore.getState().cutPathsAtSelectedPoints(sceneGraph),
        },
        {
          id: 'join-path',
          label: 'Join',
          shortcut: 'Ctrl+J',
          onClick: () => useEditorStore.getState().joinSelectedPaths(sceneGraph),
        },
        { type: 'separator' },
        {
          id: 'delete-point',
          label: pointCount === 1 ? 'Delete Point' : `Delete ${pointCount} Points`,
          shortcut: 'Del',
          danger: true,
          onClick: () => deleteDirectSelectionPoints(),
        },
      ];
    }

    const hasSelection = selectedNodeIds.size > 0;

    if (hasSelection) {
      const hasGroup = Array.from(selectedNodeIds).some((id) => {
        const n = sceneGraph.getNode(id);
        return n && n.type === 'group';
      });

      const SHAPE_TYPES = new Set(['rectangle', 'ellipse', 'polygon', 'path']);
      const isBooleanInput = (n: Node) =>
        SHAPE_TYPES.has(n.type) || (n.type === 'group' && n.booleanOp !== undefined);
      const shapeCount = Array.from(selectedNodeIds).filter((id) => {
        const n = sceneGraph.getNode(id);
        return n && isBooleanInput(n);
      }).length;
      const canBoolean = shapeCount >= 2;

      // Check if any selected node is a boolean group
      const hasBooleanGroup = Array.from(selectedNodeIds).some((id) => {
        const n = sceneGraph.getNode(id);
        return n && n.type === 'group' && n.booleanOp !== undefined;
      });
      const pathNodes = Array.from(selectedNodeIds)
        .map((id) => sceneGraph.getNode(id))
        .filter((n) => n?.type === 'path' && !n.locked) as PathNode[];
      const pathsClosed = pathNodes.length > 0 && pathNodes.every((path) => path.closed);

      return [
        {
          id: 'copy',
          label: 'Copy',
          shortcut: 'Ctrl+C',
          onClick: () => copyLayers(sceneGraph, 'copy'),
        },
        {
          id: 'duplicate',
          label: 'Duplicate',
          shortcut: 'Ctrl+D',
          onClick: () => duplicateSelection(sceneGraph),
        },
        { type: 'separator' },
        {
          id: 'group',
          label: 'Group',
          shortcut: 'Ctrl+G',
          disabled: selectedNodeIds.size < 2,
          onClick: () => groupSelection(sceneGraph),
        },
        {
          id: 'ungroup',
          label: 'Ungroup',
          shortcut: 'Ctrl+Shift+G',
          disabled: !hasGroup,
          onClick: () => ungroupSelection(sceneGraph),
        },
        { type: 'separator' },
        {
          id: 'bring-to-front',
          label: 'Bring to Front',
          shortcut: 'Ctrl+Shift+]',
          onClick: () => bringToFront(sceneGraph),
        },
        {
          id: 'bring-forward',
          label: 'Bring Forward',
          shortcut: 'Ctrl+]',
          onClick: () => bringForward(sceneGraph),
        },
        {
          id: 'send-backward',
          label: 'Send Backward',
          shortcut: 'Ctrl+[',
          onClick: () => sendBackward(sceneGraph),
        },
        {
          id: 'send-to-back',
          label: 'Send to Back',
          shortcut: 'Ctrl+Shift+[',
          onClick: () => sendToBack(sceneGraph),
        },
        { type: 'separator' },
        {
          id: 'flip-horizontal',
          label: 'Flip Horizontal',
          shortcut: 'Shift+H',
          onClick: () => flipSelected(sceneGraph, 'horizontal'),
        },
        {
          id: 'flip-vertical',
          label: 'Flip Vertical',
          shortcut: 'Shift+V',
          onClick: () => flipSelected(sceneGraph, 'vertical'),
        },
        { type: 'separator' },
        {
          id: 'boolean-union',
          label: 'Union',
          shortcut: 'Ctrl+Shift+U',
          disabled: !canBoolean,
          onClick: () => booleanUnion(sceneGraph),
        },
        {
          id: 'boolean-subtract',
          label: 'Subtract',
          shortcut: 'Ctrl+Shift+D',
          disabled: !canBoolean,
          onClick: () => booleanSubtract(sceneGraph),
        },
        {
          id: 'boolean-intersect',
          label: 'Intersect',
          shortcut: 'Ctrl+Shift+I',
          disabled: !canBoolean,
          onClick: () => booleanIntersect(sceneGraph),
        },
        {
          id: 'boolean-exclude',
          label: 'Exclude',
          shortcut: 'Ctrl+Shift+X',
          disabled: !canBoolean,
          onClick: () => booleanExclude(sceneGraph),
        },
        ...(hasBooleanGroup
          ? [
              { type: 'separator' as const },
              {
                id: 'change-op-union',
                label: 'Change to Union',
                onClick: () => changeBooleanOp(sceneGraph, 'union' as const),
              },
              {
                id: 'change-op-subtract',
                label: 'Change to Subtract',
                onClick: () => changeBooleanOp(sceneGraph, 'subtract' as const),
              },
              {
                id: 'change-op-intersect',
                label: 'Change to Intersect',
                onClick: () => changeBooleanOp(sceneGraph, 'intersect' as const),
              },
              {
                id: 'change-op-exclude',
                label: 'Change to Exclude',
                onClick: () => changeBooleanOp(sceneGraph, 'exclude' as const),
              },
              { type: 'separator' as const },
              {
                id: 'release-boolean',
                label: 'Release Boolean',
                onClick: () => releaseBooleanGroup(sceneGraph),
              },
              {
                id: 'flatten-boolean',
                label: 'Flatten Boolean',
                onClick: () => flattenBooleanGroup(sceneGraph),
              },
            ]
          : []),
        ...(pathNodes.length > 0
          ? [
              { type: 'separator' as const },
              {
                id: 'reverse-path',
                label: 'Reverse Path',
                onClick: () => useEditorStore.getState().reverseSelectedPaths(sceneGraph),
              },
              {
                id: 'simplify-path',
                label: 'Simplify Path',
                onClick: () => useEditorStore.getState().simplifySelectedPaths(sceneGraph),
              },
              {
                id: 'close-path',
                label: pathsClosed ? 'Open Path' : 'Close Path',
                onClick: () =>
                  useEditorStore.getState().setSelectedPathsClosed(sceneGraph, !pathsClosed),
              },
              ...(pathNodes.some((path) => !path.closed)
                ? [
                    {
                      id: 'join-paths',
                      label: 'Join',
                      shortcut: 'Ctrl+J',
                      onClick: () => useEditorStore.getState().joinSelectedPaths(sceneGraph),
                    },
                  ]
                : []),
            ]
          : []),
        { type: 'separator' },
        {
          id: 'convert-to-path',
          label: 'Convert to Path',
          shortcut: 'Ctrl+Shift+P',
          disabled: !Array.from(selectedNodeIds).some((id) => {
            const type = sceneGraph.getNode(id)?.type;
            return (
              type === 'text' || type === 'rectangle' || type === 'ellipse' || type === 'polygon'
            );
          }),
          onClick: () => useEditorStore.getState().convertSelectionToPaths(sceneGraph),
        },
        {
          id: 'outline-stroke',
          label: 'Outline Stroke',
          shortcut: 'Ctrl+Shift+O',
          disabled: !Array.from(selectedNodeIds).some((id) => {
            const n = sceneGraph.getNode(id);
            if (!n) return false;
            const strokes = (n as { strokes?: { visible: boolean }[] }).strokes;
            return strokes && strokes.some((s) => s.visible);
          }),
          onClick: () => outlineStroke(sceneGraph),
        },
        ...((): ContextMenuEntry[] => {
          const hasShape = Array.from(selectedNodeIds).some((id) => {
            const n = sceneGraph.getNode(id);
            return (
              n &&
              (n.type === 'path' ||
                n.type === 'rectangle' ||
                n.type === 'ellipse' ||
                n.type === 'polygon')
            );
          });
          if (!hasShape) return [];
          return [
            {
              id: 'create-brush-profile',
              label: 'Create Profile from Selection',
              onClick: () => {
                void promptDialog({
                  title: 'New Brush Profile',
                  placeholder: 'Profile name',
                  confirmLabel: 'Create',
                }).then((profileName) => {
                  if (profileName) {
                    createBrushProfileFromSelection(sceneGraph, profileName);
                  }
                });
              },
            },
          ];
        })(),
        // Rigging context menu items
        ...((): ContextMenuEntry[] => {
          const selectedArr = Array.from(selectedNodeIds);
          if (selectedArr.length !== 1) return [];
          const selNode = sceneGraph.getNode(selectedArr[0]!);
          if (!selNode) return [];

          // IK chain items for bones
          if (selNode.type === 'bone') {
            const items: ContextMenuEntry[] = [];
            const existingChain = ikChains.find(
              (c) => c.rootBoneId === selNode.id || c.endEffectorBoneId === selNode.id
            );
            if (!existingChain) {
              items.push({
                id: 'create-ik-chain',
                label: 'Create IK Chain',
                onClick: () => createIKChain(sceneGraph, selNode.id),
              });
            } else {
              items.push({
                id: 'remove-ik-chain',
                label: 'Remove IK Chain',
                onClick: () => removeIKChain(sceneGraph, existingChain.id),
              });
            }
            return items.length > 0 ? [{ type: 'separator' }, ...items] : [];
          }

          // IK target items
          if (selNode.type === 'ik-target') {
            const chainId = selNode.ikChainId;
            return [
              { type: 'separator' },
              {
                id: 'remove-ik-chain',
                label: 'Remove IK Chain',
                onClick: () => removeIKChain(sceneGraph, chainId),
              },
            ];
          }

          const isBindableShape =
            selNode.type === 'rectangle' ||
            selNode.type === 'ellipse' ||
            selNode.type === 'polygon' ||
            selNode.type === 'path' ||
            selNode.type === 'image';
          const isGroup = selNode.type === 'group';

          if (!isBindableShape && !isGroup) return [];

          // For groups: check if has shape/image children that can be bound
          const getBindableChildren = (): import('@quar/types').Node[] => {
            if (!isGroup) return [];
            return sceneGraph
              .getChildren(selNode.id)
              .filter(
                (c) =>
                  c.type === 'rectangle' ||
                  c.type === 'ellipse' ||
                  c.type === 'polygon' ||
                  c.type === 'path' ||
                  c.type === 'image'
              );
          };

          // hasSkinData: direct node or any group child
          const hasSkinData = isBindableShape
            ? (selNode as any).skinData != null
            : getBindableChildren().some((c) => (c as any).skinData != null);

          // Find bone nodes in scene
          const boneIds: string[] = [];
          sceneGraph.traverse((n) => {
            if (n.type === 'bone') boneIds.push(n.id);
          });

          const items: ContextMenuEntry[] = [];

          if (!hasSkinData && boneIds.length > 0) {
            items.push({
              id: 'bind-to-bones',
              label: 'Bind to Bones',
              onClick: () =>
                bindLayersToBones(
                  sceneGraph,
                  [selNode.id],
                  (node) => shapeRendererRef.current?.getBindVertices(node),
                  bindMeshToBones
                ),
            });
          }

          if (hasSkinData) {
            items.push({
              id: 'unbind-mesh',
              label: 'Unbind Mesh',
              onClick: () => {
                if (isGroup) {
                  // Unbind all skinned children
                  for (const child of getBindableChildren()) {
                    if ((child as any).skinData) {
                      unbindMesh(sceneGraph, child.id);
                    }
                  }
                } else {
                  unbindMesh(sceneGraph, selNode.id);
                }
              },
            });
            items.push({
              id: 'weight-paint',
              label: 'Weight Paint',
              onClick: () => {
                useEditorStore.getState().setActiveTool('weight-paint');
              },
            });
          }

          return items.length > 0 ? [{ type: 'separator' }, ...items] : [];
        })(),
        { type: 'separator' },
        {
          id: 'toggle-visibility',
          label: 'Show/Hide',
          onClick: () => {
            for (const id of selectedNodeIds) {
              const node = sceneGraph.getNode(id);
              if (node) sceneGraph.updateNode(id, { visible: !node.visible });
            }
          },
        },
        {
          id: 'toggle-lock',
          label: 'Lock/Unlock',
          onClick: () => {
            for (const id of selectedNodeIds) {
              const node = sceneGraph.getNode(id);
              if (node) sceneGraph.updateNode(id, { locked: !node.locked });
            }
          },
        },
        { type: 'separator' },
        {
          id: 'delete',
          label: 'Delete',
          shortcut: 'Del',
          danger: true,
          onClick: () => deleteSelection(sceneGraph),
        },
      ];
    }

    return [
      {
        id: 'paste',
        label: 'Paste',
        shortcut: 'Ctrl+V',
        onClick: () => {
          void pasteFromSystemClipboard().then((handled) => {
            if (!handled) {
              pasteClipboard(sceneGraph);
            }
          });
        },
      },
      { type: 'separator' },
      {
        id: 'select-all',
        label: 'Select All',
        shortcut: 'Ctrl+A',
        onClick: () => selectAll(sceneGraph),
      },
    ];
  }, [
    selectedNodeIds,
    sceneGraph,
    duplicateSelection,
    pasteClipboard,
    pasteFromSystemClipboard,
    deleteSelection,
    selectAll,
    groupSelection,
    ungroupSelection,
    bringForward,
    sendBackward,
    bringToFront,
    sendToBack,
    booleanUnion,
    booleanSubtract,
    booleanIntersect,
    booleanExclude,
    flattenBooleanGroup,
    releaseBooleanGroup,
    changeBooleanOp,
    outlineStroke,
    createBrushProfileFromSelection,
    bindMeshToBones,
    unbindMesh,
    createIKChain,
    removeIKChain,
    ikChains,
    isDirectSelectionActive,
    directSelectionPoints,
    deleteDirectSelectionPoints,
  ]);

  // --------------------------------------------------------------------------
  // Global Drag Listener Helper
  // --------------------------------------------------------------------------

  /**
   * Sets up global pointermove/pointerup listeners for drag operations that
   * start on SVG overlay elements (selection handles, pen tool points/handles).
   * Returns a cleanup function; also stores it in activeDragCleanupRef so
   * unmount cleanup can remove stale listeners.
   */
  const setupGlobalDragListeners = useCallback(() => {
    const camera = cameraRef.current;
    const canvas = canvasRef.current;
    if (!camera || !canvas) return;

    const handleGlobalMove = (moveEvent: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const moveScreenPos: Vector2 = {
        x: moveEvent.clientX - rect.left,
        y: moveEvent.clientY - rect.top,
      };
      const moveWorldPos = camera.screenToWorld(moveScreenPos);
      toolPointerMove(moveScreenPos, moveWorldPos, moveEvent as unknown as React.PointerEvent);
    };

    const handleGlobalUp = (upEvent: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const upScreenPos: Vector2 = {
        x: upEvent.clientX - rect.left,
        y: upEvent.clientY - rect.top,
      };
      const upWorldPos = camera.screenToWorld(upScreenPos);
      toolPointerUp(upScreenPos, upWorldPos, upEvent as unknown as React.PointerEvent);

      cleanup();
    };

    const cleanup = () => {
      document.removeEventListener('pointermove', handleGlobalMove);
      document.removeEventListener('pointerup', handleGlobalUp);
      if (activeDragCleanupRef.current === cleanup) {
        activeDragCleanupRef.current = null;
      }
    };

    // Remove any previous drag listeners before adding new ones
    activeDragCleanupRef.current?.();
    activeDragCleanupRef.current = cleanup;

    document.addEventListener('pointermove', handleGlobalMove);
    document.addEventListener('pointerup', handleGlobalUp);
  }, [toolPointerMove, toolPointerUp]);

  // Expose to the canvas mouse-down handler (defined earlier) via a ref (F011).
  setupGlobalDragListenersRef.current = setupGlobalDragListeners;

  // --------------------------------------------------------------------------
  // Handle Overlay Interactions
  // --------------------------------------------------------------------------

  const handleOverlayPointerDown = useCallback(
    (_handle: { position: string; screenPosition: Vector2 }, e: React.PointerEvent) => {
      const camera = cameraRef.current;
      const canvas = canvasRef.current;
      if (!camera || !canvas) return;

      e.stopPropagation();
      e.preventDefault();

      // Use actual mouse position (not handle.screenPosition which is un-rotated).
      // The overlay applies visual rotation via SVG transform, so the mouse event
      // position reflects the rotated handle location. The tool's hit test expects
      // the actual click position so it can inverse-rotate correctly.
      const canvasRect = canvas.getBoundingClientRect();
      const screenPos: Vector2 = {
        x: e.clientX - canvasRect.left,
        y: e.clientY - canvasRect.top,
      };
      const worldPos = camera.screenToWorld(screenPos);

      // Pass to tool system
      toolPointerDown(screenPos, worldPos, e);

      // Set up global event handlers for drag operation
      setupGlobalDragListeners();
    },
    [toolPointerDown, setupGlobalDragListeners]
  );

  // --------------------------------------------------------------------------
  // PenTool Overlay Handlers
  // --------------------------------------------------------------------------

  const handlePenHandlePointerDown = useCallback(
    (pointIndex: number, handleType: 'in' | 'out', e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();

      // Start dragging the handle
      startPenHandleDrag(pointIndex, handleType);

      // Set up global event handlers for drag operation
      setupGlobalDragListeners();
    },
    [startPenHandleDrag, setupGlobalDragListeners]
  );

  const handlePenPointPointerDown = useCallback(
    (pointIndex: number, e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();

      // Start dragging the point - returns true if path was closed
      const pathClosed = startPenPointDrag(pointIndex);
      if (pathClosed) {
        // Path was closed, no need for drag handlers
        return;
      }

      // Set up global event handlers for drag operation
      setupGlobalDragListeners();
    },
    [startPenPointDrag, setupGlobalDragListeners]
  );

  // --------------------------------------------------------------------------
  // Drag-and-Drop Image Import
  // --------------------------------------------------------------------------

  const handleDragOver = useCallback((e: React.DragEvent) => {
    const isFileDrag = Array.from(e.dataTransfer.types).includes('Files');
    e.preventDefault();
    if (!isFileDrag) return;
    e.dataTransfer.dropEffect = 'copy';
    setIsFileDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const nextTarget = e.relatedTarget;
    if (!(nextTarget instanceof HTMLElement) || !e.currentTarget.contains(nextTarget)) {
      setIsFileDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;
      e.preventDefault();
      setIsFileDragOver(false);

      const projectFile = files.find((file) => /\.(quar|json)$/i.test(file.name));
      if (projectFile) {
        if (onProjectFileDrop) {
          void onProjectFileDrop(projectFile);
        } else {
          toast.error('Project file importing is unavailable here');
        }
        return;
      }

      const isSvgFile = (file: File) =>
        file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
      const imageFile = files.find((file) => file.type.startsWith('image/') || isSvgFile(file));
      if (!imageFile) {
        toast.info('Drop an image, SVG, or .quar project file onto the canvas');
        return;
      }

      const camera = cameraRef.current;
      const sg = sceneGraphRef.current;
      if (!camera || !sg) return;

      const MAX_SIZE = 10 * 1024 * 1024;
      if (imageFile.size > MAX_SIZE) {
        toast.error('Image too large (max 10MB)');
        return;
      }

      // Get world position at drop location
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const screenPos = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      const worldPos = camera.screenToWorld(screenPos);

      const isSvg = isSvgFile(imageFile);

      if (isSvg) {
        // SVG → import as vector paths
        const reader = new FileReader();
        reader.onload = () => {
          const svgString = reader.result as string;
          let idCounter = Date.now();
          const generateId = () => `node_${idCounter++}`;
          try {
            useEditorStore.getState().pushUndo(sg);
            const result = importSvg(svgString, sg, generateId, {
              centerAtOrigin: false,
              position: worldPos,
            });
            if (result.rootIds.length > 1) {
              const groupId = generateId();
              const group = createGroupNode(groupId, 'Imported SVG');
              sg.addNode(group);
              for (const rootId of result.rootIds) {
                sg.moveNode(rootId, groupId);
              }
              useEditorStore.setState({ selectedNodeIds: new Set([groupId]) });
            } else if (result.rootIds.length === 1) {
              useEditorStore.setState({ selectedNodeIds: new Set(result.rootIds) });
            }
          } catch {
            // silently fail on invalid SVG
          }
        };
        reader.readAsText(imageFile);
      } else {
        // Raster image (PNG, JPG, etc.) → import as ImageNode
        const reader = new FileReader();
        reader.onload = () => {
          const dataUri = reader.result as string;
          const img = new Image();
          img.onload = () => {
            const nodeId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            const imageNode = {
              id: nodeId,
              name: imageFile.name.replace(/\.[^.]+$/, ''),
              type: 'image' as const,
              parent: null,
              children: [],
              transform: {
                position: { x: worldPos.x, y: worldPos.y },
                rotation: 0,
                scale: { x: 1, y: 1 },
                anchor: { x: 0.5, y: 0.5 },
                skew: { x: 0, y: 0 },
              },
              visible: true,
              locked: false,
              opacity: 1,
              blendMode: 'normal' as const,
              src: dataUri,
              width: img.naturalWidth,
              height: img.naturalHeight,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
              cornerRadius: [0, 0, 0, 0] as [number, number, number, number],
            };

            useEditorStore.getState().pushUndo(sg);
            sg.addNode(imageNode);
            useEditorStore.setState({ selectedNodeIds: new Set([nodeId]) });
          };
          img.src = dataUri;
        };
        reader.readAsDataURL(imageFile);
      }
    },
    [onProjectFileDrop, sceneGraphRef]
  );

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div
      className={styles.canvasContainer}
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid="canvas-drop-zone"
    >
      {isFileDragOver && (
        <div className={styles.fileDropOverlay} role="status" aria-live="polite">
          Drop an image, SVG, or project file to import
        </div>
      )}
      {/* Symbol editing banner */}
      {(() => {
        const symId = useEditorStore.getState().editingSymbolId;
        if (!symId) return null;
        const symDef = useEditorStore
          .getState()
          .symbols.find((s: { id: string }) => s.id === symId);
        return (
          <div
            data-testid="symbol-editing-banner"
            style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
              background: 'var(--color-primary)',
              color: '#fff',
              padding: '4px 16px',
              borderRadius: '0 0 6px 6px',
              fontSize: '12px',
              fontWeight: 600,
              pointerEvents: 'auto',
              cursor: 'pointer',
            }}
            role="button"
            tabIndex={0}
            onClick={() => useEditorStore.getState().exitSymbolEdit(sceneGraph)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                useEditorStore.getState().exitSymbolEdit(sceneGraph);
              }
            }}
          >
            Editing Symbol: {symDef?.name ?? 'Unknown'} — Click or press Escape to exit
          </div>
        );
      })()}
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        tabIndex={editingTextNodeId ? -1 : 0}
        aria-label="Drawing canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onContextMenu={handleContextMenu}
        style={{ cursor: toolCursor }}
      />
      {!editingTextNodeId &&
        (!isDirectSelectionActive ||
          (directSelectionPathNodes.length === 0 && directSelectionImageNodes.length === 0)) && (
          <SelectionOverlay
            bounds={screenBounds}
            // Path tools edit points: no resize/rotate handles in their way
            handles={isDirectSelectionActive || activeTool === 'pen' ? [] : transformHandles}
            rotation={selectionRotation}
            onHandlePointerDown={
              isDirectSelectionActive || activeTool === 'pen' ? undefined : handleOverlayPointerDown
            }
          />
        )}
      {screenMarqueeRect && screenMarqueeRect.width > 0 && screenMarqueeRect.height > 0 && (
        <svg className={styles.marqueeOverlay}>
          <rect
            x={screenMarqueeRect.x}
            y={screenMarqueeRect.y}
            width={screenMarqueeRect.width}
            height={screenMarqueeRect.height}
            fill="rgba(59, 130, 246, 0.1)"
            stroke="#3b82f6"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        </svg>
      )}
      <SmartGuidesOverlay
        guides={smartGuides}
        camera={cameraRef.current}
        viewportWidth={viewportSize.width}
        viewportHeight={viewportSize.height}
      />
      {editingGradient &&
        (() => {
          const editingNode = sceneGraph.getNode(editingGradient.nodeId);
          return editingNode ? (
            <GradientHandleOverlay
              node={editingNode}
              fillIndex={editingGradient.fillIndex}
              source={editingGradient.source}
              camera={cameraRef.current}
              sceneGraph={sceneGraph}
            />
          ) : null;
        })()}
      {isDirectSelectionActive && (
        <DirectSelectionOverlay
          pathNodes={directSelectionPathNodes}
          imageNodes={directSelectionImageNodes}
          selectedPoints={directSelectionPoints}
          camera={cameraRef.current}
          sceneGraph={sceneGraph}
        />
      )}
      {artboardNodes.length > 0 && (
        <ArtboardOverlay
          artboardNodes={artboardNodes}
          selectedNodeIds={selectedNodeIds}
          camera={cameraRef.current}
          sceneGraph={sceneGraph}
          cameraVersion={cameraVersion}
        />
      )}
      {showSequenceBadges && (
        <SequenceBadgesOverlay
          steps={sequenceSteps}
          camera={cameraRef.current}
          getNodeBounds={(nodeId) =>
            selectionManagerRef.current.getSelectionBoundsForDisplay(new Set([nodeId]), sceneGraph)
              ?.bounds.rect ?? null
          }
          onBadgeClick={(stepId) => useEditorStore.getState().revealSequenceStep(stepId)}
        />
      )}
      {(activeTool === 'bone' ||
        boneNodes.some((b) => selectedNodeIds.has(b.id)) ||
        ikTargetNodes.length > 0) &&
        (boneNodes.length > 0 || ikTargetNodes.length > 0) && (
          <BoneOverlay
            boneNodes={boneNodes}
            ikTargetNodes={ikTargetNodes}
            ikChains={ikChains}
            selectedNodeIds={selectedNodeIds}
            camera={cameraRef.current}
            cameraVersion={cameraVersion}
            sceneGraph={sceneGraph}
            hiddenBoneIds={hiddenBoneIds}
            dynamicChainBoneIds={dynamicChainBoneIds}
          />
        )}
      {activeTool === 'weight-paint' && cameraRef.current && (
        <WeightPaintOverlay
          camera={cameraRef.current}
          canvasWidth={viewportSize.width}
          canvasHeight={viewportSize.height}
        />
      )}
      {activeTool === 'point-magnet' && cameraRef.current && (
        <PointMagnetOverlay
          camera={cameraRef.current}
          canvasWidth={viewportSize.width}
          canvasHeight={viewportSize.height}
          toolManager={_toolManagerRef.current}
        />
      )}
      {isPenToolDrawing && (
        <PenToolOverlay
          points={penToolPath}
          rubberBand={penRubberBand}
          camera={cameraRef.current}
          onPointerMove={handleMouseMove}
          onHandlePointerDown={handlePenHandlePointerDown}
          onPointPointerDown={handlePenPointPointerDown}
        />
      )}
      {showGuides && (
        <GuideOverlay
          guides={guides}
          camera={cameraRef.current}
          viewportWidth={viewportSize.width}
          viewportHeight={viewportSize.height}
          cameraVersion={cameraVersion}
          dragPreview={guideDragPreview}
          canvasRef={canvasRef}
          onRemoveGuide={removeGuide}
          onUpdateGuidePosition={updateGuidePosition}
        />
      )}
      {showRulers && (
        <CanvasRuler
          camera={cameraRef.current}
          viewportWidth={viewportSize.width}
          viewportHeight={viewportSize.height}
          cameraVersion={cameraVersion}
          canvasRef={canvasRef}
          onGuideDrag={(axis, worldPosition) => setGuideDragPreview({ axis, worldPosition })}
          onGuideDragEnd={(axis, worldPosition) => {
            setGuideDragPreview(null);
            if (!isNaN(worldPosition)) {
              addGuide(axis, worldPosition);
            }
          }}
        />
      )}
      {editingTextNodeId &&
        cameraRef.current &&
        (() => {
          const textNode = sceneGraph.getNode(editingTextNodeId);
          if (!textNode || textNode.type !== 'text') return null;
          return (
            <TextEditOverlay
              node={textNode}
              camera={cameraRef.current}
              worldTransform={sceneGraph.getWorldTransform(editingTextNodeId)}
              onCommit={(content: string) => {
                if (content === textNode.content && content.trim() !== '') {
                  // Nothing typed: no edit, no undo step
                } else if (content.trim() === '') {
                  // Empty text — remove the node instead of keeping an invisible node
                  useEditorStore.getState().pushUndo(sceneGraph);
                  sceneGraph.removeNode(editingTextNodeId);
                  useEditorStore.getState().setSelection([]);
                } else {
                  useEditorStore.getState().pushUndo(sceneGraph);
                  // The box grows from where it is, as in Figma, rather than about its center
                  const edited = { ...textNode, content };
                  sceneGraph.updateNode(editingTextNodeId, {
                    content,
                    transform: {
                      ...textNode.transform,
                      position: keepTextInPlace(textNode, edited),
                    },
                  });
                }
                setEditingTextNodeId(null);
                useEditorStore.getState().setActiveTool('selection');
              }}
            />
          );
        })()}
      <div className={styles.statusBar}>
        <span className={styles.coordinates}>
          X: {mouseWorldPos.x.toFixed(1)} Y: {mouseWorldPos.y.toFixed(1)}
        </span>
        <span className={styles.zoom}>{zoomPercent}%</span>
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

export default Canvas;
