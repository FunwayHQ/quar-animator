/**
 * Tests for OnionSkinRenderer
 */

import { describe, it, expect, vi } from 'vitest';
import { OnionSkinRenderer, DEFAULT_ONION_SKIN_SETTINGS } from './OnionSkinRenderer';
import type { OnionSkinSettings } from './OnionSkinRenderer';
import type { ShapeRenderer } from './ShapeRenderer';
import { mat3 } from '../math';
import type { SceneGraph } from '../SceneGraph';

// ============================================================================
// Mocks
// ============================================================================

function createMockShapeRenderer(): ShapeRenderer {
  return {
    renderGhostScene: vi.fn(),
    beginGhostLayer: vi.fn(),
    endGhostLayer: vi.fn(),
  } as unknown as ShapeRenderer;
}

/** A stand-in for a scene posed at some frame */
function createTestScene(id: string): SceneGraph {
  return { id } as unknown as SceneGraph;
}

function enabledSettings(overrides?: Partial<OnionSkinSettings>): OnionSkinSettings {
  return {
    ...DEFAULT_ONION_SKIN_SETTINGS,
    enabled: true,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('OnionSkinRenderer', () => {
  it('gathers its ghosts into one layer, which a filled artboard then shows', () => {
    const shapeRenderer = createMockShapeRenderer();
    const renderer = new OnionSkinRenderer(shapeRenderer);
    const getNodes = vi.fn().mockReturnValue(createTestScene('n1'));

    renderer.render(
      enabledSettings({ beforeCount: 1, afterCount: 1 }),
      10,
      getNodes,
      mat3.identity()
    );

    const begin = vi.mocked(shapeRenderer.beginGhostLayer).mock.invocationCallOrder;
    const ghosts = vi.mocked(shapeRenderer.renderGhostScene).mock.invocationCallOrder;
    const end = vi.mocked(shapeRenderer.endGhostLayer).mock.invocationCallOrder;
    expect(begin).toHaveLength(1);
    expect(end).toHaveLength(1);
    expect(ghosts).toHaveLength(2);
    expect(ghosts.every((order) => order > begin[0]! && order < end[0]!)).toBe(true);
  });

  it('makes no layer when no frame has a ghost', () => {
    const shapeRenderer = createMockShapeRenderer();
    const renderer = new OnionSkinRenderer(shapeRenderer);

    renderer.render(enabledSettings(), 10, () => null, mat3.identity());

    expect(shapeRenderer.beginGhostLayer).not.toHaveBeenCalled();
    expect(shapeRenderer.endGhostLayer).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    const shapeRenderer = createMockShapeRenderer();
    const renderer = new OnionSkinRenderer(shapeRenderer);
    const vp = mat3.identity();
    const getNodes = vi.fn().mockReturnValue(createTestScene('n1'));

    renderer.render({ ...DEFAULT_ONION_SKIN_SETTINGS, enabled: false }, 10, getNodes, vp);

    expect(getNodes).not.toHaveBeenCalled();
    expect(shapeRenderer.renderGhostScene).not.toHaveBeenCalled();
  });

  it('renders correct number of before frames', () => {
    const shapeRenderer = createMockShapeRenderer();
    const renderer = new OnionSkinRenderer(shapeRenderer);
    const vp = mat3.identity();
    const getNodes = vi.fn().mockReturnValue(createTestScene('n1'));

    renderer.render(enabledSettings({ beforeCount: 3, afterCount: 0 }), 10, getNodes, vp);

    // Should request frames 7, 8, 9 (3 before frames)
    expect(getNodes).toHaveBeenCalledWith(7);
    expect(getNodes).toHaveBeenCalledWith(8);
    expect(getNodes).toHaveBeenCalledWith(9);
    // 3 before frames = 3 ghost passes
    expect(shapeRenderer.renderGhostScene).toHaveBeenCalledTimes(3);
  });

  it('renders correct number of after frames', () => {
    const shapeRenderer = createMockShapeRenderer();
    const renderer = new OnionSkinRenderer(shapeRenderer);
    const vp = mat3.identity();
    const getNodes = vi.fn().mockReturnValue(createTestScene('n1'));

    renderer.render(enabledSettings({ beforeCount: 0, afterCount: 2 }), 10, getNodes, vp);

    // Should request frames 11, 12 (2 after frames)
    expect(getNodes).toHaveBeenCalledWith(11);
    expect(getNodes).toHaveBeenCalledWith(12);
    expect(shapeRenderer.renderGhostScene).toHaveBeenCalledTimes(2);
  });

  it('opacity decreases with distance from current frame', () => {
    const shapeRenderer = createMockShapeRenderer();
    const renderer = new OnionSkinRenderer(shapeRenderer);
    const vp = mat3.identity();
    const getNodes = vi.fn().mockReturnValue(createTestScene('n1'));

    const settings = enabledSettings({
      beforeCount: 3,
      afterCount: 0,
      opacity: 1.0,
      opacityFalloff: 0.5,
    });

    renderer.render(settings, 10, getNodes, vp);

    const calls = (shapeRenderer.renderGhostScene as ReturnType<typeof vi.fn>).mock.calls;
    // 3 calls: frame 7 (distance 3), frame 8 (distance 2), frame 9 (distance 1)
    // Opacity for distance i = opacity * (1 - falloff)^(i-1)
    // Closest ghost (i=1) gets full base opacity, falloff only applies to more distant ghosts
    // i=3: 1.0 * 0.5^2 = 0.25
    // i=2: 1.0 * 0.5^1 = 0.5
    // i=1: 1.0 * 0.5^0 = 1.0
    const alphas = calls.map((c: unknown[]) => c[2] as number);
    expect(alphas[0]).toBeCloseTo(0.25); // furthest
    expect(alphas[1]).toBeCloseTo(0.5);
    expect(alphas[2]).toBeCloseTo(1.0); // closest - full base opacity
  });

  it('skips frames before 0 (no negative frames)', () => {
    const shapeRenderer = createMockShapeRenderer();
    const renderer = new OnionSkinRenderer(shapeRenderer);
    const vp = mat3.identity();
    const getNodes = vi.fn().mockReturnValue(createTestScene('n1'));

    renderer.render(enabledSettings({ beforeCount: 5, afterCount: 0 }), 2, getNodes, vp);

    // At frame 2 with beforeCount=5: frames -3,-2,-1,0,1 -> only 0,1 are valid
    expect(getNodes).toHaveBeenCalledWith(0);
    expect(getNodes).toHaveBeenCalledWith(1);
    expect(getNodes).toHaveBeenCalledTimes(2);
    expect(shapeRenderer.renderGhostScene).toHaveBeenCalledTimes(2);
  });

  it('leaves out frames with nothing to show', () => {
    const shapeRenderer = createMockShapeRenderer();
    const renderer = new OnionSkinRenderer(shapeRenderer);
    renderer.render(
      enabledSettings({ beforeCount: 2, afterCount: 0 }),
      5,
      () => null,
      mat3.identity()
    );
    expect(shapeRenderer.renderGhostScene).not.toHaveBeenCalled();
  });
});
