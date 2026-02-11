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
import { generateBrushOutline } from '../path/brushOutline';

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
    // When pressure is disabled, use full pressure (1.0).
    // When enabled, event.pressure may be 0 (mouse) or undefined (synthetic events) —
    // default to 0.5 so widths don't become NaN.
    const rawPressure = event.pressure;
    const pressure = !this.options.pressureEnabled
      ? 1.0
      : rawPressure != null && rawPressure > 0
        ? rawPressure
        : 0.5;
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
   * Stores brushData (spine + widths) for later profile reshaping.
   */
  private createPathNode(spinePoints: PathPoint[], widths: number[]): PathNode {
    const transform = createDefaultTransform();
    transform.position = { x: 0, y: 0 };
    transform.anchor = { x: 0, y: 0 };

    // Generate variable-width outline using shared utility
    const outlinePoints = generateBrushOutline(spinePoints, widths);

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
      fills: [this.context.defaultFill],
      strokes: [],
      brushData: {
        spine: spinePoints.map((p) => ({
          ...p,
          position: { ...p.position },
          handleIn: p.handleIn ? { ...p.handleIn } : null,
          handleOut: p.handleOut ? { ...p.handleOut } : null,
        })),
        widths: [...widths],
        profileId: null,
      },
    };
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
