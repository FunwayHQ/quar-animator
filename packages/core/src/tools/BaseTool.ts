/**
 * Base Tool for Quar Animator
 * Abstract base class for all drawing/editing tools
 */

import type { ToolType, CanvasPointerEvent, Node, Fill, Stroke, Vector2 } from '@quar/types';
import type { SceneGraph } from '../SceneGraph';
import type { Camera } from '../Camera';

// ============================================================================
// Types
// ============================================================================

export interface ToolContext {
  sceneGraph: SceneGraph;
  camera: Camera;
  getSelectedIds: () => Set<string>;
  setSelectedIds: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  clearSelection: () => void;
  defaultFill: Fill;
  defaultStroke: Stroke;
  generateId: () => string;
  setActiveTool: (tool: ToolType) => void;
}

export interface ToolState {
  isActive: boolean;
  isDragging: boolean;
  startWorldPos: Vector2 | null;
  currentWorldPos: Vector2 | null;
}

// ============================================================================
// BaseTool Abstract Class
// ============================================================================

export abstract class BaseTool {
  /** The tool type identifier */
  abstract readonly type: ToolType;

  /** CSS cursor to display when this tool is active */
  abstract readonly cursor: string;

  /** Tool context providing access to scene, camera, and selection */
  protected context: ToolContext;

  /** Current tool state */
  protected state: ToolState = {
    isActive: false,
    isDragging: false,
    startWorldPos: null,
    currentWorldPos: null,
  };

  constructor(context: ToolContext) {
    this.context = context;
  }

  // --------------------------------------------------------------------------
  // Abstract Methods - Must be implemented by subclasses
  // --------------------------------------------------------------------------

  /**
   * Called when the user presses the mouse button
   */
  abstract onPointerDown(event: CanvasPointerEvent): void;

  /**
   * Called when the user moves the mouse
   */
  abstract onPointerMove(event: CanvasPointerEvent): void;

  /**
   * Called when the user releases the mouse button
   */
  abstract onPointerUp(event: CanvasPointerEvent): void;

  // --------------------------------------------------------------------------
  // Optional Methods - Can be overridden by subclasses
  // --------------------------------------------------------------------------

  /**
   * Called when a key is pressed while this tool is active
   */
  onKeyDown?(event: KeyboardEvent): void;

  /**
   * Called when a key is released while this tool is active
   */
  onKeyUp?(event: KeyboardEvent): void;

  /**
   * Called when this tool becomes active
   */
  onActivate?(): void;

  /**
   * Called when this tool becomes inactive
   */
  onDeactivate?(): void;

  /**
   * Get preview node(s) to render while dragging
   * Returns null when not showing preview
   */
  getPreviewNode?(): Node | null;

  // --------------------------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------------------------

  /**
   * Check if shift key is held for constrained drawing
   */
  protected isConstrained(event: CanvasPointerEvent): boolean {
    return event.shiftKey;
  }

  /**
   * Check if alt key is held for center-origin drawing
   */
  protected isFromCenter(event: CanvasPointerEvent): boolean {
    return event.altKey;
  }

  /**
   * Check if ctrl/cmd key is held for adding to selection
   */
  protected isAdditive(event: CanvasPointerEvent): boolean {
    return event.ctrlKey || event.metaKey;
  }

  /**
   * Calculate constrained dimensions (square/circle)
   */
  protected constrainToSquare(width: number, height: number): { width: number; height: number } {
    const size = Math.max(Math.abs(width), Math.abs(height));
    return {
      width: Math.sign(width) * size || size,
      height: Math.sign(height) * size || size,
    };
  }

  /**
   * Calculate rectangle from two corner points
   */
  protected getRectFromPoints(
    start: Vector2,
    end: Vector2,
    constrained: boolean,
    fromCenter: boolean
  ): { x: number; y: number; width: number; height: number } {
    let width = end.x - start.x;
    let height = end.y - start.y;

    if (constrained) {
      const constrained = this.constrainToSquare(width, height);
      width = constrained.width;
      height = constrained.height;
    }

    if (fromCenter) {
      return {
        x: start.x - width,
        y: start.y - height,
        width: width * 2,
        height: height * 2,
      };
    }

    // Normalize to positive width/height
    let x = start.x;
    let y = start.y;

    if (width < 0) {
      x = start.x + width;
      width = -width;
    }
    if (height < 0) {
      y = start.y + height;
      height = -height;
    }

    return { x, y, width, height };
  }

  /**
   * Get minimum size for shape creation
   */
  protected getMinimumSize(): number {
    return 1; // 1 world unit minimum
  }

  /**
   * Reset tool state
   */
  protected resetState(): void {
    this.state = {
      isActive: false,
      isDragging: false,
      startWorldPos: null,
      currentWorldPos: null,
    };
  }
}
