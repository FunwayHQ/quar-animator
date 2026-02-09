/**
 * Brush Tool for Quar Animator
 * Creates freehand paths with optional smoothing and pressure sensitivity
 */

import type { CanvasPointerEvent, PathNode, PathPoint, Vector2 } from '@quar/types';
import { BaseTool, type ToolContext } from './BaseTool';
import { createDefaultTransform } from '../SceneGraph';
import { vec2 } from '../math';

// ============================================================================
// Types
// ============================================================================

interface BrushPoint {
  position: Vector2;
  pressure: number;
  timestamp: number;
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
// Ramer-Douglas-Peucker Smoothing Algorithm
// ============================================================================

/**
 * Simplify a path using the Ramer-Douglas-Peucker algorithm
 * @param points Array of points to simplify
 * @param epsilon Maximum perpendicular distance for simplification
 * @returns Simplified array of points
 */
function simplifyPath(points: Vector2[], epsilon: number): Vector2[] {
  if (points.length < 3) return [...points];

  // Find the point with maximum distance from line between first and last
  const first = points[0];
  const last = points[points.length - 1];

  let maxDistance = 0;
  let maxIndex = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  // If max distance is greater than epsilon, recursively simplify
  if (maxDistance > epsilon) {
    // Recursive call on two halves
    const left = simplifyPath(points.slice(0, maxIndex + 1), epsilon);
    const right = simplifyPath(points.slice(maxIndex), epsilon);

    // Combine results (remove duplicate point at junction)
    return [...left.slice(0, -1), ...right];
  }

  // All points are within epsilon, return just endpoints
  return [first, last];
}

/**
 * Calculate perpendicular distance from point to line segment
 */
function perpendicularDistance(point: Vector2, lineStart: Vector2, lineEnd: Vector2): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;

  // Handle degenerate case where line is a point
  const lineLengthSq = dx * dx + dy * dy;
  if (lineLengthSq === 0) {
    return vec2.distance(point, lineStart);
  }

  // Calculate perpendicular distance using cross product
  const numerator = Math.abs(
    dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x
  );
  const denominator = Math.sqrt(lineLengthSq);

  return numerator / denominator;
}

/**
 * Convert smoothing value (0-100) to epsilon for RDP algorithm
 * Higher smoothing = higher epsilon = more simplification
 */
function smoothingToEpsilon(smoothing: number, zoom: number): number {
  // Map 0-100 to 0.5-15 world units, adjusted for zoom
  const baseEpsilon = 0.5 + (smoothing / 100) * 14.5;
  return baseEpsilon / zoom;
}

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

  private capturedPoints: BrushPoint[] = [];
  private isDrawing: boolean = false;
  private previewNode: PathNode | null = null;

  constructor(context: ToolContext) {
    super(context);
  }

  // --------------------------------------------------------------------------
  // Options
  // --------------------------------------------------------------------------

  /**
   * Get current brush options
   */
  getOptions(): Readonly<BrushToolOptions> {
    return { ...this.options };
  }

  /**
   * Set brush options
   */
  setOptions(options: Partial<BrushToolOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Set brush size
   */
  setSize(size: number): void {
    this.options.size = Math.max(1, Math.min(100, size));
  }

  /**
   * Set smoothing amount (0-100)
   */
  setSmoothing(smoothing: number): void {
    this.options.smoothing = Math.max(0, Math.min(100, smoothing));
  }

  // --------------------------------------------------------------------------
  // Pointer Events
  // --------------------------------------------------------------------------

  onPointerDown(event: CanvasPointerEvent): void {
    // Only handle left mouse button
    if (event.button !== 0) return;

    this.isDrawing = true;
    this.capturedPoints = [];
    this.state.isDragging = true;
    this.state.startWorldPos = { ...event.worldPosition };

    // Capture first point
    this.capturePoint(event);

    // Create preview node
    this.updatePreviewNode();
  }

  onPointerMove(event: CanvasPointerEvent): void {
    if (!this.isDrawing) return;

    // Capture point
    this.capturePoint(event);

    // Update preview
    this.updatePreviewNode();
  }

  onPointerUp(event: CanvasPointerEvent): void {
    if (!this.isDrawing) return;

    // Capture final point
    this.capturePoint(event);

    // Finalize the stroke
    this.finalizeStroke();
  }

  // --------------------------------------------------------------------------
  // Keyboard Events
  // --------------------------------------------------------------------------

  onKeyDown(event: KeyboardEvent): void {
    if (!this.isDrawing) return;

    if (event.key === 'Escape') {
      // Cancel stroke
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
    const point: BrushPoint = {
      position: { ...event.worldPosition },
      pressure: this.options.pressureEnabled ? event.pressure : 1,
      timestamp: event.timestamp,
    };

    // Only add point if it's far enough from the last point
    // This prevents too many points from being captured
    if (this.capturedPoints.length > 0) {
      const lastPoint = this.capturedPoints[this.capturedPoints.length - 1]!;
      const minDistance = 2 / this.context.camera.zoom; // 2 screen pixels
      if (vec2.distance(point.position, lastPoint.position) < minDistance) {
        return;
      }
    }

    this.capturedPoints.push(point);
  }

  private updatePreviewNode(): void {
    if (this.capturedPoints.length < 2) {
      this.previewNode = null;
      return;
    }

    // Get positions and apply minimal smoothing for preview
    const positions = this.capturedPoints.map((p) => p.position);

    // Use light smoothing for preview (half the configured amount for responsiveness)
    const previewSmoothing = this.options.smoothing / 2;
    const epsilon = smoothingToEpsilon(previewSmoothing, this.context.camera.zoom);
    const simplified = simplifyPath(positions, epsilon);

    // Convert to path points (all corner points for now, no bezier handles)
    const pathPoints = this.positionsToPathPoints(simplified);

    // Create or update preview node
    this.previewNode = this.createPathNode(pathPoints, false);
  }

  private finalizeStroke(): void {
    if (this.capturedPoints.length < 2) {
      this.cancelStroke();
      return;
    }

    // Get positions
    const positions = this.capturedPoints.map((p) => p.position);

    // Apply full smoothing
    const epsilon = smoothingToEpsilon(this.options.smoothing, this.context.camera.zoom);
    const simplified = simplifyPath(positions, epsilon);

    // Fit smooth curves to simplified points
    const pathPoints = this.fitCurvesToPoints(simplified);

    // Create final path node
    const node = this.createPathNode(pathPoints, false);

    // Add to scene graph
    this.context.sceneGraph.addNode(node);

    // Select the new node
    this.context.setSelectedIds([node.id]);

    // Switch to selection tool
    this.context.setActiveTool('selection');

    // Reset state
    this.resetBrushState();
  }

  private cancelStroke(): void {
    this.resetBrushState();
  }

  private resetBrushState(): void {
    this.capturedPoints = [];
    this.isDrawing = false;
    this.previewNode = null;
    this.resetState();
  }

  /**
   * Convert positions to simple corner path points
   */
  private positionsToPathPoints(positions: Vector2[]): PathPoint[] {
    return positions.map((pos) => ({
      position: { ...pos },
      handleIn: null,
      handleOut: null,
      type: 'corner' as const,
    }));
  }

  /**
   * Fit smooth curves to a series of points
   * Creates smooth bezier handles for a natural brush stroke appearance
   */
  private fitCurvesToPoints(positions: Vector2[]): PathPoint[] {
    if (positions.length < 2) {
      return this.positionsToPathPoints(positions);
    }

    if (positions.length === 2) {
      // Two points: just a straight line
      return this.positionsToPathPoints(positions);
    }

    const pathPoints: PathPoint[] = [];

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      const prev = positions[i - 1];
      const next = positions[i + 1];

      if (i === 0) {
        // First point: only handleOut toward next point
        const handleLength = vec2.distance(pos, next) * 0.3;
        const direction = vec2.normalize(vec2.subtract(next, pos));

        pathPoints.push({
          position: { ...pos },
          handleIn: null,
          handleOut: { x: direction.x * handleLength, y: direction.y * handleLength },
          type: 'smooth',
        });
      } else if (i === positions.length - 1) {
        // Last point: only handleIn from previous point
        const handleLength = vec2.distance(pos, prev) * 0.3;
        const direction = vec2.normalize(vec2.subtract(prev, pos));

        pathPoints.push({
          position: { ...pos },
          handleIn: { x: direction.x * handleLength, y: direction.y * handleLength },
          handleOut: null,
          type: 'smooth',
        });
      } else {
        // Middle point: smooth handles based on prev and next
        const toPrev = vec2.subtract(prev, pos);
        const toNext = vec2.subtract(next, pos);

        // Calculate handle direction as average of incoming/outgoing directions
        const prevDir = vec2.normalize(toPrev);
        const nextDir = vec2.normalize(toNext);

        // Tangent is perpendicular to the angle bisector
        const tangent = vec2.normalize({
          x: nextDir.x - prevDir.x,
          y: nextDir.y - prevDir.y,
        });

        // Handle lengths proportional to distance to neighbors
        const handleInLength = vec2.length(toPrev) * 0.3;
        const handleOutLength = vec2.length(toNext) * 0.3;

        pathPoints.push({
          position: { ...pos },
          handleIn: { x: -tangent.x * handleInLength, y: -tangent.y * handleInLength },
          handleOut: { x: tangent.x * handleOutLength, y: tangent.y * handleOutLength },
          type: 'smooth',
        });
      }
    }

    return pathPoints;
  }

  private createPathNode(points: PathPoint[], _closed: boolean): PathNode {
    const transform = createDefaultTransform();
    transform.position = { x: 0, y: 0 };
    transform.anchor = { x: 0, y: 0 };

    // Calculate stroke width based on brush size and average pressure
    let avgPressure = 1;
    if (this.options.pressureEnabled && this.capturedPoints.length > 0) {
      const totalPressure = this.capturedPoints.reduce((sum, p) => sum + p.pressure, 0);
      avgPressure = totalPressure / this.capturedPoints.length;
      // Map pressure to range
      avgPressure =
        this.options.pressureMin +
        avgPressure * (this.options.pressureMax - this.options.pressureMin);
    }

    const strokeWidth = this.options.size * avgPressure;

    // Generate a closed outline path for the brush stroke
    // This creates a filled shape since WebGL line width is limited to 1px
    const outlinePoints = this.generateStrokeOutline(points, strokeWidth);

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
      closed: true, // Closed path for fill rendering
      fills: [
        {
          type: 'solid',
          color: this.context.defaultStroke.color,
          opacity: this.context.defaultStroke.opacity,
          visible: true,
        },
      ],
      strokes: [], // No stroke needed, using fill
    };
  }

  /**
   * Generate outline points for a stroke path
   * Creates a closed shape by offsetting the path on both sides
   */
  private generateStrokeOutline(points: PathPoint[], width: number): PathPoint[] {
    if (points.length < 2) return points;

    const halfWidth = Math.max(width / 2, 1); // Ensure minimum width
    const leftSide: PathPoint[] = [];
    const rightSide: PathPoint[] = [];

    // Track last valid perpendicular for degenerate points
    let lastPerpX = 0;
    let lastPerpY = 1;

    for (let i = 0; i < points.length; i++) {
      const curr = points[i].position;
      const prev = i > 0 ? points[i - 1].position : null;
      const next = i < points.length - 1 ? points[i + 1].position : null;

      // Calculate direction vector
      let dx = 0;
      let dy = 0;

      if (prev && next) {
        // Middle point: use direction from prev to next
        dx = next.x - prev.x;
        dy = next.y - prev.y;
      } else if (next) {
        // First point: use direction to next
        dx = next.x - curr.x;
        dy = next.y - curr.y;
      } else if (prev) {
        // Last point: use direction from prev
        dx = curr.x - prev.x;
        dy = curr.y - prev.y;
      }

      // Normalize and get perpendicular
      const len = Math.sqrt(dx * dx + dy * dy);
      let perpX: number;
      let perpY: number;

      if (len < 0.001) {
        // Degenerate point: reuse last valid perpendicular
        perpX = lastPerpX;
        perpY = lastPerpY;
      } else {
        perpX = -dy / len;
        perpY = dx / len;
        lastPerpX = perpX;
        lastPerpY = perpY;
      }

      // Create offset points with validated coordinates
      const leftX = curr.x + perpX * halfWidth;
      const leftY = curr.y + perpY * halfWidth;
      const rightX = curr.x - perpX * halfWidth;
      const rightY = curr.y - perpY * halfWidth;

      // Only add valid points
      if (isFinite(leftX) && isFinite(leftY)) {
        leftSide.push({
          position: { x: leftX, y: leftY },
          handleIn: null,
          handleOut: null,
          type: 'corner',
        });
      }

      if (isFinite(rightX) && isFinite(rightY)) {
        rightSide.push({
          position: { x: rightX, y: rightY },
          handleIn: null,
          handleOut: null,
          type: 'corner',
        });
      }
    }

    // Need at least 3 points to form a closed shape
    if (leftSide.length < 1 || rightSide.length < 1) {
      return points; // Fall back to original points
    }

    // Combine: left side forward, then right side backward to form closed outline
    return [...leftSide, ...rightSide.reverse()];
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  onDeactivate(): void {
    // Cancel any in-progress stroke when switching tools
    if (this.isDrawing) {
      this.cancelStroke();
    }
  }
}
