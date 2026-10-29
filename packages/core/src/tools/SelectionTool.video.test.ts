/**
 * Tests for SelectionTool with video layers: picked, moved, resized and
 * snapped as pictures are.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionTool } from './SelectionTool';
import type { ToolContext } from './BaseTool';
import { createMockToolContext, createMockPointerEvent, createTestVideoNode } from '../test/setup';
import type { VideoNode } from '@quar/types';

describe('SelectionTool - video layers', () => {
  let context: ToolContext;
  let tool: SelectionTool;

  beforeEach(() => {
    context = createMockToolContext();
    tool = new SelectionTool(context);
  });

  const click = (x: number, y: number) => {
    tool.onPointerDown(createMockPointerEvent({ worldPosition: { x, y }, button: 0 }));
    tool.onPointerUp(createMockPointerEvent({ worldPosition: { x, y }, button: 0 }));
  };

  const drag = (from: { x: number; y: number }, to: { x: number; y: number }, shiftKey = false) => {
    tool.onPointerDown(
      createMockPointerEvent({
        worldPosition: from,
        screenPosition: context.camera.worldToScreen(from),
        button: 0,
      })
    );
    tool.onPointerMove(
      createMockPointerEvent({
        worldPosition: to,
        screenPosition: context.camera.worldToScreen(to),
        shiftKey,
      })
    );
    tool.onPointerUp(
      createMockPointerEvent({
        worldPosition: to,
        screenPosition: context.camera.worldToScreen(to),
        shiftKey,
        button: 0,
      })
    );
  };

  it('picks a video layer clicked inside it, not one clicked beside it', () => {
    // 200 × 100 round (100, 100): from (0, 50) to (200, 150)
    context.sceneGraph.addNode(createTestVideoNode('v', 100, 100, 200, 100));

    click(300, 100);
    expect(context.getSelectedIds().size).toBe(0);

    click(190, 140);
    expect([...context.getSelectedIds()]).toEqual(['v']);
  });

  it('takes a video layer into a marquee', () => {
    context.sceneGraph.addNode(createTestVideoNode('v', 100, 100, 200, 100));
    drag({ x: -50, y: 0 }, { x: 250, y: 200 });
    expect([...context.getSelectedIds()]).toEqual(['v']);
  });

  it('moves a video layer dragged', () => {
    context.sceneGraph.addNode(createTestVideoNode('v', 100, 100, 200, 100));
    context.setSelectedIds(['v']);
    drag({ x: 100, y: 100 }, { x: 130, y: 120 });
    expect(context.sceneGraph.getNode('v')?.transform.position).toEqual({ x: 130, y: 120 });
  });

  it('resizes a video layer by its size, as a picture, its scale left as it is', () => {
    context.sceneGraph.addNode(createTestVideoNode('v', 100, 100, 100, 100));
    context.setSelectedIds(['v']);

    // The bottom-right handle (Y up: the corner at +x, +y in this camera)
    drag({ x: 150, y: 150 }, { x: 200, y: 200 });

    const video = context.sceneGraph.getNode('v') as VideoNode;
    expect(video.width).toBe(150);
    expect(video.height).toBe(150);
    expect(video.transform.scale).toEqual({ x: 1, y: 1 });
  });

  it('keeps a video layer’s proportions resized with Shift', () => {
    context.sceneGraph.addNode(createTestVideoNode('v', 100, 100, 100, 100));
    context.setSelectedIds(['v']);
    drag({ x: 150, y: 150 }, { x: 200, y: 170 }, true);
    const video = context.sceneGraph.getNode('v') as VideoNode;
    expect(video.width).toBe(video.height);
    expect(video.width).toBeGreaterThan(100);
  });

  it('snaps a video layer’s edges to the grid, not its middle', () => {
    context.getSnapToGrid = () => true;
    context.getGridSize = () => 20;
    // 50 × 30: its middle on the grid puts its edges off it
    context.sceneGraph.addNode(createTestVideoNode('v', 0, 0, 50, 30));
    context.setSelectedIds(['v']);

    tool.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));

    const { x, y } = context.sceneGraph.getNode('v')!.transform.position;
    const left = x - 25;
    const top = y + 15;
    expect(left % 20).toBeCloseTo(0);
    expect(top % 20).toBeCloseTo(0);
  });
});
