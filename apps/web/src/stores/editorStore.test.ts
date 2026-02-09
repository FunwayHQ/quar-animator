/**
 * Tests for Editor Store
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEditorStore, DEFAULT_FILL, DEFAULT_STROKE } from './editorStore';
import { createTimeline } from '@quar/animation';
import { DEFAULT_ONION_SKIN_SETTINGS } from '@quar/core';

describe('EditorStore', () => {
  // Reset store before each test
  beforeEach(() => {
    useEditorStore.setState({
      activeTool: 'selection',
      selectedNodeIds: new Set<string>(),
      defaultFill: DEFAULT_FILL,
      defaultStroke: DEFAULT_STROKE,
      isDrawing: false,
      brushSize: 5,
      brushSmoothing: 50,
      eraserSize: 10,
      eraserMode: 'stroke',
      aspectRatioLocked: false,
      clipboard: null,
      currentFrame: 0,
      isPlaying: false,
      isLooping: false,
      timelineDuration: 300,
      frameRate: 30,
      timelineExpanded: true,
      timeline: createTimeline({ duration: 300, frameRate: 30 }),
      autoKeyframe: false,
      selectedKeyframeIds: new Set<string>(),
      keyframeClipboard: null,
      onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
      projectId: null,
      projectName: 'Untitled Project',
      isDirty: false,
      projectCreatedAt: null,
    });
  });

  // ==========================================================================
  // Initial State
  // ==========================================================================

  describe('initial state', () => {
    it('should have selection as the default active tool', () => {
      const state = useEditorStore.getState();
      expect(state.activeTool).toBe('selection');
    });

    it('should have an empty selection', () => {
      const state = useEditorStore.getState();
      expect(state.selectedNodeIds.size).toBe(0);
    });

    it('should have default fill settings', () => {
      const state = useEditorStore.getState();
      expect(state.defaultFill).toEqual(DEFAULT_FILL);
      expect(state.defaultFill.type).toBe('solid');
      expect(state.defaultFill.opacity).toBe(1);
    });

    it('should have default stroke settings', () => {
      const state = useEditorStore.getState();
      expect(state.defaultStroke).toEqual(DEFAULT_STROKE);
      expect(state.defaultStroke.width).toBe(2);
      expect(state.defaultStroke.cap).toBe('round');
      expect(state.defaultStroke.join).toBe('round');
    });

    it('should not be in drawing mode initially', () => {
      const state = useEditorStore.getState();
      expect(state.isDrawing).toBe(false);
    });

    it('should have default brush settings', () => {
      const state = useEditorStore.getState();
      expect(state.brushSize).toBe(5);
      expect(state.brushSmoothing).toBe(50);
    });

    it('should have default eraser settings', () => {
      const state = useEditorStore.getState();
      expect(state.eraserSize).toBe(10);
      expect(state.eraserMode).toBe('stroke');
    });

    it('should have aspect ratio unlocked by default', () => {
      const state = useEditorStore.getState();
      expect(state.aspectRatioLocked).toBe(false);
    });
  });

  // ==========================================================================
  // Tool Switching
  // ==========================================================================

  describe('tool switching', () => {
    it('should switch to rectangle tool', () => {
      const { setActiveTool } = useEditorStore.getState();
      setActiveTool('rectangle');
      expect(useEditorStore.getState().activeTool).toBe('rectangle');
    });

    it('should switch to ellipse tool', () => {
      const { setActiveTool } = useEditorStore.getState();
      setActiveTool('ellipse');
      expect(useEditorStore.getState().activeTool).toBe('ellipse');
    });

    it('should switch to pen tool', () => {
      const { setActiveTool } = useEditorStore.getState();
      setActiveTool('pen');
      expect(useEditorStore.getState().activeTool).toBe('pen');
    });

    it('should switch back to selection tool', () => {
      const { setActiveTool } = useEditorStore.getState();
      setActiveTool('pen');
      setActiveTool('selection');
      expect(useEditorStore.getState().activeTool).toBe('selection');
    });

    it('should switch to brush tool', () => {
      const { setActiveTool } = useEditorStore.getState();
      setActiveTool('brush');
      expect(useEditorStore.getState().activeTool).toBe('brush');
    });
  });

  // ==========================================================================
  // Selection Operations
  // ==========================================================================

  describe('selection operations', () => {
    it('should set selection to a single node', () => {
      const { setSelection } = useEditorStore.getState();
      setSelection(['node1']);
      const state = useEditorStore.getState();
      expect(state.selectedNodeIds.size).toBe(1);
      expect(state.selectedNodeIds.has('node1')).toBe(true);
    });

    it('should set selection to multiple nodes', () => {
      const { setSelection } = useEditorStore.getState();
      setSelection(['node1', 'node2', 'node3']);
      const state = useEditorStore.getState();
      expect(state.selectedNodeIds.size).toBe(3);
      expect(state.selectedNodeIds.has('node1')).toBe(true);
      expect(state.selectedNodeIds.has('node2')).toBe(true);
      expect(state.selectedNodeIds.has('node3')).toBe(true);
    });

    it('should replace existing selection when setting new selection', () => {
      const { setSelection } = useEditorStore.getState();
      setSelection(['node1', 'node2']);
      setSelection(['node3']);
      const state = useEditorStore.getState();
      expect(state.selectedNodeIds.size).toBe(1);
      expect(state.selectedNodeIds.has('node3')).toBe(true);
      expect(state.selectedNodeIds.has('node1')).toBe(false);
    });

    it('should add a node to existing selection', () => {
      const { setSelection, addToSelection } = useEditorStore.getState();
      setSelection(['node1']);
      addToSelection('node2');
      const state = useEditorStore.getState();
      expect(state.selectedNodeIds.size).toBe(2);
      expect(state.selectedNodeIds.has('node1')).toBe(true);
      expect(state.selectedNodeIds.has('node2')).toBe(true);
    });

    it('should not duplicate when adding already selected node', () => {
      const { setSelection, addToSelection } = useEditorStore.getState();
      setSelection(['node1']);
      addToSelection('node1');
      const state = useEditorStore.getState();
      expect(state.selectedNodeIds.size).toBe(1);
    });

    it('should remove a node from selection', () => {
      const { setSelection, removeFromSelection } = useEditorStore.getState();
      setSelection(['node1', 'node2']);
      removeFromSelection('node1');
      const state = useEditorStore.getState();
      expect(state.selectedNodeIds.size).toBe(1);
      expect(state.selectedNodeIds.has('node2')).toBe(true);
      expect(state.selectedNodeIds.has('node1')).toBe(false);
    });

    it('should handle removing non-existent node gracefully', () => {
      const { setSelection, removeFromSelection } = useEditorStore.getState();
      setSelection(['node1']);
      removeFromSelection('nonexistent');
      const state = useEditorStore.getState();
      expect(state.selectedNodeIds.size).toBe(1);
    });

    it('should toggle selection (add when not selected)', () => {
      const { toggleSelection } = useEditorStore.getState();
      toggleSelection('node1');
      const state = useEditorStore.getState();
      expect(state.selectedNodeIds.has('node1')).toBe(true);
    });

    it('should toggle selection (remove when selected)', () => {
      const { setSelection, toggleSelection } = useEditorStore.getState();
      setSelection(['node1']);
      toggleSelection('node1');
      const state = useEditorStore.getState();
      expect(state.selectedNodeIds.has('node1')).toBe(false);
    });

    it('should clear selection', () => {
      const { setSelection, clearSelection } = useEditorStore.getState();
      setSelection(['node1', 'node2', 'node3']);
      clearSelection();
      const state = useEditorStore.getState();
      expect(state.selectedNodeIds.size).toBe(0);
    });

    it('should check if node is selected using isSelected', () => {
      const { setSelection, isSelected } = useEditorStore.getState();
      setSelection(['node1', 'node2']);
      expect(isSelected('node1')).toBe(true);
      expect(isSelected('node2')).toBe(true);
      expect(isSelected('node3')).toBe(false);
    });
  });

  // ==========================================================================
  // Default Fill/Stroke
  // ==========================================================================

  describe('default fill/stroke', () => {
    it('should update default fill', () => {
      const { setDefaultFill } = useEditorStore.getState();
      const newFill = {
        type: 'solid' as const,
        color: { r: 255, g: 0, b: 0, a: 1 },
        opacity: 0.5,
      };
      setDefaultFill(newFill);
      expect(useEditorStore.getState().defaultFill).toEqual(newFill);
    });

    it('should update default fill to gradient type', () => {
      const { setDefaultFill } = useEditorStore.getState();
      const newFill = {
        type: 'gradient' as const,
        gradient: {
          type: 'linear' as const,
          stops: [
            { offset: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
            { offset: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
          ],
          angle: 45,
        },
        opacity: 1,
      };
      setDefaultFill(newFill);
      expect(useEditorStore.getState().defaultFill.type).toBe('gradient');
    });

    it('should update default fill to none', () => {
      const { setDefaultFill } = useEditorStore.getState();
      const newFill = {
        type: 'none' as const,
        opacity: 0,
      };
      setDefaultFill(newFill);
      expect(useEditorStore.getState().defaultFill.type).toBe('none');
    });

    it('should update default stroke', () => {
      const { setDefaultStroke } = useEditorStore.getState();
      const newStroke = {
        color: { r: 255, g: 0, b: 0, a: 1 },
        width: 5,
        opacity: 1,
        cap: 'square' as const,
        join: 'miter' as const,
        miterLimit: 4,
      };
      setDefaultStroke(newStroke);
      expect(useEditorStore.getState().defaultStroke).toEqual(newStroke);
    });

    it('should update stroke with dash array', () => {
      const { setDefaultStroke } = useEditorStore.getState();
      const newStroke = {
        color: { r: 0, g: 0, b: 0, a: 1 },
        width: 2,
        opacity: 1,
        cap: 'butt' as const,
        join: 'bevel' as const,
        dashArray: [5, 5],
        dashOffset: 0,
      };
      setDefaultStroke(newStroke);
      expect(useEditorStore.getState().defaultStroke.dashArray).toEqual([5, 5]);
    });
  });

  // ==========================================================================
  // Drawing State
  // ==========================================================================

  describe('drawing state', () => {
    it('should set drawing state to true', () => {
      const { setIsDrawing } = useEditorStore.getState();
      setIsDrawing(true);
      expect(useEditorStore.getState().isDrawing).toBe(true);
    });

    it('should set drawing state to false', () => {
      const { setIsDrawing } = useEditorStore.getState();
      setIsDrawing(true);
      setIsDrawing(false);
      expect(useEditorStore.getState().isDrawing).toBe(false);
    });
  });

  // ==========================================================================
  // Brush Settings
  // ==========================================================================

  describe('brush settings', () => {
    it('should set brush size', () => {
      const { setBrushSize } = useEditorStore.getState();
      setBrushSize(20);
      expect(useEditorStore.getState().brushSize).toBe(20);
    });

    it('should clamp brush size to minimum of 1', () => {
      const { setBrushSize } = useEditorStore.getState();
      setBrushSize(0);
      expect(useEditorStore.getState().brushSize).toBe(1);
      setBrushSize(-5);
      expect(useEditorStore.getState().brushSize).toBe(1);
    });

    it('should clamp brush size to maximum of 100', () => {
      const { setBrushSize } = useEditorStore.getState();
      setBrushSize(150);
      expect(useEditorStore.getState().brushSize).toBe(100);
    });

    it('should set brush smoothing', () => {
      const { setBrushSmoothing } = useEditorStore.getState();
      setBrushSmoothing(75);
      expect(useEditorStore.getState().brushSmoothing).toBe(75);
    });

    it('should clamp brush smoothing to minimum of 0', () => {
      const { setBrushSmoothing } = useEditorStore.getState();
      setBrushSmoothing(-10);
      expect(useEditorStore.getState().brushSmoothing).toBe(0);
    });

    it('should clamp brush smoothing to maximum of 100', () => {
      const { setBrushSmoothing } = useEditorStore.getState();
      setBrushSmoothing(150);
      expect(useEditorStore.getState().brushSmoothing).toBe(100);
    });
  });

  // ==========================================================================
  // Eraser Settings
  // ==========================================================================

  describe('eraser settings', () => {
    it('should set eraser size', () => {
      const { setEraserSize } = useEditorStore.getState();
      setEraserSize(25);
      expect(useEditorStore.getState().eraserSize).toBe(25);
    });

    it('should clamp eraser size to minimum of 1', () => {
      const { setEraserSize } = useEditorStore.getState();
      setEraserSize(0);
      expect(useEditorStore.getState().eraserSize).toBe(1);
      setEraserSize(-10);
      expect(useEditorStore.getState().eraserSize).toBe(1);
    });

    it('should clamp eraser size to maximum of 100', () => {
      const { setEraserSize } = useEditorStore.getState();
      setEraserSize(200);
      expect(useEditorStore.getState().eraserSize).toBe(100);
    });

    it('should set eraser mode to stroke', () => {
      const { setEraserMode } = useEditorStore.getState();
      setEraserMode('point');
      setEraserMode('stroke');
      expect(useEditorStore.getState().eraserMode).toBe('stroke');
    });

    it('should set eraser mode to point', () => {
      const { setEraserMode } = useEditorStore.getState();
      setEraserMode('point');
      expect(useEditorStore.getState().eraserMode).toBe('point');
    });
  });

  // ==========================================================================
  // Aspect Ratio Lock
  // ==========================================================================

  describe('aspect ratio lock', () => {
    it('should toggle aspect ratio lock on', () => {
      const { toggleAspectRatioLock } = useEditorStore.getState();
      toggleAspectRatioLock();
      expect(useEditorStore.getState().aspectRatioLocked).toBe(true);
    });

    it('should toggle aspect ratio lock off', () => {
      const { toggleAspectRatioLock } = useEditorStore.getState();
      toggleAspectRatioLock(); // on
      toggleAspectRatioLock(); // off
      expect(useEditorStore.getState().aspectRatioLocked).toBe(false);
    });

    it('should toggle back and forth', () => {
      const { toggleAspectRatioLock } = useEditorStore.getState();
      toggleAspectRatioLock();
      expect(useEditorStore.getState().aspectRatioLocked).toBe(true);
      toggleAspectRatioLock();
      expect(useEditorStore.getState().aspectRatioLocked).toBe(false);
      toggleAspectRatioLock();
      expect(useEditorStore.getState().aspectRatioLocked).toBe(true);
    });
  });

  // ==========================================================================
  // Timeline State
  // ==========================================================================

  describe('timeline state', () => {
    it('should have default timeline values', () => {
      const state = useEditorStore.getState();
      expect(state.currentFrame).toBe(0);
      expect(state.isPlaying).toBe(false);
      expect(state.isLooping).toBe(false);
      expect(state.timelineDuration).toBe(300);
      expect(state.frameRate).toBe(30);
      expect(state.timelineExpanded).toBe(true);
    });

    it('should set current frame', () => {
      const { setCurrentFrame } = useEditorStore.getState();
      setCurrentFrame(50);
      expect(useEditorStore.getState().currentFrame).toBe(50);
    });

    it('should clamp current frame to min 0', () => {
      const { setCurrentFrame } = useEditorStore.getState();
      setCurrentFrame(-10);
      expect(useEditorStore.getState().currentFrame).toBe(0);
    });

    it('should clamp current frame to max duration - 1', () => {
      const { setCurrentFrame } = useEditorStore.getState();
      setCurrentFrame(500);
      expect(useEditorStore.getState().currentFrame).toBe(299);
    });

    it('should round fractional frames', () => {
      const { setCurrentFrame } = useEditorStore.getState();
      setCurrentFrame(10.7);
      expect(useEditorStore.getState().currentFrame).toBe(11);
    });

    it('should set isPlaying', () => {
      const { setIsPlaying } = useEditorStore.getState();
      setIsPlaying(true);
      expect(useEditorStore.getState().isPlaying).toBe(true);
      setIsPlaying(false);
      expect(useEditorStore.getState().isPlaying).toBe(false);
    });

    it('should set isLooping', () => {
      const { setIsLooping } = useEditorStore.getState();
      setIsLooping(true);
      expect(useEditorStore.getState().isLooping).toBe(true);
    });

    it('should set timeline duration with min 1', () => {
      const { setTimelineDuration } = useEditorStore.getState();
      setTimelineDuration(600);
      expect(useEditorStore.getState().timelineDuration).toBe(600);
      setTimelineDuration(0);
      expect(useEditorStore.getState().timelineDuration).toBe(1);
    });

    it('should set frame rate with clamping', () => {
      const { setFrameRate } = useEditorStore.getState();
      setFrameRate(60);
      expect(useEditorStore.getState().frameRate).toBe(60);
      setFrameRate(0);
      expect(useEditorStore.getState().frameRate).toBe(1);
      setFrameRate(200);
      expect(useEditorStore.getState().frameRate).toBe(120);
    });

    it('should set timeline expanded', () => {
      const { setTimelineExpanded } = useEditorStore.getState();
      setTimelineExpanded(false);
      expect(useEditorStore.getState().timelineExpanded).toBe(false);
    });

    it('should toggle timeline expanded', () => {
      const { toggleTimelineExpanded } = useEditorStore.getState();
      toggleTimelineExpanded();
      expect(useEditorStore.getState().timelineExpanded).toBe(false);
      toggleTimelineExpanded();
      expect(useEditorStore.getState().timelineExpanded).toBe(true);
    });

    it('should clamp frame when accessing with existing duration', () => {
      const { setCurrentFrame } = useEditorStore.getState();
      // Duration is 300, so max frame is 299
      setCurrentFrame(299);
      expect(useEditorStore.getState().currentFrame).toBe(299);
      setCurrentFrame(300);
      expect(useEditorStore.getState().currentFrame).toBe(299);
    });

    it('should round frame rate', () => {
      const { setFrameRate } = useEditorStore.getState();
      setFrameRate(29.7);
      expect(useEditorStore.getState().frameRate).toBe(30);
    });

    it('should round timeline duration', () => {
      const { setTimelineDuration } = useEditorStore.getState();
      setTimelineDuration(150.8);
      expect(useEditorStore.getState().timelineDuration).toBe(151);
    });

    it('should handle negative frame rate', () => {
      const { setFrameRate } = useEditorStore.getState();
      setFrameRate(-5);
      expect(useEditorStore.getState().frameRate).toBe(1);
    });

    it('should handle negative duration', () => {
      const { setTimelineDuration } = useEditorStore.getState();
      setTimelineDuration(-10);
      expect(useEditorStore.getState().timelineDuration).toBe(1);
    });
  });

  // ==========================================================================
  // Clipboard & Node Operations
  // ==========================================================================

  describe('clipboard & node operations', () => {
    function createMockSceneGraph() {
      const nodes = new Map<string, any>();
      return {
        getNode: (id: string) => nodes.get(id),
        getRootNodes: () => [...nodes.values()].filter((n) => !n.parent),
        addNode: vi.fn((node: any) => {
          nodes.set(node.id, node);
        }),
        removeNode: vi.fn((id: string) => {
          nodes.delete(id);
        }),
        moveNode: vi.fn(),
        getDescendants: () => [],
        traverse: (cb: (node: any, depth: number) => void) => {
          for (const node of nodes.values()) cb(node, 0);
        },
        getWorldTransform: () => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }),
        _addTestNode: (node: any) => {
          nodes.set(node.id, node);
        },
      };
    }

    function makeTestNode(id: string, x = 0, y = 0) {
      return {
        id,
        name: id,
        type: 'rectangle' as const,
        parent: null,
        children: [],
        transform: {
          position: { x, y },
          rotation: 0,
          scale: { x: 1, y: 1 },
          anchor: { x: 0.5, y: 0.5 },
          skew: { x: 0, y: 0 },
        },
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        width: 100,
        height: 100,
        cornerRadius: [0, 0, 0, 0] as [number, number, number, number],
        fills: [],
        strokes: [],
      };
    }

    it('copySelection stores clones of selected nodes', () => {
      const sg = createMockSceneGraph();
      sg._addTestNode(makeTestNode('rect1', 50, 50));
      useEditorStore.setState({ selectedNodeIds: new Set(['rect1']) });

      const { copySelection } = useEditorStore.getState();
      copySelection(sg);

      const { clipboard } = useEditorStore.getState();
      expect(clipboard).toHaveLength(1);
      expect(clipboard![0].id).toBe('rect1');
    });

    it('copySelection with no selection does nothing', () => {
      const sg = createMockSceneGraph();
      const { copySelection } = useEditorStore.getState();
      copySelection(sg);

      expect(useEditorStore.getState().clipboard).toBeNull();
    });

    it('pasteClipboard creates new nodes with new IDs', () => {
      const sg = createMockSceneGraph();
      const original = makeTestNode('rect1', 50, 50);
      useEditorStore.setState({ clipboard: [original] });

      const { pasteClipboard } = useEditorStore.getState();
      pasteClipboard(sg);

      expect(sg.addNode).toHaveBeenCalledOnce();
      const addedNode = sg.addNode.mock.calls[0]![0];
      expect(addedNode.id).not.toBe('rect1');
    });

    it('pasteClipboard offsets position', () => {
      const sg = createMockSceneGraph();
      const original = makeTestNode('rect1', 50, 50);
      useEditorStore.setState({ clipboard: [original] });

      const { pasteClipboard } = useEditorStore.getState();
      pasteClipboard(sg);

      const addedNode = sg.addNode.mock.calls[0]![0];
      expect(addedNode.transform.position.x).toBe(70);
      expect(addedNode.transform.position.y).toBe(30);
    });

    it('pasteClipboard selects pasted nodes', () => {
      const sg = createMockSceneGraph();
      const original = makeTestNode('rect1', 50, 50);
      useEditorStore.setState({ clipboard: [original] });

      const { pasteClipboard } = useEditorStore.getState();
      pasteClipboard(sg);

      const { selectedNodeIds } = useEditorStore.getState();
      expect(selectedNodeIds.size).toBe(1);
      expect([...selectedNodeIds][0]).not.toBe('rect1');
    });

    it('pasteClipboard with empty clipboard does nothing', () => {
      const sg = createMockSceneGraph();
      const { pasteClipboard } = useEditorStore.getState();
      pasteClipboard(sg);

      expect(sg.addNode).not.toHaveBeenCalled();
    });

    it('duplicateSelection copies and pastes', () => {
      const sg = createMockSceneGraph();
      sg._addTestNode(makeTestNode('rect1', 10, 20));
      useEditorStore.setState({ selectedNodeIds: new Set(['rect1']) });

      const { duplicateSelection } = useEditorStore.getState();
      duplicateSelection(sg);

      expect(sg.addNode).toHaveBeenCalledOnce();
      const addedNode = sg.addNode.mock.calls[0]![0];
      expect(addedNode.id).not.toBe('rect1');
      expect(addedNode.transform.position.x).toBe(30);
    });

    it('deleteSelection removes nodes and clears selection', () => {
      const sg = createMockSceneGraph();
      sg._addTestNode(makeTestNode('rect1'));
      sg._addTestNode(makeTestNode('rect2'));
      useEditorStore.setState({ selectedNodeIds: new Set(['rect1', 'rect2']) });

      const { deleteSelection } = useEditorStore.getState();
      deleteSelection(sg);

      expect(sg.removeNode).toHaveBeenCalledTimes(2);
      expect(useEditorStore.getState().selectedNodeIds.size).toBe(0);
    });

    it('deleteSelection with no selection does nothing', () => {
      const sg = createMockSceneGraph();
      const { deleteSelection } = useEditorStore.getState();
      deleteSelection(sg);

      expect(sg.removeNode).not.toHaveBeenCalled();
    });

    it('selectAll selects all nodes', () => {
      const sg = createMockSceneGraph();
      sg._addTestNode(makeTestNode('rect1'));
      sg._addTestNode(makeTestNode('rect2'));
      sg._addTestNode(makeTestNode('rect3'));

      const { selectAll } = useEditorStore.getState();
      selectAll(sg);

      const { selectedNodeIds } = useEditorStore.getState();
      expect(selectedNodeIds.size).toBe(3);
      expect(selectedNodeIds.has('rect1')).toBe(true);
      expect(selectedNodeIds.has('rect2')).toBe(true);
      expect(selectedNodeIds.has('rect3')).toBe(true);
    });
  });

  // ==========================================================================
  // Keyframe State
  // ==========================================================================

  describe('keyframe state', () => {
    it('should have default keyframe state', () => {
      const state = useEditorStore.getState();
      expect(state.autoKeyframe).toBe(false);
      expect(state.selectedKeyframeIds.size).toBe(0);
      expect(state.keyframeClipboard).toBeNull();
      expect(state.timeline).toBeDefined();
      expect(state.timeline.tracks.length).toBe(0);
    });

    it('should toggle auto-keyframe', () => {
      const { toggleAutoKeyframe } = useEditorStore.getState();
      toggleAutoKeyframe();
      expect(useEditorStore.getState().autoKeyframe).toBe(true);
      toggleAutoKeyframe();
      expect(useEditorStore.getState().autoKeyframe).toBe(false);
    });

    it('should select a keyframe', () => {
      const { selectKeyframe } = useEditorStore.getState();
      selectKeyframe('kf1');
      expect(useEditorStore.getState().selectedKeyframeIds.has('kf1')).toBe(true);
      expect(useEditorStore.getState().selectedKeyframeIds.size).toBe(1);
    });

    it('should add keyframe to selection', () => {
      const { selectKeyframe, addKeyframeToSelection } = useEditorStore.getState();
      selectKeyframe('kf1');
      addKeyframeToSelection('kf2');
      const ids = useEditorStore.getState().selectedKeyframeIds;
      expect(ids.size).toBe(2);
      expect(ids.has('kf1')).toBe(true);
      expect(ids.has('kf2')).toBe(true);
    });

    it('should clear keyframe selection', () => {
      const { selectKeyframe, clearKeyframeSelection } = useEditorStore.getState();
      selectKeyframe('kf1');
      clearKeyframeSelection();
      expect(useEditorStore.getState().selectedKeyframeIds.size).toBe(0);
    });

    it('should add keyframe at frame', () => {
      const { addKeyframeAtFrame } = useEditorStore.getState();
      addKeyframeAtFrame('node1', 'opacity', 10, 0.5);
      const { timeline } = useEditorStore.getState();
      expect(timeline.tracks.length).toBe(1);
      expect(timeline.tracks[0].nodeId).toBe('node1');
      expect(timeline.tracks[0].property).toBe('opacity');
      expect(timeline.tracks[0].keyframes.length).toBe(1);
      expect(timeline.tracks[0].keyframes[0].time).toBe(10);
      expect(timeline.tracks[0].keyframes[0].value).toBe(0.5);
    });

    it('should add multiple keyframes to same track', () => {
      const { addKeyframeAtFrame } = useEditorStore.getState();
      addKeyframeAtFrame('node1', 'opacity', 0, 1);
      addKeyframeAtFrame('node1', 'opacity', 30, 0);
      const { timeline } = useEditorStore.getState();
      expect(timeline.tracks.length).toBe(1);
      expect(timeline.tracks[0].keyframes.length).toBe(2);
    });

    it('should remove selected keyframes', () => {
      const { addKeyframeAtFrame, removeSelectedKeyframes } = useEditorStore.getState();
      addKeyframeAtFrame('node1', 'opacity', 0, 1);
      const kfId = useEditorStore.getState().timeline.tracks[0].keyframes[0].id;
      useEditorStore.setState({ selectedKeyframeIds: new Set([kfId]) });

      const map = new Map([[kfId, { nodeId: 'node1', property: 'opacity' }]]);
      removeSelectedKeyframes(map);

      const { timeline, selectedKeyframeIds } = useEditorStore.getState();
      expect(timeline.tracks.length).toBe(0);
      expect(selectedKeyframeIds.size).toBe(0);
    });

    it('should set keyframe easing', () => {
      const { addKeyframeAtFrame, setKeyframeEasing } = useEditorStore.getState();
      addKeyframeAtFrame('node1', 'opacity', 0, 1);
      const kfId = useEditorStore.getState().timeline.tracks[0].keyframes[0].id;

      setKeyframeEasing('node1', 'opacity', kfId, 'easeInOutCubic');
      expect(useEditorStore.getState().timeline.tracks[0].keyframes[0].easing).toBe(
        'easeInOutCubic'
      );
    });

    it('should copy and paste keyframes', () => {
      const { addKeyframeAtFrame, copySelectedKeyframes, pasteKeyframes } =
        useEditorStore.getState();
      addKeyframeAtFrame('node1', 'opacity', 0, 1);
      addKeyframeAtFrame('node1', 'opacity', 10, 0.5);
      const kfs = useEditorStore.getState().timeline.tracks[0].keyframes;
      useEditorStore.setState({ selectedKeyframeIds: new Set([kfs[0].id, kfs[1].id]) });

      const map = new Map([
        [kfs[0].id, { nodeId: 'node1', property: 'opacity' }],
        [kfs[1].id, { nodeId: 'node1', property: 'opacity' }],
      ]);
      copySelectedKeyframes(map);
      expect(useEditorStore.getState().keyframeClipboard).not.toBeNull();

      pasteKeyframes('node2', 50);
      const { timeline } = useEditorStore.getState();
      // Should now have tracks for node1 and node2
      const node2Tracks = timeline.tracks.filter((t: { nodeId: string }) => t.nodeId === 'node2');
      expect(node2Tracks.length).toBe(1);
      expect(node2Tracks[0].keyframes.length).toBe(2);
      expect(node2Tracks[0].keyframes[0].time).toBe(50);
      expect(node2Tracks[0].keyframes[1].time).toBe(60);
    });

    it('should move selected keyframes', () => {
      const { addKeyframeAtFrame, moveSelectedKeyframes } = useEditorStore.getState();
      addKeyframeAtFrame('node1', 'opacity', 10, 1);
      const kfId = useEditorStore.getState().timeline.tracks[0].keyframes[0].id;
      useEditorStore.setState({ selectedKeyframeIds: new Set([kfId]) });

      const map = new Map([[kfId, { nodeId: 'node1', property: 'opacity' }]]);
      moveSelectedKeyframes(map, 5);

      expect(useEditorStore.getState().timeline.tracks[0].keyframes[0].time).toBe(15);
    });

    it('should add keyframe with custom easing', () => {
      const { addKeyframeAtFrame } = useEditorStore.getState();
      addKeyframeAtFrame('node1', 'opacity', 0, 1, 'easeInOutCubic');
      expect(useEditorStore.getState().timeline.tracks[0].keyframes[0].easing).toBe(
        'easeInOutCubic'
      );
    });

    it('should remove keyframe at frame', () => {
      const { addKeyframeAtFrame, removeKeyframeAtFrame } = useEditorStore.getState();
      addKeyframeAtFrame('node1', 'opacity', 0, 1);
      addKeyframeAtFrame('node1', 'opacity', 10, 0.5);
      expect(useEditorStore.getState().timeline.tracks[0].keyframes.length).toBe(2);

      removeKeyframeAtFrame('node1', 'opacity', 0);
      expect(useEditorStore.getState().timeline.tracks[0].keyframes.length).toBe(1);
      expect(useEditorStore.getState().timeline.tracks[0].keyframes[0].time).toBe(10);
    });

    it('should do nothing when removing keyframe at frame with no keyframe', () => {
      const { addKeyframeAtFrame, removeKeyframeAtFrame } = useEditorStore.getState();
      addKeyframeAtFrame('node1', 'opacity', 10, 0.5);
      removeKeyframeAtFrame('node1', 'opacity', 5);
      expect(useEditorStore.getState().timeline.tracks[0].keyframes.length).toBe(1);
    });

    it('should do nothing when removing keyframe for nonexistent track', () => {
      const { removeKeyframeAtFrame } = useEditorStore.getState();
      removeKeyframeAtFrame('node1', 'opacity', 0);
      expect(useEditorStore.getState().timeline.tracks.length).toBe(0);
    });
  });

  // ==========================================================================
  // Onion Skin State
  // ==========================================================================

  describe('onion skin state', () => {
    it('should have default onion skin settings', () => {
      const state = useEditorStore.getState();
      expect(state.onionSkin.enabled).toBe(false);
      expect(state.onionSkin.beforeCount).toBe(DEFAULT_ONION_SKIN_SETTINGS.beforeCount);
      expect(state.onionSkin.afterCount).toBe(DEFAULT_ONION_SKIN_SETTINGS.afterCount);
      expect(state.onionSkin.opacity).toBe(DEFAULT_ONION_SKIN_SETTINGS.opacity);
      expect(state.onionSkin.beforeColor).toBe(DEFAULT_ONION_SKIN_SETTINGS.beforeColor);
      expect(state.onionSkin.afterColor).toBe(DEFAULT_ONION_SKIN_SETTINGS.afterColor);
    });

    it('should toggle onion skin enabled', () => {
      const { toggleOnionSkin } = useEditorStore.getState();
      toggleOnionSkin();
      expect(useEditorStore.getState().onionSkin.enabled).toBe(true);
      toggleOnionSkin();
      expect(useEditorStore.getState().onionSkin.enabled).toBe(false);
    });

    it('should set onion skin before count with clamping', () => {
      const { setOnionSkinBeforeCount } = useEditorStore.getState();
      setOnionSkinBeforeCount(3);
      expect(useEditorStore.getState().onionSkin.beforeCount).toBe(3);
      setOnionSkinBeforeCount(0);
      expect(useEditorStore.getState().onionSkin.beforeCount).toBe(1);
      setOnionSkinBeforeCount(10);
      expect(useEditorStore.getState().onionSkin.beforeCount).toBe(5);
    });

    it('should set onion skin opacity with clamping', () => {
      const { setOnionSkinOpacity } = useEditorStore.getState();
      setOnionSkinOpacity(0.7);
      expect(useEditorStore.getState().onionSkin.opacity).toBe(0.7);
      setOnionSkinOpacity(-0.5);
      expect(useEditorStore.getState().onionSkin.opacity).toBe(0);
      setOnionSkinOpacity(2.0);
      expect(useEditorStore.getState().onionSkin.opacity).toBe(1);
    });
  });

  // ==========================================================================
  // Project State
  // ==========================================================================

  describe('project state', () => {
    it('should have default project state', () => {
      const state = useEditorStore.getState();
      expect(state.projectId).toBeNull();
      expect(state.projectName).toBe('Untitled Project');
      expect(state.isDirty).toBe(false);
      expect(state.projectCreatedAt).toBeNull();
    });

    it('should set project ID', () => {
      const { setProjectId } = useEditorStore.getState();
      setProjectId('proj_123');
      expect(useEditorStore.getState().projectId).toBe('proj_123');
    });

    it('should set project name', () => {
      const { setProjectName } = useEditorStore.getState();
      setProjectName('My Animation');
      expect(useEditorStore.getState().projectName).toBe('My Animation');
    });

    it('should set isDirty', () => {
      const { setIsDirty } = useEditorStore.getState();
      setIsDirty(true);
      expect(useEditorStore.getState().isDirty).toBe(true);
      setIsDirty(false);
      expect(useEditorStore.getState().isDirty).toBe(false);
    });

    it('should markDirty', () => {
      const { markDirty } = useEditorStore.getState();
      expect(useEditorStore.getState().isDirty).toBe(false);
      markDirty();
      expect(useEditorStore.getState().isDirty).toBe(true);
    });

    it('should set projectCreatedAt', () => {
      const { setProjectCreatedAt } = useEditorStore.getState();
      const date = '2024-01-15T10:00:00.000Z';
      setProjectCreatedAt(date);
      expect(useEditorStore.getState().projectCreatedAt).toBe(date);
    });

    it('should clear project ID to null', () => {
      const { setProjectId } = useEditorStore.getState();
      setProjectId('proj_123');
      setProjectId(null);
      expect(useEditorStore.getState().projectId).toBeNull();
    });
  });
});
