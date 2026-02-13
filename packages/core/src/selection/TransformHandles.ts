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

// Figma-quality rotate cursor (32×32, hotspot 16,16)
// Compact ~100° arc with filled triangular arrowhead, dual-layer for contrast:
// dark filled shadow underneath, white filled shape on top.
// Arc: radius 9 centered at (16,16), from ~215° to ~325° (bottom-left to upper-right)
// Arrowhead: filled triangle at the arc tip pointing along the tangent direction
function makeRotateCursor(rotateDeg: number): string {
  // Arc geometry: r=9, center=(16,16), sweep from 215° to 325° (110° arc)
  const cx = 16,
    cy = 16,
    r = 9;
  const startAngle = (215 * Math.PI) / 180;
  const endAngle = (325 * Math.PI) / 180;
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  // Arc path (large-arc=0 for <180°, sweep=1 for clockwise)
  const arc = `M${x1.toFixed(2)},${y1.toFixed(2)}A${r},${r},0,0,1,${x2.toFixed(2)},${y2.toFixed(2)}`;

  // Arrowhead: filled triangle at arc end, pointing along tangent
  // Tangent at endAngle points perpendicular to radius (90° CW from radius direction)
  const tx = -Math.sin(endAngle); // tangent x (clockwise arc)
  const ty = Math.cos(endAngle); // tangent y
  // Normal pointing outward from center
  const nx = Math.cos(endAngle);
  const ny = Math.sin(endAngle);
  // Triangle: tip ahead of arc end along tangent, two base points spread across normal
  const tipLen = 5.5,
    baseSpread = 3.2,
    baseBack = 1.0;
  const tipX = x2 + tx * tipLen;
  const tipY = y2 + ty * tipLen;
  const b1X = x2 - tx * baseBack + nx * baseSpread;
  const b1Y = y2 - ty * baseBack + ny * baseSpread;
  const b2X = x2 - tx * baseBack - nx * baseSpread;
  const b2Y = y2 - ty * baseBack - ny * baseSpread;
  const arrow = `M${tipX.toFixed(2)},${tipY.toFixed(2)}L${b1X.toFixed(2)},${b1Y.toFixed(2)}L${b2X.toFixed(2)},${b2Y.toFixed(2)}Z`;

  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>` +
    `<g transform='rotate(${rotateDeg} 16 16)'>` +
    // Shadow layer — dark, thicker, semi-transparent
    `<path d='${arc}' fill='none' stroke='%23000' stroke-opacity='0.5' stroke-width='3' stroke-linecap='round'/>` +
    `<path d='${arrow}' fill='%23000' fill-opacity='0.5' stroke='%23000' stroke-opacity='0.5' stroke-width='1.5' stroke-linejoin='round'/>` +
    // Foreground layer — white, crisp
    `<path d='${arc}' fill='none' stroke='white' stroke-width='1.6' stroke-linecap='round'/>` +
    `<path d='${arrow}' fill='white' stroke='white' stroke-width='0.5' stroke-linejoin='round'/>` +
    `</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, pointer`;
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
  'rotate-top-left': makeRotateCursor(180), // Visually bottom-left
  'rotate-top-right': makeRotateCursor(270), // Visually bottom-right
  'rotate-bottom-left': makeRotateCursor(90), // Visually top-left
  'rotate-bottom-right': makeRotateCursor(0), // Visually top-right
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
    const cornerHandles = handles.filter((h) =>
      CORNER_POSITIONS.includes(h.position as (typeof CORNER_POSITIONS)[number])
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
    const tl = handles.find((h) => h.position === 'top-left')!;
    const br = handles.find((h) => h.position === 'bottom-right')!;

    // In screen space, determine the axis-aligned bounding rect from corners
    const minX = Math.min(tl.screenPosition.x, br.screenPosition.x);
    const maxX = Math.max(tl.screenPosition.x, br.screenPosition.x);
    const minY = Math.min(tl.screenPosition.y, br.screenPosition.y);
    const maxY = Math.max(tl.screenPosition.y, br.screenPosition.y);

    return (
      screenPoint.x < minX || screenPoint.x > maxX || screenPoint.y < minY || screenPoint.y > maxY
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
