/**
 * Video layers for tests, built by hand: a video in the library, a layer
 * showing it with its clip, and the sound clip linked to that layer.
 */

import type { ArtboardNode, SoundClip, Video, VideoClip, VideoNode } from '@quar/types';

/** A 4 s, 640×360 video at 30 fps, its strip four stills a second (none unless given). */
export function testVideo(id: string, extra: Partial<Video> = {}): Video {
  return {
    id,
    name: `${id}.mp4`,
    mimeType: 'video/mp4',
    byteLength: 1000,
    width: 640,
    height: 360,
    duration: 4,
    frameRate: 30,
    hasAlpha: false,
    strip: { rate: 4, height: 90, frames: [] },
    ...extra,
  };
}

/** A layer showing `videoId`: all 4 s of it, from frame 30 unless `clip` says otherwise. */
export function videoLayer(
  id: string,
  videoId: string,
  clip: Partial<VideoClip> = {},
  extra: Partial<VideoNode> = {}
): VideoNode {
  return {
    id,
    name: id,
    type: 'video',
    parent: null,
    children: [],
    transform: {
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0, y: 0 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    videoId,
    width: 320,
    height: 180,
    naturalWidth: 640,
    naturalHeight: 360,
    cornerRadius: [0, 0, 0, 0],
    clip: { start: 30, offset: 0, duration: 4, ...clip },
    ...extra,
  };
}

/** The sound clip linked to a video layer, where its clip is. */
export function linkedSound(id: string, layer: VideoNode, soundId = 'track'): SoundClip {
  return { id, soundId, ...layer.clip, gain: 1, linkedTo: layer.id };
}

/** An artboard at the origin, 400×300. */
export function artboard(id: string): ArtboardNode {
  return {
    id,
    name: id,
    type: 'artboard',
    parent: null,
    children: [],
    transform: {
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0, y: 0 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 400,
    height: 300,
    fills: [],
    clipContent: true,
  };
}
