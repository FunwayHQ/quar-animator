/**
 * Tests for copied layers keeping their animation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph, createDefaultTransform, createGroupNode, mat3 } from '@quar/core';
import {
  createKeyframe,
  createTimeline,
  createTrack,
  evaluateTrack,
  scopeDuration,
  scopeSounds,
  scopeTransition,
} from '@quar/animation';
import type {
  ArtboardNode,
  Node,
  PropertyTrack,
  RectangleNode,
  Sound,
  SoundClip,
  Timeline,
} from '@quar/types';
import { captureTracks, pastedArtboardTimelines, pastedTracks } from './clipboardAnimation';
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

const voice: Sound = { id: 'voice', name: 'Voice', src: 'data:audio/wav;base64,AAAA', duration: 2 };
const clip = (id: string, start: number, soundId = 'voice'): SoundClip => ({
  id,
  soundId,
  start,
  offset: 0.5,
  duration: 1,
  gain: 0.6,
});

describe('pastedArtboardTimelines', () => {
  it('gives each pasted artboard its length and clips, timed for the frame rate, new ids', () => {
    const pasted = pastedArtboardTimelines(
      { a: { duration: 90, sounds: [clip('c', 15)] }, gone: { duration: 10 } },
      new Map([['a', 'a2']]),
      2,
      () => true,
      newId
    );
    expect(Object.keys(pasted)).toEqual(['a2']);
    expect(pasted.a2!.duration).toBe(180);
    const [moved] = pasted.a2!.sounds!;
    expect(moved).toMatchObject({
      soundId: 'voice',
      start: 30,
      offset: 0.5,
      duration: 1,
      gain: 0.6,
    });
    expect(moved!.id).not.toBe('c');
  });

  it('leaves out clips whose sound isn’t to be had', () => {
    const pasted = pastedArtboardTimelines(
      { a: { duration: 90, sounds: [clip('c', 0, 'lost')] } },
      new Map([['a', 'a2']]),
      1,
      (soundId) => soundId === 'voice',
      newId
    );
    expect(pasted.a2).toEqual({ duration: 90 });
  });

  it('keeps the transition into each pasted slide, in seconds at any frame rate', () => {
    const transition = { type: 'push', direction: 'up', duration: 0.75 } as const;
    const pasted = pastedArtboardTimelines(
      { a: { duration: 90, transition } },
      new Map([['a', 'a2']]),
      2,
      () => true,
      newId
    );
    expect(pasted.a2).toEqual({ duration: 180, transition });
    expect(pasted.a2!.transition).not.toBe(transition);
  });
});

describe('copy and paste of an artboard with its own timeline (store)', () => {
  let sceneGraph: SceneGraph;

  beforeEach(() => {
    useEditorStore.getState().resetProject();
    sceneGraph = new SceneGraph();
    sceneGraph.addNode({
      ...createGroupNode('slide', 'Slide'),
      type: 'artboard',
      width: 400,
      height: 300,
      fills: [],
    } as unknown as ArtboardNode);
    useEditorStore.setState({
      selectedNodeIds: new Set(['slide']),
      sounds: [voice],
      timeline: createTimeline({
        duration: 300,
        frameRate: 30,
        artboards: {
          slide: {
            duration: 90,
            sounds: [clip('c', 15)],
            transition: { type: 'wipe', direction: 'down', duration: 0.8 },
          },
        },
      }),
      timelineDuration: 300,
    });
  });

  it('a duplicated artboard has the same length and sound clips as the original', () => {
    useEditorStore.getState().duplicateSelection(sceneGraph);

    const { timeline, selectedNodeIds, sounds } = useEditorStore.getState();
    const copy = [...selectedNodeIds][0]!;
    expect(copy).not.toBe('slide');
    expect(scopeDuration(timeline, copy)).toBe(90);
    const [copied] = scopeSounds(timeline, copy);
    expect(copied).toMatchObject({ soundId: 'voice', start: 15, offset: 0.5, gain: 0.6 });
    expect(copied!.id).not.toBe('c');
    // The original keeps its own; the library has the sound once
    expect(scopeSounds(timeline, 'slide').map((c) => c.id)).toEqual(['c']);
    expect(sounds).toEqual([voice]);
    // And the transition into its slide
    expect(scopeTransition(timeline, copy)).toEqual({
      type: 'wipe',
      direction: 'down',
      duration: 0.8,
    });
  });

  it('undoing the paste takes the copy’s timeline away', () => {
    useEditorStore.getState().duplicateSelection(sceneGraph);
    useEditorStore.getState().undo(sceneGraph);
    expect(Object.keys(useEditorStore.getState().timeline.artboards ?? {})).toEqual(['slide']);
  });

  it('into another project at 60 fps: the timeline timed for it, the sound brought along', () => {
    useEditorStore.getState().copySelection(sceneGraph);
    const payload = decodeClipboard(
      encodeClipboard(useEditorStore.getState().clipboardPayload()!).text
    )!;

    const other = new SceneGraph();
    useEditorStore.getState().resetProject();
    useEditorStore.setState({
      frameRate: 60,
      timeline: createTimeline({ duration: 300, frameRate: 60 }),
    });
    useEditorStore.getState().pastePayload(other, payload);

    const { timeline, selectedNodeIds, sounds } = useEditorStore.getState();
    const copy = [...selectedNodeIds][0]!;
    expect(scopeDuration(timeline, copy)).toBe(180);
    expect(scopeSounds(timeline, copy)[0]).toMatchObject({ soundId: 'voice', start: 30 });
    expect(sounds).toEqual([voice]);
    expect(scopeTransition(timeline, copy)).toEqual({
      type: 'wipe',
      direction: 'down',
      duration: 0.8,
    });
  });

  it('from another window, only real sounds come in, and clips without one are left out', () => {
    useEditorStore.getState().copySelection(sceneGraph);
    const payload = useEditorStore.getState().clipboardPayload()!;
    const tampered = {
      ...payload,
      extras: {
        ...payload.extras!,
        artboardTimelines: {
          slide: {
            duration: 90,
            sounds: [clip('c', 15), clip('d', 0, 'script'), { id: 1 }],
            transition: { type: 'explode', duration: 1 },
          },
        },
        sounds: [voice, { ...voice, id: 'script', src: 'javascript:alert(1)' }],
      },
    };
    const decoded = decodeClipboard(encodeClipboard(tampered as typeof payload).text)!;
    expect(decoded.extras!.sounds).toEqual([voice]);

    const other = new SceneGraph();
    useEditorStore.getState().resetProject();
    useEditorStore.getState().pastePayload(other, decoded);
    const { timeline, selectedNodeIds, sounds } = useEditorStore.getState();
    const copy = [...selectedNodeIds][0]!;
    expect(scopeSounds(timeline, copy).map((c) => c.soundId)).toEqual(['voice']);
    expect(sounds.map((sound) => sound.id)).toEqual(['voice']);
    // A transition there isn't: a cut
    expect(scopeTransition(timeline, copy)).toBeNull();
  });
});
