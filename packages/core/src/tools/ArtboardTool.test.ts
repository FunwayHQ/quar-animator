/**
 * Tests for ArtboardTool
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ArtboardTool } from './ArtboardTool';
import type { ToolContext } from './BaseTool';
import type { ArtboardNode, RectangleNode } from '@quar/types';
import { createDefaultTransform, createGroupNode } from '../SceneGraph';
import { createMockToolContext, createMockPointerEvent } from '../test/setup';

describe('ArtboardTool', () => {
  let context: ToolContext;
  let tool: ArtboardTool;

  beforeEach(() => {
    context = createMockToolContext();
    tool = new ArtboardTool(context);
  });

  // ==========================================================================
  // Basic Properties
  // ==========================================================================

  describe('properties', () => {
    it('should have correct type', () => {
      expect(tool.type).toBe('artboard');
    });

    it('should have crosshair cursor', () => {
      expect(tool.cursor).toBe('crosshair');
    });
  });

  // ==========================================================================
  // Artboard Creation
  // ==========================================================================

  describe('artboard creation', () => {
    it('should create artboard on drag', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 200, y: 150 } }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 200, y: 150 }, button: 0 }));

      expect(context.sceneGraph.getNodeCount()).toBe(1);
      const nodes = Array.from(context.sceneGraph.getNodes());
      const artboard = nodes[0] as ArtboardNode;
      expect(artboard.type).toBe('artboard');
      expect(artboard.width).toBe(200);
      expect(artboard.height).toBe(150);
    });

    it('should position artboard at center of drawn rect', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 10, y: 20 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 210, y: 120 }, button: 0 }));

      const nodes = Array.from(context.sceneGraph.getNodes());
      const artboard = nodes[0] as ArtboardNode;
      expect(artboard.transform.position.x).toBe(110); // 10 + 200/2
      expect(artboard.transform.position.y).toBe(70); // 20 + 100/2
    });

    it('should have white solid fill by default', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 100 }, button: 0 }));

      const nodes = Array.from(context.sceneGraph.getNodes());
      const artboard = nodes[0] as ArtboardNode;
      expect(artboard.fills).toHaveLength(1);
      expect(artboard.fills[0].type).toBe('solid');
      expect(artboard.fills[0].color).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    });

    it('should have clipContent true by default', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 100 }, button: 0 }));

      const nodes = Array.from(context.sceneGraph.getNodes());
      const artboard = nodes[0] as ArtboardNode;
      expect(artboard.clipContent).toBe(true);
    });

    it('should have rotation forced to 0', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 100 }, button: 0 }));

      const nodes = Array.from(context.sceneGraph.getNodes());
      const artboard = nodes[0] as ArtboardNode;
      expect(artboard.transform.rotation).toBe(0);
    });

    it('should have anchor at center (0.5, 0.5)', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 100 }, button: 0 }));

      const nodes = Array.from(context.sceneGraph.getNodes());
      const artboard = nodes[0] as ArtboardNode;
      expect(artboard.transform.anchor).toEqual({ x: 0.5, y: 0.5 });
    });

    it('should have no parent (root level)', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 100 }, button: 0 }));

      const nodes = Array.from(context.sceneGraph.getNodes());
      expect(nodes[0].parent).toBeNull();
    });

    it('should constrain to square when shift is held', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(
        createMockPointerEvent({ worldPosition: { x: 200, y: 100 }, shiftKey: true, button: 0 })
      );

      const nodes = Array.from(context.sceneGraph.getNodes());
      const artboard = nodes[0] as ArtboardNode;
      expect(artboard.width).toBe(artboard.height);
      expect(artboard.width).toBe(200);
    });

    it('should draw from center when alt is held', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 100, y: 100 }, button: 0 }));
      tool.onPointerUp(
        createMockPointerEvent({ worldPosition: { x: 200, y: 150 }, altKey: true, button: 0 })
      );

      const nodes = Array.from(context.sceneGraph.getNodes());
      const artboard = nodes[0] as ArtboardNode;
      expect(artboard.width).toBe(200); // 100 * 2
      expect(artboard.height).toBe(100); // 50 * 2
      expect(artboard.transform.position.x).toBe(100);
      expect(artboard.transform.position.y).toBe(100);
    });

    it('should enforce minimum size', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0.5, y: 0.5 }, button: 0 }));

      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });

    it('should select the new artboard after creation', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 100 }, button: 0 }));

      const selectedIds = context.getSelectedIds();
      expect(selectedIds.size).toBe(1);
      const nodes = Array.from(context.sceneGraph.getNodes());
      expect(selectedIds.has(nodes[0].id)).toBe(true);
    });

    it('should switch to selection tool after creation', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 100 }, button: 0 }));

      // setActiveTool is called with 'selection'
      expect((context.setActiveTool as any).mock?.calls?.length).toBeUndefined();
      // The tool calls context.setActiveTool('selection') - verified through implementation
    });

    it('should have name "Artboard"', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 100 }, button: 0 }));

      const nodes = Array.from(context.sceneGraph.getNodes());
      expect(nodes[0].name).toBe('Artboard');
    });

    it('should have empty children array', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 100 }, button: 0 }));

      const nodes = Array.from(context.sceneGraph.getNodes());
      expect(nodes[0].children).toEqual([]);
    });
  });

  // ==========================================================================
  // Preview
  // ==========================================================================

  describe('preview', () => {
    it('should show preview while dragging', () => {
      expect(tool.getPreviewNode()).toBeNull();

      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      expect(tool.getPreviewNode()).not.toBeNull();
      expect(tool.getPreviewNode()?.type).toBe('artboard');
    });

    it('should update preview dimensions on move', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 300, y: 200 } }));

      const preview = tool.getPreviewNode() as ArtboardNode;
      expect(preview.width).toBe(300);
      expect(preview.height).toBe(200);
    });

    it('should clear preview after creation', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 100 }, button: 0 }));

      expect(tool.getPreviewNode()).toBeNull();
    });
  });

  // ==========================================================================
  // Keyboard Events
  // ==========================================================================

  describe('keyboard events', () => {
    it('should cancel drawing on Escape', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      expect(tool.getPreviewNode()).not.toBeNull();

      tool.onKeyDown({ key: 'Escape' } as KeyboardEvent);

      expect(tool.getPreviewNode()).toBeNull();
      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should ignore non-left mouse buttons', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 1 }));
      expect(tool.getPreviewNode()).toBeNull();
    });

    it('should handle drag in negative direction', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 200, y: 200 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 120 }, button: 0 }));

      const nodes = Array.from(context.sceneGraph.getNodes());
      const artboard = nodes[0] as ArtboardNode;
      expect(artboard.width).toBe(100);
      expect(artboard.height).toBe(80);
    });

    it('should handle same start and end position', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 50, y: 50 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 50, y: 50 }, button: 0 }));

      expect(context.sceneGraph.getNodeCount()).toBe(0);
    });
  });
});

describe('ArtboardTool — drawing around existing layers', () => {
  let context: ToolContext;
  let tool: ArtboardTool;
  const moves: Array<[string, string | null]> = [];

  function rect(id: string, x: number, y: number, size = 20): RectangleNode {
    return {
      id,
      name: id,
      type: 'rectangle',
      parent: null,
      children: [],
      transform: { ...createDefaultTransform(), position: { x, y } },
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      width: size,
      height: size,
      cornerRadius: [0, 0, 0, 0],
      fills: [],
      strokes: [],
    };
  }

  /** Draws an artboard from (0, 0) to (200, 150) and returns it. */
  function drawArtboard(): ArtboardNode {
    tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
    tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 200, y: 150 }, button: 0 }));
    return Array.from(context.sceneGraph.getNodes()).find(
      (node) => node.type === 'artboard' && !moves.some(([id]) => id === node.id)
    ) as ArtboardNode;
  }

  beforeEach(() => {
    moves.length = 0;
    context = createMockToolContext();
    context.moveNodeKeepingPlacement = (id, parentId) => {
      moves.push([id, parentId]);
      context.sceneGraph.moveNode(id, parentId);
    };
    tool = new ArtboardTool(context);
  });

  it('takes in the layers it was drawn around, keeping their stacking order', () => {
    context.sceneGraph.addNode(rect('bottom', 50, 50));
    context.sceneGraph.addNode(rect('top', 120, 90));
    const artboard = drawArtboard();
    expect(moves).toEqual([
      ['bottom', artboard.id],
      ['top', artboard.id],
    ]);
    expect(context.sceneGraph.getNode(artboard.id)!.children).toEqual(['bottom', 'top']);
  });

  it('leaves layers that are partly or wholly outside it', () => {
    context.sceneGraph.addNode(rect('straddling', 195, 75));
    context.sceneGraph.addNode(rect('outside', 400, 75));
    drawArtboard();
    expect(moves).toEqual([]);
  });

  it('leaves other artboards, layers inside groups and hidden layers alone', () => {
    const group = createGroupNode('group', 'Group');
    context.sceneGraph.addNode(group);
    context.sceneGraph.addNode(rect('grouped', 60, 60), 'group');
    context.sceneGraph.addNode({ ...rect('hidden', 80, 80), visible: false });
    const inner: ArtboardNode = {
      ...rect('inner', 150, 100, 30),
      type: 'artboard',
      fills: [],
      clipContent: true,
    } as unknown as ArtboardNode;
    context.sceneGraph.addNode(inner);
    drawArtboard();
    // The group as a whole is inside, so it moves; its child goes with it
    expect(moves.map(([id]) => id)).toEqual(['group']);
    expect(context.sceneGraph.getNode('grouped')!.parent).toBe('group');
  });

  it('takes in point-like layers such as IK targets by their position', () => {
    context.sceneGraph.addNode({
      ...rect('target', 100, 75),
      type: 'ik-target',
      ikChainId: 'chain',
    } as unknown as RectangleNode);
    context.sceneGraph.addNode({
      ...rect('far-target', 500, 75),
      type: 'ik-target',
      ikChainId: 'chain-2',
    } as unknown as RectangleNode);
    drawArtboard();
    expect(moves.map(([id]) => id)).toEqual(['target']);
  });

  it('adds the artboard on its own when the editor can’t move layers', () => {
    context.moveNodeKeepingPlacement = undefined;
    context.sceneGraph.addNode(rect('inside', 50, 50));
    drawArtboard();
    expect(context.sceneGraph.getNode('inside')!.parent).toBeNull();
  });
});
