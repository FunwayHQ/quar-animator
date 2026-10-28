/**
 * Timeline Scope
 * A page has its own timeline (for layers outside every artboard) and each
 * artboard has one of its own. A scope names one: an artboard's id, or null
 * for the page's. Keyframes stay in the page's tracks, keyed by layer; a
 * scope's timeline is the tracks of the layers in it, at its own length.
 */

import { artboardsInOrder, inTimelineScope } from '@quar/core';
import type { ScopeLookup } from '@quar/core';
import type { SlideTransition, SoundClip, Timeline } from '@quar/types';

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

/** The sounds on a scope's timeline. */
export function scopeSounds(timeline: Timeline, scope: TimelineScope): SoundClip[] {
  return (scope === null ? timeline.sounds : timeline.artboards?.[scope]?.sounds) ?? [];
}

/** The timeline with a scope's sounds set (an artboard with no timing yet gets the page's length). */
export function withScopeSounds(
  timeline: Timeline,
  scope: TimelineScope,
  sounds: SoundClip[]
): Timeline {
  if (scope === null) return { ...timeline, sounds };
  return {
    ...timeline,
    artboards: {
      ...timeline.artboards,
      [scope]: { duration: scopeDuration(timeline, scope), ...timeline.artboards?.[scope], sounds },
    },
  };
}

/**
 * The transition into an artboard's slide from the one before it (null:
 * a cut). The page's own timeline isn't a slide, and has none.
 */
export function scopeTransition(timeline: Timeline, scope: TimelineScope): SlideTransition | null {
  if (scope === null) return null;
  return timeline.artboards?.[scope]?.transition ?? null;
}

/**
 * The timeline with the transition into an artboard's slide set, or taken
 * off (null). An artboard with no timing yet gets the page's length; the
 * page's own timeline has no transition, and stays as it is.
 */
export function withScopeTransition(
  timeline: Timeline,
  scope: TimelineScope,
  transition: SlideTransition | null
): Timeline {
  if (scope === null) return timeline;
  const { transition: _was, ...entry } = timeline.artboards?.[scope] ?? {
    duration: scopeDuration(timeline, scope),
  };
  return {
    ...timeline,
    artboards: {
      ...timeline.artboards,
      [scope]: transition ? { ...entry, transition: { ...transition } } : entry,
    },
  };
}

/**
 * A scope's timeline on its own: the tracks of its layers (`inScope`), at
 * its length, with its sounds, as the page's timeline is for everything —
 * to play, scrub or export it.
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
    sounds: scope === null ? timeline.sounds : timeline.artboards?.[scope]?.sounds,
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

/**
 * The timeline to put in view when a page opens: the page's own — unless
 * nothing outside the artboards plays (no keyframes, no sounds) while an
 * artboard does, as on every page made before artboards had timelines of
 * their own. Then the first such artboard's (in the Layers panel's order),
 * so Play plays what the page animates.
 */
export function openingScope(
  sceneGraph: ScopeLookup & { getNode(id: string): unknown },
  timeline: Timeline
): TimelineScope {
  const animated = timeline.tracks
    .filter((track) => track.keyframes.length > 0 && sceneGraph.getNode(track.nodeId))
    .map((track) => track.nodeId);
  if ((timeline.sounds?.length ?? 0) > 0 || animated.some(inTimelineScope(sceneGraph, null))) {
    return null;
  }
  const first = artboardsInOrder(sceneGraph).find(
    (artboard) =>
      (timeline.artboards?.[artboard.id]?.sounds?.length ?? 0) > 0 ||
      animated.some(inTimelineScope(sceneGraph, artboard.id))
  );
  return first?.id ?? null;
}
