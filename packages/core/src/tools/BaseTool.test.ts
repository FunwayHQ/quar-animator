/**
 * Tests for BaseTool
 */

import { describe, it, expect, vi } from 'vitest';
import { BaseTool, type ToolContext, type ToolState } from './BaseTool';
import type { CanvasPointerEvent, ToolType } from '@quar/types';
import { createMockToolContext, createMockPointerEvent } from '../test/setup';

// Concrete implementation for testing
class TestTool extends BaseTool {
  readonly type: ToolType = 'selection';
  readonly cursor = 'test-cursor';

  onPointerDown = vi.fn();
  onPointerMove = vi.fn();
  onPointerUp = vi.fn();

  // Expose protected methods for testing
  public testIsConstrained(event: CanvasPointerEvent): boolean {
    return this.isConstrained(event);
  }

  public testIsFromCenter(event: CanvasPointerEvent): boolean {
    return this.isFromCenter(event);
  }

  public testIsAdditive(event: CanvasPointerEvent): boolean {
    return this.isAdditive(event);
  }

  public testConstrainToSquare(width: number, height: number) {
    return this.constrainToSquare(width, height);
  }

  public testGetRectFromPoints(
    start: { x: number; y: number },
    end: { x: number; y: number },
    constrained: boolean,
    fromCenter: boolean
  ) {
    return this.getRectFromPoints(start, end, constrained, fromCenter);
  }

  public testResetState() {
    this.resetState();
  }

  public getState(): ToolState {
    return this.state;
  }
}

describe('BaseTool', () => {
  let context: ToolContext;
  let tool: TestTool;

  beforeEach(() => {
    context = createMockToolContext();
    tool = new TestTool(context);
  });

  // ==========================================================================
  // Constructor
  // ==========================================================================

  describe('constructor', () => {
    it('should initialize with provided context', () => {
      expect(tool).toBeDefined();
      expect(tool.type).toBe('selection');
      expect(tool.cursor).toBe('test-cursor');
    });

    it('should initialize state with default values', () => {
      const state = tool.getState();
      expect(state.isActive).toBe(false);
      expect(state.isDragging).toBe(false);
      expect(state.startWorldPos).toBeNull();
      expect(state.currentWorldPos).toBeNull();
    });
  });

  // ==========================================================================
  // Modifier Keys
  // ==========================================================================

  describe('isConstrained', () => {
    it('should return true when shift key is pressed', () => {
      const event = createMockPointerEvent({ shiftKey: true });
      expect(tool.testIsConstrained(event)).toBe(true);
    });

    it('should return false when shift key is not pressed', () => {
      const event = createMockPointerEvent({ shiftKey: false });
      expect(tool.testIsConstrained(event)).toBe(false);
    });
  });

  describe('isFromCenter', () => {
    it('should return true when alt key is pressed', () => {
      const event = createMockPointerEvent({ altKey: true });
      expect(tool.testIsFromCenter(event)).toBe(true);
    });

    it('should return false when alt key is not pressed', () => {
      const event = createMockPointerEvent({ altKey: false });
      expect(tool.testIsFromCenter(event)).toBe(false);
    });
  });

  describe('isAdditive', () => {
    it('should return true when ctrl key is pressed', () => {
      const event = createMockPointerEvent({ ctrlKey: true });
      expect(tool.testIsAdditive(event)).toBe(true);
    });

    it('should return true when meta key is pressed', () => {
      const event = createMockPointerEvent({ metaKey: true });
      expect(tool.testIsAdditive(event)).toBe(true);
    });

    it('should return false when neither ctrl nor meta key is pressed', () => {
      const event = createMockPointerEvent({ ctrlKey: false, metaKey: false });
      expect(tool.testIsAdditive(event)).toBe(false);
    });
  });

  // ==========================================================================
  // Constraint Helpers
  // ==========================================================================

  describe('constrainToSquare', () => {
    it('should constrain to square using larger dimension', () => {
      const result = tool.testConstrainToSquare(100, 50);
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    });

    it('should preserve sign of dimensions', () => {
      const result = tool.testConstrainToSquare(-100, 50);
      expect(result.width).toBe(-100);
      expect(result.height).toBe(100);
    });

    it('should handle negative height', () => {
      const result = tool.testConstrainToSquare(50, -100);
      expect(result.width).toBe(100);
      expect(result.height).toBe(-100);
    });

    it('should handle both negative', () => {
      const result = tool.testConstrainToSquare(-80, -100);
      expect(result.width).toBe(-100);
      expect(result.height).toBe(-100);
    });
  });

  describe('getRectFromPoints', () => {
    it('should calculate basic rectangle', () => {
      const rect = tool.testGetRectFromPoints(
        { x: 10, y: 20 },
        { x: 110, y: 70 },
        false,
        false
      );
      expect(rect.x).toBe(10);
      expect(rect.y).toBe(20);
      expect(rect.width).toBe(100);
      expect(rect.height).toBe(50);
    });

    it('should handle negative direction (dragging up-left)', () => {
      const rect = tool.testGetRectFromPoints(
        { x: 100, y: 100 },
        { x: 50, y: 60 },
        false,
        false
      );
      expect(rect.x).toBe(50);
      expect(rect.y).toBe(60);
      expect(rect.width).toBe(50);
      expect(rect.height).toBe(40);
    });

    it('should constrain to square', () => {
      const rect = tool.testGetRectFromPoints(
        { x: 0, y: 0 },
        { x: 100, y: 50 },
        true,
        false
      );
      expect(rect.width).toBe(100);
      expect(rect.height).toBe(100);
    });

    it('should draw from center', () => {
      const rect = tool.testGetRectFromPoints(
        { x: 50, y: 50 },
        { x: 100, y: 80 },
        false,
        true
      );
      expect(rect.x).toBe(0); // 50 - 50
      expect(rect.y).toBe(20); // 50 - 30
      expect(rect.width).toBe(100); // 50 * 2
      expect(rect.height).toBe(60); // 30 * 2
    });

    it('should combine constrained and from center', () => {
      const rect = tool.testGetRectFromPoints(
        { x: 50, y: 50 },
        { x: 100, y: 80 },
        true,
        true
      );
      expect(rect.width).toBe(100);
      expect(rect.height).toBe(100);
    });
  });

  // ==========================================================================
  // State Management
  // ==========================================================================

  describe('resetState', () => {
    it('should reset state to initial values', () => {
      // Manually modify state
      const state = tool.getState();
      state.isActive = true;
      state.isDragging = true;
      state.startWorldPos = { x: 100, y: 200 };
      state.currentWorldPos = { x: 150, y: 250 };

      tool.testResetState();

      const resetState = tool.getState();
      expect(resetState.isActive).toBe(false);
      expect(resetState.isDragging).toBe(false);
      expect(resetState.startWorldPos).toBeNull();
      expect(resetState.currentWorldPos).toBeNull();
    });
  });
});
