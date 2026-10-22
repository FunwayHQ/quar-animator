/**
 * Bone Tool for Quar Animator
 * Creates bone chains by click-dragging
 */

import type { CanvasPointerEvent, BoneNode, Vector2 } from '@quar/types';
import { BaseTool, type ToolContext } from './BaseTool';
import { mat3 } from '../math';

// Minimum drag distance (screen pixels) to create a bone
const MIN_BONE_LENGTH = 5;

// Screen distance to snap to an existing bone tip
const SNAP_DISTANCE = 8;

export class BoneTool extends BaseTool {
  readonly type = 'bone' as const;
  readonly cursor = 'crosshair';

  private startPoint: Vector2 | null = null;
  private previewNode: BoneNode | null = null;
  private lastCreatedBoneId: string | null = null;
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
    // Each bone finds its own parent (a click on a tip used to leave it set)
    this.chainParentId = null;

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
        const tipWorld = this.getBoneWorldTip(lastBone);
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

    // The minimum is on screen, so a short drag zoomed in still makes a bone
    // and a click zoomed out doesn't
    if (length >= MIN_BONE_LENGTH / this.context.camera.zoom) {
      const rotation = Math.atan2(dy, dx) * (180 / Math.PI);

      // Undo snapshot
      this.context.onTransformStart?.();

      if (this.chainParentId) {
        // Chaining to a parent bone
        const parentBone = this.context.sceneGraph.getNode(this.chainParentId);
        const inverse = parentBone
          ? mat3.invert(this.context.sceneGraph.getWorldTransform(this.chainParentId))
          : null;
        if (parentBone && parentBone.type === 'bone' && inverse) {
          // The drag in the parent bone's own space, so the new bone is as
          // long and as angled as drawn under a scaled or mirrored parent too
          const start = mat3.transformPoint(inverse, this.startPoint);
          const end = mat3.transformPoint(inverse, event.worldPosition);
          const node = this.createBoneNode(
            start.x,
            start.y,
            Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI),
            Math.hypot(end.x - start.x, end.y - start.y)
          );

          this.context.sceneGraph.addNode(node, this.chainParentId);
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
    if (!this.startPoint) return;
    const node = this.createBoneNode(this.startPoint.x, this.startPoint.y, rotation, length);
    this.context.sceneGraph.addNode(node);
    this.context.setSelectedIds([node.id]);
    this.lastCreatedBoneId = node.id;
  }

  /** "Bone N", numbered on from the bones already in the scene. */
  private nextBoneName(): string {
    let highest = 0;
    this.context.sceneGraph.traverse((node) => {
      const match = node.type === 'bone' ? /^Bone (\d+)$/.exec(node.name) : null;
      if (match) highest = Math.max(highest, Number(match[1]));
    });
    return `Bone ${highest + 1}`;
  }

  private createBoneNode(x: number, y: number, rotation: number, length: number): BoneNode {
    return {
      id: this.context.generateId(),
      name: this.nextBoneName(),
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
    let nearest: { id: string; tipWorld: Vector2; dist: number } | null = null;

    // Every bone shown, inside groups and artboards too
    this.context.sceneGraph.traverseVisible((node) => {
      if (node.type !== 'bone' || this.context.isHiddenOnCanvas?.(node.id)) return;
      const tipWorld = this.getBoneWorldTip(node);
      if (!tipWorld) return;

      // Convert tip to screen space for distance check
      const tipScreen = this.context.camera.worldToScreen(tipWorld);
      const dx = tipScreen.x - event.screenPosition.x;
      const dy = tipScreen.y - event.screenPosition.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < SNAP_DISTANCE && (!nearest || dist < nearest.dist)) {
        nearest = { id: node.id, tipWorld, dist };
      }
    });

    return nearest;
  }

  private getBoneWorldTip(bone: BoneNode): Vector2 | null {
    const worldTransform = this.context.sceneGraph.getWorldTransform(bone.id);
    const tipX = bone.length;
    const wx = worldTransform.a * tipX + worldTransform.tx;
    const wy = worldTransform.b * tipX + worldTransform.ty;
    return { x: wx, y: wy };
  }
}
