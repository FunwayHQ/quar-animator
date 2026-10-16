import { describe, it, expect } from 'vitest';
import { getRulerScale, rulerIntervals, MIN_LABEL_SPACING_PX } from './timelineRuler';

describe('rulerIntervals', () => {
  it('mixes small frame counts with fractions and multiples of a second', () => {
    expect(rulerIntervals(30).slice(0, 8)).toEqual([1, 2, 5, 10, 15, 30, 60, 150]);
    expect(rulerIntervals(24).slice(0, 7)).toEqual([1, 2, 5, 10, 12, 24, 48]);
    // No half-second step for odd frame rates
    expect(rulerIntervals(25).slice(0, 6)).toEqual([1, 2, 5, 10, 25, 50]);
  });
});

describe('getRulerScale', () => {
  it('labels about every second at 100% zoom', () => {
    // 300 frames across 1400px ≈ 4.7px per frame
    const scale = getRulerScale(300, 30, 1400);
    expect(scale.labelStep).toBe(15);
    expect(scale.labels.slice(0, 4)).toEqual([0, 15, 30, 45]);
    expect(scale.tickStep).toBe(5);
  });

  it('labels smaller intervals as the timeline is zoomed in', () => {
    expect(getRulerScale(300, 30, 1400 * 4).labelStep).toBe(5);
    const max = getRulerScale(300, 30, 1400 * 8);
    expect(max.labelStep).toBe(2);
    expect(max.tickStep).toBe(1);
  });

  it('labels larger intervals when zoomed out or for long timelines', () => {
    expect(getRulerScale(300, 30, 350).labelStep).toBe(60);
    expect(getRulerScale(9000, 30, 1400).labelStep).toBe(900); // 30 s
  });

  it('keeps labels at least the minimum spacing apart', () => {
    for (const width of [300, 700, 1400, 5600, 11200]) {
      const { labelStep } = getRulerScale(300, 30, width);
      expect((labelStep * width) / 300).toBeGreaterThanOrEqual(MIN_LABEL_SPACING_PX);
    }
  });

  it('only uses tick intervals that divide the label interval', () => {
    for (const width of [500, 1400, 3000, 11200]) {
      const { labelStep, tickStep } = getRulerScale(300, 24, width);
      if (tickStep !== null) expect(labelStep % tickStep).toBe(0);
    }
  });

  it('falls back to about ten labels before the ruler is measured', () => {
    const scale = getRulerScale(300, 30, 0);
    expect(scale.labelStep).toBe(30);
    expect(scale.labels).toEqual([0, 30, 60, 90, 120, 150, 180, 210, 240, 270]);
    expect(scale.tickStep).toBeNull();
  });
});
