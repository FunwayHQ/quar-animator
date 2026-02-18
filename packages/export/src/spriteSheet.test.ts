import { describe, it, expect } from 'vitest';
import { generateSpriteSheetMetadata } from './spriteSheetMetadata';
import { packGrid, packMaxRects } from './binPacking';
import type { PackResult } from './binPacking';

// ============================================================================
// generateSpriteSheetMetadata
// ============================================================================

describe('generateSpriteSheetMetadata', () => {
  const packResult: PackResult = packGrid(4, 64, 64, 2, 0);

  it('generates correct structure', () => {
    const meta = generateSpriteSheetMetadata(
      packResult,
      { startFrame: 0, endFrame: 3, frameWidth: 64, frameHeight: 64 },
      'sheet.png'
    );
    expect(meta.meta.app).toBe('Quar Animator');
    expect(meta.meta.image).toBe('sheet.png');
    expect(meta.meta.format).toBe('RGBA8888');
    expect(meta.meta.size).toEqual({ w: 128, h: 128 });
  });

  it('generates correct number of frame entries', () => {
    const meta = generateSpriteSheetMetadata(
      packResult,
      { startFrame: 0, endFrame: 3, frameWidth: 64, frameHeight: 64 },
      'sheet.png'
    );
    const frameKeys = Object.keys(meta.frames);
    expect(frameKeys).toHaveLength(4);
  });

  it('frame entries have correct positions', () => {
    const meta = generateSpriteSheetMetadata(
      packResult,
      { startFrame: 0, endFrame: 3, frameWidth: 64, frameHeight: 64 },
      'sheet.png'
    );
    const entries = Object.values(meta.frames);
    // First frame at (0,0)
    expect(entries[0].frame).toEqual({ x: 0, y: 0, w: 64, h: 64 });
    // Second frame at (64,0)
    expect(entries[1].frame).toEqual({ x: 64, y: 0, w: 64, h: 64 });
  });

  it('frame entries have correct sourceSize', () => {
    const meta = generateSpriteSheetMetadata(
      packResult,
      { startFrame: 0, endFrame: 3, frameWidth: 64, frameHeight: 64 },
      'sheet.png'
    );
    for (const entry of Object.values(meta.frames)) {
      expect(entry.sourceSize).toEqual({ w: 64, h: 64 });
      expect(entry.trimmed).toBe(false);
    }
  });

  it('uses custom filename pattern', () => {
    const meta = generateSpriteSheetMetadata(
      packResult,
      { startFrame: 0, endFrame: 3, frameWidth: 64, frameHeight: 64, filenamePattern: 'shot_{N}' },
      'sheet.png'
    );
    const keys = Object.keys(meta.frames);
    expect(keys[0]).toBe('shot_0.png');
    expect(keys[3]).toBe('shot_3.png');
  });

  it('handles non-zero start frame', () => {
    const result = packGrid(3, 32, 32, 3, 0);
    const meta = generateSpriteSheetMetadata(
      result,
      { startFrame: 10, endFrame: 12, frameWidth: 32, frameHeight: 32 },
      'out.png'
    );
    const keys = Object.keys(meta.frames);
    expect(keys[0]).toBe('frame_10.png');
    expect(keys[2]).toBe('frame_12.png');
  });

  it('handles packed layout with rotation', () => {
    const packResult: PackResult = {
      rects: [
        { frameIndex: 0, x: 0, y: 0, width: 100, height: 50, rotated: false },
        { frameIndex: 1, x: 0, y: 50, width: 50, height: 100, rotated: true },
      ],
      atlasWidth: 100,
      atlasHeight: 150,
    };
    const meta = generateSpriteSheetMetadata(
      packResult,
      { startFrame: 0, endFrame: 1, frameWidth: 100, frameHeight: 50 },
      'atlas.png'
    );
    const entries = Object.values(meta.frames);
    expect(entries[0].rotated).toBe(false);
    expect(entries[1].rotated).toBe(true);
  });

  it('empty pack result produces empty frames', () => {
    const emptyResult: PackResult = { rects: [], atlasWidth: 0, atlasHeight: 0 };
    const meta = generateSpriteSheetMetadata(
      emptyResult,
      { startFrame: 0, endFrame: -1, frameWidth: 64, frameHeight: 64 },
      'empty.png'
    );
    expect(Object.keys(meta.frames)).toHaveLength(0);
  });

  it('metadata size matches pack result', () => {
    const pack = packGrid(9, 100, 100, 3, 5);
    const meta = generateSpriteSheetMetadata(
      pack,
      { startFrame: 0, endFrame: 8, frameWidth: 100, frameHeight: 100 },
      's.png'
    );
    expect(meta.meta.size.w).toBe(pack.atlasWidth);
    expect(meta.meta.size.h).toBe(pack.atlasHeight);
  });
});

describe('Sprite Sheet - Grid + MaxRects Integration', () => {
  it('grid packing produces valid metadata', () => {
    const pack = packGrid(12, 50, 50, 4, 2);
    const meta = generateSpriteSheetMetadata(
      pack,
      { startFrame: 0, endFrame: 11, frameWidth: 50, frameHeight: 50 },
      'grid.png'
    );
    expect(Object.keys(meta.frames)).toHaveLength(12);
    // All positions should be non-negative
    for (const entry of Object.values(meta.frames)) {
      expect(entry.frame.x).toBeGreaterThanOrEqual(0);
      expect(entry.frame.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('maxrects packing produces valid metadata', () => {
    const frames = Array.from({ length: 6 }, () => ({ width: 80, height: 80 }));
    const pack = packMaxRects(frames, 512, 512, 4);
    const meta = generateSpriteSheetMetadata(
      pack,
      { startFrame: 0, endFrame: 5, frameWidth: 80, frameHeight: 80 },
      'packed.png'
    );
    expect(Object.keys(meta.frames)).toHaveLength(6);
  });

  it('frame entries do not overlap in grid layout', () => {
    const pack = packGrid(4, 100, 100, 2, 0);
    const rects = pack.rects;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlapsX = a.x < b.x + b.width && b.x < a.x + a.width;
        const overlapsY = a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlapsX && overlapsY).toBe(false);
      }
    }
  });
});
