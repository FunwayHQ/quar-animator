/**
 * Video layers' sounds. The sound clip linked to a video layer stays where
 * the layer's clip is and on the timeline the layer plays on: as the clip is
 * moved, trimmed, sped up or looped (or its sound is, on the Sound lane), as
 * the layer goes into or out of an artboard, and when the layer is deleted
 * (its sound kept, unlinked, or deleted with it).
 */

import { linkedSoundClip, scopeSounds, withScopeSounds, withSoundClip } from '@quar/animation';
import type { TimelineScope } from '@quar/animation';
import type { Node, SoundClip, Timeline, VideoClip, VideoNode } from '@quar/types';

/** What finding layers and their timelines needs of a scene graph. */
export interface LayerLookup {
  getNode(id: string): Node | undefined;
  getDescendants(id: string): Node[];
}

/** Every timeline a page has: the page's own (null), then each artboard's. */
function scopesOf(timeline: Timeline): TimelineScope[] {
  return [null, ...Object.keys(timeline.artboards ?? {})];
}

/** The timeline a layer plays on: the artboard's at the root of its branch, else (null) the page's. */
export function layerScope(
  sceneGraph: Pick<LayerLookup, 'getNode'>,
  nodeId: string
): TimelineScope {
  let node = sceneGraph.getNode(nodeId);
  // No deeper than a scene graph nests (a loop in bad data ends here)
  for (let depth = 0; node?.parent && depth < 100; depth++) {
    const parent = sceneGraph.getNode(node.parent);
    if (!parent) break;
    node = parent;
  }
  return node?.type === 'artboard' ? node.id : null;
}

/** The sound clip linked to a video layer and the timeline it's on, wherever on the page; null without one. */
export function findLinkedSound(
  timeline: Timeline,
  nodeId: string
): { scope: TimelineScope; clip: SoundClip } | null {
  for (const scope of scopesOf(timeline)) {
    const clip = scopeSounds(timeline, scope).find((candidate) => candidate.linkedTo === nodeId);
    if (clip) return { scope, clip };
  }
  return null;
}

/** The video layers among these layers, and those in them. */
export function videoLayersIn(sceneGraph: LayerLookup, ids: Iterable<string>): VideoNode[] {
  const found = new Map<string, VideoNode>();
  for (const id of ids) {
    const node = sceneGraph.getNode(id);
    if (!node) continue;
    for (const layer of [node, ...sceneGraph.getDescendants(id)]) {
      if (layer.type === 'video') found.set(layer.id, layer);
    }
  }
  return [...found.values()];
}

/** The timeline with a video layer's linked sound (if it has one) put where its clip now is. */
export function withLinkedSoundAt(timeline: Timeline, nodeId: string, clip: VideoClip): Timeline {
  const linked = findLinkedSound(timeline, nodeId);
  if (!linked) return timeline;
  return withSoundClip(timeline, linked.clip.id, (sound) => linkedSoundClip(sound, clip));
}

/**
 * The timeline with the linked sounds of the video layers among `ids` (and
 * in them) on the timelines those layers play on now, where their clips are:
 * a layer gone into or out of an artboard takes its sound with it.
 */
export function withLinkedSoundsFollowing(
  sceneGraph: LayerLookup,
  timeline: Timeline,
  ids: Iterable<string>
): Timeline {
  let result = timeline;
  for (const layer of videoLayersIn(sceneGraph, ids)) {
    const linked = findLinkedSound(result, layer.id);
    if (!linked) continue;
    const scope = layerScope(sceneGraph, layer.id);
    const clip = linkedSoundClip(linked.clip, layer.clip);
    if (scope === linked.scope) {
      result = withSoundClip(result, linked.clip.id, () => clip);
      continue;
    }
    result = withSoundClip(result, linked.clip.id, () => null);
    result = withScopeSounds(result, scope, [...scopeSounds(result, scope), clip]);
  }
  return result;
}

/** The timing a video's clip takes from its linked sound (the inverse of linkedSoundClip). */
const LINKED_TIMING = ['start', 'offset', 'duration', 'speed', 'loop', 'loopFor'] as const;

/**
 * A video layer's clip put where its linked sound is: the same start, the
 * same part of the file, at the same speed, looped alike (holding its last
 * frame stays its own). Unchanged when it's there already.
 */
export function clipOfLinkedSound(clip: VideoClip, sound: SoundClip): VideoClip {
  if (LINKED_TIMING.every((key) => clip[key] === sound[key])) return clip;
  const linked: VideoClip = { ...clip };
  for (const key of LINKED_TIMING) {
    if (sound[key] === undefined) delete linked[key];
    else Object.assign(linked, { [key]: sound[key] });
  }
  return linked;
}

/**
 * A linked sound clip changed on the Sound lane (`before` → `after`) takes
 * its video layer's clip with it: moved, trimmed, sped up or slowed down,
 * looped, the layer's clip is where the sound now is.
 */
export function followLinkedVideo(
  sceneGraph: Pick<LayerLookup, 'getNode'> & {
    updateNode(id: string, updates: Partial<Node>): void;
  },
  before: Timeline,
  after: Timeline,
  clipId: string
): void {
  const find = (timeline: Timeline) => {
    for (const scope of scopesOf(timeline)) {
      const clip = scopeSounds(timeline, scope).find((candidate) => candidate.id === clipId);
      if (clip) return clip;
    }
    return undefined;
  };
  const was = find(before);
  const now = find(after);
  if (!was || !now?.linkedTo || LINKED_TIMING.every((key) => now[key] === was[key])) return;
  const layer = sceneGraph.getNode(now.linkedTo);
  if (layer?.type !== 'video') return;
  const clip = clipOfLinkedSound(layer.clip, now);
  if (clip !== layer.clip) sceneGraph.updateNode(layer.id, { clip });
}

/**
 * The sound clips linked to the video layers among `ids` (being deleted)
 * that would stay behind: those on a timeline that isn't going with them
 * (an artboard deleted takes its own timeline's sounds).
 */
export function soundsLinkedToRemoved(
  sceneGraph: LayerLookup,
  timeline: Timeline,
  ids: Iterable<string>
): SoundClip[] {
  const removed = new Set<string>();
  for (const id of ids) {
    if (!sceneGraph.getNode(id)) continue;
    removed.add(id);
    for (const node of sceneGraph.getDescendants(id)) removed.add(node.id);
  }
  const videos = new Set(videoLayersIn(sceneGraph, removed).map((layer) => layer.id));
  if (videos.size === 0) return [];
  return scopesOf(timeline)
    .filter((scope) => scope === null || !removed.has(scope))
    .flatMap((scope) => scopeSounds(timeline, scope))
    .filter((clip) => clip.linkedTo !== undefined && videos.has(clip.linkedTo));
}

/** A sound clip of its own, no longer linked to a video. */
export function unlinkedSoundClip(clip: SoundClip): SoundClip {
  if (clip.linkedTo === undefined) return clip;
  const { linkedTo: _video, ...own } = clip;
  return own;
}

/** The timeline with these clips kept as sounds of their own (`keep`), or taken off. */
export function withLinkedSoundsResolved(
  timeline: Timeline,
  clips: readonly SoundClip[],
  keep: boolean
): Timeline {
  let result = timeline;
  for (const { id } of clips) {
    result = withSoundClip(result, id, (clip) => (keep ? unlinkedSoundClip(clip) : null));
  }
  return result;
}
