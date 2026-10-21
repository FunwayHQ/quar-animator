/**
 * Tests for keeping a path's per-point keyframes on their points
 */

import { describe, it, expect } from 'vitest';
import type { PathNode, PathPoint, PathShape, PropertyTrack, Timeline } from '@quar/types';
import { createDefaultTransform } from '@quar/core';
import { createKeyframe, createTimeline, createTrack, evaluateTrack } from '@quar/animation';
import { remapVertexTracks } from './vertexTracks';

function point(x: number, y: number, extra: Partial<PathPoint> = {}): PathPoint {
  return { position: { x, y }, handleIn: null, handleOut: null, type: 'corner', ...extra };
}

function path(points: PathPoint[], subpaths?: PathPoint[][]): PathNode {
  return {
    id: 'p',
    name: 'Path',
    type: 'path',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    points,
    subpaths,
    closed: false,
    fills: [],
    strokes: [],
  };
}

/** A track keyed at these [time, value] pairs. */
function track(property: string, keys: [number, unknown][], nodeId = 'p'): PropertyTrack {
  return createTrack(
    nodeId,
    property,
    keys.map(([time, value]) => createKeyframe(time, value))
  );
}

function timelineWith(...tracks: PropertyTrack[]): Timeline {
  return { ...createTimeline(), tracks };
}

const properties = (timeline: Timeline) => timeline.tracks.map((t) => t.property).sort();
const find = (timeline: Timeline, property: string) =>
  timeline.tracks.find((t) => t.property === property)!;

describe('remapVertexTracks', () => {
  it('leaves a timeline without point keyframes as it is', () => {
    const timeline = timelineWith(track('transform.position.x', [[0, 0]]));
    const before = path([point(0, 0), point(100, 0)]);
    expect(remapVertexTracks(timeline, 'p', before, { kind: 'delete', indices: [0] })).toBe(
      timeline
    );
  });

  it("drops a deleted point's keyframes and moves the later points' up", () => {
    const timeline = timelineWith(
      track('points.0.position.x', [[0, 0]]),
      track('points.1.position.x', [[0, 1]]),
      track('points.2.position.x', [[0, 2]]),
      track('points.3.position.y', [[0, 3]]),
      track('points.0.position.x', [[0, 9]], 'other')
    );
    const before = path([point(0, 0), point(1, 0), point(2, 0), point(3, 0)]);

    const next = remapVertexTracks(timeline, 'p', before, { kind: 'delete', indices: [1] });

    const mine = next.tracks.filter((t) => t.nodeId === 'p');
    expect(mine.map((t) => [t.property, t.keyframes[0]!.value])).toEqual([
      ['points.0.position.x', 0],
      ['points.1.position.x', 2],
      ['points.2.position.y', 3],
    ]);
    // Another layer's tracks stay put
    expect(next.tracks.find((t) => t.nodeId === 'other')!.property).toBe('points.0.position.x');
  });

  it('moves subpath keyframes up when a whole contour is deleted', () => {
    const before = path(
      [point(0, 0), point(1, 0)],
      [
        [point(5, 5), point(6, 5)],
        [point(9, 9), point(10, 9)],
      ]
    );
    const timeline = timelineWith(
      track('subpaths.0.0.position.x', [[0, 5]]),
      track('subpaths.1.1.position.x', [[0, 10]])
    );

    // Flat 2 and 3 are the first subpath
    const next = remapVertexTracks(timeline, 'p', before, { kind: 'delete', indices: [2, 3] });

    expect(properties(next)).toEqual(['subpaths.0.1.position.x']);
    expect(find(next, 'subpaths.0.1.position.x').keyframes[0]!.value).toBe(10);
  });

  it('keys a point added to an animated straight segment where it is at each keyframe', () => {
    // The end point rises from y=0 to y=100 between frames 0 and 10
    const before = path([point(0, 0), point(100, 0), point(200, 0)]);
    const timeline = timelineWith(
      track('points.1.position.y', [
        [0, 0],
        [10, 100],
      ])
    );

    const next = remapVertexTracks(timeline, 'p', before, {
      kind: 'insert',
      segmentIndex: 0,
      t: 0.5,
    });

    // The old point 1 is now point 2, and the new point 1 rides halfway up
    expect(properties(next)).toEqual([
      'points.1.position.x',
      'points.1.position.y',
      'points.2.position.y',
    ]);
    expect(evaluateTrack(find(next, 'points.1.position.y'), 0)).toBeCloseTo(0);
    expect(evaluateTrack(find(next, 'points.1.position.y'), 10)).toBeCloseTo(50);
    expect(evaluateTrack(find(next, 'points.1.position.x'), 10)).toBeCloseTo(50);
    expect(evaluateTrack(find(next, 'points.2.position.y'), 10)).toBe(100);
  });

  it('keys the split handles of a curve at each keyframe time', () => {
    // An arch whose handles grow from 50 to 100 tall
    const before = path([
      point(0, 0, { handleOut: { x: 0, y: 50 }, type: 'smooth' }),
      point(100, 0, { handleIn: { x: 0, y: 50 }, type: 'smooth' }),
    ]);
    const timeline = timelineWith(
      track('points.0.handleOut.y', [
        [0, 50],
        [10, 100],
      ]),
      track('points.1.handleIn.y', [
        [0, 50],
        [10, 100],
      ])
    );

    const next = remapVertexTracks(timeline, 'p', before, {
      kind: 'insert',
      segmentIndex: 0,
      t: 0.5,
    });

    // Its top: 37.5 then 75 high, handles level and a quarter of the width
    expect(evaluateTrack(find(next, 'points.1.position.y'), 0)).toBeCloseTo(37.5);
    expect(evaluateTrack(find(next, 'points.1.position.y'), 10)).toBeCloseTo(75);
    expect(evaluateTrack(find(next, 'points.1.handleOut.x'), 10)).toBeCloseTo(25);
    expect(evaluateTrack(find(next, 'points.1.handleIn.x'), 10)).toBeCloseTo(-25);
    // The outer handles are halved at both times, the end's now on point 2
    expect(evaluateTrack(find(next, 'points.0.handleOut.y'), 10)).toBeCloseTo(50);
    expect(evaluateTrack(find(next, 'points.2.handleIn.y'), 0)).toBeCloseTo(25);
    expect(evaluateTrack(find(next, 'points.2.handleIn.y'), 10)).toBeCloseTo(50);
  });

  it('gives the new keyframes the easing of the point it splits from', () => {
    const before = path([point(0, 0), point(100, 0)]);
    const timeline = timelineWith({
      ...track('points.0.position.x', []),
      keyframes: [createKeyframe(0, 0, 'easeInOutCubic'), createKeyframe(10, 50, 'easeInOutCubic')],
    });

    const next = remapVertexTracks(timeline, 'p', before, {
      kind: 'insert',
      segmentIndex: 0,
      t: 0.5,
    });

    expect(find(next, 'points.1.position.x').keyframes.map((kf) => kf.easing)).toEqual([
      'easeInOutCubic',
      'easeInOutCubic',
    ]);
  });

  it('splits the same segment in each whole-shape keyframe', () => {
    const shapeA = [point(0, 0), point(100, 0)];
    const shapeB = [point(0, 0), point(100, 100)];
    const before = path(shapeA);
    const timeline = timelineWith(
      track('points', [
        [0, shapeA],
        [10, shapeB],
      ])
    );

    const next = remapVertexTracks(timeline, 'p', before, {
      kind: 'insert',
      segmentIndex: 0,
      t: 0.5,
    });

    const [first, second] = find(next, 'points').keyframes.map((kf) => kf.value as PathPoint[]);
    expect(first!.map((p) => p.position)).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(second![1]!.position).toEqual({ x: 50, y: 50 });
  });

  describe('whole shapes with holes', () => {
    const outer = [point(0, 0), point(100, 0), point(100, 100)];
    const hole = [point(40, 40), point(60, 40), point(50, 60)];
    const shape = (dx: number): PathShape => ({
      points: outer.map((p) => point(p.position.x + dx, p.position.y)),
      subpaths: [hole.map((p) => point(p.position.x + dx, p.position.y))],
      closed: true,
    });
    const before = { ...path(outer, [hole]), closed: true };
    const keyed = () =>
      timelineWith(
        track('points', [
          [0, shape(0)],
          [10, shape(10)],
        ])
      );
    const shapes = (timeline: Timeline) =>
      find(timeline, 'points').keyframes.map((kf) => kf.value as PathShape);

    it('splits a segment of a hole in each shape', () => {
      // Flat index 4 is the hole's second point: its segment to the third
      const next = remapVertexTracks(keyed(), 'p', before, {
        kind: 'insert',
        segmentIndex: 4,
        t: 0.5,
      });
      const [first, second] = shapes(next);
      expect(first!.points).toHaveLength(3);
      expect(first!.subpaths![0]!.map((p) => p.position)).toEqual([
        { x: 40, y: 40 },
        { x: 60, y: 40 },
        { x: 55, y: 50 },
        { x: 50, y: 60 },
      ]);
      expect(second!.subpaths![0]![2]!.position).toEqual({ x: 65, y: 50 });
    });

    it('deletes points of a hole in each shape, and the hole once it has none', () => {
      const one = remapVertexTracks(keyed(), 'p', before, { kind: 'delete', indices: [3] });
      expect(shapes(one)[1]!.subpaths![0]!.map((p) => p.position.x)).toEqual([70, 60]);
      const all = remapVertexTracks(keyed(), 'p', before, { kind: 'delete', indices: [3, 4, 5] });
      expect(shapes(all)[0]).not.toHaveProperty('subpaths');
      expect(shapes(all)[0]!.closed).toBe(true);
    });

    it('leaves shapes with other points alone', () => {
      const other: PathShape = { points: outer, closed: true };
      const timeline = timelineWith(track('points', [[0, other]]));
      const next = remapVertexTracks(timeline, 'p', before, { kind: 'delete', indices: [0] });
      expect(shapes(next)[0]).toBe(other);
    });
  });

  it('moves the keyframes along when a path is drawn on from its start', () => {
    const before = path([point(0, 0), point(100, 0)]);
    const timeline = timelineWith(
      track('points.0.position.y', [[0, 0]]),
      track('points.1.position.y', [[0, 5]]),
      track('points', [[0, [point(0, 0), point(100, 0)]]])
    );

    const next = remapVertexTracks(timeline, 'p', before, {
      kind: 'extend',
      at: 'start',
      points: [point(-50, 0), point(-25, 0)],
    });

    expect(properties(next)).toEqual(['points', 'points.2.position.y', 'points.3.position.y']);
    const shape = find(next, 'points').keyframes[0]!.value as PathPoint[];
    expect(shape.map((p) => p.position.x)).toEqual([-50, -25, 0, 100]);
  });

  it('leaves keyframes where they are when a path is drawn on from its end', () => {
    const before = path([point(0, 0), point(100, 0)]);
    const timeline = timelineWith(track('points.1.position.y', [[0, 5]]));
    const next = remapVertexTracks(timeline, 'p', before, {
      kind: 'extend',
      at: 'end',
      points: [point(200, 0)],
    });
    expect(properties(next)).toEqual(['points.1.position.y']);
  });
});
