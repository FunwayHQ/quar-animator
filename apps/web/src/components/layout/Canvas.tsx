import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  Camera,
  WebGLRenderer,
  Grid,
  ShapeRenderer,
  OnionSkinRenderer,
  SelectionManager,
  TransformHandles,
} from '@quar/core';
import type { Node, ImageNode, TextNode, GroupNode, Vector2 } from '@quar/types';
import { evaluateNodeAtFrame, applyAnimatedValues, getAnimatedNodes } from '@quar/animation';
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
import { ContextMenu } from '../common/ContextMenu';
import type { ContextMenuEntry } from '../common/ContextMenu';
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
  const editingTextNodeId = useEditorStore((state) => state.editingTextNodeId);
  const setEditingTextNodeId = useEditorStore((state) => state.setEditingTextNodeId);

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
    marqueeRect,
  } = useCanvasTools({ camera: cameraReady ? cameraRef.current : null, sceneGraph });

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
  const selectionDisplay = useMemo(() => {
    if (!sceneGraphRef.current || selectedNodeIds.size === 0) return null;
    return selectionManagerRef.current.getSelectionBoundsForDisplay(
      selectedNodeIds,
      sceneGraphRef.current
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sceneGraphVersion triggers recalculation when nodes change
  }, [selectedNodeIds, sceneGraphRef, sceneGraphVersion]);

  const selectionBounds = selectionDisplay?.bounds ?? null;
  const selectionRotation = selectionDisplay?.rotation ?? 0;

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

        // Render shapes from scene graph
        if (sceneGraphRef.current && shapeRenderer) {
          shapeRenderer.render(
            sceneGraphRef.current,
            viewProjectionMatrix,
            selectedNodeIdsRef.current,
            useEditorStore.getState().editingTextNodeId
          );
        }

        // Render preview node (if drawing)
        if (previewNodeRef.current && shapeRenderer) {
          shapeRenderer.renderNode(previewNodeRef.current, viewProjectionMatrix);
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
          pasteClipboard(sceneGraph);
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
      if (!isInput && (e.key === 'Delete' || e.key === 'Backspace')) {
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
        disabled: !clipboard || clipboard.length === 0,
        onClick: () => pasteClipboard(sceneGraph),
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
    if (!camera || !sceneGraphRef.current) return;

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

        useEditorStore.getState().pushUndo(sceneGraphRef.current);
        sceneGraphRef.current!.addNode(imageNode);
        useEditorStore.setState({ selectedNodeIds: new Set([nodeId]) });
      };
      img.src = dataUri;
    };
    reader.readAsDataURL(imageFile);
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
      {!isDirectSelectionActive && (
        <SelectionOverlay
          bounds={screenBounds}
          handles={transformHandles}
          rotation={selectionRotation}
          onHandlePointerDown={handleOverlayPointerDown}
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
          selectedPoints={directSelectionPoints}
          camera={cameraRef.current}
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
      {showRulers && (
        <CanvasRuler
          camera={cameraRef.current}
          viewportWidth={viewportSize.width}
          viewportHeight={viewportSize.height}
          cameraVersion={cameraVersion}
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
