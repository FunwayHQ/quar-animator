/**
 * Tests for Editor Store
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEditorStore, DEFAULT_FILL, DEFAULT_STROKE } from './editorStore';
import { createTimeline } from '@quar/animation';
import { DEFAULT_ONION_SKIN_SETTINGS, SceneGraph } from '@quar/core';

describe('EditorStore', () => {
  // Reset store before each test
  beforeEach(() => {
    const defaultPageId = 'test-page-1';
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
      workAreaEnabled: false,
      workAreaStart: 0,
      workAreaEnd: 299,
      projectId: null,
      projectName: 'Untitled Project',
      isDirty: false,
      projectCreatedAt: null,
      undoStack: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,
      ikChains: [],
      smartBoneActions: [],
      smartBoneRecordingActionId: null,
      smartBoneRecordingTargetId: null,
      vitruvianControllers: [],
      dynamicChains: [],
      globalWind: {
        strength: 0,
        direction: 0,
        turbulence: 0,
        frequency: 1,
        enabled: false,
      },
      enteredGroupId: null,
      symbols: [],
      editingSymbolId: null,
      editingSymbolPrevState: null,
      pages: [
        {
          id: defaultPageId,
          name: 'Page 1',
          sceneGraphJSON: { nodes: [], rootNodeIds: [] },
          timeline: createTimeline({ duration: 300, frameRate: 30 }),
          selectedNodeIds: [],
          undoStack: [],
          redoStack: [],
        },
      ],
      activePageId: defaultPageId,
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
  // Work Area
  // ==========================================================================

  describe('work area', () => {
    it('should have default work area values', () => {
      const state = useEditorStore.getState();
      expect(state.workAreaEnabled).toBe(false);
      expect(state.workAreaStart).toBe(0);
      expect(state.workAreaEnd).toBe(299);
    });

    it('setWorkAreaEnabled should toggle enabled state', () => {
      useEditorStore.getState().setWorkAreaEnabled(true);
      expect(useEditorStore.getState().workAreaEnabled).toBe(true);
      useEditorStore.getState().setWorkAreaEnabled(false);
      expect(useEditorStore.getState().workAreaEnabled).toBe(false);
    });

    it('toggleWorkArea should toggle enabled state', () => {
      useEditorStore.getState().toggleWorkArea();
      expect(useEditorStore.getState().workAreaEnabled).toBe(true);
      useEditorStore.getState().toggleWorkArea();
      expect(useEditorStore.getState().workAreaEnabled).toBe(false);
    });

    it('setWorkAreaStart should clamp to [0, end-1]', () => {
      useEditorStore.getState().setWorkAreaStart(50);
      expect(useEditorStore.getState().workAreaStart).toBe(50);
      // Should clamp to end - 1
      useEditorStore.getState().setWorkAreaStart(500);
      expect(useEditorStore.getState().workAreaStart).toBe(298);
      // Should clamp to 0
      useEditorStore.getState().setWorkAreaStart(-10);
      expect(useEditorStore.getState().workAreaStart).toBe(0);
    });

    it('setWorkAreaEnd should clamp to [start+1, duration-1]', () => {
      useEditorStore.getState().setWorkAreaStart(50);
      useEditorStore.getState().setWorkAreaEnd(200);
      expect(useEditorStore.getState().workAreaEnd).toBe(200);
      // Should clamp to start + 1
      useEditorStore.getState().setWorkAreaEnd(10);
      expect(useEditorStore.getState().workAreaEnd).toBe(51);
      // Should clamp to duration - 1
      useEditorStore.getState().setWorkAreaEnd(500);
      expect(useEditorStore.getState().workAreaEnd).toBe(299);
    });

    it('setWorkAreaRange should set both start and end', () => {
      useEditorStore.getState().setWorkAreaRange(30, 150);
      expect(useEditorStore.getState().workAreaStart).toBe(30);
      expect(useEditorStore.getState().workAreaEnd).toBe(150);
    });

    it('setWorkAreaRange should reject invalid range', () => {
      useEditorStore.getState().setWorkAreaRange(30, 150);
      // start >= end should be rejected (no change)
      useEditorStore.getState().setWorkAreaRange(100, 50);
      expect(useEditorStore.getState().workAreaStart).toBe(30);
      expect(useEditorStore.getState().workAreaEnd).toBe(150);
    });

    it('setWorkAreaToCurrentFrame should set IN/OUT and auto-enable', () => {
      useEditorStore.getState().setCurrentFrame(60);
      useEditorStore.getState().setWorkAreaToCurrentFrame('start');
      expect(useEditorStore.getState().workAreaStart).toBe(60);
      expect(useEditorStore.getState().workAreaEnabled).toBe(true);

      useEditorStore.getState().setCurrentFrame(200);
      useEditorStore.getState().setWorkAreaToCurrentFrame('end');
      expect(useEditorStore.getState().workAreaEnd).toBe(200);
    });

    it('clearWorkArea should reset to full range and disable', () => {
      useEditorStore.getState().setWorkAreaEnabled(true);
      useEditorStore.getState().setWorkAreaStart(50);
      useEditorStore.getState().setWorkAreaEnd(200);
      useEditorStore.getState().clearWorkArea();
      expect(useEditorStore.getState().workAreaEnabled).toBe(false);
      expect(useEditorStore.getState().workAreaStart).toBe(0);
      expect(useEditorStore.getState().workAreaEnd).toBe(299);
    });

    it('setTimelineDuration should clamp work area when duration shrinks', () => {
      useEditorStore.getState().setWorkAreaStart(50);
      useEditorStore.getState().setWorkAreaEnd(250);
      useEditorStore.getState().setTimelineDuration(100);
      expect(useEditorStore.getState().workAreaEnd).toBe(99);
      expect(useEditorStore.getState().workAreaStart).toBe(50);
    });

    it('setTimelineDuration should clamp both bounds if needed', () => {
      useEditorStore.getState().setWorkAreaStart(200);
      useEditorStore.getState().setWorkAreaEnd(250);
      useEditorStore.getState().setTimelineDuration(50);
      expect(useEditorStore.getState().workAreaEnd).toBe(49);
      expect(useEditorStore.getState().workAreaStart).toBeLessThan(49);
    });
  });

  // ==========================================================================
  // Clipboard & Node Operations
  // ==========================================================================

  describe('clipboard & node operations', () => {
    function createMockSceneGraph() {
      const nodes = new Map<string, any>();
      let rootNodeIds: string[] = [];
      return {
        getNode: (id: string) => nodes.get(id),
        getRootNodes: () => rootNodeIds.map((id) => nodes.get(id)).filter(Boolean),
        addNode: vi.fn((node: any) => {
          nodes.set(node.id, node);
          if (!node.parent && !rootNodeIds.includes(node.id)) rootNodeIds.push(node.id);
        }),
        removeNode: vi.fn((id: string) => {
          nodes.delete(id);
          rootNodeIds = rootNodeIds.filter((rid) => rid !== id);
        }),
        updateNode: vi.fn((id: string, updates: any) => {
          const node = nodes.get(id);
          if (node) nodes.set(id, { ...node, ...updates });
        }),
        moveNode: vi.fn(),
        getDescendants: () => [],
        traverse: (cb: (node: any, depth: number) => void) => {
          for (const node of nodes.values()) cb(node, 0);
        },
        getWorldTransform: () => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }),
        toJSON: () => ({
          nodes: Array.from(nodes.values()),
          rootNodeIds: [...rootNodeIds],
        }),
        fromJSON: (data: { nodes: any[]; rootNodeIds: string[] }) => {
          nodes.clear();
          for (const node of data.nodes) nodes.set(node.id, node);
          rootNodeIds = [...data.rootNodeIds];
        },
        _addTestNode: (node: any) => {
          nodes.set(node.id, node);
          if (!node.parent && !rootNodeIds.includes(node.id)) rootNodeIds.push(node.id);
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

    it('updateKeyframeTimeAndValueById replaces an occupied destination frame (F020)', () => {
      const { addKeyframeAtFrame } = useEditorStore.getState();
      addKeyframeAtFrame('node1', 'opacity', 0, 0.1);
      addKeyframeAtFrame('node1', 'opacity', 10, 0.9);
      const track = useEditorStore
        .getState()
        .timeline.tracks.find((t) => t.nodeId === 'node1' && t.property === 'opacity')!;
      const kfAt0 = track.keyframes.find((k) => k.time === 0)!;

      // Drag the frame-0 keyframe onto the occupied frame 10.
      useEditorStore
        .getState()
        .updateKeyframeTimeAndValueById('node1', 'opacity', kfAt0.id, 10, 0.1);

      const after = useEditorStore
        .getState()
        .timeline.tracks.find((t) => t.nodeId === 'node1' && t.property === 'opacity')!;
      // No stacking: exactly one keyframe, on frame 10, and it is the moved one.
      expect(after.keyframes).toHaveLength(1);
      expect(after.keyframes[0].time).toBe(10);
      expect(after.keyframes[0].id).toBe(kfAt0.id);
      expect(after.keyframes[0].value).toBe(0.1);
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

  // ==========================================================================
  // Boolean Group Operations
  // ==========================================================================

  describe('Boolean Group Operations', () => {
    function createMockSceneGraph() {
      const nodes = new Map<string, any>();
      const rootNodeIds: string[] = [];

      return {
        getNode: (id: string) => nodes.get(id),
        getRootNodes: () => rootNodeIds.map((id) => nodes.get(id)).filter(Boolean),
        addNode: vi.fn((node: any, parentId?: string) => {
          nodes.set(node.id, node);
          if (parentId) {
            const parent = nodes.get(parentId);
            if (parent) {
              node.parent = parentId;
              parent.children.push(node.id);
            }
          } else {
            node.parent = null;
            rootNodeIds.push(node.id);
          }
        }),
        removeNode: vi.fn((id: string) => {
          const node = nodes.get(id);
          if (!node) return;
          // Remove from parent's children
          if (node.parent) {
            const parent = nodes.get(node.parent);
            if (parent) {
              parent.children = parent.children.filter((cid: string) => cid !== id);
            }
          } else {
            const idx = rootNodeIds.indexOf(id);
            if (idx >= 0) rootNodeIds.splice(idx, 1);
          }
          // Remove descendants
          const removeDescendants = (nodeId: string) => {
            const n = nodes.get(nodeId);
            if (!n) return;
            for (const childId of [...n.children]) {
              removeDescendants(childId);
            }
            nodes.delete(nodeId);
          };
          removeDescendants(id);
        }),
        updateNode: vi.fn((id: string, updates: any) => {
          const node = nodes.get(id);
          if (node) Object.assign(node, updates);
        }),
        moveNode: vi.fn((id: string, newParentId: string | null, index?: number) => {
          const node = nodes.get(id);
          if (!node) return;
          // Remove from current parent
          if (node.parent) {
            const parent = nodes.get(node.parent);
            if (parent) {
              parent.children = parent.children.filter((cid: string) => cid !== id);
            }
          } else {
            const idx = rootNodeIds.indexOf(id);
            if (idx >= 0) rootNodeIds.splice(idx, 1);
          }
          // Add to new parent
          if (newParentId) {
            const newParent = nodes.get(newParentId);
            if (newParent) {
              node.parent = newParentId;
              if (index !== undefined) {
                newParent.children.splice(index, 0, id);
              } else {
                newParent.children.push(id);
              }
            }
          } else {
            node.parent = null;
            if (index !== undefined) {
              rootNodeIds.splice(index, 0, id);
            } else {
              rootNodeIds.push(id);
            }
          }
        }),
        getDescendants: (id: string) => {
          const result: any[] = [];
          const collect = (nodeId: string) => {
            const n = nodes.get(nodeId);
            if (!n) return;
            for (const childId of n.children) {
              const child = nodes.get(childId);
              if (child) {
                result.push(child);
                collect(childId);
              }
            }
          };
          collect(id);
          return result;
        },
        traverse: (cb: (node: any, depth: number) => boolean | void) => {
          const visit = (nodeId: string, depth: number): boolean => {
            const n = nodes.get(nodeId);
            if (!n) return true;
            const result = cb(n, depth);
            if (result === false) return false;
            for (const childId of n.children) {
              const cont = visit(childId, depth + 1);
              if (!cont) return false;
            }
            return true;
          };
          for (const rootId of rootNodeIds) {
            const cont = visit(rootId, 0);
            if (!cont) break;
          }
        },
        getWorldTransform: () => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }),
        toJSON: () => ({
          nodes: Array.from(nodes.values()).map((n: any) => structuredClone(n)),
          rootNodeIds: [...rootNodeIds],
        }),
        fromJSON: (data: any) => {
          nodes.clear();
          rootNodeIds.length = 0;
          for (const n of data.nodes) {
            nodes.set(n.id, n);
          }
          rootNodeIds.push(...data.rootNodeIds);
        },
        _addTestNode: (node: any, parentId?: string) => {
          nodes.set(node.id, node);
          if (parentId) {
            const parent = nodes.get(parentId);
            if (parent) {
              node.parent = parentId;
              parent.children.push(node.id);
            }
          } else {
            node.parent = null;
            rootNodeIds.push(node.id);
          }
        },
      };
    }

    function makeTestRect(id: string, x = 0, y = 0) {
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
        fills: [
          {
            type: 'solid' as const,
            color: { r: 255, g: 0, b: 0, a: 1 },
            opacity: 1,
            visible: true,
          },
        ],
        strokes: [
          {
            color: { r: 0, g: 0, b: 0, a: 1 },
            width: 2,
            opacity: 1,
            cap: 'round' as const,
            join: 'round' as const,
            visible: true,
          },
        ],
      };
    }

    it('performBooleanOp creates a boolean group (non-destructive)', () => {
      const sg = createMockSceneGraph();
      sg._addTestNode(makeTestRect('rect1', 0, 0));
      sg._addTestNode(makeTestRect('rect2', 50, 0));
      useEditorStore.setState({ selectedNodeIds: new Set(['rect1', 'rect2']) });

      const { booleanUnion } = useEditorStore.getState();
      booleanUnion(sg);

      // Should have created a group node
      const { selectedNodeIds } = useEditorStore.getState();
      expect(selectedNodeIds.size).toBe(1);
      const groupId = [...selectedNodeIds][0];
      const group = sg.getNode(groupId);
      expect(group).toBeDefined();
      expect(group.type).toBe('group');
      expect(group.booleanOp).toBe('union');
    });

    it('boolean group has booleanOp, fills, strokes set', () => {
      const sg = createMockSceneGraph();
      const r1 = makeTestRect('rect1', 0, 0);
      const r2 = makeTestRect('rect2', 50, 0);
      sg._addTestNode(r1);
      sg._addTestNode(r2);
      useEditorStore.setState({ selectedNodeIds: new Set(['rect1', 'rect2']) });

      const { booleanSubtract } = useEditorStore.getState();
      booleanSubtract(sg);

      const { selectedNodeIds } = useEditorStore.getState();
      const groupId = [...selectedNodeIds][0];
      const group = sg.getNode(groupId);
      expect(group.booleanOp).toBe('subtract');
      expect(group.fills).toBeDefined();
      expect(group.fills.length).toBeGreaterThan(0);
      // Strokes should also be set (from first node)
      expect(group.strokes).toBeDefined();
    });

    it('source nodes are moved into the group (not deleted)', () => {
      const sg = createMockSceneGraph();
      sg._addTestNode(makeTestRect('rect1', 0, 0));
      sg._addTestNode(makeTestRect('rect2', 50, 0));
      useEditorStore.setState({ selectedNodeIds: new Set(['rect1', 'rect2']) });

      const { booleanUnion } = useEditorStore.getState();
      booleanUnion(sg);

      // Source nodes should still exist in the scene graph
      const rect1 = sg.getNode('rect1');
      const rect2 = sg.getNode('rect2');
      expect(rect1).toBeDefined();
      expect(rect2).toBeDefined();

      // They should now be children of the boolean group
      const { selectedNodeIds } = useEditorStore.getState();
      const groupId = [...selectedNodeIds][0];
      const group = sg.getNode(groupId);
      expect(group.children).toContain('rect1');
      expect(group.children).toContain('rect2');
    });

    it('flattenBooleanGroup converts to PathNode', () => {
      const sg = createMockSceneGraph();
      const r1 = makeTestRect('rect1', 0, 0);
      const r2 = makeTestRect('rect2', 50, 0);
      sg._addTestNode(r1);
      sg._addTestNode(r2);
      useEditorStore.setState({ selectedNodeIds: new Set(['rect1', 'rect2']) });

      // First create the boolean group
      const { booleanUnion } = useEditorStore.getState();
      booleanUnion(sg);

      const { selectedNodeIds } = useEditorStore.getState();
      const groupId = [...selectedNodeIds][0];

      // Now flatten it
      const { flattenBooleanGroup } = useEditorStore.getState();
      flattenBooleanGroup(sg);

      // The group should be removed
      expect(sg.getNode(groupId)).toBeUndefined();

      // A new path node should have been added
      expect(sg.addNode).toHaveBeenCalled();
      // Find the last added node that is a path
      const addCalls = sg.addNode.mock.calls;
      const lastAddedNode = addCalls[addCalls.length - 1]?.[0];
      expect(lastAddedNode.type).toBe('path');
      expect(lastAddedNode.closed).toBe(true);
    });

    it('releaseBooleanGroup moves children out', () => {
      const sg = createMockSceneGraph();
      sg._addTestNode(makeTestRect('rect1', 0, 0));
      sg._addTestNode(makeTestRect('rect2', 50, 0));
      useEditorStore.setState({ selectedNodeIds: new Set(['rect1', 'rect2']) });

      // Create the boolean group
      const { booleanIntersect } = useEditorStore.getState();
      booleanIntersect(sg);

      const groupId = [...useEditorStore.getState().selectedNodeIds][0];
      expect(sg.getNode(groupId)).toBeDefined();

      // Release the group
      const { releaseBooleanGroup } = useEditorStore.getState();
      releaseBooleanGroup(sg);

      // The group should be removed
      expect(sg.removeNode).toHaveBeenCalledWith(groupId);

      // Children should be selected after release
      const { selectedNodeIds: releasedIds } = useEditorStore.getState();
      expect(releasedIds.size).toBeGreaterThan(0);
    });

    it('changeBooleanOp updates the operation', () => {
      const sg = createMockSceneGraph();
      sg._addTestNode(makeTestRect('rect1', 0, 0));
      sg._addTestNode(makeTestRect('rect2', 50, 0));
      useEditorStore.setState({ selectedNodeIds: new Set(['rect1', 'rect2']) });

      // Create a union group
      const { booleanUnion } = useEditorStore.getState();
      booleanUnion(sg);

      const groupId = [...useEditorStore.getState().selectedNodeIds][0];

      // Change to subtract
      const { changeBooleanOp } = useEditorStore.getState();
      changeBooleanOp(sg, 'subtract');

      // The updateNode call should have been made with the new op
      expect(sg.updateNode).toHaveBeenCalledWith(
        groupId,
        expect.objectContaining({ booleanOp: 'subtract' })
      );
    });

    it('boolean ops accept boolean groups as inputs', () => {
      const sg = createMockSceneGraph();
      sg._addTestNode(makeTestRect('rect1', 0, 0));
      sg._addTestNode(makeTestRect('rect2', 50, 0));
      sg._addTestNode(makeTestRect('rect3', 100, 0));
      useEditorStore.setState({ selectedNodeIds: new Set(['rect1', 'rect2']) });

      // Create first boolean group
      const { booleanUnion } = useEditorStore.getState();
      booleanUnion(sg);

      const group1Id = [...useEditorStore.getState().selectedNodeIds][0];
      const group1 = sg.getNode(group1Id);
      expect(group1.type).toBe('group');
      expect(group1.booleanOp).toBe('union');

      // Now select the boolean group + another rect and create a new boolean group
      useEditorStore.setState({ selectedNodeIds: new Set([group1Id, 'rect3']) });
      const { booleanSubtract } = useEditorStore.getState();
      booleanSubtract(sg);

      // Should have created a new boolean group containing the first group and rect3
      const { selectedNodeIds: finalIds } = useEditorStore.getState();
      expect(finalIds.size).toBe(1);
      const group2Id = [...finalIds][0];
      const group2 = sg.getNode(group2Id);
      expect(group2).toBeDefined();
      expect(group2.type).toBe('group');
      expect(group2.booleanOp).toBe('subtract');
    });

    it('cannot create boolean group with fewer than 2 shapes', () => {
      const sg = createMockSceneGraph();
      sg._addTestNode(makeTestRect('rect1', 0, 0));
      useEditorStore.setState({ selectedNodeIds: new Set(['rect1']) });

      const addCallsBefore = sg.addNode.mock.calls.length;
      const { booleanUnion } = useEditorStore.getState();
      booleanUnion(sg);

      // No new node should have been created
      expect(sg.addNode.mock.calls.length).toBe(addCallsBefore);

      // Selection should remain unchanged
      const { selectedNodeIds } = useEditorStore.getState();
      expect(selectedNodeIds.has('rect1')).toBe(true);
    });
  });

  // ==========================================================================
  // Undo/Redo History
  // ==========================================================================

  describe('undo/redo history', () => {
    function createMockSceneGraphWithHistory() {
      const nodes = new Map<string, any>();
      let rootNodeIds: string[] = [];

      const sg = {
        getNode: (id: string) => nodes.get(id),
        getRootNodes: () => rootNodeIds.map((id) => nodes.get(id)).filter(Boolean),
        addNode: vi.fn((node: any) => {
          nodes.set(node.id, node);
          if (!node.parent) rootNodeIds.push(node.id);
        }),
        removeNode: vi.fn((id: string) => {
          nodes.delete(id);
          rootNodeIds = rootNodeIds.filter((rid) => rid !== id);
        }),
        updateNode: vi.fn((id: string, updates: any) => {
          const node = nodes.get(id);
          if (node) nodes.set(id, { ...node, ...updates });
        }),
        moveNode: vi.fn(),
        getDescendants: () => [],
        traverse: (cb: (node: any, depth: number) => void) => {
          for (const node of nodes.values()) cb(node, 0);
        },
        getWorldTransform: () => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }),
        toJSON: () => ({
          nodes: Array.from(nodes.values()),
          rootNodeIds: [...rootNodeIds],
        }),
        fromJSON: (data: { nodes: any[]; rootNodeIds: string[] }) => {
          nodes.clear();
          for (const node of data.nodes) nodes.set(node.id, node);
          rootNodeIds = [...data.rootNodeIds];
        },
        _addTestNode: (node: any) => {
          nodes.set(node.id, node);
          if (!node.parent) rootNodeIds.push(node.id);
        },
      };

      return sg;
    }

    function makeTestRect(id: string, x = 0, y = 0) {
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

    it('pushUndo creates a snapshot and sets canUndo', () => {
      const sg = createMockSceneGraphWithHistory();
      sg._addTestNode(makeTestRect('rect1'));

      const { pushUndo } = useEditorStore.getState();
      pushUndo(sg);

      const state = useEditorStore.getState();
      expect(state.canUndo).toBe(true);
      expect(state.canRedo).toBe(false);
      expect(state.undoStack).toHaveLength(1);
      expect(state.undoStack[0].sceneData.nodes).toHaveLength(1);
    });

    it('undo restores previous scene state', () => {
      const sg = createMockSceneGraphWithHistory();
      sg._addTestNode(makeTestRect('rect1', 10, 20));

      const { pushUndo } = useEditorStore.getState();
      pushUndo(sg);

      // Simulate a modification
      sg.removeNode('rect1');
      expect(sg.getRootNodes()).toHaveLength(0);

      // Undo should restore
      useEditorStore.getState().undo(sg);
      expect(sg.getRootNodes()).toHaveLength(1);
      expect(sg.getNode('rect1')).toBeDefined();
      expect(sg.getNode('rect1').transform.position.x).toBe(10);
    });

    it('redo restores after undo', () => {
      const sg = createMockSceneGraphWithHistory();
      sg._addTestNode(makeTestRect('rect1'));

      const { pushUndo } = useEditorStore.getState();
      pushUndo(sg);

      // Delete node
      sg.removeNode('rect1');

      // Undo — rect1 back
      useEditorStore.getState().undo(sg);
      expect(sg.getRootNodes()).toHaveLength(1);

      // Redo — rect1 gone again
      useEditorStore.getState().redo(sg);
      expect(sg.getRootNodes()).toHaveLength(0);
    });

    it('undo restores selection', () => {
      const sg = createMockSceneGraphWithHistory();
      sg._addTestNode(makeTestRect('rect1'));
      useEditorStore.setState({ selectedNodeIds: new Set(['rect1']) });

      const { pushUndo } = useEditorStore.getState();
      pushUndo(sg);

      // Change selection
      useEditorStore.setState({ selectedNodeIds: new Set<string>() });

      // Undo
      useEditorStore.getState().undo(sg);
      const { selectedNodeIds } = useEditorStore.getState();
      expect(selectedNodeIds.has('rect1')).toBe(true);
    });

    it('new action clears redo stack', () => {
      const sg = createMockSceneGraphWithHistory();
      sg._addTestNode(makeTestRect('rect1'));

      const { pushUndo } = useEditorStore.getState();
      pushUndo(sg);

      // Modify and undo
      sg.removeNode('rect1');
      useEditorStore.getState().undo(sg);
      expect(useEditorStore.getState().canRedo).toBe(true);

      // New action should clear redo
      useEditorStore.getState().pushUndo(sg);
      expect(useEditorStore.getState().canRedo).toBe(false);
      expect(useEditorStore.getState().redoStack).toHaveLength(0);
    });

    it('undo stack is capped at MAX_UNDO_STACK_SIZE (50)', () => {
      const sg = createMockSceneGraphWithHistory();

      for (let i = 0; i < 60; i++) {
        useEditorStore.getState().pushUndo(sg);
      }

      expect(useEditorStore.getState().undoStack.length).toBeLessThanOrEqual(50);
    });

    it('canUndo and canRedo reflect stack state', () => {
      const sg = createMockSceneGraphWithHistory();

      expect(useEditorStore.getState().canUndo).toBe(false);
      expect(useEditorStore.getState().canRedo).toBe(false);

      useEditorStore.getState().pushUndo(sg);
      expect(useEditorStore.getState().canUndo).toBe(true);

      useEditorStore.getState().undo(sg);
      expect(useEditorStore.getState().canUndo).toBe(false);
      expect(useEditorStore.getState().canRedo).toBe(true);
    });

    it('clearHistory empties both stacks', () => {
      const sg = createMockSceneGraphWithHistory();

      useEditorStore.getState().pushUndo(sg);
      useEditorStore.getState().pushUndo(sg);
      expect(useEditorStore.getState().undoStack).toHaveLength(2);

      useEditorStore.getState().clearHistory();
      expect(useEditorStore.getState().undoStack).toHaveLength(0);
      expect(useEditorStore.getState().redoStack).toHaveLength(0);
      expect(useEditorStore.getState().canUndo).toBe(false);
      expect(useEditorStore.getState().canRedo).toBe(false);
    });

    it('cutSelection snapshots before cutting', () => {
      const sg = createMockSceneGraphWithHistory();
      sg._addTestNode(makeTestRect('rect1'));
      useEditorStore.setState({ selectedNodeIds: new Set(['rect1']) });

      useEditorStore.getState().cutSelection(sg);

      // Node should be removed
      expect(sg.getRootNodes()).toHaveLength(0);

      // Clipboard should have the node
      expect(useEditorStore.getState().clipboard).toHaveLength(1);

      // Undo should restore
      useEditorStore.getState().undo(sg);
      expect(sg.getRootNodes()).toHaveLength(1);
    });

    it('deleteSelection with undo restores deleted nodes', () => {
      const sg = createMockSceneGraphWithHistory();
      sg._addTestNode(makeTestRect('rect1'));
      sg._addTestNode(makeTestRect('rect2', 100, 100));
      useEditorStore.setState({ selectedNodeIds: new Set(['rect1']) });

      useEditorStore.getState().deleteSelection(sg);
      expect(sg.getRootNodes()).toHaveLength(1);
      expect(sg.getNode('rect1')).toBeUndefined();

      useEditorStore.getState().undo(sg);
      expect(sg.getRootNodes()).toHaveLength(2);
      expect(sg.getNode('rect1')).toBeDefined();
    });

    it('undo on empty stack does nothing', () => {
      const sg = createMockSceneGraphWithHistory();
      sg._addTestNode(makeTestRect('rect1'));

      // Calling undo on empty stack should not throw
      useEditorStore.getState().undo(sg);
      expect(sg.getRootNodes()).toHaveLength(1);
    });

    it('redo on empty stack does nothing', () => {
      const sg = createMockSceneGraphWithHistory();
      sg._addTestNode(makeTestRect('rect1'));

      useEditorStore.getState().redo(sg);
      expect(sg.getRootNodes()).toHaveLength(1);
    });
  });

  // ==========================================================================
  // IK Chain Management
  // ==========================================================================

  describe('IK chains', () => {
    function createIKSceneGraph() {
      const nodes = new Map<string, any>();
      let rootNodeIds: string[] = [];
      return {
        getNode: (id: string) => nodes.get(id),
        getRootNodes: () => rootNodeIds.map((id) => nodes.get(id)).filter(Boolean),
        addNode: vi.fn((node: any) => {
          nodes.set(node.id, node);
          if (!node.parent && !rootNodeIds.includes(node.id)) rootNodeIds.push(node.id);
        }),
        removeNode: vi.fn((id: string) => {
          nodes.delete(id);
          rootNodeIds = rootNodeIds.filter((rid) => rid !== id);
        }),
        updateNode: vi.fn((id: string, updates: any) => {
          const node = nodes.get(id);
          if (node) nodes.set(id, { ...node, ...updates });
        }),
        moveNode: vi.fn(),
        getDescendants: () => [],
        traverse: (cb: (node: any, depth: number) => void) => {
          for (const node of nodes.values()) cb(node, 0);
        },
        getWorldTransform: (id: string) => {
          const node = nodes.get(id);
          if (!node) return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
          const pos = node.transform?.position || { x: 0, y: 0 };
          return { a: 1, b: 0, c: 0, d: 1, tx: pos.x, ty: pos.y };
        },
        toJSON: () => ({
          nodes: Array.from(nodes.values()),
          rootNodeIds: [...rootNodeIds],
        }),
        fromJSON: (data: { nodes: any[]; rootNodeIds: string[] }) => {
          nodes.clear();
          for (const node of data.nodes) nodes.set(node.id, node);
          rootNodeIds = [...data.rootNodeIds];
        },
        _addTestNode: (node: any) => {
          nodes.set(node.id, node);
          if (!node.parent && !rootNodeIds.includes(node.id)) rootNodeIds.push(node.id);
        },
      };
    }

    function makeBone(
      id: string,
      name: string,
      parentId: string | null,
      x = 0,
      y = 0,
      length = 50
    ) {
      return {
        id,
        name,
        type: 'bone' as const,
        parent: parentId,
        children: [],
        transform: {
          position: { x, y },
          rotation: 0,
          scale: { x: 1, y: 1 },
          anchor: { x: 0, y: 0 },
          skew: { x: 0, y: 0 },
        },
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        length,
        angle: 0,
        angleMin: -180,
        angleMax: 180,
      };
    }

    it('createIKChain creates chain and target node from end effector bone', () => {
      const sg = createIKSceneGraph();
      const bone1 = makeBone('bone1', 'Root', null, 0, 0, 50);
      const bone2 = makeBone('bone2', 'Tip', 'bone1', 50, 0, 30);
      sg._addTestNode(bone1);
      sg._addTestNode(bone2);

      useEditorStore.getState().createIKChain(sg, 'bone2');

      const { ikChains, selectedNodeIds } = useEditorStore.getState();
      expect(ikChains).toHaveLength(1);
      expect(ikChains[0].rootBoneId).toBe('bone1');
      expect(ikChains[0].endEffectorBoneId).toBe('bone2');
      expect(ikChains[0].enabled).toBe(true);
      expect(ikChains[0].maxIterations).toBe(10);
      expect(ikChains[0].tolerance).toBe(0.5);

      // Target node added to scene graph
      expect(sg.addNode).toHaveBeenCalledTimes(1);
      const addedNode = (sg.addNode as any).mock.calls[0][0];
      expect(addedNode.type).toBe('ik-target');
      expect(addedNode.targetType).toBe('effector');
      expect(addedNode.ikChainId).toBe(ikChains[0].id);

      // Target is selected
      expect(selectedNodeIds.has(addedNode.id)).toBe(true);
    });

    it('createIKChain rejects non-bone node', () => {
      const sg = createIKSceneGraph();
      sg._addTestNode({
        id: 'rect1',
        name: 'Rect',
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
      });

      useEditorStore.getState().createIKChain(sg, 'rect1');
      expect(useEditorStore.getState().ikChains).toHaveLength(0);
    });

    it('createIKChain rejects overlapping chains', () => {
      const sg = createIKSceneGraph();
      const bone1 = makeBone('bone1', 'Root', null, 0, 0, 50);
      const bone2 = makeBone('bone2', 'Mid', 'bone1', 50, 0, 30);
      const bone3 = makeBone('bone3', 'Tip', 'bone2', 80, 0, 20);
      sg._addTestNode(bone1);
      sg._addTestNode(bone2);
      sg._addTestNode(bone3);

      // Create chain on bone2 (root: bone1, end: bone2)
      useEditorStore.getState().createIKChain(sg, 'bone2');
      expect(useEditorStore.getState().ikChains).toHaveLength(1);

      // Try to create chain on bone3 that overlaps (root: bone1, end: bone3 — shares bone2)
      useEditorStore.getState().createIKChain(sg, 'bone3');
      // Should be rejected
      expect(useEditorStore.getState().ikChains).toHaveLength(1);
    });

    it('createIKChain respects chainDepth parameter', () => {
      const sg = createIKSceneGraph();
      const bone1 = makeBone('bone1', 'Root', null, 0, 0, 50);
      const bone2 = makeBone('bone2', 'Mid', 'bone1', 50, 0, 30);
      const bone3 = makeBone('bone3', 'Tip', 'bone2', 80, 0, 20);
      sg._addTestNode(bone1);
      sg._addTestNode(bone2);
      sg._addTestNode(bone3);

      // Create chain with depth 2 — should stop at bone2, not walk to bone1
      useEditorStore.getState().createIKChain(sg, 'bone3', 2);

      const { ikChains } = useEditorStore.getState();
      expect(ikChains).toHaveLength(1);
      expect(ikChains[0].rootBoneId).toBe('bone2');
      expect(ikChains[0].endEffectorBoneId).toBe('bone3');
    });

    it('createIKChain positions target at end effector tip', () => {
      const sg = createIKSceneGraph();
      const bone1 = makeBone('bone1', 'Root', null, 100, 200, 50);
      sg._addTestNode(bone1);

      useEditorStore.getState().createIKChain(sg, 'bone1');

      const addedNode = (sg.addNode as any).mock.calls[0][0];
      // World transform for bone1 returns tx=100, ty=200 with identity rotation
      // Tip = tx + a*length = 100 + 1*50 = 150, ty + b*length = 200 + 0*50 = 200
      expect(addedNode.transform.position.x).toBe(150);
      expect(addedNode.transform.position.y).toBe(200);
    });

    it('removeIKChain removes chain and target node', () => {
      const sg = createIKSceneGraph();
      const bone1 = makeBone('bone1', 'Root', null, 0, 0, 50);
      sg._addTestNode(bone1);

      useEditorStore.getState().createIKChain(sg, 'bone1');
      const { ikChains } = useEditorStore.getState();
      const chainId = ikChains[0].id;
      const targetId = ikChains[0].targetNodeId;

      useEditorStore.getState().removeIKChain(sg, chainId);

      expect(useEditorStore.getState().ikChains).toHaveLength(0);
      expect(sg.removeNode).toHaveBeenCalledWith(targetId);
    });

    it('removeIKChain with invalid chainId does nothing', () => {
      const sg = createIKSceneGraph();
      useEditorStore.getState().removeIKChain(sg, 'nonexistent');
      expect(sg.removeNode).not.toHaveBeenCalled();
    });

    it('setIKChainEnabled toggles chain enabled state', () => {
      const sg = createIKSceneGraph();
      const bone1 = makeBone('bone1', 'Root', null, 0, 0, 50);
      sg._addTestNode(bone1);

      useEditorStore.getState().createIKChain(sg, 'bone1');
      const chainId = useEditorStore.getState().ikChains[0].id;

      useEditorStore.getState().setIKChainEnabled(chainId, false);
      expect(useEditorStore.getState().ikChains[0].enabled).toBe(false);

      useEditorStore.getState().setIKChainEnabled(chainId, true);
      expect(useEditorStore.getState().ikChains[0].enabled).toBe(true);
    });

    it('setIKChainSettings updates chain parameters', () => {
      const sg = createIKSceneGraph();
      const bone1 = makeBone('bone1', 'Root', null, 0, 0, 50);
      sg._addTestNode(bone1);

      useEditorStore.getState().createIKChain(sg, 'bone1');
      const chainId = useEditorStore.getState().ikChains[0].id;

      useEditorStore.getState().setIKChainSettings(chainId, {
        maxIterations: 20,
        tolerance: 0.1,
      });

      const chain = useEditorStore.getState().ikChains[0];
      expect(chain.maxIterations).toBe(20);
      expect(chain.tolerance).toBe(0.1);
    });

    it('deleteSelection cleans up IK chains when deleting IK target', () => {
      const sg = createIKSceneGraph();
      const bone1 = makeBone('bone1', 'Root', null, 0, 0, 50);
      sg._addTestNode(bone1);

      useEditorStore.getState().createIKChain(sg, 'bone1');
      const { ikChains } = useEditorStore.getState();
      const targetId = ikChains[0].targetNodeId;

      // Select the IK target node and delete
      useEditorStore.setState({ selectedNodeIds: new Set([targetId]) });
      useEditorStore.getState().deleteSelection(sg);

      expect(useEditorStore.getState().ikChains).toHaveLength(0);
    });

    it('deleteSelection preserves IK chains when deleting non-IK nodes', () => {
      const sg = createIKSceneGraph();
      const bone1 = makeBone('bone1', 'Root', null, 0, 0, 50);
      sg._addTestNode(bone1);
      sg._addTestNode({
        id: 'rect1',
        name: 'Rect',
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
      });

      useEditorStore.getState().createIKChain(sg, 'bone1');
      expect(useEditorStore.getState().ikChains).toHaveLength(1);

      // Delete the rectangle — IK chain should remain
      useEditorStore.setState({ selectedNodeIds: new Set(['rect1']) });
      useEditorStore.getState().deleteSelection(sg);

      expect(useEditorStore.getState().ikChains).toHaveLength(1);
    });

    it('createIKChain marks project dirty', () => {
      const sg = createIKSceneGraph();
      const bone1 = makeBone('bone1', 'Root', null, 0, 0, 50);
      sg._addTestNode(bone1);
      useEditorStore.setState({ isDirty: false });

      useEditorStore.getState().createIKChain(sg, 'bone1');
      expect(useEditorStore.getState().isDirty).toBe(true);
    });
  });

  // ==========================================================================
  // Smart Bones
  // ==========================================================================

  describe('Smart Bones', () => {
    it('createSmartBoneAction creates an action for the given bone', () => {
      useEditorStore.getState().createSmartBoneAction('bone-1');

      const actions = useEditorStore.getState().smartBoneActions;
      expect(actions).toHaveLength(1);
      expect(actions[0].driver.boneId).toBe('bone-1');
      expect(actions[0].driver.property).toBe('transform.rotation');
      expect(actions[0].enabled).toBe(true);
      expect(actions[0].targets).toEqual([]);
    });

    it('removeSmartBoneAction removes the action by id', () => {
      useEditorStore.getState().createSmartBoneAction('bone-1');
      const actionId = useEditorStore.getState().smartBoneActions[0].id;

      useEditorStore.getState().removeSmartBoneAction(actionId);
      expect(useEditorStore.getState().smartBoneActions).toHaveLength(0);
    });

    it('setSmartBoneActionEnabled toggles enabled flag', () => {
      useEditorStore.getState().createSmartBoneAction('bone-1');
      const actionId = useEditorStore.getState().smartBoneActions[0].id;

      useEditorStore.getState().setSmartBoneActionEnabled(actionId, false);
      expect(useEditorStore.getState().smartBoneActions[0].enabled).toBe(false);

      useEditorStore.getState().setSmartBoneActionEnabled(actionId, true);
      expect(useEditorStore.getState().smartBoneActions[0].enabled).toBe(true);
    });

    it('updateSmartBoneDriver updates driver range', () => {
      useEditorStore.getState().createSmartBoneAction('bone-1');
      const actionId = useEditorStore.getState().smartBoneActions[0].id;

      useEditorStore.getState().updateSmartBoneDriver(actionId, { rangeMin: -45, rangeMax: 135 });
      const driver = useEditorStore.getState().smartBoneActions[0].driver;
      expect(driver.rangeMin).toBe(-45);
      expect(driver.rangeMax).toBe(135);
    });

    it('addMorphTarget adds a target with the given driver value', () => {
      useEditorStore.getState().createSmartBoneAction('bone-1');
      const actionId = useEditorStore.getState().smartBoneActions[0].id;

      useEditorStore.getState().addMorphTarget(actionId, 45);

      const targets = useEditorStore.getState().smartBoneActions[0].targets;
      expect(targets).toHaveLength(1);
      expect(targets[0].driverValue).toBe(45);
      expect(targets[0].offsets).toEqual({});
    });

    it('removeMorphTarget removes the target by id', () => {
      useEditorStore.getState().createSmartBoneAction('bone-1');
      const actionId = useEditorStore.getState().smartBoneActions[0].id;

      useEditorStore.getState().addMorphTarget(actionId, 45);
      const targetId = useEditorStore.getState().smartBoneActions[0].targets[0].id;

      useEditorStore.getState().removeMorphTarget(actionId, targetId);
      expect(useEditorStore.getState().smartBoneActions[0].targets).toHaveLength(0);
    });

    it('startSmartBoneRecording sets recording state and rotates bone', () => {
      // Create a bone node in a mock scene graph
      const boneNode = {
        id: 'bone-1',
        type: 'bone',
        transform: { position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
      };
      const mockSg = {
        getNode: (id: string) => (id === 'bone-1' ? boneNode : undefined),
        updateNode: vi.fn((id: string, updates: any) => {
          if (id === 'bone-1') Object.assign(boneNode, updates);
        }),
      } as any;

      useEditorStore.getState().createSmartBoneAction('bone-1');
      const actionId = useEditorStore.getState().smartBoneActions[0].id;
      useEditorStore.getState().addMorphTarget(actionId, 45);
      const targetId = useEditorStore.getState().smartBoneActions[0].targets[0].id;

      useEditorStore.getState().startSmartBoneRecording(actionId, targetId, mockSg);
      const state = useEditorStore.getState();
      expect(state.smartBoneRecordingActionId).toBe(actionId);
      expect(state.smartBoneRecordingTargetId).toBe(targetId);
      expect(state.activeTool).toBe('point-magnet');
      expect(state.smartBoneRecordingPrevTool).toBe('selection');
      expect(state.smartBoneRecordingPrevRotation).toBe(0);
      // Bone should be rotated to the target's driverValue
      expect(mockSg.updateNode).toHaveBeenCalledWith(
        'bone-1',
        expect.objectContaining({
          transform: expect.objectContaining({ rotation: 45 }),
        })
      );
    });

    it('stopSmartBoneRecording clears recording state and restores bone', () => {
      const boneNode = {
        id: 'bone-1',
        type: 'bone',
        transform: { position: { x: 0, y: 0 }, rotation: 45, scale: { x: 1, y: 1 } },
      };
      const mockSg = {
        getNode: (id: string) => (id === 'bone-1' ? boneNode : undefined),
        updateNode: vi.fn((id: string, updates: any) => {
          if (id === 'bone-1') Object.assign(boneNode, updates);
        }),
      } as any;

      // Set up recording state as if startSmartBoneRecording was called
      useEditorStore.getState().createSmartBoneAction('bone-1');
      const actionId = useEditorStore.getState().smartBoneActions[0].id;
      useEditorStore.setState({
        smartBoneRecordingActionId: actionId,
        smartBoneRecordingTargetId: 'some-target',
        smartBoneRecordingPrevTool: 'selection',
        smartBoneRecordingPrevRotation: 10,
        activeTool: 'point-magnet',
      });

      useEditorStore.getState().stopSmartBoneRecording(mockSg);
      const state = useEditorStore.getState();
      expect(state.smartBoneRecordingActionId).toBeNull();
      expect(state.smartBoneRecordingTargetId).toBeNull();
      expect(state.activeTool).toBe('selection');
      expect(state.smartBoneRecordingPrevTool).toBeNull();
      expect(state.smartBoneRecordingPrevRotation).toBeNull();
      // Bone should be restored to the previous rotation
      expect(mockSg.updateNode).toHaveBeenCalledWith(
        'bone-1',
        expect.objectContaining({
          transform: expect.objectContaining({ rotation: 10 }),
        })
      );
    });

    it('saveMorphTargetOffsets stores offsets on the target', () => {
      useEditorStore.getState().createSmartBoneAction('bone-1');
      const actionId = useEditorStore.getState().smartBoneActions[0].id;
      useEditorStore.getState().addMorphTarget(actionId, 45);
      const targetId = useEditorStore.getState().smartBoneActions[0].targets[0].id;

      const offsets = { 'mesh-1': [{ vertexIndex: 0, dx: 5, dy: 3 }] };
      useEditorStore.getState().saveMorphTargetOffsets(actionId, targetId, offsets);

      const target = useEditorStore.getState().smartBoneActions[0].targets[0];
      expect(target.offsets).toEqual(offsets);
    });

    it('deleteSelection removes smart bone actions for deleted bones', () => {
      useEditorStore.getState().createSmartBoneAction('bone-1');
      useEditorStore.getState().createSmartBoneAction('bone-2');
      expect(useEditorStore.getState().smartBoneActions).toHaveLength(2);

      // Create a minimal scene graph mock for deleteSelection
      const nodes = new Map<string, any>();
      let rootNodeIds: string[] = [];
      const sg = {
        getNode: (id: string) => nodes.get(id),
        getRootNodes: () => rootNodeIds.map((id) => nodes.get(id)).filter(Boolean),
        addNode: vi.fn((node: any) => {
          nodes.set(node.id, node);
          if (!node.parent) rootNodeIds.push(node.id);
        }),
        removeNode: vi.fn((id: string) => {
          nodes.delete(id);
          rootNodeIds = rootNodeIds.filter((rid) => rid !== id);
        }),
        traverse: vi.fn(),
        toJSON: vi.fn(() => ({ nodes: [] })),
        fromJSON: vi.fn(),
      };
      sg.addNode({
        id: 'bone-1',
        name: 'Bone1',
        type: 'bone',
        parent: null,
        children: [],
      });

      useEditorStore.setState({ selectedNodeIds: new Set(['bone-1']) });
      useEditorStore.getState().deleteSelection(sg as any);

      // Action for bone-1 should be removed, bone-2 remains
      const remaining = useEditorStore.getState().smartBoneActions;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].driver.boneId).toBe('bone-2');
    });
  });

  describe('Vitruvian Controllers', () => {
    it('createVitruvianController creates a controller with default group', () => {
      useEditorStore.getState().createVitruvianController();
      const controllers = useEditorStore.getState().vitruvianControllers;
      expect(controllers).toHaveLength(1);
      expect(controllers[0].name).toMatch(/Vitruvian/);
      expect(controllers[0].enabled).toBe(true);
      // Creates a default group automatically
      expect(controllers[0].groups).toHaveLength(1);
      expect(controllers[0].groups[0].name).toBe('Default');
      expect(controllers[0].activeGroupId).toBe(controllers[0].groups[0].id);
    });

    it('removeVitruvianController removes by id', () => {
      useEditorStore.getState().createVitruvianController();
      const id = useEditorStore.getState().vitruvianControllers[0].id;
      useEditorStore.getState().removeVitruvianController(id);
      expect(useEditorStore.getState().vitruvianControllers).toHaveLength(0);
    });

    it('setVitruvianControllerEnabled toggles enabled', () => {
      useEditorStore.getState().createVitruvianController();
      const id = useEditorStore.getState().vitruvianControllers[0].id;
      useEditorStore.getState().setVitruvianControllerEnabled(id, false);
      expect(useEditorStore.getState().vitruvianControllers[0].enabled).toBe(false);
    });

    it('addVitruvianGroup adds a group with the bone', () => {
      useEditorStore.getState().createVitruvianController();
      const id = useEditorStore.getState().vitruvianControllers[0].id;
      useEditorStore.getState().addVitruvianGroup(id, 'Group B', ['bone-1']);
      const groups = useEditorStore.getState().vitruvianControllers[0].groups;
      // 1 default + 1 added
      expect(groups).toHaveLength(2);
      expect(groups[1].name).toBe('Group B');
      expect(groups[1].boneIds).toContain('bone-1');
    });

    it('removeVitruvianGroup removes the group', () => {
      useEditorStore.getState().createVitruvianController();
      const ctrlId = useEditorStore.getState().vitruvianControllers[0].id;
      useEditorStore.getState().addVitruvianGroup(ctrlId, 'Group B', ['bone-1']);
      // groups[0] = Default, groups[1] = added
      const addedGroupId = useEditorStore.getState().vitruvianControllers[0].groups[1].id;
      useEditorStore.getState().removeVitruvianGroup(ctrlId, addedGroupId);
      // Only the Default group remains
      expect(useEditorStore.getState().vitruvianControllers[0].groups).toHaveLength(1);
    });

    it('setVitruvianActiveGroup changes active group', () => {
      useEditorStore.getState().createVitruvianController();
      const ctrlId = useEditorStore.getState().vitruvianControllers[0].id;
      useEditorStore.getState().addVitruvianGroup(ctrlId, 'Group B', ['bone-1']);
      // groups: [Default, added]
      const groups = useEditorStore.getState().vitruvianControllers[0].groups;
      // Switch to the newly added group
      useEditorStore.getState().setVitruvianActiveGroup(ctrlId, groups[1].id);
      expect(useEditorStore.getState().vitruvianControllers[0].activeGroupId).toBe(groups[1].id);
    });

    it('clearHistory resets vitruvianControllers', () => {
      useEditorStore.getState().createVitruvianController();
      expect(useEditorStore.getState().vitruvianControllers).toHaveLength(1);
      useEditorStore.getState().clearHistory();
      expect(useEditorStore.getState().vitruvianControllers).toHaveLength(0);
    });
  });

  describe('Dynamic Chains', () => {
    it('createDynamicChain creates a chain', () => {
      const sg = {
        getNode: (id: string) => {
          if (id === 'bone-root')
            return {
              id: 'bone-root',
              type: 'bone',
              children: ['bone-child-1'],
            };
          if (id === 'bone-child-1')
            return {
              id: 'bone-child-1',
              type: 'bone',
              children: [],
            };
          return undefined;
        },
      } as any;

      useEditorStore.getState().createDynamicChain(sg, 'bone-root');
      const chains = useEditorStore.getState().dynamicChains;
      expect(chains).toHaveLength(1);
      expect(chains[0].rootBoneId).toBe('bone-root');
      expect(chains[0].boneIds).toContain('bone-root');
      expect(chains[0].boneIds).toContain('bone-child-1');
      expect(chains[0].enabled).toBe(true);
    });

    it('removeDynamicChain removes by id', () => {
      const sg = {
        getNode: (id: string) =>
          id === 'bone-1' ? { id: 'bone-1', type: 'bone', children: [] } : undefined,
      } as any;
      useEditorStore.getState().createDynamicChain(sg, 'bone-1');
      const chainId = useEditorStore.getState().dynamicChains[0].id;
      useEditorStore.getState().removeDynamicChain(chainId);
      expect(useEditorStore.getState().dynamicChains).toHaveLength(0);
    });

    it('setDynamicChainEnabled toggles enabled', () => {
      const sg = {
        getNode: (id: string) =>
          id === 'bone-1' ? { id: 'bone-1', type: 'bone', children: [] } : undefined,
      } as any;
      useEditorStore.getState().createDynamicChain(sg, 'bone-1');
      const chainId = useEditorStore.getState().dynamicChains[0].id;
      useEditorStore.getState().setDynamicChainEnabled(chainId, false);
      expect(useEditorStore.getState().dynamicChains[0].enabled).toBe(false);
    });

    it('updateDynamicChainSettings updates properties', () => {
      const sg = {
        getNode: (id: string) =>
          id === 'bone-1' ? { id: 'bone-1', type: 'bone', children: [] } : undefined,
      } as any;
      useEditorStore.getState().createDynamicChain(sg, 'bone-1');
      const chainId = useEditorStore.getState().dynamicChains[0].id;
      useEditorStore.getState().updateDynamicChainSettings(chainId, {
        stiffness: 0.9,
        gravity: 200,
      });
      const chain = useEditorStore.getState().dynamicChains[0];
      expect(chain.stiffness).toBe(0.9);
      expect(chain.gravity).toBe(200);
    });

    it('setGlobalWind updates wind settings', () => {
      useEditorStore.getState().setGlobalWind({ strength: 100, enabled: true });
      const wind = useEditorStore.getState().globalWind;
      expect(wind.strength).toBe(100);
      expect(wind.enabled).toBe(true);
    });

    it('clearHistory resets dynamicChains', () => {
      const sg = {
        getNode: (id: string) =>
          id === 'bone-1' ? { id: 'bone-1', type: 'bone', children: [] } : undefined,
      } as any;
      useEditorStore.getState().createDynamicChain(sg, 'bone-1');
      expect(useEditorStore.getState().dynamicChains).toHaveLength(1);
      useEditorStore.getState().clearHistory();
      expect(useEditorStore.getState().dynamicChains).toHaveLength(0);
    });
  });

  describe('Guides', () => {
    beforeEach(() => {
      useEditorStore.setState({ guides: [], showGuides: true, snapToGuides: true });
    });

    it('initial state has empty guides', () => {
      expect(useEditorStore.getState().guides).toEqual([]);
      expect(useEditorStore.getState().showGuides).toBe(true);
      expect(useEditorStore.getState().snapToGuides).toBe(true);
    });

    it('addGuide creates a guide with unique id', () => {
      useEditorStore.getState().addGuide('x', 100);
      const guides = useEditorStore.getState().guides;
      expect(guides).toHaveLength(1);
      expect(guides[0].axis).toBe('x');
      expect(guides[0].position).toBe(100);
      expect(guides[0].id).toBeTruthy();
    });

    it('addGuide supports multiple guides', () => {
      useEditorStore.getState().addGuide('x', 100);
      useEditorStore.getState().addGuide('y', 200);
      useEditorStore.getState().addGuide('x', 300);
      expect(useEditorStore.getState().guides).toHaveLength(3);
    });

    it('removeGuide removes guide by id', () => {
      useEditorStore.getState().addGuide('x', 100);
      useEditorStore.getState().addGuide('y', 200);
      const guides = useEditorStore.getState().guides;
      useEditorStore.getState().removeGuide(guides[0].id);
      expect(useEditorStore.getState().guides).toHaveLength(1);
      expect(useEditorStore.getState().guides[0].axis).toBe('y');
    });

    it('updateGuidePosition updates position', () => {
      useEditorStore.getState().addGuide('x', 100);
      const id = useEditorStore.getState().guides[0].id;
      useEditorStore.getState().updateGuidePosition(id, 250);
      expect(useEditorStore.getState().guides[0].position).toBe(250);
    });

    it('clearGuides removes all guides', () => {
      useEditorStore.getState().addGuide('x', 100);
      useEditorStore.getState().addGuide('y', 200);
      useEditorStore.getState().clearGuides();
      expect(useEditorStore.getState().guides).toEqual([]);
    });

    it('toggleShowGuides toggles visibility', () => {
      expect(useEditorStore.getState().showGuides).toBe(true);
      useEditorStore.getState().toggleShowGuides();
      expect(useEditorStore.getState().showGuides).toBe(false);
      useEditorStore.getState().toggleShowGuides();
      expect(useEditorStore.getState().showGuides).toBe(true);
    });

    it('toggleSnapToGuides toggles snapping', () => {
      expect(useEditorStore.getState().snapToGuides).toBe(true);
      useEditorStore.getState().toggleSnapToGuides();
      expect(useEditorStore.getState().snapToGuides).toBe(false);
    });
  });

  // ==========================================================================
  // Pages
  // ==========================================================================

  describe('pages', () => {
    function createMockSceneGraph() {
      const nodes = new Map<string, any>();
      let rootNodeIds: string[] = [];
      return {
        getNode: (id: string) => nodes.get(id),
        getRootNodes: () => rootNodeIds.map((id) => nodes.get(id)).filter(Boolean),
        addNode: vi.fn((node: any) => {
          nodes.set(node.id, node);
          if (!node.parent && !rootNodeIds.includes(node.id)) rootNodeIds.push(node.id);
        }),
        removeNode: vi.fn((id: string) => {
          nodes.delete(id);
          rootNodeIds = rootNodeIds.filter((rid) => rid !== id);
        }),
        updateNode: vi.fn((id: string, updates: any) => {
          const node = nodes.get(id);
          if (node) nodes.set(id, { ...node, ...updates });
        }),
        moveNode: vi.fn(),
        getDescendants: () => [],
        traverse: (cb: (node: any, depth: number) => void) => {
          for (const node of nodes.values()) cb(node, 0);
        },
        getWorldTransform: () => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }),
        toJSON: () => ({
          nodes: Array.from(nodes.values()),
          rootNodeIds: [...rootNodeIds],
        }),
        fromJSON: (data: { nodes: any[]; rootNodeIds: string[] }) => {
          nodes.clear();
          for (const node of data.nodes) nodes.set(node.id, node);
          rootNodeIds = [...data.rootNodeIds];
        },
        _addTestNode: (node: any) => {
          nodes.set(node.id, node);
          if (!node.parent && !rootNodeIds.includes(node.id)) rootNodeIds.push(node.id);
        },
      };
    }

    function makeTestNode(id: string) {
      return {
        id,
        name: id,
        type: 'rectangle' as const,
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
        blendMode: 'normal' as const,
        width: 100,
        height: 100,
        cornerRadius: [0, 0, 0, 0] as [number, number, number, number],
        fills: [],
        strokes: [],
      };
    }

    it('should start with one default page', () => {
      const state = useEditorStore.getState();
      expect(state.pages.length).toBe(1);
      expect(state.pages[0]!.name).toBe('Page 1');
      expect(state.activePageId).toBe(state.pages[0]!.id);
    });

    it('addPage creates a new page and switches to it', () => {
      const sg = createMockSceneGraph();
      sg._addTestNode(makeTestNode('rect1'));

      const initialPageId = useEditorStore.getState().activePageId;
      useEditorStore.getState().addPage(sg);

      const state = useEditorStore.getState();
      expect(state.pages.length).toBe(2);
      expect(state.activePageId).not.toBe(initialPageId);
      expect(state.pages[1]!.name).toBe('Page 2');
      // Scene graph should be empty on new page
      expect(sg.toJSON().nodes.length).toBe(0);
    });

    it('addPage saves current page state before switching', () => {
      const sg = createMockSceneGraph();
      sg._addTestNode(makeTestNode('rect1'));
      useEditorStore.setState({ selectedNodeIds: new Set(['rect1']) });

      const initialPageId = useEditorStore.getState().activePageId;
      useEditorStore.getState().addPage(sg);

      // The first page should have saved the rect1 node
      const state = useEditorStore.getState();
      const page1 = state.pages.find((p) => p.id === initialPageId)!;
      expect(page1.sceneGraphJSON.nodes.length).toBe(1);
      expect(page1.sceneGraphJSON.nodes[0]!.id).toBe('rect1');
      expect(page1.selectedNodeIds).toContain('rect1');
    });

    it('switchPage saves current and loads target', () => {
      const sg = createMockSceneGraph();
      sg._addTestNode(makeTestNode('rect1'));

      const page1Id = useEditorStore.getState().activePageId;

      // Add page 2
      useEditorStore.getState().addPage(sg);
      const page2Id = useEditorStore.getState().activePageId;

      // Add a node on page 2
      sg._addTestNode(makeTestNode('rect2'));
      useEditorStore.setState({ selectedNodeIds: new Set(['rect2']) });

      // Switch back to page 1
      useEditorStore.getState().switchPage(page1Id, sg);

      expect(useEditorStore.getState().activePageId).toBe(page1Id);
      // page 1 should have rect1
      const json = sg.toJSON();
      expect(json.nodes.length).toBe(1);
      expect(json.nodes[0]!.id).toBe('rect1');

      // Switch back to page 2
      useEditorStore.getState().switchPage(page2Id, sg);
      expect(useEditorStore.getState().activePageId).toBe(page2Id);
      const json2 = sg.toJSON();
      expect(json2.nodes.length).toBe(1);
      expect(json2.nodes[0]!.id).toBe('rect2');
    });

    it('switchPage clears transient state', () => {
      const sg = createMockSceneGraph();
      useEditorStore.setState({ enteredGroupId: 'group1', clipboard: [makeTestNode('clip1')] });

      useEditorStore.getState().addPage(sg);

      expect(useEditorStore.getState().enteredGroupId).toBeNull();
      expect(useEditorStore.getState().clipboard).toBeNull();
    });

    it('switchPage sets isPlaying to false', () => {
      const sg = createMockSceneGraph();
      useEditorStore.setState({ isPlaying: true });

      useEditorStore.getState().addPage(sg);

      expect(useEditorStore.getState().isPlaying).toBe(false);
    });

    it('switchPage to same page is a no-op', () => {
      const sg = createMockSceneGraph();
      const activePageId = useEditorStore.getState().activePageId;

      // Should not throw or change state
      useEditorStore.getState().switchPage(activePageId, sg);
      expect(useEditorStore.getState().activePageId).toBe(activePageId);
    });

    it('deletePage removes the page', () => {
      const sg = createMockSceneGraph();

      useEditorStore.getState().addPage(sg);
      expect(useEditorStore.getState().pages.length).toBe(2);

      const page2Id = useEditorStore.getState().activePageId;
      useEditorStore.getState().deletePage(page2Id, sg);

      expect(useEditorStore.getState().pages.length).toBe(1);
    });

    it('deletePage switches to adjacent page when deleting active', () => {
      const sg = createMockSceneGraph();
      sg._addTestNode(makeTestNode('rect1'));

      const page1Id = useEditorStore.getState().activePageId;

      useEditorStore.getState().addPage(sg);
      const page2Id = useEditorStore.getState().activePageId;

      // Delete page 2 (active)
      useEditorStore.getState().deletePage(page2Id, sg);

      expect(useEditorStore.getState().activePageId).toBe(page1Id);
      // Should have loaded page 1's scene graph
      expect(sg.toJSON().nodes.length).toBe(1);
      expect(sg.toJSON().nodes[0]!.id).toBe('rect1');
    });

    it('deletePage enforces minimum 1 page', () => {
      const sg = createMockSceneGraph();
      const pageId = useEditorStore.getState().activePageId;

      useEditorStore.getState().deletePage(pageId, sg);

      expect(useEditorStore.getState().pages.length).toBe(1);
    });

    it('deletePage of non-active page keeps current active', () => {
      const sg = createMockSceneGraph();
      const page1Id = useEditorStore.getState().activePageId;

      useEditorStore.getState().addPage(sg);
      const page2Id = useEditorStore.getState().activePageId;

      // Switch back to page 1
      useEditorStore.getState().switchPage(page1Id, sg);

      // Delete page 2 (non-active)
      useEditorStore.getState().deletePage(page2Id, sg);

      expect(useEditorStore.getState().activePageId).toBe(page1Id);
      expect(useEditorStore.getState().pages.length).toBe(1);
    });

    it('renamePage updates the page name', () => {
      const state = useEditorStore.getState();
      const pageId = state.pages[0]!.id;

      useEditorStore.getState().renamePage(pageId, 'My Page');

      expect(useEditorStore.getState().pages[0]!.name).toBe('My Page');
    });

    it('duplicatePage creates a copy after the source', () => {
      const sg = createMockSceneGraph();
      sg._addTestNode(makeTestNode('rect1'));

      const page1Id = useEditorStore.getState().activePageId;
      useEditorStore.getState().duplicatePage(page1Id, sg);

      const state = useEditorStore.getState();
      expect(state.pages.length).toBe(2);
      expect(state.pages[1]!.name).toBe('Page 1 Copy');
      // The duplicated page should have the same scene graph content
      expect(state.pages[1]!.sceneGraphJSON.nodes.length).toBe(1);
      expect(state.pages[1]!.sceneGraphJSON.nodes[0]!.id).toBe('rect1');
    });

    it('duplicatePage does not switch to the new page', () => {
      const sg = createMockSceneGraph();
      const page1Id = useEditorStore.getState().activePageId;

      useEditorStore.getState().duplicatePage(page1Id, sg);

      expect(useEditorStore.getState().activePageId).toBe(page1Id);
    });

    it('reorderPages moves pages correctly', () => {
      const sg = createMockSceneGraph();

      // Create 3 pages
      useEditorStore.getState().addPage(sg);
      useEditorStore.getState().addPage(sg);

      const state = useEditorStore.getState();
      expect(state.pages.length).toBe(3);

      const ids = state.pages.map((p) => p.id);

      // Move last page to position 0
      useEditorStore.getState().reorderPages(2, 0);

      const reordered = useEditorStore.getState().pages;
      expect(reordered[0]!.id).toBe(ids[2]);
      expect(reordered[1]!.id).toBe(ids[0]);
      expect(reordered[2]!.id).toBe(ids[1]);
    });

    it('reorderPages with invalid indices is a no-op', () => {
      const sg = createMockSceneGraph();
      useEditorStore.getState().addPage(sg);

      const before = useEditorStore.getState().pages.map((p) => p.id);

      useEditorStore.getState().reorderPages(-1, 0);
      useEditorStore.getState().reorderPages(0, 99);
      useEditorStore.getState().reorderPages(0, 0);

      const after = useEditorStore.getState().pages.map((p) => p.id);
      expect(after).toEqual(before);
    });

    it('per-page undo/redo stacks are independent', () => {
      const sg = createMockSceneGraph();
      sg._addTestNode(makeTestNode('rect1'));

      // Push undo on page 1
      useEditorStore.getState().pushUndo(sg);
      expect(useEditorStore.getState().canUndo).toBe(true);

      const page1Id = useEditorStore.getState().activePageId;

      // Switch to page 2
      useEditorStore.getState().addPage(sg);
      const page2Id = useEditorStore.getState().activePageId;

      // Page 2 should have empty undo stack
      expect(useEditorStore.getState().canUndo).toBe(false);

      // Switch back to page 1
      useEditorStore.getState().switchPage(page1Id, sg);

      // Page 1's undo stack should be restored
      expect(useEditorStore.getState().canUndo).toBe(true);
    });
  });

  // ==========================================================================
  // Symbols (reusable components)
  // ==========================================================================

  describe('symbols', () => {
    function createMockSceneGraphForSymbols() {
      const nodes = new Map<string, any>();
      let rootNodeIds: string[] = [];
      return {
        getNode: (id: string) => nodes.get(id),
        getRootNodes: () => rootNodeIds.map((id) => nodes.get(id)).filter(Boolean),
        addNode: vi.fn((node: any, parentId?: string) => {
          if (parentId) node.parent = parentId;
          nodes.set(node.id, node);
          if (!node.parent && !rootNodeIds.includes(node.id)) rootNodeIds.push(node.id);
        }),
        removeNode: vi.fn((id: string) => {
          nodes.delete(id);
          rootNodeIds = rootNodeIds.filter((rid) => rid !== id);
        }),
        updateNode: vi.fn((id: string, updates: any) => {
          const node = nodes.get(id);
          if (node) nodes.set(id, { ...node, ...updates });
        }),
        moveNode: vi.fn(),
        getDescendants: (id: string) => {
          const result: any[] = [];
          const node = nodes.get(id);
          if (node?.children) {
            for (const childId of node.children) {
              const child = nodes.get(childId);
              if (child) result.push(child);
            }
          }
          return result;
        },
        traverse: (cb: (node: any, depth: number) => void) => {
          for (const node of nodes.values()) cb(node, 0);
        },
        getWorldTransform: () => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }),
        toJSON: () => ({
          nodes: Array.from(nodes.values()),
          rootNodeIds: [...rootNodeIds],
        }),
        fromJSON: (data: { nodes: any[]; rootNodeIds: string[] }) => {
          nodes.clear();
          rootNodeIds = [];
          for (const node of data.nodes) {
            nodes.set(node.id, node);
          }
          rootNodeIds = [...data.rootNodeIds];
        },
        _addTestNode: (node: any) => {
          nodes.set(node.id, node);
          if (!node.parent && !rootNodeIds.includes(node.id)) rootNodeIds.push(node.id);
        },
      };
    }

    function makeTestRect(id: string) {
      return {
        id,
        name: id,
        type: 'rectangle' as const,
        parent: null,
        children: [],
        transform: {
          position: { x: 50, y: 50 },
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
        height: 80,
        cornerRadius: [0, 0, 0, 0],
        fills: [
          {
            type: 'solid' as const,
            color: { r: 100, g: 149, b: 237, a: 1 },
            opacity: 1,
            visible: true,
          },
        ],
        strokes: [],
      };
    }

    it('has empty initial state', () => {
      expect(useEditorStore.getState().symbols).toEqual([]);
      expect(useEditorStore.getState().editingSymbolId).toBeNull();
      expect(useEditorStore.getState().editingSymbolPrevState).toBeNull();
    });

    it('createSymbol returns null with no selection', () => {
      const sg = createMockSceneGraphForSymbols();
      useEditorStore.setState({ selectedNodeIds: new Set() });
      const result = useEditorStore.getState().createSymbol(sg);
      expect(result).toBeNull();
    });

    it('createSymbol creates definition and instance', () => {
      const sg = createMockSceneGraphForSymbols();
      const rect = makeTestRect('r1');
      sg._addTestNode(rect);

      useEditorStore.setState({ selectedNodeIds: new Set(['r1']) });
      const symbolId = useEditorStore.getState().createSymbol(sg);

      expect(symbolId).toBeTruthy();
      const symbols = useEditorStore.getState().symbols;
      expect(symbols).toHaveLength(1);
      expect(symbols[0]!.id).toBe(symbolId);

      // Original node should be removed
      expect(sg.removeNode).toHaveBeenCalledWith('r1');

      // An instance should be added
      expect(sg.addNode).toHaveBeenCalled();
      const addedNode = (sg.addNode as any).mock.calls.find(
        (call: any[]) => call[0].type === 'symbol-instance'
      );
      expect(addedNode).toBeTruthy();
      expect(addedNode[0].symbolId).toBe(symbolId);
    });

    it('renameSymbol updates definition name', () => {
      const sg = createMockSceneGraphForSymbols();
      const rect = makeTestRect('r1');
      sg._addTestNode(rect);
      useEditorStore.setState({ selectedNodeIds: new Set(['r1']) });
      const symbolId = useEditorStore.getState().createSymbol(sg)!;

      useEditorStore.getState().renameSymbol(symbolId, 'New Name');
      expect(useEditorStore.getState().symbols[0]!.name).toBe('New Name');
    });

    it('placeSymbolInstance creates an instance node', () => {
      const sg = createMockSceneGraphForSymbols();
      const rect = makeTestRect('r1');
      sg._addTestNode(rect);
      useEditorStore.setState({ selectedNodeIds: new Set(['r1']) });
      const symbolId = useEditorStore.getState().createSymbol(sg)!;

      // Reset mock calls
      (sg.addNode as any).mockClear();

      useEditorStore.getState().placeSymbolInstance(sg, symbolId);
      expect(sg.addNode).toHaveBeenCalledTimes(1);
      const placed = (sg.addNode as any).mock.calls[0][0];
      expect(placed.type).toBe('symbol-instance');
      expect(placed.symbolId).toBe(symbolId);
    });

    it('detachInstance converts symbol-instance to group', () => {
      const sg = createMockSceneGraphForSymbols();
      const rect = makeTestRect('r1');
      sg._addTestNode(rect);
      useEditorStore.setState({ selectedNodeIds: new Set(['r1']) });
      const symbolId = useEditorStore.getState().createSymbol(sg)!;

      // Find the instance that was created
      const selectedIds = useEditorStore.getState().selectedNodeIds;
      const instId = [...selectedIds][0]!;
      const inst = sg.getNode(instId);
      expect(inst?.type).toBe('symbol-instance');

      // Now detach
      useEditorStore.getState().detachInstance(sg);

      // Instance should be removed, a group or replacement node added
      expect(sg.removeNode).toHaveBeenCalledWith(instId);
    });

    it('detachInstance preserves nested artwork with no dangling refs (F028)', () => {
      const sg = new SceneGraph();
      const tf = () => ({
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        anchor: { x: 0.5, y: 0.5 },
        skew: { x: 0, y: 0 },
      });
      const base = { visible: true, locked: false, opacity: 1, blendMode: 'normal' };
      const groupDef = {
        ...base,
        id: 'gdef',
        name: 'G',
        type: 'group',
        parent: null,
        children: ['rdef'],
        transform: tf(),
      };
      const rectDef = {
        ...base,
        id: 'rdef',
        name: 'R',
        type: 'rectangle',
        parent: 'gdef',
        children: [],
        transform: tf(),
        width: 10,
        height: 10,
        cornerRadius: [0, 0, 0, 0],
        fills: [],
        strokes: [],
      };
      const def = {
        id: 'sym1',
        name: 'Sym',
        sceneGraphJSON: { nodes: [groupDef, rectDef], rootNodeIds: ['gdef'] },
        createdAt: '',
        updatedAt: '',
      };
      const inst = {
        ...base,
        id: 'inst1',
        name: 'Inst',
        type: 'symbol-instance',
        symbolId: 'sym1',
        overrides: [],
        parent: null,
        children: [],
        transform: tf(),
      };

      sg.addNode(inst as never);
      useEditorStore.setState({ symbols: [def] as never, selectedNodeIds: new Set(['inst1']) });
      useEditorStore.getState().detachInstance(sg);

      const outerId = Array.from(useEditorStore.getState().selectedNodeIds)[0]!;
      const outer = sg.getNode(outerId)!;
      expect(outer.type).toBe('group');
      expect(outer.children).toHaveLength(1);

      const innerGroup = sg.getNode(outer.children[0]!)!;
      expect(innerGroup.type).toBe('group');
      expect(innerGroup.children).toHaveLength(1); // nested rect survived

      const nested = sg.getNode(innerGroup.children[0]!)!;
      expect(nested.type).toBe('rectangle');

      // No child id anywhere dangles.
      for (const n of sg.toJSON().nodes) {
        for (const cid of n.children ?? []) {
          expect(sg.getNode(cid)).toBeDefined();
        }
      }
    });

    it('detachInstance is no-op if selected is not symbol-instance', () => {
      const sg = createMockSceneGraphForSymbols();
      const rect = makeTestRect('r1');
      sg._addTestNode(rect);
      useEditorStore.setState({ selectedNodeIds: new Set(['r1']) });

      const callCountBefore = (sg.removeNode as any).mock.calls.length;
      useEditorStore.getState().detachInstance(sg);
      const callCountAfter = (sg.removeNode as any).mock.calls.length;
      expect(callCountAfter).toBe(callCountBefore);
    });

    it('enterSymbolEdit swaps scene graph and sets editingSymbolId', () => {
      const sg = createMockSceneGraphForSymbols();
      const rect = makeTestRect('r1');
      sg._addTestNode(rect);
      useEditorStore.setState({ selectedNodeIds: new Set(['r1']) });
      const symbolId = useEditorStore.getState().createSymbol(sg)!;

      useEditorStore.getState().enterSymbolEdit(symbolId, sg);

      expect(useEditorStore.getState().editingSymbolId).toBe(symbolId);
      expect(useEditorStore.getState().editingSymbolPrevState).not.toBeNull();
    });

    it('exitSymbolEdit saves changes and restores scene', () => {
      const sg = createMockSceneGraphForSymbols();
      const rect = makeTestRect('r1');
      sg._addTestNode(rect);
      useEditorStore.setState({ selectedNodeIds: new Set(['r1']) });
      const symbolId = useEditorStore.getState().createSymbol(sg)!;

      // Enter edit
      useEditorStore.getState().enterSymbolEdit(symbolId, sg);
      expect(useEditorStore.getState().editingSymbolId).toBe(symbolId);

      // Exit edit
      useEditorStore.getState().exitSymbolEdit(sg);
      expect(useEditorStore.getState().editingSymbolId).toBeNull();
      expect(useEditorStore.getState().editingSymbolPrevState).toBeNull();
    });

    it('isolates the page undo/redo history during symbol edit (F029)', () => {
      const sg = createMockSceneGraphForSymbols();
      const rect = makeTestRect('r1');
      sg._addTestNode(rect);
      useEditorStore.setState({ selectedNodeIds: new Set(['r1']) });
      const symbolId = useEditorStore.getState().createSymbol(sg)!;

      // Establish a page-level undo entry.
      useEditorStore.getState().pushUndo(sg);
      const pageUndoLen = useEditorStore.getState().undoStack.length;
      expect(pageUndoLen).toBeGreaterThan(0);

      // Enter symbol edit: page history is stashed, symbol history starts empty.
      useEditorStore.getState().enterSymbolEdit(symbolId, sg);
      expect(useEditorStore.getState().canUndo).toBe(false);
      expect(useEditorStore.getState().undoStack).toHaveLength(0);

      // Undo inside symbol edit must NOT reach into the page's history / scene.
      const symbolSceneBefore = JSON.stringify(sg.toJSON());
      useEditorStore.getState().undo(sg);
      expect(JSON.stringify(sg.toJSON())).toBe(symbolSceneBefore);

      // Exit restores the page's undo history.
      useEditorStore.getState().exitSymbolEdit(sg);
      expect(useEditorStore.getState().undoStack).toHaveLength(pageUndoLen);
      expect(useEditorStore.getState().canUndo).toBe(true);
    });

    it('switching pages while editing a symbol does not corrupt the page scene (F002)', () => {
      const sg = createMockSceneGraphForSymbols();
      const rect = makeTestRect('r1');
      sg._addTestNode(rect);
      useEditorStore.setState({ selectedNodeIds: new Set(['r1']) });
      const symbolId = useEditorStore.getState().createSymbol(sg)!;

      // Create a second page and return to the first so it holds real content.
      useEditorStore.getState().addPage(sg);
      const pageIds = useEditorStore.getState().pages.map((p) => p.id);
      const page1Id = pageIds[0]!;
      const page2Id = pageIds[1]!;
      useEditorStore.getState().switchPage(page1Id, sg);

      // Enter symbol edit and make a distinctive change to the symbol.
      useEditorStore.getState().enterSymbolEdit(symbolId, sg);
      expect(useEditorStore.getState().editingSymbolId).toBe(symbolId);
      sg._addTestNode(makeTestRect('symbol-extra'));

      // Navigate away while editing the symbol.
      useEditorStore.getState().switchPage(page2Id, sg);

      // (1) symbol-edit mode was exited by the guard.
      expect(useEditorStore.getState().editingSymbolId).toBeNull();

      // (2) page 1's stored scene is its real content, not the symbol's nodes.
      const page1 = useEditorStore.getState().pages.find((p) => p.id === page1Id)!;
      const page1NodeIds = page1.sceneGraphJSON.nodes.map((n) => n.id);
      expect(page1NodeIds).not.toContain('symbol-extra');

      // (3) the symbol definition captured the edit made during symbol edit.
      const symDef = useEditorStore.getState().symbols.find((s) => s.id === symbolId)!;
      const symNodeIds = symDef.sceneGraphJSON.nodes.map((n) => n.id);
      expect(symNodeIds).toContain('symbol-extra');
    });

    it('setInstanceOverride adds override to instance', () => {
      const sg = createMockSceneGraphForSymbols();
      const rect = makeTestRect('r1');
      sg._addTestNode(rect);
      useEditorStore.setState({ selectedNodeIds: new Set(['r1']) });
      const symbolId = useEditorStore.getState().createSymbol(sg)!;

      const selectedIds = useEditorStore.getState().selectedNodeIds;
      const instId = [...selectedIds][0]!;

      useEditorStore.getState().setInstanceOverride(sg, instId, {
        nodeId: 'r1',
        properties: { opacity: 0.5 },
      });

      expect(sg.updateNode).toHaveBeenCalled();
    });

    it('resetInstanceOverrides clears all overrides', () => {
      const sg = createMockSceneGraphForSymbols();
      const rect = makeTestRect('r1');
      sg._addTestNode(rect);
      useEditorStore.setState({ selectedNodeIds: new Set(['r1']) });
      useEditorStore.getState().createSymbol(sg);

      const selectedIds = useEditorStore.getState().selectedNodeIds;
      const instId = [...selectedIds][0]!;

      // Set an override first
      useEditorStore.getState().setInstanceOverride(sg, instId, {
        nodeId: 'r1',
        properties: { opacity: 0.5 },
      });

      // Reset
      useEditorStore.getState().resetInstanceOverrides(sg, instId);

      // updateNode should have been called with empty overrides
      const lastCall = (sg.updateNode as any).mock.calls.at(-1);
      expect(lastCall[1].overrides).toEqual([]);
    });

    it('symbols persist across page switches (global state)', () => {
      const sg = createMockSceneGraphForSymbols();
      const rect = makeTestRect('r1');
      sg._addTestNode(rect);
      useEditorStore.setState({ selectedNodeIds: new Set(['r1']) });
      const symbolId = useEditorStore.getState().createSymbol(sg)!;

      // Add a page and switch
      useEditorStore.getState().addPage(sg);
      const symbols = useEditorStore.getState().symbols;
      expect(symbols).toHaveLength(1);
      expect(symbols[0]!.id).toBe(symbolId);
    });

    it('deleteSymbol removes definition', () => {
      const sg = createMockSceneGraphForSymbols();
      const rect = makeTestRect('r1');
      sg._addTestNode(rect);
      useEditorStore.setState({ selectedNodeIds: new Set(['r1']) });
      const symbolId = useEditorStore.getState().createSymbol(sg)!;

      useEditorStore.getState().deleteSymbol(symbolId, sg);
      expect(useEditorStore.getState().symbols).toHaveLength(0);
    });
  });

  describe('undo & z-order (F026, F027)', () => {
    const mkNode = (id: string) =>
      ({
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
      }) as never;

    it('bringForward moves a node exactly one slot forward', () => {
      const sg = new SceneGraph();
      for (const id of ['A', 'B', 'C', 'D']) sg.addNode(mkNode(id));
      useEditorStore.setState({ selectedNodeIds: new Set(['A']) });

      useEditorStore.getState().bringForward(sg);
      expect(sg.getRootNodes().map((n) => n.id)).toEqual(['B', 'A', 'C', 'D']);

      // Second-to-last case: C forward -> [B, A, D, C].
      useEditorStore.setState({ selectedNodeIds: new Set(['C']) });
      useEditorStore.getState().bringForward(sg);
      expect(sg.getRootNodes().map((n) => n.id)).toEqual(['B', 'A', 'D', 'C']);
    });

    it('undo restores keyframe tracks removed by deleteSelection (F026)', () => {
      const sg = new SceneGraph();
      sg.addNode(mkNode('R'));
      useEditorStore.getState().addKeyframeAtFrame('R', 'opacity', 10, 0.5);
      expect(useEditorStore.getState().timeline.tracks.some((t) => t.nodeId === 'R')).toBe(true);

      useEditorStore.setState({ selectedNodeIds: new Set(['R']) });
      useEditorStore.getState().deleteSelection(sg);
      // deleteSelection strips the node's keyframe track...
      expect(useEditorStore.getState().timeline.tracks.some((t) => t.nodeId === 'R')).toBe(false);

      // ...and undo brings it back (previously lost permanently).
      useEditorStore.getState().undo(sg);
      expect(useEditorStore.getState().timeline.tracks.some((t) => t.nodeId === 'R')).toBe(true);
    });
  });

  describe('resetProject (F024)', () => {
    it('clears all project-scoped state from a stale project', () => {
      useEditorStore.setState({
        projectId: 'A',
        projectName: 'Old',
        symbols: [{ id: 's1' }] as never,
        guides: [{ id: 'g1' }] as never,
        vitruvianControllers: [{ id: 'v1' }] as never,
        dynamicChains: [{ id: 'd1' }] as never,
        pages: [{ id: 'p1' }, { id: 'p2' }] as never,
        activePageId: 'p1',
        isDirty: true,
        selectedNodeIds: new Set(['x']),
      });

      useEditorStore.getState().resetProject();

      const s = useEditorStore.getState();
      expect(s.projectId).toBeNull();
      expect(s.projectName).toBe('Untitled Project');
      expect(s.isDirty).toBe(false);
      expect(s.pages).toHaveLength(1);
      expect(s.activePageId).toBe(s.pages[0]!.id);
      expect(s.symbols).toHaveLength(0);
      expect(s.guides).toHaveLength(0);
      expect(s.vitruvianControllers).toHaveLength(0);
      expect(s.dynamicChains).toHaveLength(0);
      expect(s.selectedNodeIds.size).toBe(0);
    });
  });
});
