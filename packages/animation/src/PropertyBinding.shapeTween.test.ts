import { describe, it, expect } from 'vitest';
import type { PathNode, PathPoint, PathShape } from '@quar/types';
import {
  getAnimatableProperties,
  detectInterpolationType,
  getInterpolator,
  evaluateTrack,
  evaluateNodeAtFrame,
  applyAnimatedValues,
} from './PropertyBinding';
import { createTimeline, createTrack, addKeyframe } from './Timeline';

// ============================================================================
// Helpers
// ============================================================================

function corner(x: number, y: number): PathPoint {
  return { position: { x, y }, handleIn: null, handleOut: null, type: 'corner' };
}

function makePathNode(points: PathPoint[]): PathNode {
  return {
    id: 'path1',
    name: 'Path',
    type: 'path',
    parent: null,
    children: [],
    transform: {
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    points,
    closed: true,
    fills: [{ type: 'solid', color: { r: 0, g: 100, b: 200, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Shape Tween - PropertyBinding integration', () => {
  describe('detectInterpolationType', () => {
    it('returns "path" for "points"', () => {
      expect(detectInterpolationType('points')).toBe('path');
    });
  });

  describe('getAnimatableProperties', () => {
    it('includes "points" for path nodes', () => {
      const props = getAnimatableProperties('path');
      const pointsProp = props.find((p) => p.path === 'points');
      expect(pointsProp).toBeDefined();
      expect(pointsProp!.displayName).toBe('Shape');
      expect(pointsProp!.interpolationType).toBe('path');
    });

    it('does not include "points" for rectangle nodes', () => {
      const props = getAnimatableProperties('rectangle');
      expect(props.find((p) => p.path === 'points')).toBeUndefined();
    });
  });

  describe('getInterpolator', () => {
    it('returns a function for "path" type', () => {
      const interp = getInterpolator('path');
      expect(typeof interp).toBe('function');
    });

    it('produces valid PathPoint[] when called', () => {
      const interp = getInterpolator('path');
      const a = [corner(0, 0), corner(100, 0), corner(50, 100)];
      const b = [corner(0, 0), corner(100, 0), corner(50, 100)];
      const result = interp(a, b, 0.5) as PathPoint[];
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('position');
    });
  });

  describe('evaluateTrack with path keyframes', () => {
    it('interpolates between two shape keyframes', () => {
      const tl = createTimeline();
      const track = createTrack('path1', 'points');
      tl.tracks.push(track);
      const pointsA = [corner(0, 0), corner(100, 0)];
      const pointsB = [corner(0, 100), corner(100, 100)];
      addKeyframe(track, 0, pointsA);
      addKeyframe(track, 30, pointsB);

      const result = evaluateTrack(track, 15) as PathPoint[];
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      // At t=0.5, y should be ~50
      expect(result[0].position.y).toBeCloseTo(50, 0);
    });
  });

  describe('evaluateNodeAtFrame', () => {
    it('returns Map with "points" entry for path node tracks', () => {
      const tl = createTimeline();
      const track = createTrack('path1', 'points');
      tl.tracks.push(track);
      const pointsA = [corner(0, 0), corner(100, 0)];
      const pointsB = [corner(0, 200), corner(100, 200)];
      addKeyframe(track, 0, pointsA);
      addKeyframe(track, 30, pointsB);

      const values = evaluateNodeAtFrame(tl, 'path1', 15);
      expect(values.has('points')).toBe(true);
      const pts = values.get('points') as PathPoint[];
      expect(pts[0].position.y).toBeCloseTo(100, 0);
    });
  });

  describe('applyAnimatedValues', () => {
    it('applies interpolated points to a path node', () => {
      const node = makePathNode([corner(0, 0), corner(100, 0)]);
      const newPoints = [corner(0, 50), corner(100, 50)];
      const values = new Map<string, unknown>([['points', newPoints]]);
      const updated = applyAnimatedValues(node, values);
      expect(updated.points[0].position.y).toBe(50);
      expect(updated.points[1].position.y).toBe(50);
    });
  });

  describe('whole Shape keyframes', () => {
    const outer = [corner(0, 0), corner(100, 0), corner(100, 100), corner(0, 100)];
    const hole = [corner(40, 40), corner(40, 60), corner(60, 60), corner(60, 40)];
    const ring: PathShape = { points: outer, subpaths: [hole], closed: true };

    it('sets every contour of the path, removing holes the shape lacks', () => {
      const node = { ...makePathNode(outer), subpaths: [hole] };
      const solid: PathShape = { points: outer, closed: true };
      const updated = applyAnimatedValues(node, new Map([['points', solid]]));
      expect(updated.subpaths).toBeUndefined();
      const again = applyAnimatedValues(makePathNode(outer), new Map([['points', ring]]));
      expect(again.subpaths).toEqual([hole]);
    });

    it('leaves the holes to the path for older keyframes of the main contour alone', () => {
      const node = { ...makePathNode(outer), subpaths: [hole] };
      const updated = applyAnimatedValues(node, new Map([['points', outer]]));
      expect(updated.subpaths).toEqual([hole]);
    });

    it('tweens between shapes with and without a hole', () => {
      const track = createTrack('path1', 'points');
      addKeyframe(track, 0, { points: outer, closed: true });
      addKeyframe(track, 10, ring);
      const halfway = evaluateTrack(track, 5) as PathShape;
      expect(halfway.subpaths).toHaveLength(1);
      expect(halfway.subpaths![0]![0]!.position.x).toBeCloseTo(45, 5);
    });

    it('tweens open shapes as open, adding no closing segment', () => {
      const track = createTrack('path1', 'points');
      addKeyframe(track, 0, { points: [corner(0, 0), corner(100, 0)], closed: false });
      addKeyframe(track, 10, {
        points: [corner(0, 0), corner(50, 80), corner(100, 0)],
        closed: false,
      });
      const halfway = evaluateTrack(track, 5) as PathShape;
      const last = halfway.points[halfway.points.length - 1]!;
      expect(last.position.x).toBeCloseTo(100, 5);
      expect(halfway.points[1]!.position.y).toBeCloseTo(40, 5);
    });

    it('tweens an older keyframe into a whole shape', () => {
      const track = createTrack('path1', 'points');
      addKeyframe(track, 0, outer);
      addKeyframe(track, 10, ring);
      const halfway = evaluateTrack(track, 5) as PathShape;
      expect(halfway.points).toHaveLength(4);
      expect(halfway.subpaths).toHaveLength(1);
    });
  });

  describe('cache hit on repeated calls', () => {
    it('returns consistent results for same keyframe arrays', () => {
      const interp = getInterpolator('path');
      const a = [corner(0, 0), corner(100, 0)];
      const b = [corner(0, 100), corner(100, 100)];

      const r1 = interp(a, b, 0.5) as PathPoint[];
      const r2 = interp(a, b, 0.5) as PathPoint[];

      // Results should be equivalent (same values)
      expect(r1[0].position.y).toBeCloseTo(r2[0].position.y);
      expect(r1[1].position.y).toBeCloseTo(r2[1].position.y);
    });
  });
});
