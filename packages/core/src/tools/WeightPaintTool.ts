/**
 * Weight Paint Tool for Quar Animator
 * Brush-based weight painting for mesh-to-bone binding
 */

import type { CanvasPointerEvent, ToolType, Node, SkinData, SkinnableNode } from '@quar/types';
import { BaseTool } from './BaseTool';
import { paintWeight } from '@quar/rigging';

/** Type guard for nodes that can have skinData */
function isSkinnableNode(node: Node): node is SkinnableNode {
  return (
    node.type === 'rectangle' ||
    node.type === 'ellipse' ||
    node.type === 'polygon' ||
    node.type === 'path'
  );
}

/** Get skinData from a node if present */
function getSkinData(node: Node): SkinData | undefined {
  if (isSkinnableNode(node)) {
    return node.skinData;
  }
  return undefined;
}

export class WeightPaintTool extends BaseTool {
  readonly type: ToolType = 'weight-paint';
  readonly cursor = 'crosshair';

  /** The bone currently being painted */
  private activeBoneId: string | null = null;

  /** Brush radius in world units */
  private brushRadius = 30;

  /** Brush strength per stroke (0..1) */
  private brushStrength = 0.3;

  /** Paint mode */
  private paintMode: 'add' | 'subtract' = 'add';

  /** Is currently painting */
  private isPainting = false;

  /** Has undo been pushed for current stroke */
  private undoPushed = false;

  /** The bound node being painted on */
  private boundNodeId: string | null = null;

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  getActiveBoneId(): string | null {
    return this.activeBoneId;
  }

  setActiveBoneId(id: string | null): void {
    this.activeBoneId = id;
  }

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

  getPaintMode(): 'add' | 'subtract' {
    return this.paintMode;
  }

  setPaintMode(mode: 'add' | 'subtract'): void {
    this.paintMode = mode;
  }

  togglePaintMode(): void {
    this.paintMode = this.paintMode === 'add' ? 'subtract' : 'add';
  }

  getBoundNodeId(): string | null {
    return this.boundNodeId;
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  onActivate(): void {
    // Find a bound node from selection
    const selectedIds = this.context.getSelectedIds();
    let foundBound = false;

    for (const id of selectedIds) {
      const node = this.context.sceneGraph.getNode(id);
      if (node) {
        const skin = getSkinData(node);
        if (skin) {
          this.boundNodeId = id;
          foundBound = true;
          break;
        }
      }
    }

    if (!foundBound) {
      // No bound node in selection — switch back to selection tool
      this.boundNodeId = null;
      this.context.setActiveTool('selection');
      return;
    }

    // Find a bone to paint with
    if (!this.activeBoneId && this.boundNodeId) {
      const node = this.context.sceneGraph.getNode(this.boundNodeId);
      if (node) {
        const skin = getSkinData(node);
        if (skin) {
          const boneIds = Object.keys(skin.inverseBindMatrices);
          if (boneIds.length > 0) {
            this.activeBoneId = boneIds[0]!;
          }
        }
      }
    }

    if (!this.activeBoneId) {
      this.boundNodeId = null;
      this.context.setActiveTool('selection');
      return;
    }
  }

  onDeactivate(): void {
    this.isPainting = false;
    this.undoPushed = false;
  }

  // --------------------------------------------------------------------------
  // Pointer Events
  // --------------------------------------------------------------------------

  onPointerDown(event: CanvasPointerEvent): void {
    if (event.button !== 0) return;
    if (!this.boundNodeId || !this.activeBoneId) return;

    const node = this.context.sceneGraph.getNode(this.boundNodeId);
    if (!node || !getSkinData(node)) return;

    this.isPainting = true;
    this.state.isDragging = true;

    // Push undo once at stroke start
    if (!this.undoPushed) {
      this.context.onTransformStart?.();
      this.undoPushed = true;
    }

    // Paint at current position
    this.paintAtWorldPosition(event.worldPosition.x, event.worldPosition.y);
  }

  onPointerMove(event: CanvasPointerEvent): void {
    if (!this.isPainting) return;
    if (!this.boundNodeId || !this.activeBoneId) return;

    this.paintAtWorldPosition(event.worldPosition.x, event.worldPosition.y);
  }

  onPointerUp(_event: CanvasPointerEvent): void {
    if (!this.isPainting) return;

    this.isPainting = false;
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
      case 'x':
      case 'X':
        this.togglePaintMode();
        break;
    }
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  /**
   * Paint weights on vertices within brush radius of the given world position.
   * Uses the node's world transform to convert local tessellation vertices to world space.
   */
  private paintAtWorldPosition(worldX: number, worldY: number): void {
    if (!this.boundNodeId || !this.activeBoneId) return;

    const node = this.context.sceneGraph.getNode(this.boundNodeId);
    if (!node) return;

    const skinData = getSkinData(node);
    if (!skinData?.vertices) return;

    // Get tessellated vertex positions from the geometry cache via the context
    const vertexPositions = this.context.getTessellatedVertices?.(this.boundNodeId);
    if (vertexPositions && vertexPositions.length >= 2) {
      // Use spatial brush with falloff
      this.paintAtPositionWithVertices(worldX, worldY, vertexPositions);
    } else {
      // Fallback: paint all vertices (no spatial filtering)
      const vertexCount = skinData.vertexCount;
      let modified = false;
      for (let i = 0; i < vertexCount; i++) {
        paintWeight(skinData, i, this.activeBoneId, this.brushStrength, this.paintMode);
        modified = true;
      }
      if (modified) {
        this.context.sceneGraph.updateNode(this.boundNodeId, {
          skinData: { ...skinData },
        } as Partial<Node>);
      }
    }
  }

  /**
   * Paint weights using provided vertex world positions.
   * Called by the UI layer which has access to tessellation data.
   */
  paintAtPositionWithVertices(
    worldX: number,
    worldY: number,
    vertexWorldPositions: Float32Array
  ): void {
    if (!this.boundNodeId || !this.activeBoneId) return;

    const node = this.context.sceneGraph.getNode(this.boundNodeId);
    if (!node) return;

    const skinData = getSkinData(node);
    if (!skinData) return;

    const radiusSq = this.brushRadius * this.brushRadius;
    let modified = false;

    const numVertices = Math.min(vertexWorldPositions.length / 2, skinData.vertices.length);
    for (let i = 0; i < numVertices; i++) {
      const vx = vertexWorldPositions[i * 2]!;
      const vy = vertexWorldPositions[i * 2 + 1]!;
      const dx = vx - worldX;
      const dy = vy - worldY;
      const distSq = dx * dx + dy * dy;

      if (distSq <= radiusSq) {
        // Falloff based on distance
        const dist = Math.sqrt(distSq);
        const falloff = 1.0 - dist / this.brushRadius;
        const strength = this.brushStrength * falloff;
        paintWeight(skinData, i, this.activeBoneId, strength, this.paintMode);
        modified = true;
      }
    }

    if (modified) {
      this.context.sceneGraph.updateNode(this.boundNodeId, {
        skinData: { ...skinData },
      } as Partial<Node>);
    }
  }
}
