import { describe, expect, it } from 'vitest';
import { calculateSmartGuideSnap } from './smartGuides';

describe('calculateSmartGuideSnap', () => {
  it('snaps matching edges and returns a bounded alignment line', () => {
    const result = calculateSmartGuideSnap(
      { x: 49, y: 10, width: 100, height: 80 },
      [{ id: 'target', bounds: { x: 150, y: 20, width: 60, height: 60 } }],
      6
    );

    expect(result.offset.x).toBe(1);
    expect(result.guides).toContainEqual({
      id: 'align-x-target-right-left',
      kind: 'alignment',
      axis: 'x',
      position: 150,
      start: 10,
      end: 90,
    });
  });

  it('snaps matching centers on both axes', () => {
    const result = calculateSmartGuideSnap(
      { x: 45, y: 35, width: 100, height: 80 },
      [{ id: 'target', bounds: { x: 50, y: 40, width: 100, height: 80 } }],
      6
    );

    expect(result.offset).toEqual({ x: 5, y: 5 });
    expect(result.guides.some((guide) => guide.kind === 'alignment' && guide.axis === 'x')).toBe(
      true
    );
    expect(result.guides.some((guide) => guide.kind === 'alignment' && guide.axis === 'y')).toBe(
      true
    );
  });

  it('snaps to equal horizontal gaps and displays both measurements', () => {
    const result = calculateSmartGuideSnap(
      { x: 66, y: 0, width: 40, height: 40 },
      [
        { id: 'left', bounds: { x: 0, y: 0, width: 40, height: 40 } },
        { id: 'right', bounds: { x: 140, y: 0, width: 40, height: 40 } },
      ],
      6
    );

    expect(result.offset.x).toBe(4);
    const spacingGuides = result.guides.filter((guide) => guide.kind === 'spacing');
    expect(spacingGuides).toHaveLength(2);
    expect(spacingGuides.every((guide) => guide.label === '30 px')).toBe(true);
  });

  it('snaps to equal vertical gaps', () => {
    const result = calculateSmartGuideSnap(
      { x: 0, y: 66, width: 40, height: 40 },
      [
        { id: 'below', bounds: { x: 0, y: 0, width: 40, height: 40 } },
        { id: 'above', bounds: { x: 0, y: 140, width: 40, height: 40 } },
      ],
      6
    );

    expect(result.offset.y).toBe(4);
    expect(result.guides.filter((guide) => guide.kind === 'spacing')).toHaveLength(2);
  });

  it('does not snap when the closest match is outside the threshold', () => {
    const result = calculateSmartGuideSnap(
      { x: 49, y: 10, width: 100, height: 80 },
      [{ id: 'target', bounds: { x: 160, y: 200, width: 60, height: 60 } }],
      6
    );

    expect(result.offset).toEqual({ x: 0, y: 0 });
    expect(result.guides).toEqual([]);
  });
});
