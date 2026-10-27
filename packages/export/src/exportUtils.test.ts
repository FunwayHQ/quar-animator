import { describe, it, expect } from 'vitest';
import { sampleSlides, sampleTimeline } from './exportUtils';

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

describe('sampleSlides', () => {
  it('plays each slide’s whole timeline, one after another', () => {
    const { fps, shots } = sampleSlides(
      [
        { ctx: 'intro', frameCount: 3 },
        { ctx: 'empty', frameCount: 0 },
        { ctx: 'outro', frameCount: 2 },
      ],
      { frameRate: 30 }
    );
    expect(fps).toBe(30);
    expect(shots).toEqual([
      { ctx: 'intro', frame: 0 },
      { ctx: 'intro', frame: 1 },
      { ctx: 'intro', frame: 2 },
      { ctx: 'outro', frame: 0 },
      { ctx: 'outro', frame: 1 },
    ]);
  });

  it('keeps each slide’s length in seconds at another rate or speed', () => {
    const halfRate = sampleSlides([{ ctx: 'a', frameCount: 30 }], { frameRate: 30, fps: 15 });
    expect(halfRate.shots).toHaveLength(15);
    const twice = sampleSlides(
      [
        { ctx: 'a', frameCount: 30 },
        { ctx: 'b', frameCount: 60 },
      ],
      { frameRate: 30, speed: 2 }
    );
    expect(twice.shots.filter((s) => s.ctx === 'a')).toHaveLength(15);
    expect(twice.shots.filter((s) => s.ctx === 'b')).toHaveLength(30);
    // A GIF's ceiling holds for every slide
    expect(sampleSlides([{ ctx: 'a', frameCount: 60 }], { frameRate: 60 }, 50).fps).toBe(50);
  });
});
