/**
 * TransformHandles for Quar Animator
 * Calculates handle positions and provides hit testing for transform operations
 */

import type { Vector2 } from '@quar/types';
import type { Camera } from '../Camera';
import type { HandlePosition, SelectionBounds, SelectionConfig, TransformHandle } from './types';
import { DEFAULT_SELECTION_CONFIG } from './types';
import { vec2 } from '../math';

// ============================================================================
// Cursor Mapping
// ============================================================================

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
  rotation: 'grab',
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
   * @returns Array of 9 transform handles (8 resize + 1 rotation)
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

    // Calculate rotation handle position (above top center)
    const rotationWorldPos = {
      x: edges.top.x,
      y: edges.top.y - this.config.rotationHandleOffset / camera.zoom,
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
      // Rotation handle
      {
        position: 'rotation',
        screenPosition: camera.worldToScreen(rotationWorldPos),
        cursor: HANDLE_CURSORS['rotation'],
      },
    ];

    return handles;
  }

  // --------------------------------------------------------------------------
  // Hit Testing
  // --------------------------------------------------------------------------

  /**
   * Test if a screen point hits any transform handle
   * @param screenPoint The screen position to test
   * @param bounds The selection bounds
   * @param camera The camera for coordinate conversion
   * @returns The hit handle position or null
   */
  hitTest(screenPoint: Vector2, bounds: SelectionBounds, camera: Camera): HandlePosition | null {
    const handles = this.getHandles(bounds, camera);
    const hitRadius = this.config.handleHitRadius;

    for (const handle of handles) {
      const distance = vec2.distance(screenPoint, handle.screenPosition);
      if (distance <= hitRadius) {
        return handle.position;
      }
    }

    return null;
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
