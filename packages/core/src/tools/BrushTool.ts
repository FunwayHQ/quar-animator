/**
 * Brush Tool for Quar Animator
 *
 * Creates freehand paths with Schneider curve fitting and Kalman-filtered
 * input stabilization. Supports per-point variable width from pressure.
 */

import type { CanvasPointerEvent, PathNode, PathPoint, Vector2 } from '@quar/types';
import { BaseTool, type ToolContext } from './BaseTool';
import { createDefaultTransform } from '../SceneGraph';
import { vec2 } from '../math';
import { schneiderFitCurve, curvesToPathPoints, type CubicSegment } from '../path/schneider';
import { KalmanFilter2D, smoothingToKalmanParams } from '../path/kalmanFilter';
import { tessellatePathToPoints } from '../path/pathUtils';

// ============================================================================
// Types
// ============================================================================

interface BrushPoint {
  position: Vector2;
  pressure: number;
  timestamp: number;
  width: number; // size * mappedPressure at capture time
}

export interface BrushToolOptions {
  /** Brush size in pixels (default: 5) */
  size: number;
  /** Smoothing amount 0-100 (default: 50) */
  smoothing: number;
  /** Whether to use pressure sensitivity (default: true) */
  pressureEnabled: boolean;
  /** Minimum pressure multiplier (default: 0.1) */
  pressureMin: number;
  /** Maximum pressure multiplier (default: 1.0) */
  pressureMax: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Schneider error threshold for final curve fitting (squared world units) */
const SCHNEIDER_ERROR = 4.0;

/** Minimum number of floating points before committing a batch */
const COMMIT_THRESHOLD = 12;

// ============================================================================
// BrushTool Class
// ============================================================================

export class BrushTool extends BaseTool {
  readonly type = 'brush' as const;
  readonly cursor = 'crosshair';

  private options: BrushToolOptions = {
    size: 5,
    smoothing: 50,
    pressureEnabled: true,
    pressureMin: 0.1,
    pressureMax: 1.0,
  };

  private isDrawing: boolean = false;
  private previewNode: PathNode | null = null;

  // Pipeline state
  private kalman: KalmanFilter2D | null = null;
  private lastTimestamp: number = 0;
  private committedCurves: CubicSegment[] = [];
  private committedWidths: number[] = [];
  private floatingPoints: BrushPoint[] = [];
  private allPoints: BrushPoint[] = [];

  constructor(context: ToolContext) {
    super(context);
  }

  // --------------------------------------------------------------------------
  // Options
  // --------------------------------------------------------------------------

  getOptions(): Readonly<BrushToolOptions> {
    return { ...this.options };
  }

  setOptions(options: Partial<BrushToolOptions>): void {
    this.options = { ...this.options, ...options };
  }

  setSize(size: number): void {
    this.options.size = Math.max(1, Math.min(100, size));
  }

  setSmoothing(smoothing: number): void {
    this.options.smoothing = Math.max(0, Math.min(100, smoothing));
  }

  // --------------------------------------------------------------------------
  // Pointer Events
  // --------------------------------------------------------------------------

  onPointerDown(event: CanvasPointerEvent): void {
    if (event.button !== 0) return;

    this.isDrawing = true;
    this.state.isDragging = true;
    this.state.startWorldPos = { ...event.worldPosition };

    // Initialize Kalman filter
    const params = smoothingToKalmanParams(this.options.smoothing);
    this.kalman = new KalmanFilter2D(params.processNoise, params.measurementNoise);
    this.lastTimestamp = event.timestamp;

    // Reset pipeline
    this.committedCurves = [];
    this.committedWidths = [];
    this.floatingPoints = [];
    this.allPoints = [];

    // Capture first point (no Kalman on first point — initialize)
    this.capturePoint(event);
    this.updatePreviewNode();
  }

  onPointerMove(event: CanvasPointerEvent): void {
    if (!this.isDrawing) return;

    this.capturePoint(event);

    // Commit floating points when buffer is large enough
    if (this.floatingPoints.length >= COMMIT_THRESHOLD) {
      this.commitFloatingPoints();
    }

    this.updatePreviewNode();
  }

  onPointerUp(event: CanvasPointerEvent): void {
    if (!this.isDrawing) return;

    this.capturePoint(event);
    this.finalizeStroke();
  }

  // --------------------------------------------------------------------------
  // Keyboard Events
  // --------------------------------------------------------------------------

  onKeyDown(event: KeyboardEvent): void {
    if (!this.isDrawing) return;

    if (event.key === 'Escape') {
      this.cancelStroke();
    }
  }

  // --------------------------------------------------------------------------
  // Preview
  // --------------------------------------------------------------------------

  getPreviewNode(): PathNode | null {
    return this.previewNode;
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private capturePoint(event: CanvasPointerEvent): void {
    const rawPos = event.worldPosition;

    // Filter through Kalman
    const dt = Math.max(0.001, (event.timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = event.timestamp;
    const filteredPos = this.kalman!.filter(rawPos, dt);

    // Minimum distance filter
    if (this.allPoints.length > 0) {
      const lastPoint = this.allPoints[this.allPoints.length - 1]!;
      const minDistance = 2 / this.context.camera.zoom;
      if (vec2.distance(filteredPos, lastPoint.position) < minDistance) {
        return;
      }
    }

    // Compute per-point width
    const pressure = this.options.pressureEnabled ? event.pressure : 1;
    const mappedPressure =
      this.options.pressureMin + pressure * (this.options.pressureMax - this.options.pressureMin);
    const pointWidth = this.options.size * mappedPressure;

    const point: BrushPoint = {
      position: { ...filteredPos },
      pressure,
      timestamp: event.timestamp,
      width: pointWidth,
    };

    this.allPoints.push(point);
    this.floatingPoints.push(point);
  }

  /**
   * Commit the front portion of floating points via Schneider fit,
   * keeping the last few for overlap.
   */
  private commitFloatingPoints(): void {
    if (this.floatingPoints.length < 4) return;

    // Keep last 3 points for overlap with next batch
    const toCommit = this.floatingPoints.slice(0, -3);
    const positions = toCommit.map((p) => p.position);

    const curves = schneiderFitCurve(positions, SCHNEIDER_ERROR);
    this.committedCurves.push(...curves);

    // Accumulate widths for committed points
    for (const p of toCommit) {
      this.committedWidths.push(p.width);
    }

    // Keep overlap
    this.floatingPoints = this.floatingPoints.slice(-3);
  }

  private updatePreviewNode(): void {
    if (this.allPoints.length < 2) {
      this.previewNode = null;
      return;
    }

    // For preview: fit all current points
    const positions = this.allPoints.map((p) => p.position);
    const widths = this.allPoints.map((p) => p.width);
    const curves = schneiderFitCurve(positions, SCHNEIDER_ERROR * 2); // looser for preview
    const pathPoints = curvesToPathPoints(curves);

    if (pathPoints.length < 2) {
      this.previewNode = null;
      return;
    }

    this.previewNode = this.createPathNode(pathPoints, widths);
  }

  private finalizeStroke(): void {
    if (this.allPoints.length < 2) {
      this.cancelStroke();
      return;
    }

    // Final Schneider fit on all points
    const positions = this.allPoints.map((p) => p.position);
    const widths = this.allPoints.map((p) => p.width);
    const curves = schneiderFitCurve(positions, SCHNEIDER_ERROR);
    const pathPoints = curvesToPathPoints(curves);

    if (pathPoints.length < 2) {
      this.cancelStroke();
      return;
    }

    const node = this.createPathNode(pathPoints, widths);

    // Add to scene graph
    this.context.onTransformStart?.();
    this.context.sceneGraph.addNode(node);

    // Select the new node
    this.context.setSelectedIds([node.id]);

    // Switch to selection tool
    this.context.setActiveTool('selection');

    this.resetBrushState();
  }

  private cancelStroke(): void {
    this.resetBrushState();
  }

  private resetBrushState(): void {
    this.isDrawing = false;
    this.previewNode = null;
    this.kalman = null;
    this.committedCurves = [];
    this.committedWidths = [];
    this.floatingPoints = [];
    this.allPoints = [];
    this.resetState();
  }

  /**
   * Create a filled closed outline PathNode from the spine path and per-point widths.
   * Uses generateStrokeOutlineVertices internally with a widthProfile.
   */
  private createPathNode(spinePoints: PathPoint[], widths: number[]): PathNode {
    const transform = createDefaultTransform();
    transform.position = { x: 0, y: 0 };
    transform.anchor = { x: 0, y: 0 };

    // Generate variable-width outline
    const outlinePoints = this.generateVariableWidthOutline(spinePoints, widths);

    return {
      id: this.context.generateId(),
      name: 'Brush Stroke',
      type: 'path',
      parent: null,
      children: [],
      transform,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      points: outlinePoints,
      closed: true,
      fills: [
        {
          type: 'solid',
          color: this.context.defaultStroke.color,
          opacity: this.context.defaultStroke.opacity,
          visible: true,
        },
      ],
      strokes: [],
    };
  }

  /**
   * Generate a closed outline from spine points with variable width.
   * Tessellates the spine, computes perpendicular offsets per sample,
   * and returns the outline as corner PathPoints.
   */
  private generateVariableWidthOutline(spinePoints: PathPoint[], widths: number[]): PathPoint[] {
    if (spinePoints.length < 2) return spinePoints;

    // Tessellate spine into dense sample points
    const sampleCount = Math.max(spinePoints.length * 8, 40);
    const samples: Vector2[] = [];
    const sampleWidths: number[] = [];
    const tessellated: Vector2[] = tessellatePathToPoints(spinePoints, false, 0.5);

    if (tessellated.length < 2) return spinePoints;

    // Resample to uniform arc-length spacing
    const totalLength = computePolylineLength(tessellated);
    if (totalLength < 0.001) return spinePoints;

    const step = totalLength / (sampleCount - 1);

    // Build cumulative distances
    const cumDist: number[] = [0];
    for (let i = 1; i < tessellated.length; i++) {
      cumDist.push(cumDist[i - 1] + vec2.distance(tessellated[i - 1], tessellated[i]));
    }

    for (let s = 0; s < sampleCount; s++) {
      const targetDist = s * step;
      const t = targetDist / totalLength;

      // Find segment in tessellated array
      let segIdx = 0;
      while (segIdx < cumDist.length - 2 && cumDist[segIdx + 1] < targetDist) {
        segIdx++;
      }
      const segLen = cumDist[segIdx + 1] - cumDist[segIdx];
      const localT = segLen > 0.0001 ? (targetDist - cumDist[segIdx]) / segLen : 0;

      const p = vec2.lerp(
        tessellated[segIdx],
        tessellated[Math.min(segIdx + 1, tessellated.length - 1)],
        localT
      );
      samples.push(p);

      // Interpolate width at this t
      const widthT = t * (widths.length - 1);
      const wLo = Math.floor(widthT);
      const wHi = Math.min(wLo + 1, widths.length - 1);
      const wFrac = widthT - wLo;
      const w =
        (widths[wLo] ?? widths[0]) +
        wFrac * ((widths[wHi] ?? widths[0]) - (widths[wLo] ?? widths[0]));
      sampleWidths.push(w);
    }

    // Compute perpendicular offsets
    const leftSide: Vector2[] = [];
    const rightSide: Vector2[] = [];
    let lastPerpX = 0;
    let lastPerpY = 1;

    for (let i = 0; i < samples.length; i++) {
      const curr = samples[i];
      const prev = i > 0 ? samples[i - 1] : null;
      const next = i < samples.length - 1 ? samples[i + 1] : null;

      let dx = 0;
      let dy = 0;
      if (prev && next) {
        dx = next.x - prev.x;
        dy = next.y - prev.y;
      } else if (next) {
        dx = next.x - curr.x;
        dy = next.y - curr.y;
      } else if (prev) {
        dx = curr.x - prev.x;
        dy = curr.y - prev.y;
      }

      const len = Math.sqrt(dx * dx + dy * dy);
      let perpX: number;
      let perpY: number;
      if (len < 0.001) {
        perpX = lastPerpX;
        perpY = lastPerpY;
      } else {
        perpX = -dy / len;
        perpY = dx / len;
        lastPerpX = perpX;
        lastPerpY = perpY;
      }

      const halfWidth = Math.max(sampleWidths[i] / 2, 0.5);
      leftSide.push({
        x: curr.x + perpX * halfWidth,
        y: curr.y + perpY * halfWidth,
      });
      rightSide.push({
        x: curr.x - perpX * halfWidth,
        y: curr.y - perpY * halfWidth,
      });
    }

    // Add round end caps
    const capPoints = 4;
    const startCap = generateRoundCap(samples[0], leftSide[0], rightSide[0], capPoints, true);
    const endCap = generateRoundCap(
      samples[samples.length - 1],
      leftSide[leftSide.length - 1],
      rightSide[rightSide.length - 1],
      capPoints,
      false
    );

    // Combine: left forward + end cap + right reversed + start cap
    const outline: PathPoint[] = [];

    // Start cap (from rightSide[0] around to leftSide[0])
    for (const p of startCap) {
      outline.push(cornerPoint(p));
    }

    // Left side forward
    for (const p of leftSide) {
      outline.push(cornerPoint(p));
    }

    // End cap (from leftSide[last] around to rightSide[last])
    for (const p of endCap) {
      outline.push(cornerPoint(p));
    }

    // Right side reversed
    for (let i = rightSide.length - 1; i >= 0; i--) {
      outline.push(cornerPoint(rightSide[i]));
    }

    return outline;
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  onDeactivate(): void {
    if (this.isDrawing) {
      this.cancelStroke();
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function cornerPoint(pos: Vector2): PathPoint {
  return {
    position: { ...pos },
    handleIn: null,
    handleOut: null,
    type: 'corner',
  };
}

function computePolylineLength(points: Vector2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += vec2.distance(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Generate a semicircular end cap.
 * @param center The endpoint of the stroke spine
 * @param leftPt The left offset point at this end
 * @param rightPt The right offset point at this end
 * @param numPoints Number of points in the semicircle
 * @param isStart Whether this is the start cap (rotates opposite)
 */
function generateRoundCap(
  center: Vector2,
  leftPt: Vector2,
  rightPt: Vector2,
  numPoints: number,
  isStart: boolean
): Vector2[] {
  const radius = vec2.distance(leftPt, rightPt) / 2;
  if (radius < 0.01) return [];

  // Angle from center to the start of the arc
  const fromPt = isStart ? rightPt : leftPt;
  const startAngle = Math.atan2(fromPt.y - center.y, fromPt.x - center.x);

  const points: Vector2[] = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const angle = startAngle + t * Math.PI; // semicircle = PI radians
    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    });
  }

  return points;
}
