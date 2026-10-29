/**
 * A video layer for tests: 160 × 90 showing a 1280 × 720 video, its clip
 * the video's first four seconds from frame 0.
 */

import { createDefaultTransform } from '@quar/core';
import type { VideoNode } from '@quar/types';

export function videoLayer(id: string, patch: Partial<VideoNode> = {}): VideoNode {
  return {
    id,
    name: id,
    type: 'video',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    videoId: `file-${id}`,
    width: 160,
    height: 90,
    naturalWidth: 1280,
    naturalHeight: 720,
    cornerRadius: [0, 0, 0, 0],
    clip: { start: 0, offset: 0, duration: 4 },
    ...patch,
  };
}
