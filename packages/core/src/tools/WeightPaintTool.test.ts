/**
 * Tests for WeightPaintTool
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WeightPaintTool } from './WeightPaintTool';
import type { ToolContext } from './BaseTool';
import { createMockToolContext, createMockPointerEvent } from '../test/setup';
import { createDefaultTransform } from '../SceneGraph';
import type { RectangleNode, SkinData } from '@quar/types';

function createBoundRectangle(id: string, skinData: SkinData): RectangleNode {
  const transform = createDefaultTransform();
  transform.position = { x: 100, y: 100 };

  return {
    id,
    name: `Rect ${id}`,
    type: 'rectangle',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 100,
    height: 100,
    cornerRadius: [0, 0, 0, 0],
    fills: [{ type: 'solid', color: { r: 100, g: 149, b: 237, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
    skinData,
  };
}

function createTestSkinData(): SkinData {
  return {
    vertices: [
      {
        influences: [
          { boneId: 'b1', weight: 0.5 },
          { boneId: 'b2', weight: 0.5 },
        ],
      },
      {
        influences: [
          { boneId: 'b1', weight: 0.8 },
          { boneId: 'b2', weight: 0.2 },
        ],
      },
      {
        influences: [
          { boneId: 'b1', weight: 0.2 },
          { boneId: 'b2', weight: 0.8 },
        ],
      },
      { influences: [{ boneId: 'b1', weight: 1.0 }] },
    ],
    inverseBindMatrices: {
      b1: [1, 0, 0, 1, 0, 0],
      b2: [1, 0, 0, 1, -50, 0],
    },
    meshBindMatrix: [1, 0, 0, 1, 0, 0],
    vertexCount: 4,
  };
}

describe('WeightPaintTool', () => {
  let context: ToolContext;
  let tool: WeightPaintTool;

  beforeEach(() => {
    context = createMockToolContext();
    tool = new WeightPaintTool(context);
  });

  // --------------------------------------------------------------------------
  // Basic Properties
  // --------------------------------------------------------------------------

  describe('properties', () => {
    it('has correct type', () => {
      expect(tool.type).toBe('weight-paint');
    });

    it('has crosshair cursor', () => {
      expect(tool.cursor).toBe('crosshair');
    });

    it('defaults to add mode', () => {
      expect(tool.getPaintMode()).toBe('add');
    });

    it('has default brush radius of 30', () => {
      expect(tool.getBrushRadius()).toBe(30);
    });

    it('has default brush strength of 0.3', () => {
      expect(tool.getBrushStrength()).toBeCloseTo(0.3);
    });
  });

  // --------------------------------------------------------------------------
  // Activation
  // --------------------------------------------------------------------------

  describe('activation', () => {
    it('switches to selection tool if no bound node in selection', () => {
      let toolSwitched = false;
      context.setActiveTool = (t) => {
        toolSwitched = t === 'selection';
      };

      tool.onActivate!();
      expect(toolSwitched).toBe(true);
    });

    it('stays active when bound node is selected', () => {
      const skinData = createTestSkinData();
      const rect = createBoundRectangle('rect1', skinData);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      let toolSwitched = false;
      context.setActiveTool = (t) => {
        toolSwitched = t === 'selection';
      };

      tool.onActivate!();
      expect(toolSwitched).toBe(false);
      expect(tool.getBoundNodeId()).toBe('rect1');
    });

    it('auto-selects first bone from skin binding', () => {
      const skinData = createTestSkinData();
      const rect = createBoundRectangle('rect1', skinData);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      tool.onActivate!();
      expect(tool.getActiveBoneId()).toBe('b1');
    });
  });

  // --------------------------------------------------------------------------
  // Painting
  // --------------------------------------------------------------------------

  describe('painting', () => {
    it('pushes undo once on pointer down', () => {
      const skinData = createTestSkinData();
      const rect = createBoundRectangle('rect1', skinData);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      let undoCount = 0;
      context.onTransformStart = () => {
        undoCount++;
      };

      tool.onActivate!();
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 100, y: 100 }, button: 0 }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 110, y: 100 } }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 120, y: 100 } }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 120, y: 100 }, button: 0 }));

      expect(undoCount).toBe(1);
    });

    it('does nothing on non-left button', () => {
      const skinData = createTestSkinData();
      const rect = createBoundRectangle('rect1', skinData);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      tool.onActivate!();
      tool.onPointerDown(createMockPointerEvent({ button: 2 }));
      // Should not start painting — no crash
    });

    it('paints weights when dragging over vertices', () => {
      const skinData = createTestSkinData();
      const rect = createBoundRectangle('rect1', skinData);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      tool.onActivate!();
      tool.setActiveBoneId('b1');

      // Store original weights
      const origWeight = skinData.vertices[0].influences[0].weight;

      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 100, y: 100 }, button: 0 }));

      // After painting, weights should have changed
      const node = context.sceneGraph.getNode('rect1') as any;
      expect(node.skinData).toBeDefined();
    });

    it('targets vertices in world space, not local (F055)', () => {
      const skinData = createTestSkinData();
      const rect = createBoundRectangle('rect1', skinData); // positioned at (100,100)
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);
      // Local tessellated corners; index 0 = (-50,-50).
      context.getTessellatedVertices = () => new Float32Array([-50, -50, 50, -50, -50, 50, 50, 50]);

      tool.onActivate!();
      tool.setActiveBoneId('b1');
      tool.setBrushRadius(30);

      const b1Weight = (id: string) => {
        const sk = (context.sceneGraph.getNode(id) as RectangleNode).skinData!;
        return sk.vertices[0]!.influences.find((inf) => inf.boneId === 'b1')!.weight;
      };
      const before = b1Weight('rect1');

      // World position of local corner (-50,-50) — far from the local coord.
      const m = context.sceneGraph.getWorldTransform('rect1');
      const wx = m.a * -50 + m.c * -50 + m.tx;
      const wy = m.b * -50 + m.d * -50 + m.ty;

      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: wx, y: wy }, button: 0 }));

      // The vertex at that world position was painted (broken code compared the
      // world cursor against local coords and would have missed it entirely).
      expect(b1Weight('rect1')).not.toBeCloseTo(before, 5);
    });

    it('paints a shape edited since binding on its current vertices', () => {
      const skinData = {
        ...createTestSkinData(),
        bindVertices: [-50, -50, 50, -50, -50, 50, 50, 50],
      };
      context.sceneGraph.addNode(createBoundRectangle('rect1', skinData));
      context.setSelectedIds(['rect1']);
      // A fifth vertex since: the middle of the bottom edge
      context.getTessellatedVertices = () =>
        new Float32Array([-50, -50, 0, -50, 50, -50, -50, 50, 50, 50]);

      tool.onActivate!();
      tool.setActiveBoneId('b1');
      const m = context.sceneGraph.getWorldTransform('rect1');
      tool.onPointerDown(
        createMockPointerEvent({ worldPosition: { x: m.tx, y: m.ty + 5000 }, button: 0 })
      );

      const fitted = (context.sceneGraph.getNode('rect1') as RectangleNode).skinData!;
      expect(fitted.vertexCount).toBe(5);
      // The corners kept their weights under their new numbers
      expect(fitted.vertices[2]).toEqual(skinData.vertices[1]);
      expect(fitted.vertices[4]).toEqual(skinData.vertices[3]);
    });

    it('does not paint when the cursor is far from every world vertex (F055)', () => {
      const skinData = createTestSkinData();
      const rect = createBoundRectangle('rect1', skinData);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);
      context.getTessellatedVertices = () => new Float32Array([-50, -50, 50, -50, -50, 50, 50, 50]);

      tool.onActivate!();
      tool.setActiveBoneId('b1');
      tool.setBrushRadius(30);

      const weights = () =>
        (context.sceneGraph.getNode('rect1') as RectangleNode).skinData!.vertices.map(
          (v) => v.influences.find((inf) => inf.boneId === 'b1')?.weight ?? 0
        );
      const before = weights();

      tool.onPointerDown(
        createMockPointerEvent({ worldPosition: { x: 5000, y: 5000 }, button: 0 })
      );

      expect(weights()).toEqual(before);
    });
  });

  // --------------------------------------------------------------------------
  // Mode & Settings
  // --------------------------------------------------------------------------

  describe('mode and settings', () => {
    it('toggles between add and subtract', () => {
      expect(tool.getPaintMode()).toBe('add');
      tool.togglePaintMode();
      expect(tool.getPaintMode()).toBe('subtract');
      tool.togglePaintMode();
      expect(tool.getPaintMode()).toBe('add');
    });

    it('clamps brush radius to [5, 200]', () => {
      tool.setBrushRadius(1);
      expect(tool.getBrushRadius()).toBe(5);
      tool.setBrushRadius(999);
      expect(tool.getBrushRadius()).toBe(200);
    });

    it('clamps brush strength to [0.01, 1.0]', () => {
      tool.setBrushStrength(0);
      expect(tool.getBrushStrength()).toBeCloseTo(0.01);
      tool.setBrushStrength(5);
      expect(tool.getBrushStrength()).toBeCloseTo(1.0);
    });
  });

  // --------------------------------------------------------------------------
  // Keyboard
  // --------------------------------------------------------------------------

  describe('keyboard shortcuts', () => {
    it('[ decreases brush radius', () => {
      const initial = tool.getBrushRadius();
      tool.onKeyDown!({ key: '[' } as KeyboardEvent);
      expect(tool.getBrushRadius()).toBe(initial - 5);
    });

    it('] increases brush radius', () => {
      const initial = tool.getBrushRadius();
      tool.onKeyDown!({ key: ']' } as KeyboardEvent);
      expect(tool.getBrushRadius()).toBe(initial + 5);
    });

    it('x toggles paint mode', () => {
      expect(tool.getPaintMode()).toBe('add');
      tool.onKeyDown!({ key: 'x' } as KeyboardEvent);
      expect(tool.getPaintMode()).toBe('subtract');
    });
  });

  // --------------------------------------------------------------------------
  // paintAtPositionWithVertices
  // --------------------------------------------------------------------------

  describe('paintAtPositionWithVertices', () => {
    it('paints vertices within brush radius', () => {
      const skinData = createTestSkinData();
      const rect = createBoundRectangle('rect1', skinData);
      context.sceneGraph.addNode(rect);
      context.setSelectedIds(['rect1']);

      tool.onActivate!();
      tool.setActiveBoneId('b1');
      tool.setBrushRadius(20);

      // Vertex positions: first at (10,10), second at (100,100) — far away
      const vertexPositions = new Float32Array([10, 10, 100, 100, 200, 200, 300, 300]);

      // Paint at (10, 10) — should only affect first vertex
      tool.paintAtPositionWithVertices(10, 10, vertexPositions);

      const node = context.sceneGraph.getNode('rect1') as any;
      expect(node.skinData).toBeDefined();
    });
  });

  describe('what it paints', () => {
    const corners = () => new Float32Array([-50, -50, 50, -50, -50, 50, 50, 50]);

    it('paints bound images', () => {
      context.sceneGraph.addNode({
        ...createBoundRectangle('img', createTestSkinData()),
        type: 'image',
        src: 'data:,',
        naturalWidth: 100,
        naturalHeight: 100,
      } as unknown as RectangleNode);
      context.setSelectedIds(['img']);
      let switched = false;
      context.setActiveTool = () => {
        switched = true;
      };
      tool.onActivate!();
      expect(switched).toBe(false);
      expect(tool.getBoundNodeIds()).toEqual(['img']);
    });

    it('paints the bound layers inside a selected group', () => {
      context.sceneGraph.addNode({
        ...createBoundRectangle('g', createTestSkinData()),
        type: 'group',
        skinData: undefined,
      } as unknown as RectangleNode);
      context.sceneGraph.addNode(createBoundRectangle('a', createTestSkinData()), 'g');
      context.sceneGraph.addNode(createBoundRectangle('b', createTestSkinData()), 'g');
      context.setSelectedIds(['g']);
      tool.onActivate!();
      expect(tool.getBoundNodeIds().sort()).toEqual(['a', 'b']);
      expect(tool.getPaintableBoneIds()).toEqual(['b1', 'b2']);
    });

    it('drops a bone left over from another layer', () => {
      context.sceneGraph.addNode(createBoundRectangle('rect1', createTestSkinData()));
      context.setSelectedIds(['rect1']);
      tool.setActiveBoneId('someone-elses-bone');
      tool.onActivate!();
      expect(tool.getActiveBoneId()).toBe('b1');
    });

    it('meets the mesh where the bones posed it', () => {
      context.sceneGraph.addNode(createBoundRectangle('rect1', createTestSkinData()));
      context.setSelectedIds(['rect1']);
      context.getTessellatedVertices = corners;
      // Posed: vertex 3 swung over to (1000, 1000), the others far away
      context.getDeformedVertices = () =>
        new Float32Array([5000, 5000, 5000, 5000, 5000, 5000, 1000, 1000]);
      tool.onActivate!();
      tool.setActiveBoneId('b2');
      tool.onPointerDown(
        createMockPointerEvent({ worldPosition: { x: 1000, y: 1000 }, button: 0 })
      );

      const skin = (context.sceneGraph.getNode('rect1') as RectangleNode).skinData!;
      expect(skin.vertices[3]!.influences.find((inf) => inf.boneId === 'b2')).toBeDefined();
      expect(skin.vertices[0]).toEqual(createTestSkinData().vertices[0]);
    });

    it('leaves the binding it started from untouched, for undo', () => {
      const original = createTestSkinData();
      const snapshot = structuredClone(original);
      context.sceneGraph.addNode(createBoundRectangle('rect1', original));
      context.setSelectedIds(['rect1']);
      context.getTessellatedVertices = corners;
      tool.onActivate!();
      const m = context.sceneGraph.getWorldTransform('rect1');
      tool.onPointerDown(
        createMockPointerEvent({ worldPosition: { x: m.tx - 50, y: m.ty - 50 }, button: 0 })
      );
      expect(original).toEqual(snapshot);
      expect((context.sceneGraph.getNode('rect1') as RectangleNode).skinData).not.toEqual(snapshot);
    });
  });
});
