/**
 * Tests for ToolManager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolManager, type ToolManagerOptions } from './ToolManager';
import { SceneGraph } from '../SceneGraph';
import { Camera } from '../Camera';
import { createMockPointerEvent } from '../test/setup';

function createToolManagerOptions(): ToolManagerOptions {
  const selectedIds = new Set<string>();

  return {
    sceneGraph: new SceneGraph(),
    camera: new Camera(),
    getSelectedIds: () => selectedIds,
    setSelectedIds: (ids: string[]) => {
      selectedIds.clear();
      ids.forEach((id) => selectedIds.add(id));
    },
    addToSelection: (id: string) => selectedIds.add(id),
    clearSelection: () => selectedIds.clear(),
    getDefaultFill: () => ({
      type: 'solid' as const,
      color: { r: 100, g: 149, b: 237, a: 1 },
      opacity: 1,
    }),
    getDefaultStroke: () => ({
      color: { r: 0, g: 0, b: 0, a: 1 },
      width: 2,
      opacity: 1,
      cap: 'round' as const,
      join: 'round' as const,
    }),
  };
}

describe('ToolManager', () => {
  let options: ToolManagerOptions;
  let manager: ToolManager;

  beforeEach(() => {
    options = createToolManagerOptions();
    manager = new ToolManager(options);
  });

  // ==========================================================================
  // Initialization
  // ==========================================================================

  describe('initialization', () => {
    it('should initialize with selection tool as default', () => {
      expect(manager.getActiveToolType()).toBe('selection');
    });

    it('should have active tool instance', () => {
      expect(manager.getActiveTool()).not.toBeNull();
      expect(manager.getActiveTool()?.type).toBe('selection');
    });

    it('should have default cursor', () => {
      expect(manager.getCursor()).toBe('default');
    });
  });

  // ==========================================================================
  // Tool Switching
  // ==========================================================================

  describe('tool switching', () => {
    it('should switch to rectangle tool', () => {
      manager.setActiveTool('rectangle');
      expect(manager.getActiveToolType()).toBe('rectangle');
      expect(manager.getCursor()).toBe('crosshair');
    });

    it('should switch to ellipse tool', () => {
      manager.setActiveTool('ellipse');
      expect(manager.getActiveToolType()).toBe('ellipse');
      expect(manager.getCursor()).toBe('crosshair');
    });

    it('should switch to pen tool', () => {
      manager.setActiveTool('pen');
      expect(manager.getActiveToolType()).toBe('pen');
      expect(manager.getCursor()).toBe('crosshair');
    });

    it('should switch to polygon tool', () => {
      manager.setActiveTool('polygon');
      expect(manager.getActiveToolType()).toBe('polygon');
      expect(manager.getCursor()).toBe('crosshair');
    });

    it('should switch back to selection tool', () => {
      manager.setActiveTool('rectangle');
      manager.setActiveTool('selection');
      expect(manager.getActiveToolType()).toBe('selection');
    });

    it('should warn on unknown tool', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      manager.setActiveTool('unknown' as any);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should call onDeactivate on previous tool', () => {
      manager.setActiveTool('pen');
      const penTool = manager.getTool('pen');
      const deactivateSpy = vi.spyOn(penTool!, 'onDeactivate');

      manager.setActiveTool('selection');
      expect(deactivateSpy).toHaveBeenCalled();
    });

    it('should call onActivate on new tool', () => {
      const selectionTool = manager.getTool('selection');
      const activateSpy = vi.fn();
      selectionTool!.onActivate = activateSpy;

      manager.setActiveTool('rectangle');
      manager.setActiveTool('selection');

      expect(activateSpy).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Event Routing
  // ==========================================================================

  describe('event routing', () => {
    it('should route pointer down to active tool', () => {
      const tool = manager.getActiveTool();
      const spy = vi.spyOn(tool!, 'onPointerDown');

      const event = createMockPointerEvent({ worldPosition: { x: 50, y: 50 } });
      manager.handlePointerDown(event);

      expect(spy).toHaveBeenCalledWith(event);
    });

    it('should route pointer move to active tool', () => {
      const tool = manager.getActiveTool();
      const spy = vi.spyOn(tool!, 'onPointerMove');

      const event = createMockPointerEvent({ worldPosition: { x: 50, y: 50 } });
      manager.handlePointerMove(event);

      expect(spy).toHaveBeenCalledWith(event);
    });

    it('should route pointer up to active tool', () => {
      const tool = manager.getActiveTool();
      const spy = vi.spyOn(tool!, 'onPointerUp');

      const event = createMockPointerEvent({ worldPosition: { x: 50, y: 50 } });
      manager.handlePointerUp(event);

      expect(spy).toHaveBeenCalledWith(event);
    });

    it('should route key down to active tool', () => {
      const tool = manager.getActiveTool();
      tool!.onKeyDown = vi.fn();
      const spy = vi.spyOn(tool!, 'onKeyDown');

      const event = { key: 'Escape' } as KeyboardEvent;
      manager.handleKeyDown(event);

      expect(spy).toHaveBeenCalledWith(event);
    });

    it('should route key up to active tool', () => {
      const tool = manager.getActiveTool();
      tool!.onKeyUp = vi.fn();
      const spy = vi.spyOn(tool!, 'onKeyUp');

      const event = { key: 'Escape' } as KeyboardEvent;
      manager.handleKeyUp(event);

      expect(spy).toHaveBeenCalledWith(event);
    });
  });

  // ==========================================================================
  // Keyboard Shortcuts
  // ==========================================================================

  describe('keyboard shortcuts', () => {
    it('should switch to selection tool on V', () => {
      manager.setActiveTool('rectangle');
      manager.handleKeyDown({ key: 'v' } as KeyboardEvent);
      expect(manager.getActiveToolType()).toBe('selection');
    });

    it('should switch to rectangle tool on R', () => {
      manager.handleKeyDown({ key: 'r' } as KeyboardEvent);
      expect(manager.getActiveToolType()).toBe('rectangle');
    });

    it('should switch to ellipse tool on O', () => {
      manager.handleKeyDown({ key: 'o' } as KeyboardEvent);
      expect(manager.getActiveToolType()).toBe('ellipse');
    });

    it('should switch to pen tool on P', () => {
      manager.handleKeyDown({ key: 'p' } as KeyboardEvent);
      expect(manager.getActiveToolType()).toBe('pen');
    });

    it('should switch to polygon tool on U', () => {
      manager.handleKeyDown({ key: 'u' } as KeyboardEvent);
      expect(manager.getActiveToolType()).toBe('polygon');
    });

    it('should handle uppercase shortcuts', () => {
      manager.handleKeyDown({ key: 'R' } as KeyboardEvent);
      expect(manager.getActiveToolType()).toBe('rectangle');
    });

    it('should not switch tools when modifier key is held', () => {
      manager.handleKeyDown({ key: 'r', ctrlKey: true } as KeyboardEvent);
      expect(manager.getActiveToolType()).toBe('selection');
    });

    it('should not switch tools when alt is held', () => {
      manager.handleKeyDown({ key: 'r', altKey: true } as KeyboardEvent);
      expect(manager.getActiveToolType()).toBe('selection');
    });
  });

  // ==========================================================================
  // Preview
  // ==========================================================================

  describe('preview', () => {
    it('should return preview node from active tool', () => {
      manager.setActiveTool('rectangle');

      const event = createMockPointerEvent({
        worldPosition: { x: 0, y: 0 },
        button: 0,
      });
      manager.handlePointerDown(event);

      expect(manager.getPreviewNode()).not.toBeNull();
    });

    it('should return null when no preview', () => {
      expect(manager.getPreviewNode()).toBeNull();
    });
  });

  // ==========================================================================
  // Get Tool
  // ==========================================================================

  describe('getTool', () => {
    it('should return tool by type', () => {
      const rectangleTool = manager.getTool('rectangle');
      expect(rectangleTool).not.toBeUndefined();
      expect(rectangleTool?.type).toBe('rectangle');
    });

    it('should return polygon tool by type', () => {
      const polygonTool = manager.getTool('polygon');
      expect(polygonTool).not.toBeUndefined();
      expect(polygonTool?.type).toBe('polygon');
    });

    it('should return undefined for unknown tool', () => {
      const tool = manager.getTool('unknown' as any);
      expect(tool).toBeUndefined();
    });
  });

  // ==========================================================================
  // ID Generation
  // ==========================================================================

  describe('id generation', () => {
    it('should generate unique IDs for shapes', () => {
      manager.setActiveTool('rectangle');

      // Create first rectangle
      manager.handlePointerDown(
        createMockPointerEvent({
          worldPosition: { x: 0, y: 0 },
          button: 0,
        })
      );
      manager.handlePointerUp(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 100 },
          button: 0,
        })
      );

      // Create second rectangle
      manager.handlePointerDown(
        createMockPointerEvent({
          worldPosition: { x: 200, y: 0 },
          button: 0,
        })
      );
      manager.handlePointerUp(
        createMockPointerEvent({
          worldPosition: { x: 300, y: 100 },
          button: 0,
        })
      );

      const nodes = Array.from(options.sceneGraph.getNodes());
      expect(nodes.length).toBe(2);
      expect(nodes[0].id).not.toBe(nodes[1].id);
    });
  });

  // ==========================================================================
  // Dispose
  // ==========================================================================

  describe('dispose', () => {
    it('should dispose without error', () => {
      expect(() => manager.dispose()).not.toThrow();
    });

    it('should clear tools on dispose', () => {
      manager.dispose();
      expect(manager.getActiveTool()).toBeNull();
    });

    it('should deactivate current tool on dispose', () => {
      manager.setActiveTool('pen');
      const penTool = manager.getTool('pen');
      const deactivateSpy = vi.spyOn(penTool!, 'onDeactivate');

      manager.dispose();
      expect(deactivateSpy).toHaveBeenCalled();
    });
  });
});
