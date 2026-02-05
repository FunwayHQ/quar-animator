/**
 * Tests for SelectionOverlay component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../test/utils';
import { SelectionOverlay } from './SelectionOverlay';
import type { SelectionBounds, TransformHandle, HandlePosition } from '@quar/core';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestBounds(
  x: number,
  y: number,
  width: number,
  height: number
): SelectionBounds {
  return {
    rect: { x, y, width, height },
    center: { x: x + width / 2, y: y + height / 2 },
  };
}

function createTestHandle(
  position: HandlePosition,
  x: number,
  y: number,
  cursor = 'default'
): TransformHandle {
  return {
    position,
    screenPosition: { x, y },
    cursor,
  };
}

function createAllHandles(bounds: SelectionBounds): TransformHandle[] {
  const { rect } = bounds;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;

  return [
    createTestHandle('top-left', rect.x, rect.y, 'nwse-resize'),
    createTestHandle('top', cx, rect.y, 'ns-resize'),
    createTestHandle('top-right', rect.x + rect.width, rect.y, 'nesw-resize'),
    createTestHandle('right', rect.x + rect.width, cy, 'ew-resize'),
    createTestHandle('bottom-right', rect.x + rect.width, rect.y + rect.height, 'nwse-resize'),
    createTestHandle('bottom', cx, rect.y + rect.height, 'ns-resize'),
    createTestHandle('bottom-left', rect.x, rect.y + rect.height, 'nesw-resize'),
    createTestHandle('left', rect.x, cy, 'ew-resize'),
    createTestHandle('rotation', cx, rect.y - 20, 'grab'),
  ];
}

// ============================================================================
// Tests
// ============================================================================

describe('SelectionOverlay', () => {
  // ==========================================================================
  // Rendering
  // ==========================================================================

  describe('rendering', () => {
    it('should render nothing when bounds is null', () => {
      render(<SelectionOverlay bounds={null} handles={[]} />);

      expect(screen.queryByTestId('selection-overlay')).not.toBeInTheDocument();
    });

    it('should render overlay when bounds is provided', () => {
      const bounds = createTestBounds(100, 100, 200, 150);
      const handles = createAllHandles(bounds);

      render(<SelectionOverlay bounds={bounds} handles={handles} />);

      expect(screen.getByTestId('selection-overlay')).toBeInTheDocument();
    });

    it('should render selection bounds rectangle', () => {
      const bounds = createTestBounds(100, 100, 200, 150);
      const handles = createAllHandles(bounds);

      render(<SelectionOverlay bounds={bounds} handles={handles} />);

      const boundsRect = screen.getByTestId('selection-bounds');
      expect(boundsRect).toBeInTheDocument();
      expect(boundsRect).toHaveAttribute('x', '100');
      expect(boundsRect).toHaveAttribute('y', '100');
      expect(boundsRect).toHaveAttribute('width', '200');
      expect(boundsRect).toHaveAttribute('height', '150');
    });
  });

  // ==========================================================================
  // Handles
  // ==========================================================================

  describe('handles', () => {
    it('should render 8 resize handles', () => {
      const bounds = createTestBounds(100, 100, 200, 150);
      const handles = createAllHandles(bounds);

      render(<SelectionOverlay bounds={bounds} handles={handles} />);

      const resizePositions: HandlePosition[] = [
        'top-left', 'top', 'top-right',
        'right', 'bottom-right', 'bottom',
        'bottom-left', 'left',
      ];

      for (const position of resizePositions) {
        expect(screen.getByTestId(`handle-${position}`)).toBeInTheDocument();
      }
    });

    it('should render rotation handle', () => {
      const bounds = createTestBounds(100, 100, 200, 150);
      const handles = createAllHandles(bounds);

      render(<SelectionOverlay bounds={bounds} handles={handles} />);

      expect(screen.getByTestId('handle-rotation')).toBeInTheDocument();
    });

    it('should render rotation line connecting to top handle', () => {
      const bounds = createTestBounds(100, 100, 200, 150);
      const handles = createAllHandles(bounds);

      render(<SelectionOverlay bounds={bounds} handles={handles} />);

      expect(screen.getByTestId('rotation-line')).toBeInTheDocument();
    });

    it('should position handles correctly', () => {
      const bounds = createTestBounds(100, 100, 200, 150);
      const handles = createAllHandles(bounds);

      render(<SelectionOverlay bounds={bounds} handles={handles} />);

      // Top-left handle should be at bounds top-left
      const topLeft = screen.getByTestId('handle-top-left');
      expect(topLeft.getAttribute('x')).toBe('96'); // 100 - 4 (half of 8px handle)
      expect(topLeft.getAttribute('y')).toBe('96');
    });

    it('should set correct cursor on handles', () => {
      const bounds = createTestBounds(100, 100, 200, 150);
      const handles = createAllHandles(bounds);

      render(<SelectionOverlay bounds={bounds} handles={handles} />);

      const topLeft = screen.getByTestId('handle-top-left');
      expect(topLeft).toHaveStyle({ cursor: 'nwse-resize' });

      const top = screen.getByTestId('handle-top');
      expect(top).toHaveStyle({ cursor: 'ns-resize' });

      const rotation = screen.getByTestId('handle-rotation');
      expect(rotation).toHaveStyle({ cursor: 'grab' });
    });
  });

  // ==========================================================================
  // Interaction
  // ==========================================================================

  describe('interaction', () => {
    it('should call onHandlePointerDown when handle is clicked', () => {
      const bounds = createTestBounds(100, 100, 200, 150);
      const handles = createAllHandles(bounds);
      const onHandlePointerDown = vi.fn();

      render(
        <SelectionOverlay
          bounds={bounds}
          handles={handles}
          onHandlePointerDown={onHandlePointerDown}
        />
      );

      const topLeft = screen.getByTestId('handle-top-left');
      fireEvent.pointerDown(topLeft);

      expect(onHandlePointerDown).toHaveBeenCalledTimes(1);
      expect(onHandlePointerDown).toHaveBeenCalledWith(
        expect.objectContaining({ position: 'top-left' }),
        expect.any(Object)
      );
    });

    it('should call onHandlePointerDown for rotation handle', () => {
      const bounds = createTestBounds(100, 100, 200, 150);
      const handles = createAllHandles(bounds);
      const onHandlePointerDown = vi.fn();

      render(
        <SelectionOverlay
          bounds={bounds}
          handles={handles}
          onHandlePointerDown={onHandlePointerDown}
        />
      );

      const rotation = screen.getByTestId('handle-rotation');
      fireEvent.pointerDown(rotation);

      expect(onHandlePointerDown).toHaveBeenCalledWith(
        expect.objectContaining({ position: 'rotation' }),
        expect.any(Object)
      );
    });

    it('should work without onHandlePointerDown callback', () => {
      const bounds = createTestBounds(100, 100, 200, 150);
      const handles = createAllHandles(bounds);

      render(<SelectionOverlay bounds={bounds} handles={handles} />);

      const topLeft = screen.getByTestId('handle-top-left');
      expect(() => fireEvent.pointerDown(topLeft)).not.toThrow();
    });
  });

  // ==========================================================================
  // Custom Handle Size
  // ==========================================================================

  describe('custom handle size', () => {
    it('should use custom handle size', () => {
      const bounds = createTestBounds(100, 100, 200, 150);
      const handles = createAllHandles(bounds);

      render(
        <SelectionOverlay
          bounds={bounds}
          handles={handles}
          handleSize={12}
        />
      );

      const topLeft = screen.getByTestId('handle-top-left');
      expect(topLeft).toHaveAttribute('width', '12');
      expect(topLeft).toHaveAttribute('height', '12');
    });

    it('should offset handles by half the custom size', () => {
      const bounds = createTestBounds(100, 100, 200, 150);
      const handles = createAllHandles(bounds);

      render(
        <SelectionOverlay
          bounds={bounds}
          handles={handles}
          handleSize={12}
        />
      );

      const topLeft = screen.getByTestId('handle-top-left');
      // Handle at (100, 100) with size 12 should have x = 100 - 6 = 94
      expect(topLeft.getAttribute('x')).toBe('94');
      expect(topLeft.getAttribute('y')).toBe('94');
    });
  });
});
