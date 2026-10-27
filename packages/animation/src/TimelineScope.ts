/**
 * Timeline Scope
 * A page has its own timeline (for layers outside every artboard) and each
 * artboard has one of its own. A scope names one: an artboard's id, or null
 * for the page's. Keyframes stay in the page's tracks, keyed by layer; a
 * scope's timeline is the tracks of the layers in it, at its own length.
 */

import type { Timeline } from '@quar/types';

/** The page's timeline (null), or an artboard's (its id). */
export type TimelineScope = string | null;

/** How long a scope's timeline runs, in frames (an artboard with none yet: the page's). */
export function scopeDuration(timeline: Timeline, scope: TimelineScope): number {
  if (scope === null) return timeline.duration;
  return timeline.artboards?.[scope]?.duration ?? timeline.duration;
}

/** The timeline with a scope's length set. */
export function withScopeDuration(
  timeline: Timeline,
  scope: TimelineScope,
  duration: number
): Timeline {
  if (scope === null) return { ...timeline, duration };
  return {
    ...timeline,
    artboards: { ...timeline.artboards, [scope]: { ...timeline.artboards?.[scope], duration } },
  };
}

/**
 * A scope's timeline on its own: the tracks of its layers (`inScope`), at
 * its length, as the page's timeline is for everything — to play, scrub or
 * export it.
 */
export function scopedTimeline(
  timeline: Timeline,
  scope: TimelineScope,
  inScope: (nodeId: string) => boolean
): Timeline {
  return {
    ...timeline,
    duration: scopeDuration(timeline, scope),
    tracks: timeline.tracks.filter((track) => inScope(track.nodeId)),
  };
}

/** The timeline without the timings of artboards no longer there. */
export function withoutGoneArtboards(
  timeline: Timeline,
  artboardIds: ReadonlySet<string>
): Timeline {
  if (!timeline.artboards) return timeline;
  const kept = Object.entries(timeline.artboards).filter(([id]) => artboardIds.has(id));
  if (kept.length === Object.keys(timeline.artboards).length) return timeline;
  return { ...timeline, artboards: Object.fromEntries(kept) };
}
