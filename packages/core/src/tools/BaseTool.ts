/**
 * Base Tool for Quar Animator
 * Abstract base class for all drawing/editing tools
 */

import type {
  ToolType,
  CanvasPointerEvent,
  Node,
  Fill,
  Stroke,
  Vector2,
  SymbolDefinition,
  PathNode,
  PathPoint,
} from '@quar/types';
import type { SceneGraph } from '../SceneGraph';
import type { Camera } from '../Camera';
import type { SmartGuide } from './smartGuides';
import { SelectionManager } from '../selection';
import { mat3 } from '../math';

// ============================================================================
// Types
// ============================================================================

export type TransformType = 'move' | 'resize' | 'rotate' | 'vertex-move';

/**
 * Points added to or taken from a path, by flat index (all contours in
 * order), so its per-point keyframes can be kept on their points.
 */
export type PathPointsChange =
  /** A point split into the segment that starts at segmentIndex, t along it */
  | { kind: 'insert'; segmentIndex: number; t: number }
  /** These points deleted (contours left empty go too) */
  | { kind: 'delete'; indices: number[] }
  /** An open path continued from one end (its main contour): these points added there */
  | { kind: 'extend'; at: 'start' | 'end'; points: PathPoint[] };

export interface ToolContext {
  sceneGraph: SceneGraph;
  camera: Camera;
  getSelectedIds: () => Set<string>;
  setSelectedIds: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  clearSelection: () => void;
  defaultFill: Fill;
  defaultStroke: Stroke;
  /** The default stroke, in a color that shows against what's behind `point` */
  strokeAt?: (point: Vector2) => Stroke;
  generateId: () => string;
  setActiveTool: (tool: ToolType) => void;
  onTransformStart?: () => void;
  onTransformComplete?: (nodeIds: Set<string>, type: TransformType) => void;
  /** A path gained or lost points; `before` is the path as it was. */
  onPathPointsChange?: (nodeId: string, before: PathNode, change: PathPointsChange) => void;
  getSnapToGrid?: () => boolean;
  getGridSize?: () => number;
  getEnteredGroupId?: () => string | null;
  setEnteredGroupId?: (id: string | null) => void;
  onEnterTextEdit?: (nodeId: string) => void;
  getTessellatedVertices?: (nodeId: string) => Float32Array | null;
  /** A bound node's vertices as its bones pose them, in world space */
  getDeformedVertices?: (nodeId: string) => Float32Array | null;
  /** Layers not shown on the canvas for now (bones outside their Vitruvian group) */
  isHiddenOnCanvas?: (nodeId: string) => boolean;
  /** A bound node's per-vertex skinning, bind-space offset → world ([a, b, c, d] each) */
  getVertexSkinMatrices?: (nodeId: string) => Float32Array | null;
  convertShapeToPath?: (nodeId: string) => string | null;
  getGuides?: () => { id: string; axis: 'x' | 'y'; position: number }[];
  getSnapToGuides?: () => boolean;
  getSymbolDefinitions?: () => SymbolDefinition[];
  onSmartGuidesChange?: (guides: SmartGuide[]) => void;
  /**
   * Move a node to another parent without it moving on screen (its transform
   * and keyframes are re-expressed in the new parent's space).
   */
  moveNodeKeepingPlacement?: (id: string, parentId: string | null, index?: number) => void;
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
   * Whether this tool uses the key itself while active. A tool shortcut on
   * the same key (F, say) then steps aside and the key goes to the tool.
   */
  consumesKey?(event: KeyboardEvent): boolean;

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
      // Normalize to positive extents so up/left drags still produce a valid
      // rect (the geometric center stays at `start`).
      const aw = Math.abs(width);
      const ah = Math.abs(height);
      return {
        x: start.x - aw,
        y: start.y - ah,
        width: aw * 2,
        height: ah * 2,
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
  /**
   * Add a layer the tool drew: into the topmost artboard it's drawn on (its
   * position on the artboard), keeping its place on screen, as a layer drawn
   * on a frame goes into it — else on the page, on top.
   */
  protected addDrawnNode(node: Node): void {
    const sceneGraph = this.context.sceneGraph;
    sceneGraph.addNode(node);
    const artboard = artboardAt(sceneGraph, node.transform.position);
    if (artboard) this.context.moveNodeKeepingPlacement?.(node.id, artboard.id);
  }

  protected resetState(): void {
    this.state = {
      isActive: false,
      isDragging: false,
      startWorldPos: null,
      currentWorldPos: null,
    };
  }
}

/** The topmost visible artboard at `point` (on the page, in world space), if any. */
export function artboardAt(sceneGraph: SceneGraph, point: Vector2): Node | undefined {
  const bounds = new SelectionManager();
  return [...sceneGraph.getRootNodes()].reverse().find((node) => {
    if (node.type !== 'artboard' || !node.visible) return false;
    const rect = bounds.getSelectionBounds(new Set([node.id]), sceneGraph)?.rect;
    return (
      rect !== undefined &&
      point.x >= rect.x &&
      point.y >= rect.y &&
      point.x <= rect.x + rect.width &&
      point.y <= rect.y + rect.height
    );
  });
}

/**
 * The artboard whose name label (drawn above its top-left corner) is at a
 * screen point, nearest first. Artboards are picked by their label, like
 * frames in Figma, so a click inside one picks what's on it.
 */
export function artboardLabelAt(
  sceneGraph: SceneGraph,
  camera: Camera,
  screenPoint: Vector2
): Node | null {
  const candidates: Array<{ node: Node; distance: number }> = [];

  sceneGraph.traverseVisible((node) => {
    if (node.type !== 'artboard' || node.locked) return;

    const worldTransform = sceneGraph.getWorldTransform(node.id);
    const localTopLeft = {
      x: -node.width * node.transform.anchor.x,
      y: node.height * (1 - node.transform.anchor.y),
    };
    const worldTopLeft = mat3.transformPoint(worldTransform, localTopLeft);
    const screenTopLeft = camera.worldToScreen(worldTopLeft);
    const distance = Math.hypot(screenPoint.x - screenTopLeft.x, screenPoint.y - screenTopLeft.y);
    const dimensionsLabel = `${Math.round(node.width)} x ${Math.round(node.height)}`;
    // Match the visible artboard title above the frame, keeping its hit area
    // screen-sized just like the overlay text at every canvas zoom level.
    const labelWidth = Math.max(32, node.name.length * 6.5 + dimensionsLabel.length * 5.5 + 6);
    const isInCornerLabel =
      screenPoint.x >= screenTopLeft.x - 6 &&
      screenPoint.x <= screenTopLeft.x + labelWidth &&
      screenPoint.y >= screenTopLeft.y - 20 &&
      screenPoint.y <= screenTopLeft.y + 4;

    if (isInCornerLabel) candidates.push({ node, distance });
  });

  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.node ?? null;
}
