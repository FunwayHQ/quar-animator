/**
 * Point Magnet Tool for Quar Animator
 * Brush-based vertex displacement for sculpting morph target offsets.
 * Active only during Smart Bone recording mode.
 */

import type { CanvasPointerEvent, ToolType, Node, SkinnableNode } from '@quar/types';
import { BaseTool } from './BaseTool';
import { applyBrushDisplacement, type FalloffType } from '@quar/rigging';
import type { MorphVertexOffset } from '@quar/types';

/** Type guard for nodes that can have skinData */
function isSkinnableNode(node: Node): node is SkinnableNode {
  return (
    node.type === 'rectangle' ||
    node.type === 'ellipse' ||
    node.type === 'polygon' ||
    node.type === 'path' ||
    node.type === 'image'
  );
}

export class PointMagnetTool extends BaseTool {
  readonly type: ToolType = 'point-magnet';
  readonly cursor = 'crosshair';

  /** Brush radius in world units */
  private brushRadius = 30;

  /** Brush strength (0..1) */
  private brushStrength = 0.5;

  /** Falloff type */
  private falloff: FalloffType = 'smooth';

  /** Is currently sculpting */
  private isSculpting = false;

  /** Has undo been pushed for current stroke */
  private undoPushed = false;

  /** Current morph offsets being edited (nodeId → offsets) */
  private workingOffsets: Map<string, MorphVertexOffset[]> = new Map();

  /** Last pointer position for computing drag delta */
  private lastWorldX = 0;
  private lastWorldY = 0;

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  getBrushRadius(): number {
    return this.brushRadius;
  }

  setBrushRadius(radius: number): void {
    this.brushRadius = Math.max(5, Math.min(200, radius));
  }

  getBrushStrength(): number {
    return this.brushStrength;
  }

  setBrushStrength(strength: number): void {
    this.brushStrength = Math.max(0.01, Math.min(1.0, strength));
  }

  getFalloff(): FalloffType {
    return this.falloff;
  }

  setFalloff(falloff: FalloffType): void {
    this.falloff = falloff;
  }

  getWorkingOffsets(): Map<string, MorphVertexOffset[]> {
    return this.workingOffsets;
  }

  setWorkingOffsets(offsets: Map<string, MorphVertexOffset[]>): void {
    this.workingOffsets = new Map(offsets);
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  onActivate(): void {
    this.isSculpting = false;
    this.undoPushed = false;
  }

  onDeactivate(): void {
    this.isSculpting = false;
    this.undoPushed = false;
  }

  // --------------------------------------------------------------------------
  // Pointer Events
  // --------------------------------------------------------------------------

  onPointerDown(event: CanvasPointerEvent): void {
    if (event.button !== 0) return;

    this.isSculpting = true;
    this.state.isDragging = true;
    this.lastWorldX = event.worldPosition.x;
    this.lastWorldY = event.worldPosition.y;

    // Push undo once at stroke start
    if (!this.undoPushed) {
      this.context.onTransformStart?.();
      this.undoPushed = true;
    }
  }

  onPointerMove(event: CanvasPointerEvent): void {
    if (!this.isSculpting) return;

    // Compute drag delta direction
    const dx = event.worldPosition.x - this.lastWorldX;
    const dy = event.worldPosition.y - this.lastWorldY;

    // Skip if no movement
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return;

    // Displace vertices in all skinned nodes near brush center
    this.displaceVertices(event.worldPosition.x, event.worldPosition.y, dx, dy);

    this.lastWorldX = event.worldPosition.x;
    this.lastWorldY = event.worldPosition.y;
  }

  onPointerUp(_event: CanvasPointerEvent): void {
    if (!this.isSculpting) return;

    this.isSculpting = false;
    this.state.isDragging = false;
    this.undoPushed = false;
  }

  // --------------------------------------------------------------------------
  // Keyboard
  // --------------------------------------------------------------------------

  onKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case '[':
        this.setBrushRadius(this.brushRadius - 5);
        break;
      case ']':
        this.setBrushRadius(this.brushRadius + 5);
        break;
      case 'f':
      case 'F':
        // Cycle falloff: smooth → linear → constant → smooth
        if (this.falloff === 'smooth') this.falloff = 'linear';
        else if (this.falloff === 'linear') this.falloff = 'constant';
        else this.falloff = 'smooth';
        break;
      case 'Escape':
        // Discard working offsets
        this.workingOffsets.clear();
        break;
    }
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  /**
   * Displace vertices within brush radius for all skinned nodes.
   * Updates workingOffsets in place.
   */
  private displaceVertices(worldX: number, worldY: number, dirX: number, dirY: number): void {
    // Iterate over skinned nodes in the scene
    const sg = this.context.sceneGraph;
    sg.traverse((node: Node) => {
      if (!isSkinnableNode(node) || !node.skinData) return;

      const vertexPositions = this.context.getTessellatedVertices?.(node.id);
      if (!vertexPositions || vertexPositions.length < 2) return;

      const currentOffsets = this.workingOffsets.get(node.id) ?? [];
      const newOffsets = applyBrushDisplacement(
        currentOffsets,
        worldX,
        worldY,
        this.brushRadius,
        this.brushStrength,
        dirX,
        dirY,
        this.falloff,
        vertexPositions
      );

      if (newOffsets.length > 0) {
        this.workingOffsets.set(node.id, newOffsets);
      }
    });
  }
}
