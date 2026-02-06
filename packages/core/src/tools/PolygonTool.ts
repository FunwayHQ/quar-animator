/**
 * Polygon Tool for Quar Animator
 * Creates regular polygons and star shapes by dragging
 */

import type { CanvasPointerEvent, PolygonNode, Vector2 } from '@quar/types';
import { BaseTool, type ToolContext } from './BaseTool';
import { createDefaultTransform } from '../SceneGraph';

// ============================================================================
// Types
// ============================================================================

export interface PolygonToolOptions {
  /** Number of sides (3-12 for polygons, or points for stars) */
  sides: number;
  /** Inner radius ratio for star shapes (0-1, where 0.5 = typical star) */
  innerRadiusRatio: number;
  /** Whether to create a star shape instead of a regular polygon */
  isStarMode: boolean;
}

// ============================================================================
// PolygonTool Class
// ============================================================================

export class PolygonTool extends BaseTool {
  readonly type = 'polygon' as const;
  readonly cursor = 'crosshair';

  private startPoint: Vector2 | null = null;
  private previewNode: PolygonNode | null = null;

  /** Tool options for polygon configuration */
  private options: PolygonToolOptions = {
    sides: 5,
    innerRadiusRatio: 0.5,
    isStarMode: false,
  };

  constructor(context: ToolContext) {
    super(context);
  }

  // --------------------------------------------------------------------------
  // Options
  // --------------------------------------------------------------------------

  /**
   * Get current tool options
   */
  getOptions(): Readonly<PolygonToolOptions> {
    return { ...this.options };
  }

  /**
   * Set tool options
   */
  setOptions(options: Partial<PolygonToolOptions>): void {
    if (options.sides !== undefined) {
      this.options.sides = Math.max(3, Math.min(12, Math.floor(options.sides)));
    }
    if (options.innerRadiusRatio !== undefined) {
      this.options.innerRadiusRatio = Math.max(0.1, Math.min(0.9, options.innerRadiusRatio));
    }
    if (options.isStarMode !== undefined) {
      this.options.isStarMode = options.isStarMode;
    }
  }

  /**
   * Set number of sides
   */
  setSides(sides: number): void {
    this.setOptions({ sides });
  }

  /**
   * Set inner radius ratio for stars
   */
  setInnerRadiusRatio(ratio: number): void {
    this.setOptions({ innerRadiusRatio: ratio });
  }

  /**
   * Toggle star mode
   */
  setStarMode(isStarMode: boolean): void {
    this.setOptions({ isStarMode });
  }

  // --------------------------------------------------------------------------
  // Pointer Events
  // --------------------------------------------------------------------------

  onPointerDown(event: CanvasPointerEvent): void {
    // Only handle left mouse button
    if (event.button !== 0) return;

    this.state.isDragging = true;
    this.startPoint = { ...event.worldPosition };
    this.state.startWorldPos = { ...event.worldPosition };

    // Create preview node
    this.previewNode = this.createPolygonNode(event.worldPosition.x, event.worldPosition.y, 0);
  }

  onPointerMove(event: CanvasPointerEvent): void {
    if (!this.state.isDragging || !this.startPoint || !this.previewNode) return;

    this.state.currentWorldPos = { ...event.worldPosition };

    // Calculate polygon dimensions
    const polygon = this.getPolygonFromPoints(
      this.startPoint,
      event.worldPosition,
      this.isFromCenter(event)
    );

    // Update preview node
    this.previewNode.transform.position = { x: polygon.cx, y: polygon.cy };
    this.previewNode.radius = polygon.radius;
    if (this.options.isStarMode) {
      this.previewNode.innerRadius = polygon.radius * this.options.innerRadiusRatio;
    }
  }

  onPointerUp(event: CanvasPointerEvent): void {
    if (!this.state.isDragging || !this.startPoint) {
      this.resetState();
      return;
    }

    // Calculate final polygon dimensions
    const polygon = this.getPolygonFromPoints(
      this.startPoint,
      event.worldPosition,
      this.isFromCenter(event)
    );

    // Only create if meets minimum size
    if (polygon.radius >= this.getMinimumSize()) {
      const node = this.createPolygonNode(polygon.cx, polygon.cy, polygon.radius);

      // Add to scene graph
      this.context.sceneGraph.addNode(node);

      // Select the new node
      this.context.setSelectedIds([node.id]);

      // Switch to selection tool
      this.context.setActiveTool('selection');
    }

    // Reset state
    this.previewNode = null;
    this.startPoint = null;
    this.resetState();
  }

  // --------------------------------------------------------------------------
  // Keyboard Events
  // --------------------------------------------------------------------------

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.state.isDragging) {
      // Cancel drawing
      this.previewNode = null;
      this.startPoint = null;
      this.resetState();
    }
  }

  // --------------------------------------------------------------------------
  // Preview
  // --------------------------------------------------------------------------

  getPreviewNode(): PolygonNode | null {
    return this.previewNode;
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  /**
   * Calculate polygon center and radius from two points
   */
  private getPolygonFromPoints(
    start: Vector2,
    end: Vector2,
    fromCenter: boolean
  ): { cx: number; cy: number; radius: number } {
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    if (fromCenter) {
      // Draw from center - radius is distance from start to end
      const radius = Math.sqrt(dx * dx + dy * dy);
      return {
        cx: start.x,
        cy: start.y,
        radius,
      };
    }

    // Draw from corner - polygon inscribed in bounding box
    const width = Math.abs(dx);
    const height = Math.abs(dy);
    const radius = Math.min(width, height) / 2;

    // Center of bounding box
    const cx = start.x + dx / 2;
    const cy = start.y + dy / 2;

    return { cx, cy, radius };
  }

  /**
   * Create a polygon node with current options
   */
  private createPolygonNode(cx: number, cy: number, radius: number): PolygonNode {
    const transform = createDefaultTransform();
    transform.position = { x: cx, y: cy };
    transform.anchor = { x: 0.5, y: 0.5 };

    const node: PolygonNode = {
      id: this.context.generateId(),
      name: this.options.isStarMode ? 'Star' : 'Polygon',
      type: 'polygon',
      parent: null,
      children: [],
      transform,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      sides: this.options.sides,
      radius,
      fill: this.context.defaultFill,
      stroke: this.context.defaultStroke,
    };

    // Add inner radius for star shapes
    if (this.options.isStarMode) {
      node.innerRadius = radius * this.options.innerRadiusRatio;
    }

    return node;
  }
}
