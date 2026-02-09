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
import type { Vector2 } from '@quar/types';
import { evaluateNodeAtFrame, applyAnimatedValues } from '@quar/animation';
import { useCanvasTools } from '../../hooks/useCanvasTools';
import { useToolShortcuts } from '../../hooks/useToolShortcuts';
import { useEditorStore } from '../../stores/editorStore';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { SelectionOverlay } from '../canvas/SelectionOverlay';
import { PenToolOverlay } from '../canvas/PenToolOverlay';
import { DirectSelectionOverlay } from '../canvas/DirectSelectionOverlay';
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

    // Subscribe to all scene graph events that affect selection bounds
    const unsubscribeChanged = sceneGraph.on('nodeChanged', incrementVersion);
    const unsubscribeAdded = sceneGraph.on('nodeAdded', incrementVersion);
    const unsubscribeRemoved = sceneGraph.on('nodeRemoved', incrementVersion);

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
    // zoomPercent triggers recalculation when camera zoom changes
  }, [selectionBounds, zoomPercent]);

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
    // zoomPercent triggers recalculation when camera zoom changes
  }, [selectionBounds, zoomPercent]);

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
  }, [marqueeRect, zoomPercent]);

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
      });

      // Set up resize observer
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            renderer.setViewport(width, height);
            camera.setViewport(width, height);
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
          } = useEditorStore.getState();
          if (onionSkin.enabled && (!playing || onionSkin.showDuringPlayback)) {
            const sg = sceneGraphRef.current;
            const getNodesAtFrame = (f: number) => {
              return sg.getRootNodes().map((node) => {
                const values = evaluateNodeAtFrame(tl, node.id, f);
                if (values.size > 0) {
                  return applyAnimatedValues(node, values);
                }
                return node;
              });
            };
            onionSkinRenderer.render(onionSkin, frame, getNodesAtFrame, viewProjectionMatrix);
          }
        }

        // Render shapes from scene graph
        if (sceneGraphRef.current && shapeRenderer) {
          shapeRenderer.render(
            sceneGraphRef.current,
            viewProjectionMatrix,
            selectedNodeIdsRef.current
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

      // Pass to tool system
      if (e.button === 0) {
        const positions = getCanvasPositions(e);
        if (positions) {
          toolPointerDown(
            positions.screenPos,
            positions.worldPos,
            e as unknown as React.PointerEvent
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

  const handleWheel = useCallback((e: React.WheelEvent) => {
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
        if (e.key === 'd') {
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
    (handle: { position: string; screenPosition: Vector2 }, e: React.PointerEvent) => {
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
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className={styles.canvasContainer} ref={containerRef}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        tabIndex={0}
        aria-label="Drawing canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onContextMenu={handleContextMenu}
        style={{ cursor: toolCursor }}
      />
      <SelectionOverlay
        bounds={screenBounds}
        handles={transformHandles}
        rotation={selectionRotation}
        onHandlePointerDown={handleOverlayPointerDown}
      />
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
