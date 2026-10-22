import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BoneTool } from './BoneTool';
import { createMockToolContext } from '../test/setup';
import type { ToolContext } from './BaseTool';
import type { CanvasPointerEvent, BoneNode } from '@quar/types';

function createPointerEvent(
  worldX: number,
  worldY: number,
  overrides: Partial<CanvasPointerEvent> = {}
): CanvasPointerEvent {
  return {
    screenPosition: { x: worldX, y: worldY },
    worldPosition: { x: worldX, y: worldY },
    button: 0,
    buttons: 1,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    pressure: 0.5,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('BoneTool', () => {
  let context: ToolContext;
  let tool: BoneTool;

  beforeEach(() => {
    context = createMockToolContext();
    context.onTransformStart = vi.fn();
    context.onTransformComplete = vi.fn();
    tool = new BoneTool(context);
    tool.onActivate?.();
  });

  // --------------------------------------------------------------------------
  // Properties
  // --------------------------------------------------------------------------

  describe('properties', () => {
    it('has type "bone"', () => {
      expect(tool.type).toBe('bone');
    });

    it('has crosshair cursor', () => {
      expect(tool.cursor).toBe('crosshair');
    });
  });

  // --------------------------------------------------------------------------
  // Single bone creation
  // --------------------------------------------------------------------------

  describe('single bone creation', () => {
    it('creates a bone on click-drag-release', () => {
      const down = createPointerEvent(100, 100);
      tool.onPointerDown(down);

      const move = createPointerEvent(200, 100);
      tool.onPointerMove(move);

      const up = createPointerEvent(200, 100);
      tool.onPointerUp(up);

      const nodes = context.sceneGraph.getRootNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0]!.type).toBe('bone');

      const bone = nodes[0]! as BoneNode;
      expect(bone.length).toBeCloseTo(100, 0);
      expect(bone.transform.rotation).toBeCloseTo(0, 0); // Horizontal drag
    });

    it('calculates correct rotation for diagonal drag', () => {
      tool.onPointerDown(createPointerEvent(0, 0));
      tool.onPointerMove(createPointerEvent(100, 100));
      tool.onPointerUp(createPointerEvent(100, 100));

      const bone = context.sceneGraph.getRootNodes()[0]! as BoneNode;
      expect(bone.transform.rotation).toBeCloseTo(45, 0);
    });

    it('does not create bone for tiny drags (< 5px)', () => {
      tool.onPointerDown(createPointerEvent(100, 100));
      tool.onPointerMove(createPointerEvent(102, 102));
      tool.onPointerUp(createPointerEvent(102, 102));

      const nodes = context.sceneGraph.getRootNodes();
      expect(nodes).toHaveLength(0);
    });

    it('creates a short bone drawn zoomed in (the minimum is on screen)', () => {
      context.camera.zoom = 8;
      // 4 world units = 32 screen pixels at 8x
      tool.onPointerDown(createPointerEvent(0, 0));
      tool.onPointerMove(createPointerEvent(4, 0));
      tool.onPointerUp(createPointerEvent(4, 0));

      const nodes = context.sceneGraph.getRootNodes();
      expect(nodes).toHaveLength(1);
      expect((nodes[0]! as BoneNode).length).toBeCloseTo(4, 5);
    });

    it('does not create a bone from a click zoomed out', () => {
      context.camera.zoom = 0.1;
      // 20 world units = 2 screen pixels at 10%
      tool.onPointerDown(createPointerEvent(0, 0));
      tool.onPointerMove(createPointerEvent(20, 0));
      tool.onPointerUp(createPointerEvent(20, 0));

      expect(context.sceneGraph.getRootNodes()).toHaveLength(0);
    });

    it('selects created bone after creation', () => {
      tool.onPointerDown(createPointerEvent(0, 0));
      tool.onPointerMove(createPointerEvent(100, 0));
      tool.onPointerUp(createPointerEvent(100, 0));

      const selected = context.getSelectedIds();
      expect(selected.size).toBe(1);
    });

    it('sets anchor to (0,0) on created bones', () => {
      tool.onPointerDown(createPointerEvent(0, 0));
      tool.onPointerMove(createPointerEvent(100, 0));
      tool.onPointerUp(createPointerEvent(100, 0));

      const bone = context.sceneGraph.getRootNodes()[0]! as BoneNode;
      expect(bone.transform.anchor).toEqual({ x: 0, y: 0 });
    });

    it('uses octahedral style by default', () => {
      tool.onPointerDown(createPointerEvent(0, 0));
      tool.onPointerMove(createPointerEvent(100, 0));
      tool.onPointerUp(createPointerEvent(100, 0));

      const bone = context.sceneGraph.getRootNodes()[0]! as BoneNode;
      expect(bone.boneStyle).toBe('octahedral');
    });

    it('calls onTransformStart when creating bone', () => {
      tool.onPointerDown(createPointerEvent(0, 0));
      tool.onPointerMove(createPointerEvent(100, 0));
      tool.onPointerUp(createPointerEvent(100, 0));

      expect(context.onTransformStart).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Auto-chain
  // --------------------------------------------------------------------------

  describe('auto-chain', () => {
    it('chains second bone to first bones tip', () => {
      // Create first bone
      tool.onPointerDown(createPointerEvent(0, 0));
      tool.onPointerMove(createPointerEvent(100, 0));
      tool.onPointerUp(createPointerEvent(100, 0));

      expect(context.sceneGraph.getRootNodes()).toHaveLength(1);

      // Create second bone — should auto-chain from first bone's tip
      tool.onPointerDown(createPointerEvent(100, 0));
      tool.onPointerMove(createPointerEvent(200, 0));
      tool.onPointerUp(createPointerEvent(200, 0));

      const rootNodes = context.sceneGraph.getRootNodes();
      // First bone stays at root, second should be child of first
      expect(rootNodes).toHaveLength(1);
      const firstBone = rootNodes[0]! as BoneNode;
      expect(firstBone.children).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // Escape handling
  // --------------------------------------------------------------------------

  describe('escape key', () => {
    it('cancels current drag on Escape', () => {
      tool.onPointerDown(createPointerEvent(0, 0));
      tool.onPointerMove(createPointerEvent(100, 0));

      // Preview should exist
      expect(tool.getPreviewNode()).not.toBeNull();

      tool.onKeyDown!(new KeyboardEvent('keydown', { key: 'Escape' }));

      // Preview cleared
      expect(tool.getPreviewNode()).toBeNull();
    });

    it('finishes chain and switches to selection on Escape', () => {
      const setActiveTool = vi.fn();
      context.setActiveTool = setActiveTool;
      tool = new BoneTool(context);
      tool.onActivate?.();

      tool.onKeyDown!(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(setActiveTool).toHaveBeenCalledWith('selection');
    });
  });

  // --------------------------------------------------------------------------
  // Preview
  // --------------------------------------------------------------------------

  describe('preview', () => {
    it('returns null when not dragging', () => {
      expect(tool.getPreviewNode()).toBeNull();
    });

    it('returns preview node during drag', () => {
      tool.onPointerDown(createPointerEvent(0, 0));
      tool.onPointerMove(createPointerEvent(50, 0));

      const preview = tool.getPreviewNode();
      expect(preview).not.toBeNull();
      expect(preview!.type).toBe('bone');
      expect(preview!.length).toBeCloseTo(50, 0);
    });

    it('updates preview length/rotation on move', () => {
      tool.onPointerDown(createPointerEvent(0, 0));

      tool.onPointerMove(createPointerEvent(50, 0));
      expect(tool.getPreviewNode()!.length).toBeCloseTo(50, 0);

      tool.onPointerMove(createPointerEvent(100, 0));
      expect(tool.getPreviewNode()!.length).toBeCloseTo(100, 0);
    });
  });

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  describe('lifecycle', () => {
    it('resets state on deactivate', () => {
      tool.onPointerDown(createPointerEvent(0, 0));
      tool.onPointerMove(createPointerEvent(100, 0));
      tool.onPointerUp(createPointerEvent(100, 0));

      tool.onDeactivate?.();

      // After deactivate, auto-chain should be cleared
      expect(tool.getPreviewNode()).toBeNull();
    });

    it('auto-names bones sequentially', () => {
      // Fresh tool instance for clean counter
      const freshContext = createMockToolContext();
      freshContext.onTransformStart = vi.fn();
      freshContext.onTransformComplete = vi.fn();
      const freshTool = new BoneTool(freshContext);
      freshTool.onActivate?.();

      freshTool.onPointerDown(createPointerEvent(0, 0));
      freshTool.onPointerMove(createPointerEvent(100, 0));
      freshTool.onPointerUp(createPointerEvent(100, 0));

      const bone1 = freshContext.sceneGraph.getRootNodes()[0]! as BoneNode;
      expect(bone1.name).toBe('Bone 1');
    });
  });

  // --------------------------------------------------------------------------
  // Right click ignore
  // --------------------------------------------------------------------------

  describe('button handling', () => {
    it('ignores right-click', () => {
      tool.onPointerDown(createPointerEvent(0, 0, { button: 2 }));
      expect(tool.getPreviewNode()).toBeNull();
    });
  });

  describe('chaining', () => {
    /** A press, drag and release, at screen positions the camera agrees with. */
    function draw(from: [number, number], to: [number, number]) {
      const at = (x: number, y: number) =>
        createPointerEvent(x, y, { screenPosition: context.camera.worldToScreen({ x, y }) });
      tool.onPointerDown(at(...from));
      tool.onPointerMove(at(...to));
      tool.onPointerUp(at(...to));
    }
    const bones = () => {
      const found: BoneNode[] = [];
      context.sceneGraph.traverse((node) => {
        if (node.type === 'bone') found.push(node as BoneNode);
      });
      return found;
    };

    it('doesn’t keep a parent from a click on a tip', () => {
      draw([0, 0], [100, 0]);
      tool.onKeyDown!({ key: 'Escape' } as KeyboardEvent);
      tool.onActivate!();
      // A click on the tip, no drag: nothing drawn
      draw([100, 0], [100, 0]);
      // Then a bone elsewhere: on its own, where it was drawn
      draw([0, 200], [100, 200]);
      const last = bones().at(-1)!;
      expect(last.parent).toBeNull();
      expect(last.transform.position).toEqual({ x: 0, y: 200 });
    });

    it('snaps to the tip of a bone inside a group', () => {
      context.sceneGraph.addNode({
        id: 'g',
        name: 'G',
        type: 'group',
        parent: null,
        children: [],
        transform: {
          position: { x: 50, y: 50 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          anchor: { x: 0, y: 0 },
          skew: { x: 0, y: 0 },
        },
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
      } as never);
      context.sceneGraph.addNode(
        {
          id: 'inner',
          name: 'Inner',
          type: 'bone',
          parent: null,
          children: [],
          transform: {
            position: { x: 0, y: 0 },
            rotation: 0,
            scale: { x: 1, y: 1 },
            anchor: { x: 0, y: 0 },
            skew: { x: 0, y: 0 },
          },
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          length: 100,
          boneStyle: 'octahedral',
          boneColor: '#E0E0E0',
        } as BoneNode,
        'g'
      );
      draw([150, 50], [150, 150]);
      expect(bones().at(-1)!.parent).toBe('inner');
    });

    it('draws a chained bone as long as dragged under a scaled parent', () => {
      draw([0, 0], [100, 0]);
      const first = bones()[0]!;
      context.sceneGraph.updateNode(first.id, {
        transform: { ...first.transform, scale: { x: 2, y: 2 } },
      });
      // From the (now 200-unit) tip, 100 units up
      draw([200, 0], [200, 100]);
      const child = bones().at(-1)!;
      expect(child.parent).toBe(first.id);
      // 50 of the parent's units, 100 in the world
      expect(child.length).toBeCloseTo(50);
      expect(child.transform.rotation).toBeCloseTo(90);
    });

    it('names new bones after those already there', () => {
      draw([0, 0], [100, 0]);
      tool.onKeyDown!({ key: 'Escape' } as KeyboardEvent);
      tool.onActivate!();
      draw([0, 300], [100, 300]);
      expect(bones().map((bone) => bone.name)).toEqual(['Bone 1', 'Bone 2']);
    });
  });
});
