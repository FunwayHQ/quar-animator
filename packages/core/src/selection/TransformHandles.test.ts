/**
 * Tests for TransformHandles
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TransformHandles } from './TransformHandles';
import { Camera } from '../Camera';
import type { SelectionBounds, HandlePosition } from './types';
import { DEFAULT_SELECTION_CONFIG } from './types';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestBounds(x: number, y: number, width: number, height: number): SelectionBounds {
  return {
    rect: { x, y, width, height },
    center: { x: x + width / 2, y: y + height / 2 },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('TransformHandles', () => {
  let handles: TransformHandles;
  let camera: Camera;

  beforeEach(() => {
    handles = new TransformHandles();
    camera = new Camera();
    // Set viewport for consistent testing
    camera.setViewport(800, 600);
  });

  // ==========================================================================
  // getHandles
  // ==========================================================================

  describe('getHandles', () => {
    it('should return 9 handles', () => {
      const bounds = createTestBounds(100, 100, 200, 150);
      const result = handles.getHandles(bounds, camera);

      expect(result).toHaveLength(9);
    });

    it('should return handles with correct positions', () => {
      const bounds = createTestBounds(100, 100, 200, 150);
      const result = handles.getHandles(bounds, camera);

      const positions = result.map((h) => h.position);
      expect(positions).toContain('top-left');
      expect(positions).toContain('top');
      expect(positions).toContain('top-right');
      expect(positions).toContain('right');
      expect(positions).toContain('bottom-right');
      expect(positions).toContain('bottom');
      expect(positions).toContain('bottom-left');
      expect(positions).toContain('left');
      expect(positions).toContain('rotation');
    });

    it('should calculate correct corner handle screen positions', () => {
      const bounds = createTestBounds(0, 0, 100, 100);
      camera.reset(); // Ensure zoom is 1 and pan is 0
      const result = handles.getHandles(bounds, camera);

      const topLeft = result.find((h) => h.position === 'top-left');
      const bottomRight = result.find((h) => h.position === 'bottom-right');

      expect(topLeft).toBeDefined();
      expect(bottomRight).toBeDefined();

      // Screen position should be world position adjusted by camera
      // At zoom 1 and no pan, with viewport 800x600, center is at (400, 300)
      // Top-left world (0,0) maps to screen (400, 300)
      const expectedTopLeft = camera.worldToScreen({ x: 0, y: 0 });
      expect(topLeft!.screenPosition.x).toBeCloseTo(expectedTopLeft.x, 1);
      expect(topLeft!.screenPosition.y).toBeCloseTo(expectedTopLeft.y, 1);

      const expectedBottomRight = camera.worldToScreen({ x: 100, y: 100 });
      expect(bottomRight!.screenPosition.x).toBeCloseTo(expectedBottomRight.x, 1);
      expect(bottomRight!.screenPosition.y).toBeCloseTo(expectedBottomRight.y, 1);
    });

    it('should calculate correct edge midpoint handle positions', () => {
      const bounds = createTestBounds(0, 0, 100, 80);
      const result = handles.getHandles(bounds, camera);

      const top = result.find((h) => h.position === 'top');
      const right = result.find((h) => h.position === 'right');
      const bottom = result.find((h) => h.position === 'bottom');
      const left = result.find((h) => h.position === 'left');

      // Top should be at (50, 0) in world coords
      const expectedTop = camera.worldToScreen({ x: 50, y: 0 });
      expect(top!.screenPosition.x).toBeCloseTo(expectedTop.x, 1);
      expect(top!.screenPosition.y).toBeCloseTo(expectedTop.y, 1);

      // Right should be at (100, 40)
      const expectedRight = camera.worldToScreen({ x: 100, y: 40 });
      expect(right!.screenPosition.x).toBeCloseTo(expectedRight.x, 1);
      expect(right!.screenPosition.y).toBeCloseTo(expectedRight.y, 1);

      // Bottom should be at (50, 80)
      const expectedBottom = camera.worldToScreen({ x: 50, y: 80 });
      expect(bottom!.screenPosition.x).toBeCloseTo(expectedBottom.x, 1);
      expect(bottom!.screenPosition.y).toBeCloseTo(expectedBottom.y, 1);

      // Left should be at (0, 40)
      const expectedLeft = camera.worldToScreen({ x: 0, y: 40 });
      expect(left!.screenPosition.x).toBeCloseTo(expectedLeft.x, 1);
      expect(left!.screenPosition.y).toBeCloseTo(expectedLeft.y, 1);
    });

    it('should position rotation handle above selection', () => {
      const bounds = createTestBounds(0, 0, 100, 100);
      const result = handles.getHandles(bounds, camera);

      const rotation = result.find((h) => h.position === 'rotation');
      const top = result.find((h) => h.position === 'top');

      expect(rotation).toBeDefined();
      expect(top).toBeDefined();

      // Rotation handle should be above top center in world space
      // The rotation handle has x equal to top handle x
      expect(rotation!.screenPosition.x).toBeCloseTo(top!.screenPosition.x, 1);
      // The rotation handle Y is different from top handle Y (offset in world space)
      expect(rotation!.screenPosition.y).not.toBe(top!.screenPosition.y);
    });

    it('should include correct cursors for each handle', () => {
      const bounds = createTestBounds(0, 0, 100, 100);
      const result = handles.getHandles(bounds, camera);

      // Note: World coordinates use Y-up, so visual cursors are swapped
      const cursorMap: Record<HandlePosition, string> = {
        'top-left': 'nesw-resize', // Visually bottom-left
        top: 'ns-resize',
        'top-right': 'nwse-resize', // Visually bottom-right
        right: 'ew-resize',
        'bottom-right': 'nesw-resize', // Visually top-right
        bottom: 'ns-resize',
        'bottom-left': 'nwse-resize', // Visually top-left
        left: 'ew-resize',
        rotation: 'grab',
      };

      for (const handle of result) {
        expect(handle.cursor).toBe(cursorMap[handle.position]);
      }
    });

    it('should adjust rotation handle distance with zoom', () => {
      const bounds = createTestBounds(0, 0, 100, 100);

      // At zoom 1
      camera.zoomTo(1);
      const result1 = handles.getHandles(bounds, camera);
      const rotation1 = result1.find((h) => h.position === 'rotation');
      const top1 = result1.find((h) => h.position === 'top');
      const offset1 = top1!.screenPosition.y - rotation1!.screenPosition.y;

      // At zoom 2
      camera.zoomTo(2);
      const result2 = handles.getHandles(bounds, camera);
      const rotation2 = result2.find((h) => h.position === 'rotation');
      const top2 = result2.find((h) => h.position === 'top');
      const offset2 = top2!.screenPosition.y - rotation2!.screenPosition.y;

      // The screen offset should be roughly the same regardless of zoom
      // (because we scale the world offset by 1/zoom to maintain consistent screen distance)
      expect(offset1).toBeCloseTo(offset2, 0);
    });
  });

  // ==========================================================================
  // hitTest
  // ==========================================================================

  describe('hitTest', () => {
    it('should return null when point is far from handles', () => {
      const bounds = createTestBounds(0, 0, 100, 100);

      // Test a point far away
      const result = handles.hitTest({ x: 1000, y: 1000 }, bounds, camera);
      expect(result).toBeNull();
    });

    it('should detect hit on corner handles', () => {
      const bounds = createTestBounds(0, 0, 100, 100);
      const handleList = handles.getHandles(bounds, camera);
      const topLeft = handleList.find((h) => h.position === 'top-left');

      const result = handles.hitTest(topLeft!.screenPosition, bounds, camera);
      expect(result).toBe('top-left');
    });

    it('should detect hit on edge handles', () => {
      const bounds = createTestBounds(0, 0, 100, 100);
      const handleList = handles.getHandles(bounds, camera);
      const top = handleList.find((h) => h.position === 'top');

      const result = handles.hitTest(top!.screenPosition, bounds, camera);
      expect(result).toBe('top');
    });

    it('should detect hit on rotation handle', () => {
      const bounds = createTestBounds(0, 0, 100, 100);
      const handleList = handles.getHandles(bounds, camera);
      const rotation = handleList.find((h) => h.position === 'rotation');

      const result = handles.hitTest(rotation!.screenPosition, bounds, camera);
      expect(result).toBe('rotation');
    });

    it('should detect hit within hit radius', () => {
      const bounds = createTestBounds(0, 0, 100, 100);
      const handleList = handles.getHandles(bounds, camera);
      const topLeft = handleList.find((h) => h.position === 'top-left');

      // Test point slightly offset (within hit radius of 12)
      const offsetPoint = {
        x: topLeft!.screenPosition.x + 5,
        y: topLeft!.screenPosition.y + 5,
      };

      const result = handles.hitTest(offsetPoint, bounds, camera);
      expect(result).toBe('top-left');
    });

    it('should return null when point is just outside hit radius', () => {
      const bounds = createTestBounds(0, 0, 100, 100);
      const handleList = handles.getHandles(bounds, camera);
      const topLeft = handleList.find((h) => h.position === 'top-left');

      // Test point outside hit radius (default is 12)
      const offsetPoint = {
        x: topLeft!.screenPosition.x + 15,
        y: topLeft!.screenPosition.y + 15,
      };

      const result = handles.hitTest(offsetPoint, bounds, camera);
      expect(result).toBeNull();
    });

    it('should respect custom hit radius', () => {
      const customHandles = new TransformHandles({ handleHitRadius: 5 });
      const bounds = createTestBounds(0, 0, 100, 100);
      const handleList = customHandles.getHandles(bounds, camera);
      const topLeft = handleList.find((h) => h.position === 'top-left');

      // Point at distance 8 - should miss with smaller radius
      const offsetPoint = {
        x: topLeft!.screenPosition.x + 8,
        y: topLeft!.screenPosition.y,
      };

      const result = customHandles.hitTest(offsetPoint, bounds, camera);
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // getCursor
  // ==========================================================================

  describe('getCursor', () => {
    it('should return correct cursor for each position', () => {
      // Note: World coordinates use Y-up, so visual cursors are swapped
      const expectations: Array<[HandlePosition, string]> = [
        ['top-left', 'nesw-resize'], // Visually bottom-left
        ['top', 'ns-resize'],
        ['top-right', 'nwse-resize'], // Visually bottom-right
        ['right', 'ew-resize'],
        ['bottom-right', 'nesw-resize'], // Visually top-right
        ['bottom', 'ns-resize'],
        ['bottom-left', 'nwse-resize'], // Visually top-left
        ['left', 'ew-resize'],
        ['rotation', 'grab'],
      ];

      for (const [position, expectedCursor] of expectations) {
        expect(handles.getCursor(position)).toBe(expectedCursor);
      }
    });
  });

  // ==========================================================================
  // Configuration
  // ==========================================================================

  describe('configuration', () => {
    it('should use default config values', () => {
      const config = handles.getConfig();

      expect(config.handleSize).toBe(DEFAULT_SELECTION_CONFIG.handleSize);
      expect(config.handleHitRadius).toBe(DEFAULT_SELECTION_CONFIG.handleHitRadius);
      expect(config.rotationHandleOffset).toBe(DEFAULT_SELECTION_CONFIG.rotationHandleOffset);
    });

    it('should accept custom config in constructor', () => {
      const customHandles = new TransformHandles({
        handleSize: 12,
        handleHitRadius: 16,
      });

      const config = customHandles.getConfig();
      expect(config.handleSize).toBe(12);
      expect(config.handleHitRadius).toBe(16);
      expect(config.rotationHandleOffset).toBe(DEFAULT_SELECTION_CONFIG.rotationHandleOffset);
    });

    it('should update config with setConfig', () => {
      handles.setConfig({ handleSize: 10 });

      const config = handles.getConfig();
      expect(config.handleSize).toBe(10);
    });
  });
});
