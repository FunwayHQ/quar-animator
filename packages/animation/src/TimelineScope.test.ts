import { describe, expect, it } from 'vitest';

import { createTimeline } from './Timeline';
import {
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
