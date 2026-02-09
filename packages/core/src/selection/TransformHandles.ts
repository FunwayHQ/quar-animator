/**
 * TransformHandles for Quar Animator
 * Calculates handle positions and provides hit testing for transform operations
 * Rotation is triggered by hovering outside the selection bounds near a corner (Figma-style)
 */

import type { Vector2 } from '@quar/types';
import type { Camera } from '../Camera';
import type { HandlePosition, SelectionBounds, SelectionConfig, TransformHandle } from './types';
import { DEFAULT_SELECTION_CONFIG } from './types';
import { vec2 } from '../math';

// ============================================================================
// Cursor Mapping
// ============================================================================

// Inline SVG rotate cursor (24x24 curved arrow, hotspot 12,12)
// Four variants rotated for each corner
function makeRotateCursor(rotateDeg: number): string {
  // White curved arrow with 1px black stroke outline — visible on dark backgrounds
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none'><g transform='rotate(${rotateDeg} 12 12)'><path d='M7.5 3.5A8.5 8.5 0 0 1 20 12' stroke='black' stroke-width='3' stroke-linecap='round' fill='none'/><path d='M7.5 3.5A8.5 8.5 0 0 1 20 12' stroke='white' stroke-width='1.5' stroke-linecap='round' fill='none'/><polyline points='4.5,4.5 7.5,3.5 8.5,6.5' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round' fill='none'/><polyline points='4.5,4.5 7.5,3.5 8.5,6.5' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' fill='none'/></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, pointer`;
}

// Note: World coordinates use Y-up, so "top" in code is visually at the bottom
// The cursor mappings are adjusted for the visual appearance (screen coordinates)
const HANDLE_CURSORS: Record<HandlePosition, string> = {
  'top-left': 'nesw-resize', // Visually bottom-left
  top: 'ns-resize',
  'top-right': 'nwse-resize', // Visually bottom-right
  right: 'ew-resize',
  'bottom-right': 'nesw-resize', // Visually top-right
  bottom: 'ns-resize',
  'bottom-left': 'nwse-resize', // Visually top-left
  left: 'ew-resize',
  // Rotation zones: cursor rotated per corner (world Y-up → visual positions swapped)
  'rotate-top-left': makeRotateCursor(180),     // Visually bottom-left
  'rotate-top-right': makeRotateCursor(270),     // Visually bottom-right
  'rotate-bottom-left': makeRotateCursor(90),    // Visually top-left
  'rotate-bottom-right': makeRotateCursor(0),    // Visually top-right
};

// Corner positions for rotation zone detection
const CORNER_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
const CORNER_TO_ROTATE: Record<string, HandlePosition> = {
  'top-left': 'rotate-top-left',
  'top-right': 'rotate-top-right',
  'bottom-left': 'rotate-bottom-left',
  'bottom-right': 'rotate-bottom-right',
};

// ============================================================================
// TransformHandles Class
// ============================================================================

export class TransformHandles {
  private config: SelectionConfig;

  constructor(config: Partial<SelectionConfig> = {}) {
    this.config = { ...DEFAULT_SELECTION_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // Handle Position Calculation
  // --------------------------------------------------------------------------

  /**
   * Get all transform handles for the given selection bounds
   * @param bounds The selection bounds
   * @param camera The camera for coordinate conversion
   * @returns Array of 8 transform handles (4 corners + 4 edges)
   */
  getHandles(bounds: SelectionBounds, camera: Camera): TransformHandle[] {
    const { rect } = bounds;

    // Calculate world coordinates for corners and edge midpoints
    const corners = {
      topLeft: { x: rect.x, y: rect.y },
      topRight: { x: rect.x + rect.width, y: rect.y },
      bottomLeft: { x: rect.x, y: rect.y + rect.height },
      bottomRight: { x: rect.x + rect.width, y: rect.y + rect.height },
    };

    const edges = {
      top: { x: rect.x + rect.width / 2, y: rect.y },
      right: { x: rect.x + rect.width, y: rect.y + rect.height / 2 },
      bottom: { x: rect.x + rect.width / 2, y: rect.y + rect.height },
      left: { x: rect.x, y: rect.y + rect.height / 2 },
    };

    // Convert all positions to screen coordinates
    const handles: TransformHandle[] = [
      // Corner handles
      {
        position: 'top-left',
        screenPosition: camera.worldToScreen(corners.topLeft),
        cursor: HANDLE_CURSORS['top-left'],
      },
      {
        position: 'top-right',
        screenPosition: camera.worldToScreen(corners.topRight),
        cursor: HANDLE_CURSORS['top-right'],
      },
      {
        position: 'bottom-left',
        screenPosition: camera.worldToScreen(corners.bottomLeft),
        cursor: HANDLE_CURSORS['bottom-left'],
      },
      {
        position: 'bottom-right',
        screenPosition: camera.worldToScreen(corners.bottomRight),
        cursor: HANDLE_CURSORS['bottom-right'],
      },
      // Edge midpoint handles
      {
        position: 'top',
        screenPosition: camera.worldToScreen(edges.top),
        cursor: HANDLE_CURSORS['top'],
      },
      {
        position: 'right',
        screenPosition: camera.worldToScreen(edges.right),
        cursor: HANDLE_CURSORS['right'],
      },
      {
        position: 'bottom',
        screenPosition: camera.worldToScreen(edges.bottom),
        cursor: HANDLE_CURSORS['bottom'],
      },
      {
        position: 'left',
        screenPosition: camera.worldToScreen(edges.left),
        cursor: HANDLE_CURSORS['left'],
      },
    ];

    return handles;
  }

  // --------------------------------------------------------------------------
  // Hit Testing
  // --------------------------------------------------------------------------

  /**
   * Test if a screen point hits any transform handle or rotation zone
   * @param screenPoint The screen position to test
   * @param bounds The selection bounds
   * @param camera The camera for coordinate conversion
   * @param rotation Current rotation in degrees
   * @returns The hit handle position or null
   */
  hitTest(
    screenPoint: Vector2,
    bounds: SelectionBounds,
    camera: Camera,
    rotation: number = 0
  ): HandlePosition | null {
    const handles = this.getHandles(bounds, camera);
    const hitRadius = this.config.handleHitRadius;

    // When bounds are un-rotated but visually rotated, inverse-rotate the
    // test point so it compares correctly against un-rotated handle positions.
    let testPoint = screenPoint;
    const screenCenter = camera.worldToScreen(bounds.center);
    if (rotation !== 0) {
      // The SVG overlay applies rotate(-rotation) to position handles visually.
      // To undo this, we apply the inverse: rotate(+rotation) to the click point.
      const rad = rotation * (Math.PI / 180);
      const dx = screenPoint.x - screenCenter.x;
      const dy = screenPoint.y - screenCenter.y;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      testPoint = {
        x: screenCenter.x + dx * cos - dy * sin,
        y: screenCenter.y + dx * sin + dy * cos,
      };
    }

    // 1. Check resize handles first — resize takes priority over rotation
    for (const handle of handles) {
      const distance = vec2.distance(testPoint, handle.screenPosition);
      if (distance <= hitRadius) {
        return handle.position;
      }
    }

    // 2. Check rotation zones — near a corner but outside the bounds rect
    const rotationRadius = this.config.rotationZoneRadius;
    const cornerHandles = handles.filter(h =>
      CORNER_POSITIONS.includes(h.position as typeof CORNER_POSITIONS[number])
    );

    for (const corner of cornerHandles) {
      const distance = vec2.distance(testPoint, corner.screenPosition);
      if (distance <= rotationRadius && this.isOutsideBounds(testPoint, handles)) {
        return CORNER_TO_ROTATE[corner.position] ?? null;
      }
    }

    return null;
  }

  // --------------------------------------------------------------------------
  // Bounds Testing
  // --------------------------------------------------------------------------

  /**
   * Check if a screen point is outside the selection bounds rectangle
   * Uses the corner handle positions to define the rectangle in screen space
   */
  private isOutsideBounds(screenPoint: Vector2, handles: TransformHandle[]): boolean {
    const tl = handles.find(h => h.position === 'top-left')!;
    const br = handles.find(h => h.position === 'bottom-right')!;

    // In screen space, determine the axis-aligned bounding rect from corners
    const minX = Math.min(tl.screenPosition.x, br.screenPosition.x);
    const maxX = Math.max(tl.screenPosition.x, br.screenPosition.x);
    const minY = Math.min(tl.screenPosition.y, br.screenPosition.y);
    const maxY = Math.max(tl.screenPosition.y, br.screenPosition.y);

    return (
      screenPoint.x < minX ||
      screenPoint.x > maxX ||
      screenPoint.y < minY ||
      screenPoint.y > maxY
    );
  }

  // --------------------------------------------------------------------------
  // Cursor Utilities
  // --------------------------------------------------------------------------

  /**
   * Get the CSS cursor style for a handle position
   * @param position The handle position
   * @returns CSS cursor string
   */
  getCursor(position: HandlePosition): string {
    return HANDLE_CURSORS[position];
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  /**
   * Get the current configuration
   */
  getConfig(): SelectionConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<SelectionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
