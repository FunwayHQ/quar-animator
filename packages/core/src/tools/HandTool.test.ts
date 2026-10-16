import { describe, expect, it, vi } from 'vitest';
import type { CanvasPointerEvent } from '@quar/types';
import type { ToolContext } from './BaseTool';
import { HandTool } from './HandTool';

function pointerAt(x: number, y: number): CanvasPointerEvent {
  return {
    worldPosition: { x, y },
    screenPosition: { x, y },
    button: 0,
    buttons: 1,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    pressure: 0.5,
    timestamp: 0,
  };
}

function createTool() {
  const pan = vi.fn();
  const context = { camera: { pan } } as unknown as ToolContext;
  return { tool: new HandTool(context), pan };
}

describe('HandTool', () => {
  it('starts ready to pan and ignores pointer movement until a drag begins', () => {
    const { tool, pan } = createTool();

    expect(tool.type).toBe('hand');
    expect(tool.cursor).toBe('grab');
    expect(tool.getCursor()).toBe('grab');

    tool.onPointerMove(pointerAt(20, 30));

    expect(pan).not.toHaveBeenCalled();
  });

  it('pans by incremental screen-space movement while dragging', () => {
    const { tool, pan } = createTool();
    tool.onPointerDown(pointerAt(10, 15));

    expect(tool.getCursor()).toBe('grabbing');
    tool.onPointerMove(pointerAt(18, 22));
    tool.onPointerMove(pointerAt(25, 20));

    expect(pan).toHaveBeenNthCalledWith(1, { x: 8, y: 7 });
    expect(pan).toHaveBeenNthCalledWith(2, { x: 7, y: -2 });
  });

  it('stops panning on pointer up and resets after deactivation', () => {
    const { tool, pan } = createTool();
    tool.onPointerDown(pointerAt(5, 5));
    tool.onPointerMove(pointerAt(8, 9));
    tool.onPointerUp(pointerAt(8, 9));
    tool.onPointerMove(pointerAt(20, 20));

    expect(tool.getCursor()).toBe('grab');
    expect(pan).toHaveBeenCalledTimes(1);

    tool.onPointerDown(pointerAt(10, 10));
    tool.onDeactivate();
    tool.onPointerMove(pointerAt(30, 40));

    expect(tool.getCursor()).toBe('grab');
    expect(pan).toHaveBeenCalledTimes(1);
  });
});
