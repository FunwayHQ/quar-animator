import { describe, it, expect } from 'vitest';
import { packGrid, packMaxRects, nextPowerOfTwo } from './binPacking';

// ============================================================================
// nextPowerOfTwo
// ============================================================================

describe('nextPowerOfTwo', () => {
  it('returns 1 for zero and negative', () => {
    expect(nextPowerOfTwo(0)).toBe(1);
    expect(nextPowerOfTwo(-5)).toBe(1);
  });

  it('returns same value for exact powers of two', () => {
    expect(nextPowerOfTwo(1)).toBe(1);
    expect(nextPowerOfTwo(2)).toBe(2);
    expect(nextPowerOfTwo(4)).toBe(4);
    expect(nextPowerOfTwo(256)).toBe(256);
    expect(nextPowerOfTwo(1024)).toBe(1024);
  });

  it('rounds up to next power of two', () => {
    expect(nextPowerOfTwo(3)).toBe(4);
    expect(nextPowerOfTwo(5)).toBe(8);
    expect(nextPowerOfTwo(100)).toBe(128);
    expect(nextPowerOfTwo(500)).toBe(512);
    expect(nextPowerOfTwo(1025)).toBe(2048);
  });
});

// ============================================================================
// packGrid
// ============================================================================

describe('packGrid', () => {
  it('returns empty result for zero frames', () => {
    const result = packGrid(0, 100, 100);
    expect(result.rects).toHaveLength(0);
    expect(result.atlasWidth).toBe(0);
    expect(result.atlasHeight).toBe(0);
  });

  it('returns empty for invalid dimensions', () => {
    expect(packGrid(5, 0, 100).rects).toHaveLength(0);
    expect(packGrid(5, 100, -1).rects).toHaveLength(0);
  });

  it('packs single frame', () => {
    const result = packGrid(1, 64, 64);
    expect(result.rects).toHaveLength(1);
    expect(result.rects[0]).toEqual({
      frameIndex: 0,
      x: 0,
      y: 0,
      width: 64,
      height: 64,
      rotated: false,
    });
    expect(result.atlasWidth).toBe(64);
    expect(result.atlasHeight).toBe(64);
  });

  it('auto-computes columns from sqrt', () => {
    // 4 frames → ceil(sqrt(4)) = 2 columns
    const result = packGrid(4, 50, 50);
    expect(result.rects).toHaveLength(4);
    expect(result.atlasWidth).toBe(100); // 2 * 50
    expect(result.atlasHeight).toBe(100); // 2 * 50
  });

  it('respects explicit column count', () => {
    const result = packGrid(6, 32, 32, 3);
    expect(result.rects).toHaveLength(6);
    // 3 columns, 2 rows
    expect(result.atlasWidth).toBe(96);
    expect(result.atlasHeight).toBe(64);
    // Check positions
    expect(result.rects[0]).toMatchObject({ x: 0, y: 0 });
    expect(result.rects[1]).toMatchObject({ x: 32, y: 0 });
    expect(result.rects[2]).toMatchObject({ x: 64, y: 0 });
    expect(result.rects[3]).toMatchObject({ x: 0, y: 32 });
  });

  it('applies padding between frames', () => {
    const result = packGrid(4, 50, 50, 2, 10);
    // Cell size = 60x60
    // Atlas = 2*60 - 10 = 110 wide, 2*60 - 10 = 110 tall
    expect(result.atlasWidth).toBe(110);
    expect(result.atlasHeight).toBe(110);
    expect(result.rects[0]).toMatchObject({ x: 0, y: 0, width: 50, height: 50 });
    expect(result.rects[1]).toMatchObject({ x: 60, y: 0, width: 50, height: 50 });
    expect(result.rects[2]).toMatchObject({ x: 0, y: 60, width: 50, height: 50 });
    expect(result.rects[3]).toMatchObject({ x: 60, y: 60, width: 50, height: 50 });
  });

  it('handles non-square frames', () => {
    const result = packGrid(3, 100, 50, 3);
    expect(result.atlasWidth).toBe(300);
    expect(result.atlasHeight).toBe(50);
  });

  it('all rects have correct frameIndex', () => {
    const result = packGrid(10, 20, 20);
    for (let i = 0; i < 10; i++) {
      expect(result.rects[i].frameIndex).toBe(i);
    }
  });
});

// ============================================================================
// packMaxRects
// ============================================================================

describe('packMaxRects', () => {
  it('returns empty result for empty frames array', () => {
    const result = packMaxRects([], 1024, 1024);
    expect(result.rects).toHaveLength(0);
    expect(result.atlasWidth).toBe(0);
  });

  it('packs uniform frames', () => {
    const frames = Array.from({ length: 4 }, () => ({ width: 50, height: 50 }));
    const result = packMaxRects(frames, 200, 200);
    expect(result.rects).toHaveLength(4);
    // All should fit without overlap
    for (const rect of result.rects) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
    }
    expect(result.atlasWidth).toBeLessThanOrEqual(200);
    expect(result.atlasHeight).toBeLessThanOrEqual(200);
  });

  it('packs variable-size frames', () => {
    const frames = [
      { width: 100, height: 50 },
      { width: 50, height: 100 },
      { width: 30, height: 30 },
    ];
    const result = packMaxRects(frames, 256, 256);
    expect(result.rects).toHaveLength(3);
    // Rects should be sorted by frameIndex
    expect(result.rects[0].frameIndex).toBe(0);
    expect(result.rects[1].frameIndex).toBe(1);
    expect(result.rects[2].frameIndex).toBe(2);
  });

  it('applies padding', () => {
    const frames = [
      { width: 100, height: 100 },
      { width: 100, height: 100 },
    ];
    const result = packMaxRects(frames, 512, 512, 10);
    expect(result.rects).toHaveLength(2);
    // With padding, they shouldn't overlap even considering padding
    const r0 = result.rects[0];
    const r1 = result.rects[1];
    // Check no overlap (accounting for the padding space)
    const overlapsX = r0.x < r1.x + r1.width + 10 && r1.x < r0.x + r0.width + 10;
    const overlapsY = r0.y < r1.y + r1.height + 10 && r1.y < r0.y + r0.height + 10;
    expect(overlapsX && overlapsY).toBe(false);
  });

  it('marks frames that do not fit with x=-1', () => {
    const frames = [{ width: 200, height: 200 }];
    const result = packMaxRects(frames, 100, 100); // Too small
    expect(result.rects).toHaveLength(1);
    expect(result.rects[0].x).toBe(-1);
    expect(result.rects[0].y).toBe(-1);
  });

  it('supports rotation when enabled', () => {
    // Frame is 200x50, atlas is 100x200 — only fits rotated
    const frames = [{ width: 200, height: 50 }];
    const result = packMaxRects(frames, 100, 250, 0, true);
    expect(result.rects).toHaveLength(1);
    expect(result.rects[0].rotated).toBe(true);
    expect(result.rects[0].width).toBe(50); // swapped
    expect(result.rects[0].height).toBe(200);
  });

  it('does not rotate when rotation is disabled', () => {
    const frames = [{ width: 200, height: 50 }];
    const result = packMaxRects(frames, 100, 250, 0, false);
    expect(result.rects).toHaveLength(1);
    expect(result.rects[0].x).toBe(-1); // Can't fit
  });

  it('packs single frame', () => {
    const frames = [{ width: 50, height: 50 }];
    const result = packMaxRects(frames, 100, 100);
    expect(result.rects).toHaveLength(1);
    expect(result.rects[0].x).toBe(0);
    expect(result.rects[0].y).toBe(0);
    expect(result.atlasWidth).toBe(50);
    expect(result.atlasHeight).toBe(50);
  });
});

// ============================================================================
// Additional packGrid tests
// ============================================================================

describe('packGrid - additional', () => {
  it('handles columns > frameCount', () => {
    const result = packGrid(3, 50, 50, 10);
    expect(result.rects).toHaveLength(3);
    // All in one row
    expect(result.atlasHeight).toBe(50);
    expect(result.rects[0]).toMatchObject({ x: 0, y: 0 });
    expect(result.rects[1]).toMatchObject({ x: 50, y: 0 });
    expect(result.rects[2]).toMatchObject({ x: 100, y: 0 });
  });

  it('single column layout', () => {
    const result = packGrid(4, 100, 50, 1);
    expect(result.rects).toHaveLength(4);
    expect(result.atlasWidth).toBe(100);
    expect(result.atlasHeight).toBe(200);
    expect(result.rects[0]).toMatchObject({ x: 0, y: 0 });
    expect(result.rects[1]).toMatchObject({ x: 0, y: 50 });
    expect(result.rects[2]).toMatchObject({ x: 0, y: 100 });
    expect(result.rects[3]).toMatchObject({ x: 0, y: 150 });
  });

  it('large frame count computes correct dimensions', () => {
    const result = packGrid(100, 10, 10);
    expect(result.rects).toHaveLength(100);
    // ceil(sqrt(100)) = 10 columns
    expect(result.atlasWidth).toBe(100);
    expect(result.atlasHeight).toBe(100);
  });
});
