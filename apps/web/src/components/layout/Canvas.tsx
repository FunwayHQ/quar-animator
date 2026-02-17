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
} from '@quar/core';
import type { Node, ImageNode, TextNode, GroupNode, Vector2 } from '@quar/types';
import { evaluateNodeAtFrame, applyAnimatedValues, getAnimatedNodes } from '@quar/animation';
import {
  evaluateIKChains,
  evaluateSmartBones,
  morphOffsetsToDense,
  evaluateVitruvianControllers,
  evaluateDynamicChains,
  resetDynamicChainStates,
} from '@quar/rigging';
import type { DynamicChainState } from '@quar/types';
import type { PointMagnetTool } from '@quar/core';
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
import { ArtboardOverlay } from '../canvas/ArtboardOverlay';
import { GuideOverlay } from '../canvas/GuideOverlay';
import { WeightPaintOverlay } from '../canvas/WeightPaintOverlay';
import { PointMagnetOverlay } from '../canvas/PointMagnetOverlay';
import { ContextMenu } from '../common/ContextMenu';
import type { ContextMenuEntry } from '../common/ContextMenu';
import { promptDialog } from '../common/PromptDialog';
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

export function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Renderer refs (not state to avoid re-renders)
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const gridRef = useRef<Grid | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const shapeRendererRef = useRef<ShapeRenderer | null>(null);
  const onionSkinRendererRef = useRef<OnionSkinRenderer | null>(null);
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

  // Dynamic chain physics state (transient, not persisted)
  const dynamicChainStatesRef = useRef<Map<string, DynamicChainState>>(new Map());
  const lastFrameTimeRef = useRef<number>(0);

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
  const clipboard = useEditorStore((state) => state.clipboard);
  const copySelection = useEditorStore((state) => state.copySelection);
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
  const convertTextToPath = useEditorStore((state) => state.convertTextToPath);
  const outlineStroke = useEditorStore((state) => state.outlineStroke);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const cutSelection = useEditorStore((state) => state.cutSelection);
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
    isPenToolDrawing,
    startPenHandleDrag,
    startPenPointDrag,
    isDirectSelectionActive,
    directSelectionPoints,
    directSelectionPathNodes,
    directSelectionImageNodes,
    deleteDirectSelectionPoints,
    marqueeRect,
  } = useCanvasTools({
    camera: cameraReady ? cameraRef.current : null,
    sceneGraph,
    getTessellatedVertices: (nodeId: string) =>
      shapeRendererRef.current?.getTessellatedVertices(nodeId) ?? null,
  });

  // Subscribe to scene graph changes to update selection bounds
  useEffect(() => {
    if (!sceneGraphRef.current) return;
    const sceneGraph = sceneGraphRef.current;

    const incrementVersion = () => setSceneGraphVersion((v) => v + 1);

    // Dispose texture when an image node is removed
    const handleNodeRemoved = (node: Node) => {
      incrementVersion();
      if (node.type === 'image' && shapeRendererRef.current) {
        shapeRendererRef.current.disposeTexture(node.src);
      }
    };

    // Subscribe to all scene graph events that affect selection bounds
    const unsubscribeChanged = sceneGraph.on('nodeChanged', incrementVersion);
    const unsubscribeAdded = sceneGraph.on('nodeAdded', incrementVersion);
    const unsubscribeRemoved = sceneGraph.on('nodeRemoved', handleNodeRemoved);

    return () => {
      unsubscribeChanged();
      unsubscribeAdded();
      unsubscribeRemoved();
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

  // Global keyboard shortcuts for group/ungroup (works regardless of focus)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key !== 'g' && e.key !== 'G') return;

      // Skip when input is focused
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      e.preventDefault();
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
          convertTextToPath(sceneGraph);
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
  }, [
    sceneGraph,
    booleanUnion,
    booleanSubtract,
    booleanIntersect,
    booleanExclude,
    convertTextToPath,
    outlineStroke,
  ]);

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
    if (!sceneGraphRef.current) return [];
    const bones: import('@quar/types').BoneNode[] = [];
    const collectBones = (nodes: Node[]) => {
      for (const node of nodes) {
        if (node.type === 'bone') {
          bones.push(node);
        }
        if (node.children.length > 0) {
          const children = node.children
            .map((id) => sceneGraphRef.current!.getNode(id))
            .filter(Boolean) as Node[];
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
        targets.push(node as import('@quar/types').IKTargetNode);
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
        artboards.push(node as import('@quar/types').ArtboardNode);
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
    return transformHandlesRef.current.getHandles(selectionBounds, cameraRef.current);
    // cameraVersion triggers recalculation when camera changes (pan + zoom)
  }, [selectionBounds, cameraVersion]);

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
    // cameraVersion triggers recalculation when camera changes (pan + zoom)
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

      // Initialize grid
      const grid = new Grid(renderer, {
        majorSpacing: 100,
        minorDivisions: 5,
      });
      gridRef.current = grid;

      // Initialize shape renderer
      const shapeRenderer = new ShapeRenderer(renderer);
      shapeRendererRef.current = shapeRenderer;

      // Initialize onion skin renderer
      const onionSkinRenderer = new OnionSkinRenderer(shapeRenderer);
      onionSkinRendererRef.current = onionSkinRenderer;

      // Listen to camera changes
      const unsubscribe = camera.on('change', () => {
        setZoomPercent(Math.round(camera.zoom * 100));
        setCameraVersion((v) => v + 1);
      });

      // Set up resize observer
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const width = Math.round(entry.contentRect.width);
          const height = Math.round(entry.contentRect.height);
          if (width > 0 && height > 0) {
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

        renderer.clear();

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
            const getNodesAtFrame = (f: number) => {
              // Evaluate all animated nodes (including children in groups), then
              // return all root-level nodes with animated values applied
              const animatedIds = getAnimatedNodes(tl);
              const overrides = new Map<string, Node>();
              for (const nodeId of animatedIds) {
                const node = sg.getNode(nodeId);
                if (!node) continue;
                const values = evaluateNodeAtFrame(tl, nodeId, f);
                if (values.size > 0) {
                  overrides.set(nodeId, applyAnimatedValues(node, values));
                }
              }
              return sg.getRootNodes().map((node: Node) => overrides.get(node.id) ?? node);
            };
            onionSkinRenderer.render(
              onionSkin,
              frame,
              getNodesAtFrame,
              viewProjectionMatrix,
              tlDuration
            );
          }
        }

        // Evaluate IK chains for interactive posing (when NOT playing)
        if (sceneGraphRef.current) {
          const { ikChains, isPlaying: ikPlaying } = useEditorStore.getState();
          if (ikChains.length > 0 && !ikPlaying) {
            evaluateIKChains(ikChains, sceneGraphRef.current);
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
          if (dynamicChains.length > 0 && dcPlaying) {
            const now = performance.now() / 1000;
            const dt =
              lastFrameTimeRef.current > 0
                ? Math.min(now - lastFrameTimeRef.current, 0.05)
                : 1 / dcFrameRate;
            lastFrameTimeRef.current = now;
            evaluateDynamicChains(
              dynamicChains,
              dynamicChainStatesRef.current,
              sceneGraphRef.current as any,
              dt,
              globalWind,
              dcFrame / dcFrameRate
            );
          } else if (!dcPlaying) {
            // Reset chain states when not playing so they re-init on next play
            if (dynamicChainStatesRef.current.size > 0) {
              resetDynamicChainStates(dynamicChainStatesRef.current);
              lastFrameTimeRef.current = 0;
            }
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
              smartBoneActions,
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
                      existing[i] += dense[i];
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
          // Get bound node from WeightPaintTool, fallback to selection
          const wpTool = _toolManagerRef.current?.getActiveTool();
          const boundNodeId =
            wpTool?.type === 'weight-paint' ? (wpTool as any).getBoundNodeId?.() : null;
          const nodeIds = boundNodeId ? [boundNodeId] : [...edState.selectedNodeIds];
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
    const handleFitToWindow = () => camera.reset();

    window.addEventListener('menubar:zoom-in', handleZoomIn);
    window.addEventListener('menubar:zoom-out', handleZoomOut);
    window.addEventListener('menubar:zoom-100', handleZoom100);
    window.addEventListener('menubar:fit-to-window', handleFitToWindow);

    // Rigging commands from MenuBar
    const handleBindToBones = () => {
      const state = useEditorStore.getState();
      const selectedArr = Array.from(state.selectedNodeIds);
      const boneIds: string[] = [];
      sceneGraphRef.current?.traverse((n) => {
        if (n.type === 'bone') boneIds.push(n.id);
      });
      if (boneIds.length === 0) return;

      for (const nodeId of selectedArr) {
        const node = sceneGraphRef.current?.getNode(nodeId);
        if (!node) continue;
        const isShape = ['rectangle', 'ellipse', 'polygon', 'path', 'image'].includes(node.type);
        const isGroup = node.type === 'group';

        if (isShape) {
          const tessVerts = shapeRendererRef.current?.getTessellatedVertices(nodeId) ?? undefined;
          bindMeshToBones(sceneGraphRef.current, nodeId, boneIds, tessVerts);
        } else if (isGroup) {
          const children = sceneGraphRef
            .current!.getChildren(nodeId)
            .filter(
              (c: Node) =>
                c.type === 'rectangle' ||
                c.type === 'ellipse' ||
                c.type === 'polygon' ||
                c.type === 'path' ||
                c.type === 'image'
            );
          for (const child of children) {
            const tessVerts =
              shapeRendererRef.current?.getTessellatedVertices(child.id) ?? undefined;
            bindMeshToBones(sceneGraphRef.current, child.id, boneIds, tessVerts);
          }
        }
      }
    };

    const handleUnbindMesh = () => {
      const state = useEditorStore.getState();
      const selectedArr = Array.from(state.selectedNodeIds);
      for (const nodeId of selectedArr) {
        const node = sceneGraphRef.current?.getNode(nodeId);
        if (!node) continue;
        if ((node as any).skinData) {
          unbindMesh(sceneGraphRef.current, nodeId);
        } else if (node.type === 'group') {
          const children = sceneGraphRef.current!.getChildren(nodeId);
          for (const child of children) {
            if ((child as any).skinData) {
              unbindMesh(sceneGraphRef.current, child.id);
            }
          }
        }
      }
    };

    const handleCreateIKChain = () => {
      const state = useEditorStore.getState();
      const selectedArr = Array.from(state.selectedNodeIds);
      for (const nodeId of selectedArr) {
        const node = sceneGraphRef.current?.getNode(nodeId);
        if (node && node.type === 'bone') {
          createIKChain(sceneGraphRef.current, nodeId);
          break;
        }
      }
    };

    const handleRemoveIKChain = () => {
      const state = useEditorStore.getState();
      const selectedArr = Array.from(state.selectedNodeIds);
      for (const nodeId of selectedArr) {
        const node = sceneGraphRef.current?.getNode(nodeId);
        if (!node) continue;
        // If an IK target is selected, remove its chain
        if (node.type === 'ik-target') {
          removeIKChain(sceneGraphRef.current, (node as any).ikChainId);
          break;
        }
        // If a bone is selected, find its chain
        if (node.type === 'bone') {
          const chain = state.ikChains.find(
            (c) => c.rootBoneId === nodeId || c.endEffectorBoneId === nodeId
          );
          if (chain) {
            removeIKChain(sceneGraphRef.current, chain.id);
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
  }, [cameraReady, bindMeshToBones, unbindMesh, createIKChain, removeIKChain]); // Re-attach when camera becomes ready

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

      // Pass to tool system
      toolPointerMove(positions.screenPos, positions.worldPos, e as unknown as React.PointerEvent);

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
        if (result.rootIds.length > 0) {
          useEditorStore.setState({ selectedNodeIds: new Set(result.rootIds) });
        }
      } catch {
        // Invalid SVG — ignore
      }
    },
    [getCanvasCenter]
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
    [getCanvasCenter]
  );

  /**
   * Read system clipboard via Clipboard API and import SVG/images.
   * Returns true if external content was found, false if should fall back to internal paste.
   */
  const pasteFromSystemClipboard = useCallback(async (): Promise<boolean> => {
    try {
      // Try the modern Clipboard API (navigator.clipboard.read)
      if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
          // Check for SVG in text/html (Figma, Illustrator)
          if (item.types.includes('text/html')) {
            const htmlBlob = await item.getType('text/html');
            const html = await htmlBlob.text();
            const svgMatch = html.match(/<svg[\s\S]*?<\/svg>/i);
            if (svgMatch) {
              importSvgString(svgMatch[0]);
              return true;
            }
          }

          // Check for SVG in text/plain
          if (item.types.includes('text/plain')) {
            const textBlob = await item.getType('text/plain');
            const text = await textBlob.text();
            const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
            if (svgMatch) {
              importSvgString(svgMatch[0]);
              return true;
            }
          }

          // Check for image content
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const imageBlob = await item.getType(type);
              importImageBlob(imageBlob);
              return true;
            }
          }
        }
      }
    } catch {
      // Clipboard API not available or permission denied — fall through
    }

    // Try fallback: navigator.clipboard.readText for SVG text
    try {
      if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        const text = await navigator.clipboard.readText();
        if (text) {
          const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
          if (svgMatch) {
            importSvgString(svgMatch[0]);
            return true;
          }
        }
      }
    } catch {
      // readText not available or denied
    }

    return false;
  }, [importSvgString, importImageBlob]);

  // Handle native paste event (backup for when Clipboard API is unavailable)
  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      // Skip if focus is in an input/textarea
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      e.preventDefault();

      const sg = sceneGraphRef.current;
      if (!sg) return;

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
        const item = items[i];
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
    [pasteClipboard, importSvgString, importImageBlob]
  );

  // Document-level Ctrl+V handler — uses Clipboard API for reliable cross-focus paste,
  // with native paste event as fallback
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'v') return;

      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Prevent default to avoid double-paste from native paste event
      e.preventDefault();

      const sg = sceneGraphRef.current;
      if (!sg) return;

      // Use Clipboard API (works during user gesture context)
      void pasteFromSystemClipboard().then((handled) => {
        if (!handled) {
          pasteClipboard(sg);
        }
      });
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
      document.removeEventListener('paste', handlePaste);
    };
  }, [handlePaste, pasteFromSystemClipboard, pasteClipboard]);

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

      // Ctrl+0: Fit to window (reset zoom and position)
      if (e.code === 'Digit0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        camera.reset();
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

      // Undo/Redo shortcuts
      if (!isInput && (e.ctrlKey || e.metaKey)) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo(sceneGraph);
          return;
        }
        if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
          e.preventDefault();
          redo(sceneGraph);
          return;
        }
        if (e.key === 'x' && !e.shiftKey) {
          e.preventDefault();
          cutSelection(sceneGraph);
          return;
        }
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
        if (e.key === 'c') {
          copySelection(sceneGraph);
          return;
        }
        if (e.key === 'v') {
          // Handled by document-level keydown listener (Clipboard API + fallback)
          return;
        }
        if (e.key === 'd' && !e.shiftKey) {
          e.preventDefault();
          duplicateSelection(sceneGraph);
          return;
        }
        if (e.key === 'a') {
          e.preventDefault();
          selectAll(sceneGraph);
          return;
        }
      }

      // Delete/Backspace: delete selection (skip if input)
      // When Direct Selection Tool has selected points, let the tool handle deletion
      if (!isInput && (e.key === 'Delete' || e.key === 'Backspace')) {
        if (isDirectSelectionActive && directSelectionPoints.length > 0) {
          // Let tool system handle point deletion
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
      copySelection,
      pasteClipboard,
      pasteFromSystemClipboard,
      duplicateSelection,
      deleteSelection,
      selectAll,
      groupSelection,
      ungroupSelection,
      bringForward,
      sendBackward,
      bringToFront,
      sendToBack,
      undo,
      redo,
      cutSelection,
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
        return n && n.type === 'group' && (n as GroupNode).booleanOp !== undefined;
      });

      return [
        { id: 'copy', label: 'Copy', shortcut: 'Ctrl+C', onClick: () => copySelection(sceneGraph) },
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
                label: 'Release Boolean Group',
                onClick: () => releaseBooleanGroup(sceneGraph),
              },
              {
                id: 'flatten-boolean',
                label: 'Flatten to Path',
                onClick: () => flattenBooleanGroup(sceneGraph),
              },
            ]
          : []),
        { type: 'separator' },
        {
          id: 'convert-to-path',
          label: 'Convert to Path',
          shortcut: 'Ctrl+Shift+P',
          disabled: !Array.from(selectedNodeIds).some((id) => {
            const n = sceneGraph.getNode(id);
            return n && n.type === 'text';
          }),
          onClick: () => convertTextToPath(sceneGraph),
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
              onClick: () => {
                if (isGroup) {
                  // Bind each shape/image child individually
                  const children = getBindableChildren();
                  for (const child of children) {
                    const tessVerts =
                      shapeRendererRef.current?.getTessellatedVertices(child.id) ?? undefined;
                    bindMeshToBones(sceneGraph, child.id, boneIds, tessVerts);
                  }
                } else {
                  const tessVerts =
                    shapeRendererRef.current?.getTessellatedVertices(selNode.id) ?? undefined;
                  bindMeshToBones(sceneGraph, selNode.id, boneIds, tessVerts);
                }
              },
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
    clipboard,
    sceneGraph,
    copySelection,
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
    convertTextToPath,
    outlineStroke,
    createBrushProfileFromSelection,
    bindMeshToBones,
    unbindMesh,
    createIKChain,
    removeIKChain,
    ikChains,
    ikTargetNodes,
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
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const camera = cameraRef.current;
    const sg = sceneGraphRef.current;
    if (!camera || !sg) return;

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find((f) => f.type.startsWith('image/'));
    if (!imageFile) return;

    const MAX_SIZE = 10 * 1024 * 1024;
    if (imageFile.size > MAX_SIZE) return;

    // Get world position at drop location
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenPos = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    const worldPos = camera.screenToWorld(screenPos);

    const isSvg = imageFile.type === 'image/svg+xml' || imageFile.name.endsWith('.svg');

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
          if (result.rootIds.length > 0) {
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
  }, []);

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div
      className={styles.canvasContainer}
      ref={containerRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Symbol editing banner */}
      {useEditorStore.getState().editingSymbolId &&
        (() => {
          const symId = useEditorStore.getState().editingSymbolId!;
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
              onClick={() => useEditorStore.getState().exitSymbolEdit(sceneGraph)}
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
            handles={isDirectSelectionActive ? [] : transformHandles}
            rotation={selectionRotation}
            onHandlePointerDown={isDirectSelectionActive ? undefined : handleOverlayPointerDown}
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
          camera={cameraRef.current}
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
              node={textNode as TextNode}
              camera={cameraRef.current}
              onCommit={(content: string) => {
                if (content.trim() === '') {
                  // Empty text — remove the node instead of keeping an invisible node
                  useEditorStore.getState().pushUndo(sceneGraph);
                  sceneGraph.removeNode(editingTextNodeId);
                  useEditorStore.getState().setSelection([]);
                } else {
                  useEditorStore.getState().pushUndo(sceneGraph);
                  sceneGraph.updateNode(editingTextNodeId, { content });
                }
                setEditingTextNodeId(null);
                useEditorStore.getState().setActiveTool('selection');
              }}
              onCancel={() => {
                // If the node has no content (new node that was never edited), remove it
                const n = sceneGraph.getNode(editingTextNodeId);
                if (n && n.type === 'text' && !(n as TextNode).content) {
                  useEditorStore.getState().pushUndo(sceneGraph);
                  sceneGraph.removeNode(editingTextNodeId);
                  useEditorStore.getState().setSelection([]);
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
