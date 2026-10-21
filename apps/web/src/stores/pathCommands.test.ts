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
});
