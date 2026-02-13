/**
 * Tests for PointMagnetTool
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PointMagnetTool } from './PointMagnetTool';
import type { ToolContext } from './BaseTool';
import { createMockToolContext, createMockPointerEvent } from '../test/setup';
import { createDefaultTransform } from '../SceneGraph';
import type { RectangleNode, SkinData } from '@quar/types';

function createBoundRectangle(id: string, skinData: SkinData): RectangleNode {
  const transform = createDefaultTransform();
  transform.position = { x: 0, y: 0 };

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
      { influences: [{ boneId: 'b1', weight: 1.0 }] },
      { influences: [{ boneId: 'b1', weight: 1.0 }] },
      { influences: [{ boneId: 'b1', weight: 1.0 }] },
      { influences: [{ boneId: 'b1', weight: 1.0 }] },
    ],
    inverseBindMatrices: { b1: [1, 0, 0, 1, 0, 0] },
    meshBindMatrix: [1, 0, 0, 1, 0, 0],
    vertexCount: 4,
  };
}

describe('PointMagnetTool', () => {
  let context: ToolContext;
  let tool: PointMagnetTool;

  beforeEach(() => {
    context = createMockToolContext();
    // Add tessellation vertex provider
    context.getTessellatedVertices = (nodeId: string) => {
      if (nodeId === 'rect-1') {
        // 4 vertices at (0,0), (100,0), (0,100), (100,100)
        return new Float32Array([0, 0, 100, 0, 0, 100, 100, 100]);
      }
      return null;
    };
    tool = new PointMagnetTool(context);
  });

  // --------------------------------------------------------------------------
  // Tool properties
  // --------------------------------------------------------------------------

  it('has correct tool type', () => {
    expect(tool.type).toBe('point-magnet');
  });

  it('has crosshair cursor', () => {
    expect(tool.cursor).toBe('crosshair');
  });

  // --------------------------------------------------------------------------
  // Brush settings
  // --------------------------------------------------------------------------

  it('gets and sets brush radius', () => {
    expect(tool.getBrushRadius()).toBe(30);
    tool.setBrushRadius(50);
    expect(tool.getBrushRadius()).toBe(50);
  });

  it('clamps brush radius', () => {
    tool.setBrushRadius(1);
    expect(tool.getBrushRadius()).toBe(5);
    tool.setBrushRadius(500);
    expect(tool.getBrushRadius()).toBe(200);
  });

  it('gets and sets brush strength', () => {
    expect(tool.getBrushStrength()).toBe(0.5);
    tool.setBrushStrength(0.8);
    expect(tool.getBrushStrength()).toBe(0.8);
  });

  it('gets and sets falloff type', () => {
    expect(tool.getFalloff()).toBe('smooth');
    tool.setFalloff('linear');
    expect(tool.getFalloff()).toBe('linear');
  });

  // --------------------------------------------------------------------------
  // Pointer events
  // --------------------------------------------------------------------------

  it('activates and deactivates cleanly', () => {
    tool.onActivate();
    tool.onDeactivate();
    // No errors
  });

  it('begins sculpting on pointer down', () => {
    const skinData = createTestSkinData();
    const rect = createBoundRectangle('rect-1', skinData);
    context.sceneGraph.addNode(rect);

    tool.onActivate();
    tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 50, y: 50 } }));
    // No crash
  });

  it('displaces vertices on pointer move after pointer down', () => {
    const skinData = createTestSkinData();
    const rect = createBoundRectangle('rect-1', skinData);
    context.sceneGraph.addNode(rect);

    tool.setBrushRadius(200); // Large radius to hit all vertices
    tool.onActivate();

    tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 50, y: 50 } }));
    tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 60, y: 50 } }));

    const offsets = tool.getWorkingOffsets();
    expect(offsets.size).toBeGreaterThan(0);
    // Should have offsets for rect-1
    expect(offsets.has('rect-1')).toBe(true);
    const rectOffsets = offsets.get('rect-1')!;
    expect(rectOffsets.length).toBeGreaterThan(0);
  });

  it('does not displace without pointer down', () => {
    const skinData = createTestSkinData();
    const rect = createBoundRectangle('rect-1', skinData);
    context.sceneGraph.addNode(rect);

    tool.onActivate();
    tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 60, y: 50 } }));

    expect(tool.getWorkingOffsets().size).toBe(0);
  });

  it('stops sculpting on pointer up', () => {
    tool.onActivate();
    tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 50, y: 50 } }));
    tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 60, y: 50 } }));
    // Further moves should not sculpt
    const sizeBefore = tool.getWorkingOffsets().size;
    tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 70, y: 50 } }));
    expect(tool.getWorkingOffsets().size).toBe(sizeBefore);
  });

  // --------------------------------------------------------------------------
  // Keyboard shortcuts
  // --------------------------------------------------------------------------

  it('adjusts brush radius with [ and ]', () => {
    const initial = tool.getBrushRadius();
    tool.onKeyDown(new KeyboardEvent('keydown', { key: ']' }));
    expect(tool.getBrushRadius()).toBe(initial + 5);
    tool.onKeyDown(new KeyboardEvent('keydown', { key: '[' }));
    expect(tool.getBrushRadius()).toBe(initial);
  });

  it('cycles falloff with F key', () => {
    expect(tool.getFalloff()).toBe('smooth');
    tool.onKeyDown(new KeyboardEvent('keydown', { key: 'f' }));
    expect(tool.getFalloff()).toBe('linear');
    tool.onKeyDown(new KeyboardEvent('keydown', { key: 'f' }));
    expect(tool.getFalloff()).toBe('constant');
    tool.onKeyDown(new KeyboardEvent('keydown', { key: 'f' }));
    expect(tool.getFalloff()).toBe('smooth');
  });

  it('clears working offsets on Escape', () => {
    tool.setWorkingOffsets(new Map([['mesh-1', [{ vertexIndex: 0, dx: 5, dy: 5 }]]]));
    expect(tool.getWorkingOffsets().size).toBe(1);
    tool.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(tool.getWorkingOffsets().size).toBe(0);
  });
});
