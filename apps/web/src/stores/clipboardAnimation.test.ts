/**
 * Tests for copied layers keeping their animation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph, createDefaultTransform, mat3 } from '@quar/core';
import { createKeyframe, createTimeline, createTrack, evaluateTrack } from '@quar/animation';
import type { Node, PropertyTrack, RectangleNode, Timeline } from '@quar/types';
import { captureTracks, pastedTracks } from './clipboardAnimation';
import { placementOf } from './reparent';
import { useEditorStore } from './editorStore';
import { decodeClipboard, encodeClipboard } from '../services/systemClipboard';

let counter = 0;
const newId = (prefix: string) => `${prefix}-new-${++counter}`;

function track(nodeId: string, property: string, keys: [number, unknown][]): PropertyTrack {
  return createTrack(
    nodeId,
    property,
    keys.map(([time, value]) => createKeyframe(time, value))
  );
}

function rect(id: string, x = 0, parent: string | null = null): RectangleNode {
  const transform = createDefaultTransform();
  transform.position = { x, y: 0 };
  return {
    id,
    name: id,
    type: 'rectangle',
    parent,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 40,
    height: 20,
    cornerRadius: [0, 0, 0, 0],
    fills: [],
    strokes: [],
  };
}

describe('captureTracks', () => {
  it("takes the copied layers' tracks, sequence keyframes as ordinary ones", () => {
    const timeline: Timeline = {
      ...createTimeline(),
      tracks: [
        {
          ...track('a', 'opacity', [[0, 0]]),
          keyframes: [{ ...createKeyframe(0, 0), sequenceStepId: 'step-1' }],
        },
        track('b', 'opacity', [[0, 1]]),
      ],
    };
    const captured = captureTracks(timeline, new Set(['a']));
    expect(captured.map((t) => t.nodeId)).toEqual(['a']);
    expect(captured[0]!.keyframes[0]).not.toHaveProperty('sequenceStepId');
  });
});

describe('pastedTracks', () => {
  const slide = () => [
    track('a', 'transform.position.x', [
      [0, 0],
      [10, 100],
    ]),
  ];

  it('moves the animation to the pasted layer, offset with it', () => {
    const [pasted] = pastedTracks(
      slide(),
      new Map([['a', 'a2']]),
      new Map([['a', { base: placementOf(rect('a').transform), offset: { x: 20, y: -20 } }]]),
      1,
      newId
    );
    expect(pasted!.nodeId).toBe('a2');
    expect(pasted!.id).not.toBe(slide()[0]!.id);
    expect(evaluateTrack(pasted!, 0)).toBe(20);
    expect(evaluateTrack(pasted!, 10)).toBe(120);
  });

  it("re-expresses a root's keyframes at the top level when it's pasted out of its group", () => {
    const [pasted] = pastedTracks(
      slide(),
      new Map([['a', 'a2']]),
      new Map([
        [
          'a',
          {
            base: placementOf(rect('a').transform),
            toTopLevel: mat3.translate(mat3.identity(), 300, 0),
          },
        ],
      ]),
      1,
      newId
    );
    expect(evaluateTrack(pasted!, 10)).toBe(400);
  });

  it("keeps the animation's speed in a project with another frame rate", () => {
    const [pasted] = pastedTracks(slide(), new Map([['a', 'a2']]), new Map(), 2, newId);
    expect(pasted!.keyframes.map((k) => k.time)).toEqual([0, 20]);
  });

  it('drops tracks whose property path writes through the prototype', () => {
    const tracks = [track('a', '__proto__.polluted', [[0, 1]]), ...slide()];
    const pasted = pastedTracks(tracks, new Map([['a', 'a2']]), new Map(), 1, newId);
    expect(pasted.map((t) => t.property)).toEqual(['transform.position.x']);
  });
});

describe('copy and paste with animation (store)', () => {
  let sceneGraph: SceneGraph;

  beforeEach(() => {
    sceneGraph = new SceneGraph();
    sceneGraph.addNode(rect('r1') as Node);
    useEditorStore.setState({
      selectedNodeIds: new Set(['r1']),
      clipboard: null,
      clipboardExtras: null,
      symbols: [],
      frameRate: 30,
      timelineDuration: 300,
      timeline: {
        ...createTimeline(),
        duration: 300,
        frameRate: 30,
        tracks: [
          track('r1', 'transform.position.x', [
            [0, 0],
            [30, 100],
          ]),
        ],
      },
    });
  });

  it('a pasted copy slides like the original, beside it', () => {
    useEditorStore.getState().copySelection(sceneGraph);
    useEditorStore.getState().pasteClipboard(sceneGraph);

    const pastedId = [...useEditorStore.getState().selectedNodeIds][0]!;
    const pastedTrack = useEditorStore
      .getState()
      .timeline.tracks.find((t) => t.nodeId === pastedId)!;
    expect(evaluateTrack(pastedTrack, 30)).toBe(120);
  });

  it('into another project at 60 fps, with a shorter timeline: same speed, timeline grown', () => {
    useEditorStore.getState().copySelection(sceneGraph);
    const payload = decodeClipboard(
      encodeClipboard(useEditorStore.getState().clipboardPayload()!).text
    )!;

    // The other window's project
    const other = new SceneGraph();
    useEditorStore.setState({
      frameRate: 60,
      timelineDuration: 40,
      timeline: { ...createTimeline(), duration: 40, frameRate: 60, tracks: [] },
    });
    useEditorStore.getState().pastePayload(other, payload);

    const [pasted] = useEditorStore.getState().timeline.tracks;
    expect(pasted!.keyframes.map((k) => k.time)).toEqual([0, 60]);
    expect(useEditorStore.getState().timelineDuration).toBe(61);
  });
});
