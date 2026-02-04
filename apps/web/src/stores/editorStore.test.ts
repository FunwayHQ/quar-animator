/**
 * Tests for Editor Store
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore, DEFAULT_FILL, DEFAULT_STROKE } from './editorStore';

describe('EditorStore', () => {
  // Reset store before each test
  beforeEach(() => {
    useEditorStore.setState({
      activeTool: 'selection',
      selectedNodeIds: new Set<string>(),
      defaultFill: DEFAULT_FILL,
      defaultStroke: DEFAULT_STROKE,
      isDrawing: false,
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
});
