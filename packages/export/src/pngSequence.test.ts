import { describe, it, expect } from 'vitest';
import { getFrameCount, generateFrameFilenames } from './exportUtils';

// Note: exportPngSequence requires WebGL + JSZip and is tested via integration tests.
// These tests cover the pure functions used by the PNG sequence pipeline.

describe('PNG Sequence - Frame Utilities', () => {
  describe('getFrameCount', () => {
    it('computes correct frame count for standard range', () => {
      expect(getFrameCount(0, 59)).toBe(60);
    });

    it('handles non-zero start frame', () => {
      expect(getFrameCount(10, 39)).toBe(30);
    });

    it('single frame export', () => {
      expect(getFrameCount(15, 15)).toBe(1);
    });

    it('returns 0 for invalid range', () => {
      expect(getFrameCount(30, 10)).toBe(0);
    });
  });

  describe('generateFrameFilenames', () => {
    it('generates standard frame sequence names', () => {
      const names = generateFrameFilenames('frame_{N}', 0, 4, 'png');
      expect(names).toHaveLength(5);
      expect(names[0]).toBe('frame_0.png');
      expect(names[4]).toBe('frame_4.png');
    });

    it('zero-pads based on max frame number', () => {
      const names = generateFrameFilenames('frame_{N}', 0, 100, 'png');
      expect(names[0]).toBe('frame_000.png');
      expect(names[9]).toBe('frame_009.png');
      expect(names[100]).toBe('frame_100.png');
    });

    it('works with custom pattern', () => {
      const names = generateFrameFilenames('export_{N}', 5, 7, 'png');
      expect(names).toEqual(['export_5.png', 'export_6.png', 'export_7.png']);
    });

    it('returns empty array for reversed range', () => {
      expect(generateFrameFilenames('f_{N}', 10, 5, 'png')).toEqual([]);
    });

    it('handles pattern without {N} placeholder', () => {
      const names = generateFrameFilenames('static_name', 0, 1, 'png');
      expect(names[0]).toBe('static_name.png');
      expect(names[1]).toBe('static_name.png');
    });
  });
});

describe('PNG Sequence - Export Options Validation', () => {
  it('default filename pattern is frame_{N}', () => {
    const names = generateFrameFilenames('frame_{N}', 0, 2, 'png');
    expect(names).toEqual(['frame_0.png', 'frame_1.png', 'frame_2.png']);
  });

  it('supports jpg extension', () => {
    const names = generateFrameFilenames('frame_{N}', 0, 1, 'jpg');
    expect(names[0]).toBe('frame_0.jpg');
  });

  it('supports webp extension', () => {
    const names = generateFrameFilenames('frame_{N}', 0, 0, 'webp');
    expect(names[0]).toBe('frame_0.webp');
  });
});

// ============================================================================
// Additional edge cases
// ============================================================================

describe('Frame count edge cases', () => {
  it('getFrameCount returns 1 for same start and end', () => {
    expect(getFrameCount(0, 0)).toBe(1);
    expect(getFrameCount(100, 100)).toBe(1);
  });

  it('getFrameCount handles large ranges', () => {
    expect(getFrameCount(0, 999)).toBe(1000);
  });

  it('generateFrameFilenames pads based on end frame digits', () => {
    const names = generateFrameFilenames('f_{N}', 0, 9, 'png');
    expect(names[0]).toBe('f_0.png'); // single digit, pad=1
    expect(names[9]).toBe('f_9.png');
  });

  it('generateFrameFilenames zero-pads to 4 digits for large ranges', () => {
    const names = generateFrameFilenames('f_{N}', 0, 1000, 'png');
    expect(names[0]).toBe('f_0000.png');
    expect(names[99]).toBe('f_0099.png');
    expect(names[1000]).toBe('f_1000.png');
  });
});
