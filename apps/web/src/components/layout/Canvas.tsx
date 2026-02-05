import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  Camera,
  WebGLRenderer,
  Grid,
  ShapeRenderer,
  SelectionManager,
  TransformHandles,
} from '@quar/core';
import type { Vector2 } from '@quar/types';
import { useCanvasTools } from '../../hooks/useCanvasTools';
import { useToolShortcuts } from '../../hooks/useToolShortcuts';
import { useEditorStore } from '../../stores/editorStore';
import { SelectionOverlay } from '../canvas/SelectionOverlay';
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
  const selectionManagerRef = useRef<SelectionManager | null>(null);
  const transformHandlesRef = useRef<TransformHandles | null>(null);
  const animationFrameRef = useRef<number>(0);

  // Interaction state
  const isPanningRef = useRef(false);
  const isSpaceHeldRef = useRef(false);
  const lastMousePosRef = useRef<Vector2>({ x: 0, y: 0 });

  // UI state (for display)
  const [zoomPercent, setZoomPercent] = useState(100);
  const [mouseWorldPos, setMouseWorldPos] = useState<Vector2>({ x: 0, y: 0 });
  const [cameraReady, setCameraReady] = useState(false);

  // Get selection state from store
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);

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
  } = useCanvasTools({ camera: cameraReady ? cameraRef.current : null });

  // Keep preview node in a ref for the render loop (avoids stale closure)
  const previewNodeRef = useRef(previewNode);
  previewNodeRef.current = previewNode;

  // Keep selectedNodeIds in a ref for the render loop (avoids stale closure)
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  selectedNodeIdsRef.current = selectedNodeIds;

  // Enable tool shortcuts
  useToolShortcuts();

  // Selection bounds and handles
  const selectionBounds = useMemo(() => {
    if (!selectionManagerRef.current || !sceneGraphRef.current) return null;
    return selectionManagerRef.current.getSelectionBounds(selectedNodeIds, sceneGraphRef.current);
  }, [selectedNodeIds, sceneGraphRef]);

  const transformHandles = useMemo(() => {
    if (!transformHandlesRef.current || !selectionBounds || !cameraRef.current) return [];
    return transformHandlesRef.current.getHandles(selectionBounds, cameraRef.current);
  }, [selectionBounds]);

  // Convert selection bounds to screen coordinates for overlay
  const screenBounds = useMemo(() => {
    if (!selectionBounds || !cameraRef.current) return null;
    const camera = cameraRef.current;
    const { rect } = selectionBounds;

    // Convert world bounds to screen
    const topLeft = camera.worldToScreen({ x: rect.x, y: rect.y });
    const bottomRight = camera.worldToScreen({
      x: rect.x + rect.width,
      y: rect.y + rect.height,
    });

    return {
      rect: {
        x: topLeft.x,
        y: topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y,
      },
      center: camera.worldToScreen(selectionBounds.center),
    };
  }, [selectionBounds]);

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

      // Initialize selection infrastructure
      selectionManagerRef.current = new SelectionManager();
      transformHandlesRef.current = new TransformHandles();

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
      if (e.code === 'Digit0' && e.ctrlKey) {
        e.preventDefault();
        camera.reset();
        return;
      }

      // Ctrl+1: Zoom to 100%
      if (e.code === 'Digit1' && e.ctrlKey) {
        e.preventDefault();
        camera.zoomTo(1);
        return;
      }

      // Ctrl+Plus: Zoom in
      if ((e.code === 'Equal' || e.code === 'NumpadAdd') && e.ctrlKey) {
        e.preventDefault();
        camera.zoomTo(camera.zoom * 1.25);
        return;
      }

      // Ctrl+Minus: Zoom out
      if ((e.code === 'Minus' || e.code === 'NumpadSubtract') && e.ctrlKey) {
        e.preventDefault();
        camera.zoomTo(camera.zoom * 0.8);
        return;
      }

      // Pass to tool system
      toolKeyDown(e);
    },
    [toolKeyDown]
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
  // Context Menu (prevent right-click menu)
  // --------------------------------------------------------------------------

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className={styles.canvasContainer} ref={containerRef}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        tabIndex={0}
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
      <SelectionOverlay bounds={screenBounds} handles={transformHandles} />
      <div className={styles.statusBar}>
        <span className={styles.coordinates}>
          X: {mouseWorldPos.x.toFixed(1)} Y: {mouseWorldPos.y.toFixed(1)}
        </span>
        <span className={styles.zoom}>{zoomPercent}%</span>
      </div>
    </div>
  );
}

export default Canvas;
