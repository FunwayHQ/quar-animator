import { describe, expect, it } from 'vitest';
import { SceneGraph, createDefaultTransform } from '@quar/core';

import { createTimeline } from './Timeline';
import {
  openingScope,
  scopeDuration,
  scopedTimeline,
  withScopeDuration,
  withoutGoneArtboards,
} from './TimelineScope';

const track = (id: string, nodeId: string) => ({ id, nodeId, property: 'opacity', keyframes: [] });

describe('timeline scopes', () => {
  const timeline = createTimeline({
    duration: 120,
    tracks: [track('t1', 'loose'), track('t2', 'a-child'), track('t3', 'b-child')],
    artboards: { a: { duration: 60 } },
  });

  it('runs each artboard for its own length, the page’s until it has one', () => {
    expect(scopeDuration(timeline, null)).toBe(120);
    expect(scopeDuration(timeline, 'a')).toBe(60);
    expect(scopeDuration(timeline, 'b')).toBe(120);
  });

  it('sets one scope’s length, leaving the rest', () => {
    const longer = withScopeDuration(timeline, 'b', 200);
    expect([
      scopeDuration(longer, null),
      scopeDuration(longer, 'a'),
      scopeDuration(longer, 'b'),
    ]).toEqual([120, 60, 200]);
    expect(withScopeDuration(timeline, null, 90).duration).toBe(90);
    // Kept with the timeline (copies keep it too)
    expect(createTimeline(longer).artboards).toEqual({ a: { duration: 60 }, b: { duration: 200 } });
  });

  it('plays a scope as its layers’ tracks at its length', () => {
    const inA = new Set(['a', 'a-child']);
    const a = scopedTimeline(timeline, 'a', (id) => inA.has(id));
    expect(a.duration).toBe(60);
    expect(a.tracks.map((t) => t.id)).toEqual(['t2']);
  });

  it('forgets the timings of artboards no longer there', () => {
    expect(withoutGoneArtboards(timeline, new Set(['b'])).artboards).toEqual({});
    expect(withoutGoneArtboards(timeline, new Set(['a']))).toBe(timeline);
  });
});

describe('the timeline a page opens on', () => {
  function layer(id: string, type: string) {
    return {
      id,
      name: id,
      type,
      parent: null,
      children: [],
      transform: createDefaultTransform(),
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      ...(type === 'artboard' ? { width: 100, height: 100, fills: [], clipContent: true } : {}),
    } as never;
  }
  // Two slides (slide1 topmost in Layers) and a layer outside them
  function page() {
    const sg = new SceneGraph();
    sg.addNode(layer('slide2', 'artboard'));
    sg.addNode(layer('in2', 'group'), 'slide2');
    sg.addNode(layer('slide1', 'artboard'));
    sg.addNode(layer('in1', 'group'), 'slide1');
    sg.addNode(layer('loose', 'group'));
    return sg;
  }
  const keyed = (nodeId: string) => ({
    id: `t-${nodeId}`,
    nodeId,
    property: 'opacity',
    keyframes: [{ id: 'k', time: 0, value: 1, easing: 'linear' as const }],
  });

  it('is the first animated artboard’s when only artboards animate (every older file)', () => {
    const sg = page();
    expect(openingScope(sg, createTimeline({ tracks: [keyed('in2')] }))).toBe('slide2');
    expect(openingScope(sg, createTimeline({ tracks: [keyed('in2'), keyed('in1')] }))).toBe(
      'slide1'
    );
    // An artboard with only sounds plays too
    const sounding = createTimeline({
      artboards: {
        slide2: {
          duration: 60,
          sounds: [{ id: 's', soundId: 'v', start: 0, offset: 0, duration: 1, gain: 1 }],
        },
      },
    });
    expect(openingScope(sg, sounding)).toBe('slide2');
  });

  it('is the page’s own when something outside the artboards plays, or nothing does', () => {
    const sg = page();
    expect(openingScope(sg, createTimeline({ tracks: [keyed('in1'), keyed('loose')] }))).toBeNull();
    expect(openingScope(sg, createTimeline())).toBeNull();
    // Keyframes of a layer no longer there play nothing
    expect(openingScope(sg, createTimeline({ tracks: [keyed('gone'), keyed('in1')] }))).toBe(
      'slide1'
    );
  });
});
