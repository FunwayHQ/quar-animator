/**
 * Animation on the clipboard: copied layers keep their keyframes when pasted
 * — in this project, another window or another browser — and copied
 * artboards their own timelines, with the sounds on them.
 */

import type {
  ArtboardTimeline,
  Keyframe,
  Matrix3,
  PropertyTrack,
  Sound,
  Timeline,
  Vector2,
} from '@quar/types';
import { mapPlacement, remapPlacementTimeline, type Placement } from './reparent';

/**
 * The tracks animating the copied layers. Keyframes an Animation Sequence
 * step generated become ordinary ones: the pasted layers aren't in the step.
 */
export function captureTracks(timeline: Timeline, copied: Set<string>): PropertyTrack[] {
  return structuredClone(
    timeline.tracks.filter((track) => copied.has(track.nodeId) && track.keyframes.length > 0)
  ).map((track) => ({
    ...track,
    keyframes: track.keyframes.map(({ sequenceStepId: _step, ...keyframe }) => keyframe),
  }));
}

/** The copied artboards' own timelines, and the sounds their clips play. */
export function captureArtboardTimelines(
  timeline: Timeline,
  copied: Set<string>,
  library: readonly Sound[]
): { artboardTimelines: Record<string, ArtboardTimeline>; sounds: Sound[] } {
  const artboardTimelines = Object.fromEntries(
    Object.entries(timeline.artboards ?? {})
      .filter(([id]) => copied.has(id))
      .map(([id, entry]) => [id, structuredClone(entry)])
  );
  const played = new Set(
    Object.values(artboardTimelines)
      .flatMap((entry) => entry.sounds ?? [])
      .map((c) => c.soundId)
  );
  return { artboardTimelines, sounds: library.filter((sound) => played.has(sound.id)) };
}

/**
 * The copied artboards' timelines for the pasted artboards: their lengths
 * and clips timed for this project's frame rate, each clip with a new id,
 * and the transitions into their slides.
 * Clips whose sound isn't to be had (`playable`) are left out.
 */
export function pastedArtboardTimelines(
  timelines: Record<string, ArtboardTimeline> | undefined,
  newIds: Map<string, string>,
  frameScale: number,
  playable: (soundId: string) => boolean,
  newId: (prefix: string) => string
): Record<string, ArtboardTimeline> {
  const scale = Number.isFinite(frameScale) && frameScale > 0 ? frameScale : 1;
  const pasted: Record<string, ArtboardTimeline> = {};
  for (const [oldId, entry] of Object.entries(timelines ?? {})) {
    const id = newIds.get(oldId);
    if (!id) continue;
    const sounds = (entry.sounds ?? [])
      .filter((clip) => playable(clip.soundId))
      .map((clip) => ({ ...clip, id: newId('sound'), start: Math.round(clip.start * scale) }));
    pasted[id] = {
      duration: Math.max(1, Math.round(entry.duration * scale)),
      ...(sounds.length > 0 ? { sounds } : {}),
      // The transition into its slide is in seconds: it lasts as long at any frame rate
      ...(entry.transition ? { transition: { ...entry.transition } } : {}),
    };
  }
  return pasted;
}

/** How a pasted root moved from where it was copied. */
export interface RootMove {
  /** Its placement when copied, in its parent's space then. */
  base: Placement;
  /** From that parent's space to the top level, when it's pasted there instead. */
  toTopLevel?: Matrix3 | null;
  /** The paste offset. */
  offset?: Vector2;
}

/** A property path that's only names (nothing like __proto__ to write through). */
function isSafeProperty(property: string): boolean {
  return (
    /^[\w.]+$/.test(property) &&
    !property.split('.').some((part) => ['__proto__', 'prototype', 'constructor'].includes(part))
  );
}

/**
 * The copied tracks for the pasted layers: their new ids, timed for this
 * project's frame rate (`frameScale` = its rate over the copy's), and the
 * roots' placement keyframes moved with them — re-expressed at the top level
 * when pasted there, and offset like the layer — so the animation plays
 * where the layer now is.
 */
export function pastedTracks(
  tracks: PropertyTrack[],
  newIds: Map<string, string>,
  roots: Map<string, RootMove>,
  frameScale: number,
  newId: (prefix: string) => string
): PropertyTrack[] {
  let moved: PropertyTrack[] = tracks.filter(
    (track) => newIds.has(track.nodeId) && isSafeProperty(track.property)
  );

  for (const [oldId, move] of roots) {
    if (!move.toTopLevel && !move.offset) continue;
    const map = (placement: Placement): Placement => {
      const mapped = move.toTopLevel ? mapPlacement(placement, move.toTopLevel) : placement;
      return move.offset
        ? {
            ...mapped,
            'transform.position.x': mapped['transform.position.x'] + move.offset.x,
            'transform.position.y': mapped['transform.position.y'] + move.offset.y,
          }
        : mapped;
    };
    const timeline = { tracks: moved } as Timeline;
    moved = remapPlacementTimeline(timeline, oldId, move.base, map).tracks;
  }

  return moved.flatMap((track) => {
    const nodeId = newIds.get(track.nodeId);
    if (!nodeId) return [];
    return [
      {
        ...structuredClone(track),
        id: newId('track'),
        nodeId,
        keyframes: retime(track.keyframes, frameScale).map((keyframe) => ({
          ...structuredClone(keyframe),
          id: newId('kf'),
        })),
      },
    ];
  });
}

/** Keyframes at frame times scaled to another frame rate (one per frame, the last kept). */
function retime(keyframes: Keyframe[], frameScale: number): Keyframe[] {
  if (frameScale === 1 || !Number.isFinite(frameScale) || frameScale <= 0) return keyframes;
  const byFrame = new Map<number, Keyframe>();
  for (const keyframe of keyframes) {
    const time = Math.round(keyframe.time * frameScale);
    byFrame.set(time, { ...keyframe, time });
  }
  return [...byFrame.values()].sort((a, b) => a.time - b.time);
}
