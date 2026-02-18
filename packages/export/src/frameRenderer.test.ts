import { describe, it, expect } from 'vitest';
import { getFrameCount, generateFrameFilenames } from './exportUtils';

// Note: createFrameRenderer requires WebGL context and is tested via integration tests.
// These tests cover the pure utility functions.

describe('getFrameCount', () => {
  it('returns inclusive frame count', () => {
    expect(getFrameCount(0, 29)).toBe(30);
    expect(getFrameCount(0, 0)).toBe(1);
    expect(getFrameCount(10, 20)).toBe(11);
  });

  it('returns 0 for reversed range', () => {
    expect(getFrameCount(30, 10)).toBe(0);
  });

  it('handles single frame', () => {
    expect(getFrameCount(5, 5)).toBe(1);
  });
});

describe('generateFrameFilenames', () => {
  it('generates sequential filenames with zero-padding', () => {
    const names = generateFrameFilenames('frame_{N}', 0, 2, 'png');
    expect(names).toEqual(['frame_0.png', 'frame_1.png', 'frame_2.png']);
  });

  it('pads based on end frame digit count', () => {
    const names = generateFrameFilenames('frame_{N}', 0, 99, 'png');
    expect(names[0]).toBe('frame_00.png');
    expect(names[9]).toBe('frame_09.png');
    expect(names[99]).toBe('frame_99.png');
  });

  it('handles custom pattern', () => {
    const names = generateFrameFilenames('shot_{N}', 10, 12, 'jpg');
    expect(names).toEqual(['shot_10.jpg', 'shot_11.jpg', 'shot_12.jpg']);
  });

  it('handles large frame numbers', () => {
    const names = generateFrameFilenames('f_{N}', 998, 1000, 'png');
    expect(names).toEqual(['f_0998.png', 'f_0999.png', 'f_1000.png']);
  });

  it('returns empty for reversed range', () => {
    const names = generateFrameFilenames('frame_{N}', 10, 5, 'png');
    expect(names).toEqual([]);
  });
});
