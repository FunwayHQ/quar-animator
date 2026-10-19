/**
 * Weight Paint Tool for Quar Animator
 * Brush-based weight painting for mesh-to-bone binding
 */

import type { CanvasPointerEvent, ToolType, Node, SkinData } from '@quar/types';
import { BaseTool } from './BaseTool';
import { fitSkinToVertices, paintWeight } from '@quar/rigging';

/** A node's skin binding, if it has one (shapes and images can be bound) */
function getSkinData(node: Node): SkinData | undefined {
  return 'skinData' in node ? ((node as { skinData?: SkinData }).skinData ?? undefined) : undefined;
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

  /** The bound layers being painted on: the selection's, groups included */
  private boundNodeIds: string[] = [];

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
    return this.boundNodeIds[0] ?? null;
  }

  getBoundNodeIds(): string[] {
    return [...this.boundNodeIds];
  }

  /** The bones the bound layers are bound to, in binding order. */
  getPaintableBoneIds(): string[] {
    const boneIds = new Set<string>();
    for (const id of this.boundNodeIds) {
      const node = this.context.sceneGraph.getNode(id);
      const skin = node ? getSkinData(node) : undefined;
      for (const boneId of Object.keys(skin?.inverseBindMatrices ?? {})) boneIds.add(boneId);
    }
    return [...boneIds];
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  onActivate(): void {
    // The bound layers in the selection, and inside selected groups
    const found = new Set<string>();
    const collect = (id: string) => {
      const node = this.context.sceneGraph.getNode(id);
      if (!node || found.has(id)) return;
      if (getSkinData(node)) found.add(id);
      for (const childId of node.children) collect(childId);
    };
    for (const id of this.context.getSelectedIds()) collect(id);
    this.boundNodeIds = [...found];

    // Keep the bone being painted if these layers are bound to it
    const boneIds = this.getPaintableBoneIds();
    if (!this.activeBoneId || !boneIds.includes(this.activeBoneId)) {
      this.activeBoneId = boneIds[0] ?? null;
    }

    if (this.boundNodeIds.length === 0 || !this.activeBoneId) {
      // Nothing bound to paint — back to the selection tool
      this.boundNodeIds = [];
      this.context.setActiveTool('selection');
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
    if (this.boundNodeIds.length === 0 || !this.activeBoneId) return;

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
    if (!this.activeBoneId) return;

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
   * Paint weights on the vertices within the brush, on every bound layer.
   * The brush meets the mesh where the bones have posed it.
   */
  private paintAtWorldPosition(worldX: number, worldY: number): void {
    if (!this.activeBoneId) return;
    for (const nodeId of this.boundNodeIds) {
      const node = this.context.sceneGraph.getNode(nodeId);
      const skinData = node ? getSkinData(node) : undefined;
      if (!skinData) continue;
      // Bones this layer isn't bound to can't take its weight
      if (!skinData.inverseBindMatrices[this.activeBoneId]) continue;

      const localVertices = this.context.getTessellatedVertices?.(nodeId);
      if (!localVertices || localVertices.length < 2) continue;
      // Weights for the shape as it is now, if it was edited since it was bound
      const fitted = fitSkinToVertices(skinData, localVertices);
      if (fitted !== skinData) {
        this.context.sceneGraph.updateNode(nodeId, { skinData: fitted } as Partial<Node>);
      }

      const posed = this.context.getDeformedVertices?.(nodeId);
      const worldVertices =
        posed && posed.length === localVertices.length
          ? posed
          : this.restWorldVertices(nodeId, localVertices);
      this.paintAtPositionWithVertices(worldX, worldY, worldVertices, nodeId);
    }
  }

  /** A layer's vertices where they'd be unposed, in world space. */
  private restWorldVertices(nodeId: string, localVertices: Float32Array): Float32Array {
    const m = this.context.sceneGraph.getWorldTransform(nodeId);
    const world = new Float32Array(localVertices.length);
    for (let i = 0; i < localVertices.length; i += 2) {
      const lx = localVertices[i]!;
      const ly = localVertices[i + 1]!;
      world[i] = m.a * lx + m.c * ly + m.tx;
      world[i + 1] = m.b * lx + m.d * ly + m.ty;
    }
    return world;
  }

  /**
   * Paint weights using provided vertex world positions (of the first bound
   * layer unless another is named).
   */
  paintAtPositionWithVertices(
    worldX: number,
    worldY: number,
    vertexWorldPositions: Float32Array,
    nodeId: string | null = this.getBoundNodeId()
  ): void {
    if (!nodeId || !this.activeBoneId) return;

    const node = this.context.sceneGraph.getNode(nodeId);
    const bound = node ? getSkinData(node) : undefined;
    if (!bound) return;

    const radiusSq = this.brushRadius * this.brushRadius;
    // Painted on a copy: the layer's binding (and undo's copy of it) stay as they were
    const skinData: SkinData = { ...bound, vertices: [...bound.vertices] };
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
      this.context.sceneGraph.updateNode(nodeId, { skinData } as Partial<Node>);
    }
  }
}
