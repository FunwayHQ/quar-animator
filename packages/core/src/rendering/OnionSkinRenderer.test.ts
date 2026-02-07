/**
 * Tests for OnionSkinRenderer
 */

import { describe, it, expect, vi } from 'vitest';
import { OnionSkinRenderer, DEFAULT_ONION_SKIN_SETTINGS } from './OnionSkinRenderer';
import type { OnionSkinSettings } from './OnionSkinRenderer';
import type { ShapeRenderer } from './ShapeRenderer';
import type { Node } from '@quar/types';
import { mat3 } from '../math';

// ============================================================================
// Mocks
// ============================================================================

function createMockShapeRenderer(): ShapeRenderer {
  return {
    renderGhostNode: vi.fn(),
  } as unknown as ShapeRenderer;
}

function createTestNode(id: string): Node {
  return {
    id,
    name: id,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: {
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 100,
    height: 100,
    cornerRadius: [0, 0, 0, 0],
    fills: [{ type: 'solid', color: { r: 100, g: 149, b: 237, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  } as unknown as Node;
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
  it('does nothing when disabled', () => {
    const shapeRenderer = createMockShapeRenderer();
    const renderer = new OnionSkinRenderer(shapeRenderer);
    const vp = mat3.identity();
    const getNodes = vi.fn().mockReturnValue([createTestNode('n1')]);

    renderer.render({ ...DEFAULT_ONION_SKIN_SETTINGS, enabled: false }, 10, getNodes, vp);

    expect(getNodes).not.toHaveBeenCalled();
    expect(shapeRenderer.renderGhostNode).not.toHaveBeenCalled();
  });

  it('renders correct number of before frames', () => {
    const shapeRenderer = createMockShapeRenderer();
    const renderer = new OnionSkinRenderer(shapeRenderer);
    const vp = mat3.identity();
    const getNodes = vi.fn().mockReturnValue([createTestNode('n1')]);

    renderer.render(enabledSettings({ beforeCount: 3, afterCount: 0 }), 10, getNodes, vp);

    // Should request frames 7, 8, 9 (3 before frames)
    expect(getNodes).toHaveBeenCalledWith(7);
    expect(getNodes).toHaveBeenCalledWith(8);
    expect(getNodes).toHaveBeenCalledWith(9);
    // 3 before frames, 1 node each = 3 renderGhostNode calls
    expect(shapeRenderer.renderGhostNode).toHaveBeenCalledTimes(3);
  });

  it('renders correct number of after frames', () => {
    const shapeRenderer = createMockShapeRenderer();
    const renderer = new OnionSkinRenderer(shapeRenderer);
    const vp = mat3.identity();
    const getNodes = vi.fn().mockReturnValue([createTestNode('n1')]);

    renderer.render(enabledSettings({ beforeCount: 0, afterCount: 2 }), 10, getNodes, vp);

    // Should request frames 11, 12 (2 after frames)
    expect(getNodes).toHaveBeenCalledWith(11);
    expect(getNodes).toHaveBeenCalledWith(12);
    expect(shapeRenderer.renderGhostNode).toHaveBeenCalledTimes(2);
  });

  it('opacity decreases with distance from current frame', () => {
    const shapeRenderer = createMockShapeRenderer();
    const renderer = new OnionSkinRenderer(shapeRenderer);
    const vp = mat3.identity();
    const getNodes = vi.fn().mockReturnValue([createTestNode('n1')]);

    const settings = enabledSettings({
      beforeCount: 3,
      afterCount: 0,
      opacity: 1.0,
      opacityFalloff: 0.5,
    });

    renderer.render(settings, 10, getNodes, vp);

    const calls = (shapeRenderer.renderGhostNode as ReturnType<typeof vi.fn>).mock.calls;
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
    const getNodes = vi.fn().mockReturnValue([createTestNode('n1')]);

    renderer.render(enabledSettings({ beforeCount: 5, afterCount: 0 }), 2, getNodes, vp);

    // At frame 2 with beforeCount=5: frames -3,-2,-1,0,1 -> only 0,1 are valid
    expect(getNodes).toHaveBeenCalledWith(0);
    expect(getNodes).toHaveBeenCalledWith(1);
    expect(getNodes).toHaveBeenCalledTimes(2);
    expect(shapeRenderer.renderGhostNode).toHaveBeenCalledTimes(2);
  });
});
