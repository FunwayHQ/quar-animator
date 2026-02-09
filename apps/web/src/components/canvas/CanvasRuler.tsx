/**
 * CanvasRuler — Horizontal and vertical rulers for the canvas.
 *
 * Renders tick marks with coordinate labels that adapt to zoom level.
 * Uses the same adaptive spacing algorithm as the Grid renderer.
 */

import { useMemo } from 'react';
import type { Camera } from '@quar/core';
import styles from './CanvasRuler.module.css';

// ============================================================================
// Constants
// ============================================================================

const RULER_SIZE = 20; // Width/height of the ruler strip in pixels
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

function generateTicks(
  camera: Camera,
  viewportSize: number,
  axis: 'x' | 'y'
): TickMark[] {
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
    const screenPt = camera.worldToScreen(
      axis === 'x' ? { x: w, y: 0 } : { x: 0, y: w }
    );
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

export function CanvasRuler({ camera, viewportWidth, viewportHeight, cameraVersion }: CanvasRulerProps) {
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

  return (
    <>
      {/* Horizontal ruler (top) */}
      <div
        className={styles.hRuler}
        style={{ height: RULER_SIZE, left: RULER_SIZE }}
        data-testid="canvas-ruler-h"
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
      <div
        className={styles.corner}
        style={{ width: RULER_SIZE, height: RULER_SIZE }}
      />
    </>
  );
}

export default CanvasRuler;
