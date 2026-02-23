/**
 * CanvasRuler — Horizontal and vertical rulers for the canvas.
 *
 * Renders tick marks with coordinate labels that adapt to zoom level.
 * Uses the same adaptive spacing algorithm as the Grid renderer.
 * Supports drag-to-create guide lines.
 */

import { useMemo, useCallback, useRef, useEffect } from 'react';
import type { Camera } from '@quar/core';
import styles from './CanvasRuler.module.css';

// ============================================================================
// Constants
// ============================================================================

export const RULER_SIZE = 20; // Width/height of the ruler strip in pixels
const MIN_SCREEN_SPACING = 50;
const MAX_SCREEN_SPACING = 200;
const BASE_SPACING = 100;

// ============================================================================
// Types
// ============================================================================

interface CanvasRulerProps {
  camera: Camera | null;
  viewportWidth: number;
  viewportHeight: number;
  /** Increments on camera change, used to invalidate memos */
  cameraVersion?: number;
  /** Ref to the WebGL canvas element — used to compute canvas-relative screen coords */
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  /** Called when the user starts dragging from a ruler */
  onGuideDragStart?: (axis: 'x' | 'y') => void;
  /** Called as the user drags from a ruler */
  onGuideDrag?: (axis: 'x' | 'y', worldPosition: number) => void;
  /** Called when the user finishes dragging from a ruler */
  onGuideDragEnd?: (axis: 'x' | 'y', worldPosition: number) => void;
}

interface TickMark {
  screenPos: number;
  worldValue: number;
  isMajor: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function calculateAdaptiveSpacing(zoom: number): number {
  let spacing = BASE_SPACING;
  while (spacing * zoom < MIN_SCREEN_SPACING) spacing *= 2;
  while (spacing * zoom > MAX_SCREEN_SPACING) spacing /= 2;
  return spacing;
}

function formatValue(value: number): string {
  if (Math.abs(value) < 0.01) return '0';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

function generateTicks(camera: Camera, viewportSize: number, axis: 'x' | 'y'): TickMark[] {
  const zoom = camera.zoom;
  const majorSpacing = calculateAdaptiveSpacing(zoom);
  const minorSpacing = majorSpacing / 5;

  const ticks: TickMark[] = [];

  // Get world bounds for this axis
  const startWorld = camera.screenToWorld({ x: 0, y: viewportSize });
  const endWorld = camera.screenToWorld({ x: viewportSize, y: 0 });

  const worldMin = axis === 'x' ? startWorld.x : startWorld.y;
  const worldMax = axis === 'x' ? endWorld.x : endWorld.y;

  // Generate minor ticks
  const firstMinor = Math.floor(worldMin / minorSpacing) * minorSpacing;
  for (let w = firstMinor; w <= worldMax; w += minorSpacing) {
    const screenPt = camera.worldToScreen(axis === 'x' ? { x: w, y: 0 } : { x: 0, y: w });
    const screenPos = axis === 'x' ? screenPt.x : screenPt.y;

    if (screenPos < -10 || screenPos > viewportSize + 10) continue;

    const isMajor = Math.abs(w % majorSpacing) < minorSpacing * 0.1;
    ticks.push({ screenPos, worldValue: w, isMajor });
  }

  return ticks;
}

// ============================================================================
// Component
// ============================================================================

export function CanvasRuler({
  camera,
  viewportWidth,
  viewportHeight,
  cameraVersion,
  canvasRef: externalCanvasRef,
  onGuideDragStart,
  onGuideDrag,
  onGuideDragEnd,
}: CanvasRulerProps) {
  const hTicks = useMemo(
    () => (camera ? generateTicks(camera, viewportWidth, 'x') : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cameraVersion triggers recalculation
    [camera, viewportWidth, cameraVersion]
  );

  const vTicks = useMemo(
    () => (camera ? generateTicks(camera, viewportHeight, 'y') : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cameraVersion triggers recalculation
    [camera, viewportHeight, cameraVersion]
  );

  // Refs for camera and callbacks to avoid stale closures in global listeners
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const canvasElRef = useRef(externalCanvasRef);
  canvasElRef.current = externalCanvasRef;
  const onGuideDragRef = useRef(onGuideDrag);
  onGuideDragRef.current = onGuideDrag;
  const onGuideDragEndRef = useRef(onGuideDragEnd);
  onGuideDragEndRef.current = onGuideDragEnd;

  // Track active global listener cleanups for unmount safety
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  /** Convert browser-viewport clientX/clientY to canvas-local screen coords */
  const toCanvasScreen = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const canvas = canvasElRef.current?.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        return { x: clientX - rect.left, y: clientY - rect.top };
      }
      // Fallback: assume canvas fills the area after the ruler
      return { x: clientX, y: clientY };
    },
    []
  );

  const handleHRulerPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!cameraRef.current) return;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      // Remember the ruler element's top so we can detect "drag back onto ruler"
      const rulerRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      onGuideDragStart?.('y');

      const onMove = (ev: PointerEvent) => {
        if (!cameraRef.current) return;
        const screen = toCanvasScreen(ev.clientX, ev.clientY);
        const worldPos = cameraRef.current.screenToWorld(screen);
        onGuideDragRef.current?.('y', worldPos.y);
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        cleanupRef.current = null;
      };

      const onUp = (ev: PointerEvent) => {
        if (!cameraRef.current) return;
        const screen = toCanvasScreen(ev.clientX, ev.clientY);
        const worldPos = cameraRef.current.screenToWorld(screen);
        // Only create guide if pointer is below the ruler area
        if (ev.clientY > rulerRect.bottom) {
          onGuideDragEndRef.current?.('y', worldPos.y);
        } else {
          // Cancelled — dragged back onto ruler
          onGuideDragEndRef.current?.('y', NaN);
        }
        cleanup();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      cleanupRef.current = cleanup;
    },
    [onGuideDragStart, toCanvasScreen]
  );

  const handleVRulerPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!cameraRef.current) return;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const rulerRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      onGuideDragStart?.('x');

      const onMove = (ev: PointerEvent) => {
        if (!cameraRef.current) return;
        const screen = toCanvasScreen(ev.clientX, ev.clientY);
        const worldPos = cameraRef.current.screenToWorld(screen);
        onGuideDragRef.current?.('x', worldPos.x);
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        cleanupRef.current = null;
      };

      const onUp = (ev: PointerEvent) => {
        if (!cameraRef.current) return;
        const screen = toCanvasScreen(ev.clientX, ev.clientY);
        const worldPos = cameraRef.current.screenToWorld(screen);
        if (ev.clientX > rulerRect.right) {
          onGuideDragEndRef.current?.('x', worldPos.x);
        } else {
          onGuideDragEndRef.current?.('x', NaN);
        }
        cleanup();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      cleanupRef.current = cleanup;
    },
    [onGuideDragStart, toCanvasScreen]
  );

  return (
    <>
      {/* Horizontal ruler (top) */}
      <div
        className={styles.hRuler}
        style={{ height: RULER_SIZE, left: RULER_SIZE }}
        data-testid="canvas-ruler-h"
        onPointerDown={handleHRulerPointerDown}
      >
        {hTicks.map((tick, i) => (
          <div
            key={i}
            className={tick.isMajor ? styles.majorTick : styles.minorTick}
            style={{ left: tick.screenPos - RULER_SIZE }}
          >
            {tick.isMajor && (
              <span className={styles.tickLabel}>{formatValue(tick.worldValue)}</span>
            )}
          </div>
        ))}
      </div>

      {/* Vertical ruler (left) */}
      <div
        className={styles.vRuler}
        style={{ width: RULER_SIZE, top: RULER_SIZE }}
        data-testid="canvas-ruler-v"
        onPointerDown={handleVRulerPointerDown}
      >
        {vTicks.map((tick, i) => (
          <div
            key={i}
            className={tick.isMajor ? styles.majorTickV : styles.minorTickV}
            style={{ top: tick.screenPos - RULER_SIZE }}
          >
            {tick.isMajor && (
              <span className={styles.tickLabelV}>{formatValue(tick.worldValue)}</span>
            )}
          </div>
        ))}
      </div>

      {/* Corner square (top-left intersection) */}
      <div className={styles.corner} style={{ width: RULER_SIZE, height: RULER_SIZE }} />
    </>
  );
}

export default CanvasRuler;
