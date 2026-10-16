import { describe, it, expect } from 'vitest';
import { sampleTimeline } from './exportUtils';

describe('sampleTimeline', () => {
  const range = { frameRate: 30, startFrame: 0, endFrame: 59 }; // two seconds

  it('keeps every timeline frame by default', () => {
    expect(sampleTimeline(range)).toEqual({
      fps: 30,
      frames: Array.from({ length: 60 }, (_, i) => i),
    });
  });

  it('samples a different frame rate over the same duration', () => {
    const { fps, frames } = sampleTimeline({ ...range, fps: 60 });
    expect(fps).toBe(60);
    expect(frames).toHaveLength(120);
    expect(frames.slice(0, 3)).toEqual([0, 0.5, 1]);
  });

  it('plays faster or slower', () => {
    expect(sampleTimeline({ ...range, speed: 2 }).frames).toHaveLength(30);
    expect(sampleTimeline({ ...range, speed: 0.5 }).frames).toHaveLength(120);
  });

  it('caps the frame rate', () => {
    expect(sampleTimeline({ ...range, fps: 60 }, 50).fps).toBe(50);
  });

  it('ignores nonsensical speeds and rates', () => {
    expect(sampleTimeline({ ...range, speed: 0 }).frames).toHaveLength(60);
    expect(sampleTimeline({ ...range, fps: 0 }).fps).toBe(1);
  });
});
