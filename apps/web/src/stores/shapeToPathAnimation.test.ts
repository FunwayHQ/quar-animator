/**
 * Tests for converting shapes to paths in place, keeping their animation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph, createDefaultTransform, getShapeOutlinePoints } from '@quar/core';
import { createKeyframe, createTimeline, createTrack, evaluateTrack } from '@quar/animation';
import type { PathNode, PathPoint, PathShape, RectangleNode } from '@quar/types';
import { useEditorStore } from './editorStore';

function rect(extra: Partial<RectangleNode> = {}): RectangleNode {
  return {
    id: 'r',
    name: 'Card',
    type: 'rectangle',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 100,
    height: 50,
    cornerRadius: [0, 0, 0, 0],
    fills: [],
    strokes: [],
    ...extra,
  };
}

const xs = (points: PathPoint[]) => points.map((p) => p.position.x);

describe('convertShapesToPaths', () => {
  let sceneGraph: SceneGraph;
  beforeEach(() => {
    sceneGraph = new SceneGraph();
    useEditorStore.setState({
      undoStack: [],
      redoStack: [],
      timeline: { ...createTimeline(), tracks: [] },
    });
  });

  it('converts in place: same layer, same keyframes, its size animation as outline keyframes', () => {
    sceneGraph.addNode(rect());
    useEditorStore.setState({
      timeline: {
        ...createTimeline(),
        tracks: [
          createTrack('r', 'width', [
            createKeyframe(0, 100, 'easeOutCubic'),
            createKeyframe(10, 200),
          ]),
          createTrack('r', 'transform.rotation', [createKeyframe(0, 0), createKeyframe(10, 90)]),
        ],
      },
    });

    expect(useEditorStore.getState().convertShapesToPaths(sceneGraph, ['r'])).toEqual(['r']);

    const node = sceneGraph.getNode('r') as PathNode;
    expect(node.type).toBe('path');
    expect(node.name).toBe('Card');
    const tracks = useEditorStore.getState().timeline.tracks;
    expect(tracks.map((t) => t.property).sort()).toEqual(['points', 'transform.rotation']);
    const outline = tracks.find((t) => t.property === 'points')!;
    expect(outline.keyframes.map((k) => k.time)).toEqual([0, 10]);
    expect(outline.keyframes[0]!.easing).toBe('easeOutCubic');
    const shape = outline.keyframes[1]!.value as PathShape;
    expect(shape.closed).toBe(true);
    expect(Math.max(...xs(shape.points))).toBeCloseTo(100);
    expect(evaluateTrack(tracks.find((t) => t.property === 'transform.rotation')!, 10)).toBe(90);
  });

  it("keeps a rectangle's outline where it renders, about its anchor", () => {
    sceneGraph.addNode(
      rect({ transform: { ...createDefaultTransform(), anchor: { x: 0, y: 0 } } })
    );
    useEditorStore.getState().convertShapesToPaths(sceneGraph, ['r']);
    const node = sceneGraph.getNode('r') as PathNode;
    expect(Math.min(...xs(node.points))).toBeCloseTo(0);
    expect(Math.max(...xs(node.points))).toBeCloseTo(100);
  });

  it('keeps its binding to bones and its export settings', () => {
    const skinData = {
      vertices: [],
      inverseBindMatrices: { bone: [1, 0, 0, 1, 0, 0] },
      meshBindMatrix: [1, 0, 0, 1, 0, 0],
    } as unknown as NonNullable<RectangleNode['skinData']>;
    const exports = [{ format: 'png', scale: 2, suffix: '@2x' }] as unknown as NonNullable<
      RectangleNode['exports']
    >;
    sceneGraph.addNode({ ...rect(), skinData, exports });
    useEditorStore.getState().convertShapesToPaths(sceneGraph, ['r']);
    const node = sceneGraph.getNode('r') as PathNode;
    expect(node.skinData).toEqual(skinData);
    expect(node.skinData).not.toBe(skinData);
    expect(node.exports).toEqual(exports);
  });

  it('can be undone', () => {
    sceneGraph.addNode(rect());
    useEditorStore.getState().convertShapesToPaths(sceneGraph, ['r']);
    useEditorStore.getState().undo(sceneGraph);
    expect(sceneGraph.getNode('r')!.type).toBe('rectangle');
  });

  it('morphs as the rectangle did when its corner radius grows from 0', () => {
    sceneGraph.addNode(rect());
    useEditorStore.setState({
      timeline: {
        ...createTimeline(),
        tracks: [
          createTrack('r', 'width', [createKeyframe(0, 100), createKeyframe(6, 320)]),
          // Each corner keyed, as Properties keys them
          ...[0, 1, 2, 3].map((corner) =>
            createTrack('r', `cornerRadius.${corner}`, [
              createKeyframe(0, 0),
              createKeyframe(6, 40),
            ])
          ),
        ],
      },
    });
    useEditorStore.getState().convertShapesToPaths(sceneGraph, ['r']);

    const outline = useEditorStore.getState().timeline.tracks.find((t) => t.property === 'points')!;
    const shapes = outline.keyframes.map((k) => k.value as PathShape);
    // The same points in every keyframe: the sharp corners as zero-length arcs
    expect(shapes.map((s) => s.points.length)).toEqual([8, 8]);
    expect(shapes[0]!.points[0]!.position).toEqual(shapes[0]!.points[1]!.position);

    // Halfway, the outline the rectangle had there, rounded evenly
    const halfway = evaluateTrack(outline, 3) as PathShape;
    const expected = getShapeOutlinePoints(rect({ width: 210, cornerRadius: [20, 20, 20, 20] }))!;
    expect(halfway.points).toHaveLength(expected.points.length);
    halfway.points.forEach((point, i) => {
      const want = expected.points[i]!;
      expect(point.position.x).toBeCloseTo(want.position.x);
      expect(point.position.y).toBeCloseTo(want.position.y);
      expect(point.handleOut?.x ?? 0).toBeCloseTo(want.handleOut?.x ?? 0);
      expect(point.handleIn?.y ?? 0).toBeCloseTo(want.handleIn?.y ?? 0);
    });
  });

  it('keeps a corner that is never rounded a single point', () => {
    sceneGraph.addNode(rect());
    useEditorStore.setState({
      timeline: {
        ...createTimeline(),
        tracks: [createTrack('r', 'cornerRadius.0', [createKeyframe(0, 0), createKeyframe(6, 12)])],
      },
    });
    useEditorStore.getState().convertShapesToPaths(sceneGraph, ['r']);
    const outline = useEditorStore.getState().timeline.tracks.find((t) => t.property === 'points')!;
    expect(outline.keyframes.map((k) => (k.value as PathShape).points.length)).toEqual([5, 5]);
  });

  it('gives a polygon whose corners round from 0 the same points in every keyframe', () => {
    sceneGraph.addNode({
      ...rect(),
      type: 'polygon',
      sides: 5,
      radius: 60,
      cornerRadius: 0,
    } as unknown as RectangleNode);
    useEditorStore.setState({
      timeline: {
        ...createTimeline(),
        tracks: [createTrack('r', 'cornerRadius', [createKeyframe(0, 0), createKeyframe(6, 10)])],
      },
    });
    useEditorStore.getState().convertShapesToPaths(sceneGraph, ['r']);
    const outline = useEditorStore.getState().timeline.tracks.find((t) => t.property === 'points')!;
    expect(outline.keyframes.map((k) => (k.value as PathShape).points.length)).toEqual([10, 10]);
  });

  it('keeps its place among its siblings', () => {
    sceneGraph.addNode(rect({ id: 'a', name: 'a' }));
    sceneGraph.addNode(rect());
    sceneGraph.addNode(rect({ id: 'z', name: 'z' }));
    useEditorStore.getState().convertShapesToPaths(sceneGraph, ['r']);
    expect(sceneGraph.getRootNodes().map((n) => n.id)).toEqual(['a', 'r', 'z']);
  });
});
