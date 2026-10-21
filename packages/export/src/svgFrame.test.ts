/**
 * Tests for exporting one frame of the scene as SVG
 */

import { describe, it, expect } from 'vitest';
import { addKeyframe, createTimeline, getOrCreateTrack } from '@quar/animation';
import { exportSvgFrame } from './svgFrame';
import { riggedArm } from './__fixtures__/riggedArm';

/** The numbers of a path's d attribute, as [x, y] pairs. */
function pathPoints(svg: string): Array<[number, number]> {
  const d = /<path d="([^"]+)"/.exec(svg)?.[1] ?? '';
  const numbers = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) pairs.push([numbers[i]!, numbers[i + 1]!]);
  return pairs;
}

describe('exportSvgFrame', () => {
  it('draws the scene as its keyframes have it at that frame', () => {
    const { sg } = riggedArm();
    const timeline = createTimeline({ duration: 30, frameRate: 30 });
    const x = getOrCreateTrack<number>(timeline, 'arm', 'transform.position.x');
    addKeyframe(x, 0, 0);
    addKeyframe(x, 10, 50);
    const svg = exportSvgFrame(sg, timeline, undefined, { frame: 10 });
    expect(svg).toContain('translate(50,0)');
    // The scene itself isn't posed
    expect(sg.getNode('arm')!.transform.position.x).toBe(0);
  });

  it('writes a shape bound to bones as the outline its bones bend it to', () => {
    const { sg, timeline } = riggedArm();
    const atRest = pathPoints(exportSvgFrame(sg, timeline, { frameRate: 30 }, { frame: 0 }));
    const bent = pathPoints(exportSvgFrame(sg, timeline, { frameRate: 30 }, { frame: 10 }));
    expect(atRest.length).toBeGreaterThan(4);
    // At rest it reaches x = 100; bent, the forearm swings up
    expect(Math.max(...atRest.map(([px]) => px))).toBeCloseTo(100, 0);
    expect(Math.max(...bent.map(([px]) => px))).toBeLessThan(60);
    expect(Math.max(...bent.map(([, py]) => py))).toBeGreaterThan(60);
    // Bones are rig helpers, not artwork
    expect(bent.length).toBe(atRest.length);
  });

  it('exports just the given layers', () => {
    const { sg, timeline } = riggedArm();
    const svg = exportSvgFrame(sg, timeline, undefined, { frame: 0, rootIds: ['missing'] });
    expect(svg).toBe('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  });
});
