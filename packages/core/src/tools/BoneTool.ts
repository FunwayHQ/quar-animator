/**
 * Bone Tool for Quar Animator
 * Creates bone chains by click-dragging
 */

import type { CanvasPointerEvent, BoneNode, Vector2 } from '@quar/types';
import { BaseTool, type ToolContext } from './BaseTool';

// Minimum drag distance (pixels) to create a bone
const MIN_BONE_LENGTH = 5;

// Screen distance to snap to an existing bone tip
const SNAP_DISTANCE = 8;

export class BoneTool extends BaseTool {
  readonly type = 'bone' as const;
  readonly cursor = 'crosshair';

  private startPoint: Vector2 | null = null;
  private previewNode: BoneNode | null = null;
  private lastCreatedBoneId: string | null = null;
  private boneCounter = 0;
  private chainParentId: string | null = null;

  constructor(context: ToolContext) {
    super(context);
  }

  // --------------------------------------------------------------------------
  // Pointer Events
  // --------------------------------------------------------------------------

  onPointerDown(event: CanvasPointerEvent): void {
    if (event.button !== 0) return;

    this.state.isDragging = true;
    this.startPoint = { ...event.worldPosition };
    this.state.startWorldPos = { ...event.worldPosition };

    // Check if clicking near an existing bone tip to start a chain from it
    const nearBone = this.findNearestBoneTip(event);
    if (nearBone) {
      this.chainParentId = nearBone.id;
      this.startPoint = nearBone.tipWorld;
    } else if (this.lastCreatedBoneId) {
      // Auto-chain: continue from last created bone
      this.chainParentId = this.lastCreatedBoneId;
      const lastBone = this.context.sceneGraph.getNode(this.lastCreatedBoneId);
      if (lastBone && lastBone.type === 'bone') {
        const tipWorld = this.getBoneWorldTip(lastBone as BoneNode);
        if (tipWorld) {
          this.startPoint = tipWorld;
        }
      }
    }

    // Create preview (does not increment bone counter)
    this.previewNode = {
      id: '__preview__',
      name: 'Preview',
      type: 'bone',
      parent: null,
      children: [],
      transform: {
        position: { x: this.startPoint.x, y: this.startPoint.y },
        rotation: 0,
        scale: { x: 1, y: 1 },
        anchor: { x: 0, y: 0 },
        skew: { x: 0, y: 0 },
      },
      visible: true,
      locked: false,
      opacity: 0.5,
      blendMode: 'normal',
      length: 0,
      boneStyle: 'octahedral',
      boneColor: '#E0E0E0',
    };
  }

  onPointerMove(event: CanvasPointerEvent): void {
    if (!this.state.isDragging || !this.startPoint || !this.previewNode) return;

    this.state.currentWorldPos = { ...event.worldPosition };

    const dx = event.worldPosition.x - this.startPoint.x;
    const dy = event.worldPosition.y - this.startPoint.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const rotation = Math.atan2(dy, dx) * (180 / Math.PI);

    this.previewNode.transform.position = { ...this.startPoint };
    this.previewNode.length = length;
    this.previewNode.transform.rotation = rotation;
  }

  onPointerUp(event: CanvasPointerEvent): void {
    if (!this.state.isDragging || !this.startPoint) {
      this.previewNode = null;
      this.startPoint = null;
      this.resetState();
      return;
    }

    const dx = event.worldPosition.x - this.startPoint.x;
    const dy = event.worldPosition.y - this.startPoint.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length >= MIN_BONE_LENGTH) {
      const rotation = Math.atan2(dy, dx) * (180 / Math.PI);

      // Undo snapshot
      this.context.onTransformStart?.();

      if (this.chainParentId) {
        // Chaining to a parent bone
        const parentBone = this.context.sceneGraph.getNode(this.chainParentId);
        if (parentBone && parentBone.type === 'bone') {
          const parent = parentBone as BoneNode;
          // Compute child rotation relative to parent's world rotation
          const parentWorldRot = this.getWorldRotation(this.chainParentId);
          const relativeRotation = rotation - parentWorldRot;

          const node = this.createBoneNode(
            parent.length, // Position at parent's tip in local space
            0,
            relativeRotation,
            length
          );

          this.context.sceneGraph.addNode(node);
          this.context.sceneGraph.moveNode(node.id, this.chainParentId);
          this.context.setSelectedIds([node.id]);
          this.lastCreatedBoneId = node.id;
        } else {
          // Parent disappeared, create standalone
          this.createStandaloneBone(length, rotation);
        }
      } else {
        // Create standalone bone
        this.createStandaloneBone(length, rotation);
      }

      // Notify completion
      if (this.lastCreatedBoneId) {
        this.context.onTransformComplete?.(new Set([this.lastCreatedBoneId]), 'move');
      }
    }

    this.previewNode = null;
    this.startPoint = null;
    this.state.isDragging = false;
    // Keep chainParentId for next click (auto-chain continues)
  }

  // --------------------------------------------------------------------------
  // Keyboard Events
  // --------------------------------------------------------------------------

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.state.isDragging) {
        // Cancel current drag
        this.previewNode = null;
        this.startPoint = null;
        this.resetState();
      }
      // Finish chain, switch to selection
      this.lastCreatedBoneId = null;
      this.chainParentId = null;
      this.context.setActiveTool('selection');
    }
  }

  // --------------------------------------------------------------------------
  // Preview
  // --------------------------------------------------------------------------

  getPreviewNode(): BoneNode | null {
    return this.previewNode;
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  onActivate(): void {
    this.lastCreatedBoneId = null;
    this.chainParentId = null;
    this.boneCounter = 0;
  }

  onDeactivate(): void {
    this.lastCreatedBoneId = null;
    this.chainParentId = null;
    this.previewNode = null;
    this.startPoint = null;
    this.resetState();
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private createStandaloneBone(length: number, rotation: number): void {
    const node = this.createBoneNode(this.startPoint!.x, this.startPoint!.y, rotation, length);
    this.context.sceneGraph.addNode(node);
    this.context.setSelectedIds([node.id]);
    this.lastCreatedBoneId = node.id;
  }

  private createBoneNode(x: number, y: number, rotation: number, length: number): BoneNode {
    this.boneCounter++;
    return {
      id: this.context.generateId(),
      name: `Bone ${this.boneCounter}`,
      type: 'bone',
      parent: null,
      children: [],
      transform: {
        position: { x, y },
        rotation,
        scale: { x: 1, y: 1 },
        anchor: { x: 0, y: 0 }, // Bones pivot at root joint
        skew: { x: 0, y: 0 },
      },
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      length,
      boneStyle: 'octahedral',
      boneColor: '#E0E0E0',
    };
  }

  private findNearestBoneTip(event: CanvasPointerEvent): { id: string; tipWorld: Vector2 } | null {
    const nodes = this.context.sceneGraph.getRootNodes();
    let nearest: { id: string; tipWorld: Vector2; dist: number } | null = null;

    const checkBone = (node: import('@quar/types').Node) => {
      if (node.type !== 'bone') return;
      const bone = node as BoneNode;
      const tipWorld = this.getBoneWorldTip(bone);
      if (!tipWorld) return;

      // Convert tip to screen space for distance check
      const tipScreen = this.context.camera.worldToScreen(tipWorld.x, tipWorld.y);
      const dx = tipScreen.x - event.screenPosition.x;
      const dy = tipScreen.y - event.screenPosition.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < SNAP_DISTANCE && (!nearest || dist < nearest.dist)) {
        nearest = { id: bone.id, tipWorld, dist };
      }

      // Check children
      for (const childId of bone.children) {
        const child = this.context.sceneGraph.getNode(childId);
        if (child) checkBone(child);
      }
    };

    for (const node of nodes) {
      checkBone(node);
    }

    return nearest;
  }

  private getBoneWorldTip(bone: BoneNode): Vector2 | null {
    const worldTransform = this.context.sceneGraph.getWorldTransform(bone.id);
    const tipX = bone.length;
    const wx = worldTransform.a * tipX + worldTransform.tx;
    const wy = worldTransform.b * tipX + worldTransform.ty;
    return { x: wx, y: wy };
  }

  private getWorldRotation(boneId: string): number {
    const worldTransform = this.context.sceneGraph.getWorldTransform(boneId);
    return Math.atan2(worldTransform.b, worldTransform.a) * (180 / Math.PI);
  }
}
