import { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, WebGLRenderer, Grid } from '@quar/core';
import type { Vector2 } from '@quar/types';
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
  const animationFrameRef = useRef<number>(0);

  // Interaction state
  const isPanningRef = useRef(false);
  const isSpaceHeldRef = useRef(false);
  const lastMousePosRef = useRef<Vector2>({ x: 0, y: 0 });

  // UI state (for display)
  const [zoomPercent, setZoomPercent] = useState(100);
  const [mouseWorldPos, setMouseWorldPos] = useState<Vector2>({ x: 0, y: 0 });

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

      // Initialize grid
      const grid = new Grid(renderer, {
        majorSpacing: 100,
        minorDivisions: 5,
      });
      gridRef.current = grid;

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

        grid.render(viewProjectionMatrix, visibleBounds, camera.zoom);

        animationFrameRef.current = requestAnimationFrame(render);
      };

      animationFrameRef.current = requestAnimationFrame(render);

      // Cleanup
      return () => {
        cancelAnimationFrame(animationFrameRef.current);
        resizeObserver.disconnect();
        unsubscribe();
        grid.dispose();
        renderer.dispose();
      };
    } catch (error) {
      console.error('Failed to initialize WebGL:', error);
      // Fallback to 2D canvas rendering could be added here
    }
  }, []);

  // --------------------------------------------------------------------------
  // Mouse Handlers
  // --------------------------------------------------------------------------

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Middle mouse or Space+Left mouse for panning
    if (e.button === 1 || (e.button === 0 && isSpaceHeldRef.current)) {
      e.preventDefault();
      isPanningRef.current = true;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      canvas.style.cursor = 'grabbing';
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const camera = cameraRef.current;
    const canvas = canvasRef.current;
    if (!camera || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenPos: Vector2 = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    // Update world position
    const worldPos = camera.screenToWorld(screenPos);
    setMouseWorldPos({
      x: Math.round(worldPos.x * 10) / 10,
      y: Math.round(worldPos.y * 10) / 10,
    });

    // Handle panning
    if (isPanningRef.current) {
      const delta: Vector2 = {
        x: e.clientX - lastMousePosRef.current.x,
        y: e.clientY - lastMousePosRef.current.y,
      };
      camera.pan(delta);
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    }

    // Update cursor based on state
    if (!isPanningRef.current) {
      canvas.style.cursor = isSpaceHeldRef.current ? 'grab' : 'crosshair';
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    isPanningRef.current = false;
    canvas.style.cursor = isSpaceHeldRef.current ? 'grab' : 'crosshair';
  }, []);

  const handleMouseLeave = useCallback(() => {
    isPanningRef.current = false;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.cursor = 'crosshair';
    }
  }, []);

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

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
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
    }

    // Ctrl+0: Fit to window (reset zoom and position)
    if (e.code === 'Digit0' && e.ctrlKey) {
      e.preventDefault();
      camera.reset();
    }

    // Ctrl+1: Zoom to 100%
    if (e.code === 'Digit1' && e.ctrlKey) {
      e.preventDefault();
      camera.zoomTo(1);
    }

    // Ctrl+Plus: Zoom in
    if ((e.code === 'Equal' || e.code === 'NumpadAdd') && e.ctrlKey) {
      e.preventDefault();
      camera.zoomTo(camera.zoom * 1.25);
    }

    // Ctrl+Minus: Zoom out
    if ((e.code === 'Minus' || e.code === 'NumpadSubtract') && e.ctrlKey) {
      e.preventDefault();
      camera.zoomTo(camera.zoom * 0.8);
    }
  }, []);

  const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
    if (e.code === 'Space') {
      isSpaceHeldRef.current = false;
      const canvas = canvasRef.current;
      if (canvas && !isPanningRef.current) {
        canvas.style.cursor = 'crosshair';
      }
    }
  }, []);

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
      />
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
