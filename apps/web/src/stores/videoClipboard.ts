/**
 * Video layers on the clipboard. A copied video layer brings a copy of its
 * linked sound, pasted linked to the new layer on the timeline it lands on;
 * the video itself stays in the library, shown by both layers (no second
 * file). The file can't travel on the system clipboard: where the document
 * hasn't that video (another window, another project), or inside a symbol,
 * the layer is left out of the paste, and the person told why.
 */

import { linkedSoundClip, scopeSounds, videoClipEndFrame, withScopeSounds } from '@quar/animation';
import type { TimelineScope } from '@quar/animation';
import type { Node, Sound, SoundClip, Timeline, Video } from '@quar/types';
import { findLinkedSound, layerScope, type LayerLookup } from './videoSounds';

/**
 * The sound clips linked to the copied video layers, and the sounds they
 * play. Those on a copied artboard's timeline are left to it: they come
 * with that timeline.
 */
export function captureVideoSounds(
  timeline: Timeline,
  clones: readonly Node[],
  copied: ReadonlySet<string>,
  library: readonly Sound[]
): { videoSounds: SoundClip[]; sounds: Sound[] } {
  const videoSounds: SoundClip[] = [];
  for (const node of clones) {
    if (node.type !== 'video') continue;
    const linked = findLinkedSound(timeline, node.id);
    if (!linked || (linked.scope !== null && copied.has(linked.scope))) continue;
    videoSounds.push(structuredClone(linked.clip));
  }
  const played = new Set(videoSounds.map((clip) => clip.soundId));
  return { videoSounds, sounds: library.filter((sound) => played.has(sound.id)) };
}

/**
 * The video layers (their ids) a paste leaves out, and what to tell the
 * person: all of them inside a symbol (a symbol has no timeline for a clip
 * to play on), else those whose video this document hasn't.
 */
export function videosLeftOut(
  nodes: readonly Node[],
  videos: readonly Video[],
  inSymbol: boolean
): { ids: Set<string>; reason: string | null } {
  const known = new Set(videos.map((video) => video.id));
  const ids = new Set(
    nodes
      .filter((node) => node.type === 'video' && (inSymbol || !known.has(node.videoId)))
      .map((node) => node.id)
  );
  if (ids.size === 0) return { ids, reason: null };
  const layers = ids.size === 1 ? 'A video layer wasn’t' : `${ids.size} video layers weren’t`;
  return {
    ids,
    reason: inSymbol
      ? `${layers} pasted: symbols can’t hold videos yet.`
      : `${layers} pasted: videos don’t travel between windows or projects. Import the video here, with File › Import Video…`,
  };
}

/** The pasted video layers' clips timed for this project's frame rate (`frameScale`: its rate over the copy's). */
export function retimeVideoClips(nodes: Node[], frameScale: number): void {
  if (frameScale === 1 || !Number.isFinite(frameScale) || frameScale <= 0) return;
  for (const node of nodes) {
    if (node.type === 'video') {
      node.clip = { ...node.clip, start: Math.max(0, Math.round(node.clip.start * frameScale)) };
    }
  }
}

/** A sound clip placed on one of a page's timelines. */
export interface PlacedSound {
  scope: TimelineScope;
  clip: SoundClip;
}

/**
 * The copied videos' sounds for the pasted layers (`newIds`: copied id →
 * pasted id), now in the scene graph: each a new clip linked to its pasted
 * layer, where that layer's clip is, on the timeline it landed on. Those
 * whose layer wasn't pasted, or whose sound isn't to be had, are left out.
 */
export function pastedVideoSounds(
  carried: readonly SoundClip[] | undefined,
  newIds: ReadonlyMap<string, string>,
  sceneGraph: Pick<LayerLookup, 'getNode'>,
  playable: (soundId: string) => boolean,
  newId: (prefix: string) => string
): PlacedSound[] {
  return (carried ?? []).flatMap((clip) => {
    const nodeId = clip.linkedTo !== undefined ? newIds.get(clip.linkedTo) : undefined;
    const layer = nodeId ? sceneGraph.getNode(nodeId) : undefined;
    if (layer?.type !== 'video' || !playable(clip.soundId)) return [];
    const pasted = linkedSoundClip({ ...clip, id: newId('sound'), linkedTo: layer.id }, layer.clip);
    return [{ scope: layerScope(sceneGraph, layer.id), clip: pasted }];
  });
}

/** The timeline with these clips added, each on its timeline. */
export function withPlacedSounds(timeline: Timeline, placed: readonly PlacedSound[]): Timeline {
  let result = timeline;
  for (const { scope, clip } of placed) {
    result = withScopeSounds(result, scope, [...scopeSounds(result, scope), clip]);
  }
  return result;
}

/**
 * How long the timeline `scope` must run to play the clips of these video
 * layers on it to their ends, in frames (0 with none there).
 */
export function videoClipsEnd(
  sceneGraph: Pick<LayerLookup, 'getNode'>,
  nodeIds: Iterable<string>,
  scope: TimelineScope,
  frameRate: number
): number {
  let end = 0;
  for (const id of nodeIds) {
    const node = sceneGraph.getNode(id);
    if (node?.type !== 'video' || layerScope(sceneGraph, id) !== scope) continue;
    end = Math.max(end, Math.ceil(videoClipEndFrame(node.clip, frameRate) - 1e-6));
  }
  return end;
}
