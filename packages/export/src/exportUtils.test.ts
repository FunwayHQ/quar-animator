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

describe('sampleSlides, with transitions', () => {
  const linear = (type: 'fade' | 'push', duration: number) =>
    ({
      type,
      duration,
      easing: 'linear',
      ...(type === 'push' ? { direction: 'up' } : {}),
    }) as const;

  it('plays the transition into a slide between the two: the length of its seconds', () => {
    const { shots } = sampleSlides(
      [
        { ctx: 'intro', frameCount: 30 },
        { ctx: 'outro', frameCount: 60, transition: linear('fade', 0.5) },
      ],
      { frameRate: 30 }
    );
    // 30 + 15 + 60
    expect(shots).toHaveLength(105);
    const between = shots.slice(30, 45);
    expect(between.every((shot) => shot.ctx === 'outro' && shot.frame === 0)).toBe(true);
    // The outgoing slide held on the frame it ended on
    expect(between[0]?.transition).toEqual({
      from: { ctx: 'intro', frame: 29 },
      type: 'fade',
      direction: 'left',
      progress: 1 / 16,
    });
    // Evenly from the one to the other, neither end repeated
    expect(between.map((shot) => shot.transition?.progress)).toEqual(
      Array.from({ length: 15 }, (_, k) => (k + 1) / 16)
    );
    // Then the incoming slide's own timeline, from its start
    expect(shots[45]).toEqual({ ctx: 'outro', frame: 0 });
    expect(shots[104]).toEqual({ ctx: 'outro', frame: 59 });
  });

  it('eases a transition’s progress (in and out, unless it says)', () => {
    const { shots } = sampleSlides(
      [
        { ctx: 'a', frameCount: 1 },
        { ctx: 'b', frameCount: 1, transition: { type: 'wipe', direction: 'down', duration: 0.1 } },
      ],
      { frameRate: 30 }
    );
    // Three frames: a quarter, a half and three quarters of the way, eased (easeInOutCubic)
    const progress = shots.filter((shot) => shot.transition).map((s) => s.transition!.progress);
    expect(progress).toHaveLength(3);
    expect(progress[0]).toBeCloseTo(0.0625);
    expect(progress[1]).toBeCloseTo(0.5);
    expect(progress[2]).toBeCloseTo(0.9375);
    expect(shots.find((shot) => shot.transition)?.transition?.direction).toBe('down');
  });

  it('plays none into the first slide, and cuts where a slide has none', () => {
    const { shots } = sampleSlides(
      [
        { ctx: 'a', frameCount: 2, transition: linear('fade', 1) },
        { ctx: 'b', frameCount: 2 },
        { ctx: 'c', frameCount: 2, transition: null },
      ],
      { frameRate: 30 }
    );
    expect(shots).toHaveLength(6);
    expect(shots.some((shot) => shot.transition)).toBe(false);
  });

  it('skips an empty slide: the transition comes from the slide before it', () => {
    const { shots } = sampleSlides(
      [
        { ctx: 'a', frameCount: 2 },
        { ctx: 'empty', frameCount: 0 },
        { ctx: 'c', frameCount: 2, transition: linear('push', 0.1) },
      ],
      { frameRate: 30 }
    );
    expect(shots.map((shot) => shot.ctx)).toEqual(['a', 'a', 'c', 'c', 'c', 'c', 'c']);
    expect(shots[2]?.transition?.from).toEqual({ ctx: 'a', frame: 1 });
  });

  it('times a transition at the output’s rate and speed', () => {
    const slides = [
      { ctx: 'a', frameCount: 30 },
      { ctx: 'b', frameCount: 30, transition: linear('fade', 0.5) },
    ];
    const at = (timing: Parameters<typeof sampleSlides>[1], maxFps?: number) =>
      sampleSlides(slides, timing, maxFps).shots.filter((shot) => shot.transition).length;
    expect(at({ frameRate: 30, fps: 60 })).toBe(30);
    expect(at({ frameRate: 30, fps: 24 })).toBe(12);
    expect(at({ frameRate: 30, speed: 2 })).toBe(8);
    expect(at({ frameRate: 60 }, 50)).toBe(25);
    // At another rate, the outgoing slide holds the last frame it was shown on
    const half = sampleSlides(slides, { frameRate: 30, fps: 15 }).shots;
    expect(half.find((shot) => shot.transition)?.transition?.from.frame).toBe(28);
  });
});
