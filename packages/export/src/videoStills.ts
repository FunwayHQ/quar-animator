/**
 * Video layers in the exports that can't play video (Lottie, SVG, PDF):
 * each shows a still of the moment of its video it's at, as a picture —
 * placed, masked, rounded and faded as a picture is. Which moment each
 * layer shows is worked out here; the stills themselves are had by whoever
 * has the videos' files (the app: video/still decodes them), before the
 * export is written.
 */

import type { SceneGraph } from '@quar/core';
import { videoTimeAt } from '@quar/animation';
import type { ImageNode, Node, VideoNode } from '@quar/types';

/** A video layer, and the moment of its video it shows. */
export interface VideoMoment {
  nodeId: string;
  videoId: string;
  /** In seconds of the video */
  seconds: number;
}

/** Each video layer's still, by layer id: its picture's src (a data URI). */
export type VideoStills = ReadonlyMap<string, string>;

/** The stills for these moments; a layer it has none for shows nothing. */
export type VideoStillLoader = (moments: VideoMoment[]) => Promise<VideoStills>;

type Resolve = (id: string) => Node | undefined;

/** The visible video layers among `nodes` and inside their groups and artboards. */
function visibleVideoLayers(nodes: Node[], resolve: Resolve): VideoNode[] {
  const found: VideoNode[] = [];
  const seen = new Set<string>();
  const visit = (node: Node) => {
    if (!node.visible || seen.has(node.id)) return;
    seen.add(node.id);
    if (node.type === 'video') {
      if (node.videoId) found.push(node);
      return;
    }
    if (node.type !== 'group' && node.type !== 'artboard') return;
    for (const id of node.children) {
      const child = resolve(id);
      if (child) visit(child);
    }
  };
  for (const node of nodes) visit(node);
  return found;
}

/** How many video layers an export of `nodes` shows (as stills, in these formats). */
export function countVideoLayers(nodes: Node[], resolve: Resolve): number {
  return visibleVideoLayers(nodes, resolve).length;
}

/**
 * The moment each visible video layer among `nodes` (and in them) shows,
 * as `momentOf` has it; a layer it gives null shows nothing.
 */
export function videoMoments(
  nodes: Node[],
  resolve: Resolve,
  momentOf: (node: VideoNode) => number | null
): VideoMoment[] {
  return visibleVideoLayers(nodes, resolve).flatMap((node) => {
    const seconds = momentOf(node);
    return seconds === null || !Number.isFinite(seconds)
      ? []
      : [{ nodeId: node.id, videoId: node.videoId, seconds }];
  });
}

/**
 * The moments the video layers show at a frame of their timelines (an
 * export of that one frame: an SVG, a PDF page): nothing outside a clip,
 * its last picture after one that holds it.
 */
export function videoMomentsAtFrame(
  nodes: Node[],
  resolve: Resolve,
  frame: number,
  frameRate: number
): VideoMoment[] {
  return videoMoments(nodes, resolve, (node) => videoTimeAt(node.clip, frame, frameRate));
}

/** A video layer as the picture of its still: all it is but its video and clip. */
export function videoStillPicture(node: VideoNode, src: string): ImageNode {
  const { videoId: _videoId, clip: _clip, ...picture } = node;
  return { ...picture, type: 'image', src };
}

/**
 * Each video layer of a scene (a copy: an export's posed scene) that has a
 * still put in as the picture of it, where the layer was — among the same
 * siblings, its group's mask if it was the mask. The rest are left as they
 * are (exports draw no video).
 */
export function drawVideoStills(scene: SceneGraph, stills: VideoStills): void {
  for (const [nodeId, src] of stills) {
    const node = scene.getNode(nodeId);
    if (node?.type !== 'video') continue;
    const parentId = node.parent;
    const parent = parentId ? scene.getNode(parentId) : undefined;
    const siblings = parent ? parent.children : scene.getRootNodes().map((root) => root.id);
    const index = siblings.indexOf(nodeId);
    // Taking it out lets go of its group's mask: put back with it
    const mask =
      parent?.type === 'group' && parent.maskNodeId === nodeId
        ? { maskNodeId: nodeId, maskMode: parent.maskMode }
        : null;
    scene.removeNode(nodeId);
    scene.addNode(videoStillPicture(node, src), parentId ?? undefined);
    if (index >= 0) scene.moveNode(nodeId, parentId, index);
    if (parentId && mask) scene.updateNode(parentId, mask);
  }
}
