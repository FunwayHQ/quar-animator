/**
 * OnionSkinRenderer - Renders ghost frames for onion skinning
 *
 * Renders previous and next frames as tinted, semi-transparent overlays
 * to help animators see motion before/after the current frame.
 */

import type { Matrix3 } from '@quar/types';
import type { SceneGraph } from '../SceneGraph';
import type { ShapeRenderer } from './ShapeRenderer';
import { hexToRgbNormalized } from '../color/colorHex';

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
  beforeCount: 3,
  afterCount: 3,
  beforeColor: '#FF6B6B',
  afterColor: '#4ECDC4',
  opacity: 0.6,
  opacityFalloff: 0.3,
  showDuringPlayback: false,
};

// ============================================================================
// OnionSkinRenderer Class
// ============================================================================

export class OnionSkinRenderer {
  private shapeRenderer: ShapeRenderer;

  constructor(shapeRenderer: ShapeRenderer) {
    this.shapeRenderer = shapeRenderer;
  }

  /**
   * Render onion skin ghost frames: the scene as posed at each frame either
   * side of the current one, tinted, fading with distance.
   *
   * @param settings - Onion skin configuration
   * @param currentFrame - The current frame number
   * @param getSceneAtFrame - The scene posed at a frame (null: nothing to show)
   * @param viewProjectionMatrix - Camera view-projection matrix
   * @param timelineDuration - Total duration in frames (optional, used to clamp after frames)
   */
  render(
    settings: OnionSkinSettings,
    currentFrame: number,
    getSceneAtFrame: (frame: number) => SceneGraph | null,
    viewProjectionMatrix: Matrix3,
    timelineDuration?: number
  ): void {
    if (!settings.enabled) return;

    const beforeColorRgb = hexToRgbNormalized(settings.beforeColor);
    const afterColorRgb = hexToRgbNormalized(settings.afterColor);
    // The ghosts are gathered into one layer, laid over the page now and over
    // each artboard's background as the scene is drawn: an artboard with a
    // background doesn't hide them
    let gathering = false;
    const ghost = (frame: number, distance: number, tint: [number, number, number]) => {
      const scene = getSceneAtFrame(frame);
      if (!scene) return;
      if (!gathering) this.shapeRenderer.beginGhostLayer();
      gathering = true;
      // The closest ghost (distance 1) gets the full base opacity; falloff
      // only fades the ones further away
      const frameOpacity = settings.opacity * Math.pow(1 - settings.opacityFalloff, distance - 1);
      this.shapeRenderer.renderGhostScene(scene, viewProjectionMatrix, frameOpacity, tint);
    };

    // Before frames (furthest first, so closest overlaps on top)
    for (let i = settings.beforeCount; i >= 1; i--) {
      const frame = currentFrame - i;
      if (frame < 0) continue;
      ghost(frame, i, beforeColorRgb);
    }

    // After frames (furthest first, so closest overlaps on top)
    for (let i = settings.afterCount; i >= 1; i--) {
      const frame = currentFrame + i;
      if (timelineDuration !== undefined && frame >= timelineDuration) continue;
      ghost(frame, i, afterColorRgb);
    }

    if (gathering) this.shapeRenderer.endGhostLayer();
  }
}
