/**
 * Tests for useCanvasTools hook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCanvasTools } from './useCanvasTools';
import { useEditorStore, DEFAULT_FILL, DEFAULT_STROKE } from '../stores/editorStore';
import { Camera, SceneGraph } from '@quar/core';
import { createKeyframe, createTimeline, createTrack } from '@quar/animation';
import { toast } from '../components/common/Toast';
import { videoLayer } from '../test/videoLayer';
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

  describe('resizing a symbol instance', () => {
    it('keys its scale when auto-keyframe is on', () => {
      useEditorStore.setState({
        symbols: [
          {
            id: 'sym',
            name: 'Square',
            sceneGraphJSON: {
              nodes: [
                {
                  id: 'square',
                  name: 'square',
                  type: 'rectangle',
                  parent: null,
                  children: [],
                  transform: {
                    position: { x: 0, y: 0 },
                    rotation: 0,
                    scale: { x: 1, y: 1 },
                    anchor: { x: 0.5, y: 0.5 },
                    skew: { x: 0, y: 0 },
                  },
                  visible: true,
                  locked: false,
                  opacity: 1,
                  blendMode: 'normal',
                  width: 100,
                  height: 100,
                  cornerRadius: [0, 0, 0, 0],
                  fills: [],
                  strokes: [],
                },
              ],
              rootNodeIds: ['square'],
            },
          },
        ],
        autoKeyframe: true,
        currentFrame: 0,
        selectedNodeIds: new Set(['inst']),
      });
      sceneGraph.addNode({
        id: 'inst',
        name: 'Square 1',
        type: 'symbol-instance',
        parent: null,
        children: [],
        transform: {
          position: { x: 200, y: 100 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          anchor: { x: 0.5, y: 0.5 },
          skew: { x: 0, y: 0 },
        },
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        symbolId: 'sym',
        overrides: [],
      });
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));

      // Drag the (250, 150) corner of its 150..250 x 50..150 box out by 50
      const at = (x: number, y: number) => [camera.worldToScreen({ x, y }), { x, y }] as const;
      act(() => result.current.handlePointerDown(...at(250, 150), createMockPointerEvent()));
      act(() => result.current.handlePointerMove(...at(300, 200), createMockPointerEvent()));
      act(() => result.current.handlePointerUp(...at(300, 200), createMockPointerEvent()));

      const { timeline } = useEditorStore.getState();
      const scaleX = timeline?.tracks.find(
        (t) => t.nodeId === 'inst' && t.property === 'transform.scale.x'
      );
      expect(scaleX?.keyframes[0]?.value).toBeCloseTo(1.5, 5);
      useEditorStore.setState({ symbols: [], autoKeyframe: false });
    });
  });

  describe('resizing a video layer', () => {
    it('keys its size, as a picture’s, when auto-keyframe is on', () => {
      useEditorStore.setState({
        autoKeyframe: true,
        currentFrame: 0,
        timeline: createTimeline(),
        selectedNodeIds: new Set(['video']),
      });
      sceneGraph.addNode(videoLayer('video', 'film', {}, { width: 100, height: 100 }));
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));

      // Drag the (100, 100) corner of its 0..100 box out by 50
      const at = (x: number, y: number) => [camera.worldToScreen({ x, y }), { x, y }] as const;
      act(() => result.current.handlePointerDown(...at(100, 100), createMockPointerEvent()));
      act(() => result.current.handlePointerMove(...at(150, 150), createMockPointerEvent()));
      act(() => result.current.handlePointerUp(...at(150, 150), createMockPointerEvent()));

      const { timeline } = useEditorStore.getState();
      const keyed = (property: string) =>
        timeline?.tracks.find((t) => t.nodeId === 'video' && t.property === property)?.keyframes[0]
          ?.value;
      expect(keyed('width')).toBe(150);
      expect(keyed('height')).toBe(150);
      useEditorStore.setState({ autoKeyframe: false });
    });
  });

  describe('erasing an animated shape', () => {
    it('keeps its animation, but not its size keyframes, and the piece cut off gets it too', () => {
      sceneGraph.addNode({
        id: 'card',
        name: 'Card',
        type: 'rectangle',
        parent: null,
        children: [],
        transform: {
          position: { x: 0, y: 0 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          anchor: { x: 0.5, y: 0.5 },
          skew: { x: 0, y: 0 },
        },
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        width: 200,
        height: 100,
        cornerRadius: [0, 0, 0, 0],
        fills: [],
        strokes: [],
      });
      useEditorStore.setState({
        activeTool: 'eraser',
        eraserMode: 'stroke',
        eraserSize: 10,
        timeline: {
          ...createTimeline(),
          tracks: [
            createTrack('card', 'transform.position.x', [createKeyframe(0, 0)]),
            createTrack('card', 'width', [createKeyframe(0, 200)]),
          ],
        },
      });
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));

      // Across it, left of its middle
      const at = (x: number, y: number) => [camera.worldToScreen({ x, y }), { x, y }] as const;
      act(() => result.current.handlePointerDown(...at(-40, -100), createMockPointerEvent()));
      act(() => result.current.handlePointerMove(...at(-40, 100), createMockPointerEvent()));
      act(() => result.current.handlePointerUp(...at(-40, 100), createMockPointerEvent()));

      const [kept, copy] = sceneGraph.getRootNodes();
      expect(kept!.id).toBe('card');
      expect(kept!.type).toBe('path');
      const tracksOf = (id: string) =>
        useEditorStore
          .getState()
          .timeline.tracks.filter((track) => track.nodeId === id)
          .map((track) => track.property);
      expect(tracksOf('card')).toEqual(['transform.position.x']);
      expect(tracksOf(copy!.id)).toEqual(['transform.position.x']);
      useEditorStore.setState({ activeTool: 'selection', timeline: createTimeline() });
    });

    it('deleting points: their keyframes go, and the others stay on their points', () => {
      const corner = (x: number) => ({
        position: { x, y: 0 },
        handleIn: null,
        handleOut: null,
        type: 'corner' as const,
      });
      sceneGraph.addNode({
        id: 'line',
        name: 'Line',
        type: 'path',
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
        points: [corner(0), corner(100), corner(200)],
        closed: false,
        fills: [],
        strokes: [],
      });
      useEditorStore.setState({
        activeTool: 'eraser',
        eraserMode: 'point',
        eraserSize: 10,
        timeline: {
          ...createTimeline(),
          tracks: [
            createTrack('line', 'points.1.position', [createKeyframe(0, { x: 100, y: 0 })]),
            createTrack('line', 'points.2.position', [createKeyframe(0, { x: 200, y: 40 })]),
          ],
        },
      });
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));

      // A click on the middle point
      const at = [camera.worldToScreen({ x: 100, y: 0 }), { x: 100, y: 0 }] as const;
      act(() => result.current.handlePointerDown(...at, createMockPointerEvent()));
      act(() => result.current.handlePointerUp(...at, createMockPointerEvent()));

      const line = sceneGraph.getNode('line') as { points: Array<{ position: { x: number } }> };
      expect(line.points.map((p) => p.position.x)).toEqual([0, 200]);
      // The last point's keyframe is now the second point's
      expect(
        useEditorStore
          .getState()
          .timeline.tracks.filter((track) => track.nodeId === 'line')
          .map((track) => track.property)
      ).toEqual(['points.1.position']);
      useEditorStore.setState({
        activeTool: 'selection',
        eraserMode: 'stroke',
        timeline: createTimeline(),
      });
    });
  });

  describe('weight paint', () => {
    function boundRect(id: string, boneIds: string[]) {
      sceneGraph.addNode({
        id,
        name: id,
        type: 'rectangle',
        parent: null,
        children: [],
        transform: {
          position: { x: 0, y: 0 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          anchor: { x: 0.5, y: 0.5 },
          skew: { x: 0, y: 0 },
        },
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        width: 10,
        height: 10,
        cornerRadius: [0, 0, 0, 0],
        fills: [],
        strokes: [],
        skinData: {
          vertices: [],
          inverseBindMatrices: Object.fromEntries(boneIds.map((b) => [b, [1, 0, 0, 1, 0, 0]])),
          meshBindMatrix: [1, 0, 0, 1, 0, 0],
          vertexCount: 0,
        },
      } as never);
    }
    const paintTool = (result: { current: ReturnType<typeof useCanvasTools> }) =>
      result.current.toolManagerRef.current!.getActiveTool() as unknown as {
        getActiveBoneId(): string | null;
        getBrushRadius(): number;
        getBrushStrength(): number;
        getPaintMode(): string;
      };

    it('paints with the bone, brush and mode chosen in the panel', () => {
      boundRect('arm', ['upper', 'lower']);
      useEditorStore.setState({ selectedNodeIds: new Set(['arm']) });
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));

      act(() => {
        useEditorStore.getState().setWeightPaintBoneId('lower');
        useEditorStore.getState().setActiveTool('weight-paint');
      });
      expect(paintTool(result).getActiveBoneId()).toBe('lower');

      act(() => {
        useEditorStore.getState().setWeightPaintBoneId('upper');
        useEditorStore.getState().setWeightPaintBrushSize(80);
        useEditorStore.getState().setWeightPaintBrushStrength(0.6);
        useEditorStore.getState().setWeightPaintMode('subtract');
      });
      const tool = paintTool(result);
      expect(tool.getActiveBoneId()).toBe('upper');
      expect(tool.getBrushRadius()).toBe(80);
      expect(tool.getBrushStrength()).toBeCloseTo(0.6);
      expect(tool.getPaintMode()).toBe('subtract');

      // The brush keys show in the panel
      act(() => result.current.handleKeyDown(createMockKeyboardEvent(']')));
      expect(useEditorStore.getState().weightPaintBrushSize).toBe(85);
    });

    it('goes back to selection, and says why, with nothing bound selected', () => {
      const info = vi.spyOn(toast, 'info');
      renderHook(() => useCanvasTools({ camera, sceneGraph }));
      act(() => useEditorStore.getState().setActiveTool('weight-paint'));
      expect(useEditorStore.getState().activeTool).toBe('selection');
      expect(info).toHaveBeenCalledWith(expect.stringContaining('Select a layer bound to bones'));
      info.mockRestore();
    });
  });

  describe('brush and eraser settings', () => {
    const optionsOf = (result: { current: ReturnType<typeof useCanvasTools> }, tool: string) =>
      (
        result.current.toolManagerRef.current!.getTool(tool as never) as unknown as {
          getOptions(): Record<string, unknown>;
        }
      ).getOptions();

    beforeEach(() => {
      useEditorStore.setState({
        brushSize: 5,
        brushSmoothing: 50,
        eraserSize: 10,
        eraserMode: 'stroke',
      });
    });

    it('draws with the Brush size and smoothing set in the panel', () => {
      useEditorStore.setState({ brushSize: 24 });
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));
      expect(optionsOf(result, 'brush')).toMatchObject({ size: 24, smoothing: 50 });

      act(() => {
        useEditorStore.getState().setBrushSize(40);
        useEditorStore.getState().setBrushSmoothing(85);
      });
      expect(optionsOf(result, 'brush')).toMatchObject({ size: 40, smoothing: 85 });
    });

    it('erases with the Eraser size and mode set in the panel', () => {
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));

      act(() => {
        useEditorStore.getState().setEraserSize(30);
        useEditorStore.getState().setEraserMode('point');
      });
      expect(optionsOf(result, 'eraser')).toMatchObject({ size: 30, mode: 'point' });
    });

    it('shows in the panel the size [ and ] give the Eraser', () => {
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));
      act(() => useEditorStore.getState().setActiveTool('eraser'));

      act(() => result.current.handleKeyDown(createMockKeyboardEvent(']')));
      expect(useEditorStore.getState().eraserSize).toBe(15);
      act(() => result.current.handleKeyDown(createMockKeyboardEvent('[')));
      act(() => result.current.handleKeyDown(createMockKeyboardEvent('[')));
      expect(useEditorStore.getState().eraserSize).toBe(5);
      expect(optionsOf(result, 'eraser')).toMatchObject({ size: 5 });
    });
  });

  describe('a Smart Bone recording', () => {
    it('finishes, keeping its work, when another tool is picked', async () => {
      const { createBoneNode } = await import('@quar/rigging');
      sceneGraph.addNode(createBoneNode('arm', 'Arm', { x: 0, y: 0 }, 100));
      const { result } = renderHook(() => useCanvasTools({ camera, sceneGraph }));
      const store = useEditorStore.getState();
      store.createSmartBoneAction(sceneGraph, 'arm');
      const actionId = useEditorStore.getState().smartBoneActions.at(-1)!.id;
      store.addMorphTarget(sceneGraph, actionId, 45);
      const targetId = useEditorStore.getState().smartBoneActions.at(-1)!.targets[0]!.id;

      act(() => useEditorStore.getState().startSmartBoneRecording(actionId, targetId, sceneGraph));
      expect(sceneGraph.getNode('arm')!.transform.rotation).toBe(45);
      const magnet = result.current.toolManagerRef.current!.getTool('point-magnet') as unknown as {
        setWorkingOffsets(offsets: Map<string, unknown[]>): void;
      };
      magnet.setWorkingOffsets(new Map([['mesh', [{ vertexIndex: 0, dx: 4, dy: 0 }]]]));

      act(() => useEditorStore.getState().setActiveTool('selection'));
      const state = useEditorStore.getState();
      expect(state.smartBoneRecordingActionId).toBeNull();
      expect(state.activeTool).toBe('selection');
      expect(sceneGraph.getNode('arm')!.transform.rotation).toBe(0);
      expect(state.smartBoneActions.at(-1)!.targets[0]!.offsets).toEqual({
        mesh: [{ vertexIndex: 0, dx: 4, dy: 0 }],
      });
    });
  });
});
