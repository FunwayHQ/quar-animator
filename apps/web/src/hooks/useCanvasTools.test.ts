/**
 * Tests for useCanvasTools hook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCanvasTools } from './useCanvasTools';
import { useEditorStore, DEFAULT_FILL, DEFAULT_STROKE } from '../stores/editorStore';
import { Camera, SceneGraph } from '@quar/core';
import type React from 'react';

// ============================================================================
// Test Helpers
// ============================================================================

function resetStore() {
  useEditorStore.setState({
    activeTool: 'selection',
    selectedNodeIds: new Set<string>(),
    defaultFill: DEFAULT_FILL,
    defaultStroke: DEFAULT_STROKE,
    isDrawing: false,
  });
}

function createMockPointerEvent(overrides: Partial<React.PointerEvent> = {}): React.PointerEvent {
  return {
    button: 0,
    buttons: 1,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    pressure: 0.5,
    timeStamp: Date.now(),
    ...overrides,
  } as React.PointerEvent;
}

function createMockKeyboardEvent(
  key: string,
  overrides: Partial<React.KeyboardEvent> = {}
): React.KeyboardEvent {
  return {
    key,
    code: key,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    nativeEvent: new KeyboardEvent('keydown', { key }),
    ...overrides,
  } as React.KeyboardEvent;
}

// ============================================================================
// Tests
// ============================================================================

describe('useCanvasTools', () => {
  let camera: Camera;
  let sceneGraph: SceneGraph;

  beforeEach(() => {
    resetStore();
    camera = new Camera();
    camera.setViewport(800, 600);
    sceneGraph = new SceneGraph();
  });

  // ==========================================================================
  // Initialization
  // ==========================================================================

  describe('initialization', () => {
    it('should initialize with null toolManager when camera is null', () => {
      const { result } = renderHook(() => useCanvasTools({ camera: null, sceneGraph }));

      expect(result.current.toolManagerRef.current).toBeNull();
    });

    it('should initialize toolManager when camera is provided', () => {
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));

      expect(result.current.toolManagerRef.current).not.toBeNull();
    });

    it('should initialize sceneGraph', () => {
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));

      expect(result.current.sceneGraphRef.current).toBeDefined();
    });

    it('should return default cursor', () => {
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));

      expect(result.current.cursor).toBe('default');
    });

    it('should have null previewNode initially', () => {
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));

      expect(result.current.previewNode).toBeNull();
    });
  });

  // ==========================================================================
  // Tool Synchronization
  // ==========================================================================

  describe('tool synchronization', () => {
    it('should sync active tool from store', () => {
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));

      act(() => {
        useEditorStore.getState().setActiveTool('rectangle');
      });

      expect(result.current.toolManagerRef.current?.getActiveToolType()).toBe('rectangle');
    });

    it('should update cursor when tool changes', () => {
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));

      act(() => {
        useEditorStore.getState().setActiveTool('rectangle');
      });

      expect(result.current.cursor).toBe('crosshair');
    });

    it('should sync pen tool', () => {
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));

      act(() => {
        useEditorStore.getState().setActiveTool('pen');
      });

      expect(result.current.toolManagerRef.current?.getActiveToolType()).toBe('pen');
    });
  });

  // ==========================================================================
  // Pointer Events
  // ==========================================================================

  describe('pointer events', () => {
    it('should handle pointer down', () => {
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));

      act(() => {
        result.current.handlePointerDown(
          { x: 100, y: 100 },
          { x: 50, y: 50 },
          createMockPointerEvent()
        );
      });

      expect(useEditorStore.getState().isDrawing).toBe(true);
    });

    it('should handle pointer up', () => {
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));

      act(() => {
        result.current.handlePointerDown(
          { x: 100, y: 100 },
          { x: 50, y: 50 },
          createMockPointerEvent()
        );
      });

      act(() => {
        result.current.handlePointerUp(
          { x: 200, y: 200 },
          { x: 100, y: 100 },
          createMockPointerEvent()
        );
      });

      expect(useEditorStore.getState().isDrawing).toBe(false);
    });

    it('should handle pointer move without error', () => {
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));

      expect(() => {
        act(() => {
          result.current.handlePointerMove(
            { x: 150, y: 150 },
            { x: 75, y: 75 },
            createMockPointerEvent()
          );
        });
      }).not.toThrow();
    });

    it('should create preview node when drawing rectangle', () => {
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));

      act(() => {
        useEditorStore.getState().setActiveTool('rectangle');
      });

      act(() => {
        result.current.handlePointerDown(
          { x: 100, y: 100 },
          { x: 0, y: 0 },
          createMockPointerEvent()
        );
      });

      act(() => {
        result.current.handlePointerMove(
          { x: 200, y: 200 },
          { x: 100, y: 100 },
          createMockPointerEvent()
        );
      });

      expect(result.current.previewNode).not.toBeNull();
      expect(result.current.previewNode?.type).toBe('rectangle');
    });

    it('should clear preview node on pointer up', () => {
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));

      act(() => {
        useEditorStore.getState().setActiveTool('rectangle');
      });

      act(() => {
        result.current.handlePointerDown(
          { x: 100, y: 100 },
          { x: 0, y: 0 },
          createMockPointerEvent()
        );
      });

      act(() => {
        result.current.handlePointerMove(
          { x: 200, y: 200 },
          { x: 100, y: 100 },
          createMockPointerEvent()
        );
      });

      act(() => {
        result.current.handlePointerUp(
          { x: 200, y: 200 },
          { x: 100, y: 100 },
          createMockPointerEvent()
        );
      });

      expect(result.current.previewNode).toBeNull();
    });
  });

  // ==========================================================================
  // Keyboard Events
  // ==========================================================================

  describe('keyboard events', () => {
    it('should handle key down without error', () => {
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));

      expect(() => {
        act(() => {
          result.current.handleKeyDown(createMockKeyboardEvent('Delete'));
        });
      }).not.toThrow();
    });

    it('should handle key up without error', () => {
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));

      expect(() => {
        act(() => {
          result.current.handleKeyUp(createMockKeyboardEvent('Shift'));
        });
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  describe('cleanup', () => {
    it('should dispose toolManager on unmount', () => {
      const { result, unmount } = renderHook(() => useCanvasTools({ camera, sceneGraph }));
      const manager = result.current.toolManagerRef.current;
      const disposeSpy = vi.spyOn(manager!, 'dispose');

      unmount();

      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should set toolManagerRef to null on unmount', () => {
      const { result, unmount } = renderHook(() => useCanvasTools({ camera, sceneGraph }));

      unmount();

      // After unmount, the ref should be cleaned up
      // Note: In practice, the ref may still hold the value but the manager is disposed
      expect(result.current.toolManagerRef.current).toBeNull();
    });
  });

  // ==========================================================================
  // No Camera
  // ==========================================================================

  describe('no camera', () => {
    it('should not throw when handling events without camera', () => {
      const { result } = renderHook(() => useCanvasTools({ camera: null, sceneGraph }));

      expect(() => {
        act(() => {
          result.current.handlePointerDown(
            { x: 100, y: 100 },
            { x: 50, y: 50 },
            createMockPointerEvent()
          );
        });
      }).not.toThrow();
    });

    it('should not throw on key events without camera', () => {
      const { result } = renderHook(() => useCanvasTools({ camera: null, sceneGraph }));

      expect(() => {
        act(() => {
          result.current.handleKeyDown(createMockKeyboardEvent('r'));
        });
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // SceneGraph Access
  // ==========================================================================

  describe('sceneGraph access', () => {
    it('should allow adding nodes to sceneGraph', () => {
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));

      act(() => {
        useEditorStore.getState().setActiveTool('rectangle');
      });

      // Draw a rectangle
      act(() => {
        result.current.handlePointerDown(
          { x: 100, y: 100 },
          { x: 0, y: 0 },
          createMockPointerEvent()
        );
      });

      act(() => {
        result.current.handlePointerUp(
          { x: 200, y: 200 },
          { x: 100, y: 100 },
          createMockPointerEvent()
        );
      });

      // Check that a node was added
      expect(result.current.sceneGraphRef.current.getNodeCount()).toBe(1);
    });
  });
});
