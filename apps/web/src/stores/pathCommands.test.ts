/**
 * Tests for whole-path commands: reverse, close/open, fill rule
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph, createDefaultTransform } from '@quar/core';
import { createKeyframe, createTimeline, createTrack } from '@quar/animation';
import type { PathNode, PathPoint } from '@quar/types';
import { reversedContours, reversedTracks } from './pathCommands';
import { useEditorStore } from './editorStore';

const pt = (x: number, handleOut: number | null = null): PathPoint => ({
  position: { x, y: 0 },
  handleIn: null,
  handleOut: handleOut === null ? null : { x: handleOut, y: 0 },
  type: 'corner',
});

function path(points: PathPoint[], extra: Partial<PathNode> = {}): PathNode {
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
    closed: false,
    fills: [],
    strokes: [],
    ...extra,
  };
}

describe('reversing a path', () => {
  it('runs each contour the other way, its handles swapped', () => {
    const reversed = reversedContours(
      path([pt(0, 10), pt(100), pt(200)], { subpaths: [[pt(5), pt(6)]] })
    );
    expect(reversed.points.map((p) => p.position.x)).toEqual([200, 100, 0]);
    expect(reversed.points[2]!.handleIn).toEqual({ x: 10, y: 0 });
    expect(reversed.points[2]!.handleOut).toBeNull();
    expect(reversed.subpaths![0]!.map((p) => p.position.x)).toEqual([6, 5]);
  });

  it('keeps the keyframes on their points, in and out handles swapped', () => {
    const node = path([pt(0), pt(100), pt(200)]);
    const timeline = {
      ...createTimeline(),
      tracks: [
        createTrack('p', 'points.0.position.x', [createKeyframe(0, 0)]),
        createTrack('p', 'points.0.handleOut.y', [createKeyframe(0, 5)]),
        createTrack('p', 'points', [createKeyframe(0, [pt(0), pt(100), pt(200)])]),
      ],
    };
    const next = reversedTracks(timeline, node);
    expect(next.tracks.map((t) => t.property)).toEqual([
      'points.2.position.x',
      'points.2.handleIn.y',
      'points',
    ]);
    const shape = next.tracks[2]!.keyframes[0]!.value as PathPoint[];
    expect(shape.map((p) => p.position.x)).toEqual([200, 100, 0]);
  });
});

describe('path commands (store)', () => {
  let sceneGraph: SceneGraph;
  beforeEach(() => {
    sceneGraph = new SceneGraph();
    sceneGraph.addNode(path([pt(0), pt(100), pt(200)]));
    useEditorStore.setState({
      selectedNodeIds: new Set(['p']),
      undoStack: [],
      redoStack: [],
      timeline: { ...createTimeline(), tracks: [] },
    });
  });
  const node = () => sceneGraph.getNode('p') as PathNode;

  it('reverses the selected path, undoably', () => {
    useEditorStore.getState().reverseSelectedPaths(sceneGraph);
    expect(node().points.map((p) => p.position.x)).toEqual([200, 100, 0]);
    useEditorStore.getState().undo(sceneGraph);
    expect(node().points.map((p) => p.position.x)).toEqual([0, 100, 200]);
  });

  it('closes the selected path (a fill if it had none) and opens it again', () => {
    useEditorStore.getState().setSelectedPathsClosed(sceneGraph, true);
    expect(node().closed).toBe(true);
    expect(node().fills).toHaveLength(1);
    useEditorStore.getState().setSelectedPathsClosed(sceneGraph, false);
    expect(node().closed).toBe(false);
    expect(useEditorStore.getState().undoStack).toHaveLength(2);
  });

  it('sets the fill rule', () => {
    useEditorStore.getState().setSelectedPathsFillRule(sceneGraph, 'evenodd');
    expect(node().fillRule).toBe('evenodd');
  });

  it('leaves locked paths alone', () => {
    sceneGraph.updateNode('p', { locked: true });
    useEditorStore.getState().reverseSelectedPaths(sceneGraph);
    expect(node().points[0]!.position.x).toBe(0);
    expect(useEditorStore.getState().undoStack).toHaveLength(0);
  });

  describe('Simplify Path', () => {
    const circle = () =>
      Array.from({ length: 48 }, (_, i) => {
        const a = (i / 48) * Math.PI * 2;
        return {
          ...pt(Math.cos(a) * 100),
          position: { x: Math.cos(a) * 100, y: Math.sin(a) * 100 },
        };
      });

    it('takes a many-point path down to a few points, undoably', () => {
      sceneGraph.updateNode('p', { points: circle(), closed: true });
      useEditorStore.getState().simplifySelectedPaths(sceneGraph);
      expect(node().points.length).toBeLessThan(12);
      useEditorStore.getState().undo(sceneGraph);
      expect(node().points).toHaveLength(48);
    });

    it('leaves a path whose points are animated as it is', () => {
      sceneGraph.updateNode('p', { points: circle(), closed: true });
      useEditorStore.setState({
        timeline: {
          ...createTimeline(),
          tracks: [createTrack('p', 'points.3.position.x', [createKeyframe(0, 1)])],
        },
      });
      useEditorStore.getState().simplifySelectedPaths(sceneGraph);
      expect(node().points).toHaveLength(48);
    });
  });

  describe('Join', () => {
    it('closes one open path, its ends one point where they meet', () => {
      sceneGraph.updateNode('p', {
        points: [pt(0), pt(100), { ...pt(50), position: { x: 50, y: 80 } }, pt(0.2)],
      });
      useEditorStore.getState().joinSelectedPaths(sceneGraph);
      expect(node().closed).toBe(true);
      expect(node().points).toHaveLength(3);
    });

    it('joins two paths into the lower one, nearest ends meeting, wherever each sits', () => {
      sceneGraph.addNode(
        path([pt(0), pt(50)], {
          id: 'q',
          name: 'Other',
          transform: { ...createDefaultTransform(), position: { x: 250, y: 0 } },
        })
      );
      useEditorStore.setState({ selectedNodeIds: new Set(['p', 'q']) });
      useEditorStore.getState().joinSelectedPaths(sceneGraph);

      expect(sceneGraph.getNode('q')).toBeUndefined();
      expect(node().points.map((p) => p.position.x)).toEqual([0, 100, 200, 250, 300]);
      expect([...useEditorStore.getState().selectedNodeIds]).toEqual(['p']);

      useEditorStore.getState().undo(sceneGraph);
      expect(sceneGraph.getNode('q')).toBeDefined();
      expect(node().points).toHaveLength(3);
    });
  });

  describe('Cut at Point', () => {
    it('cuts a path in two at a picked point; the new piece moves as the layer did', () => {
      useEditorStore.setState({
        directSelectionPoints: [{ nodeId: 'p', pointIndex: 1 }],
        timeline: {
          ...createTimeline(),
          tracks: [
            createTrack('p', 'transform.rotation', [createKeyframe(0, 0), createKeyframe(10, 45)]),
          ],
        },
      });
      useEditorStore.getState().cutPathsAtSelectedPoints(sceneGraph);

      const ids = [...useEditorStore.getState().selectedNodeIds];
      expect(ids).toHaveLength(2);
      const piece = sceneGraph.getNode(ids[1]!) as PathNode;
      expect(node().points.map((p) => p.position.x)).toEqual([0, 100]);
      expect(piece.points.map((p) => p.position.x)).toEqual([100, 200]);
      expect(sceneGraph.getRootNodes().map((n) => n.id)).toEqual(['p', piece.id]);
      const tracks = useEditorStore.getState().timeline.tracks;
      expect(
        tracks.filter((t) => t.property === 'transform.rotation').map((t) => t.nodeId)
      ).toEqual(['p', piece.id]);
      expect(useEditorStore.getState().directSelectionPoints).toEqual([]);
    });

    it('opens a closed path at the point', () => {
      sceneGraph.updateNode('p', { closed: true });
      useEditorStore.setState({ directSelectionPoints: [{ nodeId: 'p', pointIndex: 1 }] });
      useEditorStore.getState().cutPathsAtSelectedPoints(sceneGraph);
      expect(node().closed).toBe(false);
      expect(node().points.map((p) => p.position.x)).toEqual([100, 200, 0, 100]);
    });

    it('leaves a path whose points are animated as it is', () => {
      useEditorStore.setState({
        directSelectionPoints: [{ nodeId: 'p', pointIndex: 1 }],
        timeline: {
          ...createTimeline(),
          tracks: [createTrack('p', 'points.0.position.x', [createKeyframe(0, 1)])],
        },
      });
      useEditorStore.getState().cutPathsAtSelectedPoints(sceneGraph);
      expect(node().points).toHaveLength(3);
      expect(sceneGraph.getRootNodes()).toHaveLength(1);
    });
  });
});
