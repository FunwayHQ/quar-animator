/**
 * OnionSkinRenderer - Renders ghost frames for onion skinning
 *
 * Renders previous and next frames as tinted, semi-transparent overlays
 * to help animators see motion before/after the current frame.
 */

import type { Matrix3, Node } from '@quar/types';
import type { ShapeRenderer } from './ShapeRenderer';

// ============================================================================
// Types & Defaults
// ============================================================================

export interface OnionSkinSettings {
  enabled: boolean;
  beforeCount: number; // 1-5
  afterCount: number; // 1-5
  beforeColor: string; // hex, e.g. '#FF6B6B'
  afterColor: string; // hex, e.g. '#4ECDC4'
  opacity: number; // 0-1
  opacityFalloff: number; // 0-1
  showDuringPlayback: boolean;
}

export const DEFAULT_ONION_SKIN_SETTINGS: OnionSkinSettings = {
  enabled: false,
  beforeCount: 2,
  afterCount: 2,
  beforeColor: '#FF6B6B',
  afterColor: '#4ECDC4',
  opacity: 0.5,
  opacityFalloff: 0.3,
  showDuringPlayback: false,
};

// ============================================================================
// Color Helpers
// ============================================================================

/**
 * Parse a hex color string to normalized [r, g, b] values (0-1 range).
 */
function hexToRgbNormalized(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16) / 255;
  const g = parseInt(cleaned.substring(2, 4), 16) / 255;
  const b = parseInt(cleaned.substring(4, 6), 16) / 255;
  return [r, g, b];
}

// ============================================================================
// OnionSkinRenderer Class
// ============================================================================

export class OnionSkinRenderer {
  private shapeRenderer: ShapeRenderer;

  constructor(shapeRenderer: ShapeRenderer) {
    this.shapeRenderer = shapeRenderer;
  }

  /**
   * Render onion skin ghost frames.
   *
   * @param settings - Onion skin configuration
   * @param currentFrame - The current frame number
   * @param getNodesAtFrame - Callback that evaluates timeline at a frame and returns node states
   * @param viewProjectionMatrix - Camera view-projection matrix
   */
  render(
    settings: OnionSkinSettings,
    currentFrame: number,
    getNodesAtFrame: (frame: number) => Node[],
    viewProjectionMatrix: Matrix3
  ): void {
    if (!settings.enabled) return;

    const beforeColorRgb = hexToRgbNormalized(settings.beforeColor);
    const afterColorRgb = hexToRgbNormalized(settings.afterColor);

    // Render before frames (furthest first, so closest overlaps)
    for (let i = settings.beforeCount; i >= 1; i--) {
      const frame = currentFrame - i;
      if (frame < 0) continue;
      const frameOpacity = settings.opacity * Math.pow(1 - settings.opacityFalloff, i);
      const nodes = getNodesAtFrame(frame);
      for (const node of nodes) {
        this.shapeRenderer.renderGhostNode(
          node,
          viewProjectionMatrix,
          frameOpacity,
          beforeColorRgb
        );
      }
    }

    // Render after frames (furthest first, so closest overlaps)
    for (let i = settings.afterCount; i >= 1; i--) {
      const frame = currentFrame + i;
      const frameOpacity = settings.opacity * Math.pow(1 - settings.opacityFalloff, i);
      const nodes = getNodesAtFrame(frame);
      for (const node of nodes) {
        this.shapeRenderer.renderGhostNode(node, viewProjectionMatrix, frameOpacity, afterColorRgb);
      }
    }
  }
}
