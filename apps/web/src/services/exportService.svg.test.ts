import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneGraph, createDefaultTransform } from '@quar/core';
import type { VideoNode } from '@quar/types';

// Each video layer's still named for it
vi.mock('./videoStills', () => ({
  canvasVideoMoments: (_scene: unknown, nodes: Array<{ id: string; type: string }>) =>
    nodes
      .filter((node) => node.type === 'video')
      .map((node) => ({ nodeId: node.id, videoId: 'v1', seconds: 0 })),
  loadVideoStills: vi.fn((moments: Array<{ nodeId: string }>) =>
    Promise.resolve(new Map(moments.map((m) => [m.nodeId, `data:image/jpeg;base64,${m.nodeId}`])))
  ),
}));

import { exportSelectionAsSvg } from './exportService';

const video: VideoNode = {
  id: 'clip',
  name: 'Clip',
  type: 'video',
  parent: null,
  children: [],
  transform: createDefaultTransform(),
  visible: true,
  locked: false,
  opacity: 1,
  blendMode: 'normal',
  videoId: 'v1',
  width: 160,
  height: 90,
  naturalWidth: 1280,
  naturalHeight: 720,
  cornerRadius: [0, 0, 0, 0],
  clip: { start: 0, offset: 0, duration: 2 },
};

describe('exportSelectionAsSvg', () => {
  let saved: Blob | null = null;

  beforeEach(() => {
    saved = null;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (blob: Blob) => {
        saved = blob;
        return 'blob:svg';
      },
      revokeObjectURL: () => undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('draws a video layer as its still, leaving the scene as it is', async () => {
    const sg = new SceneGraph();
    sg.addNode(structuredClone(video));
    await exportSelectionAsSvg([sg.getNode('clip')!], sg);
    expect(saved).not.toBeNull();
    const svg = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(saved!);
    });
    expect(svg).toContain('<image ');
    expect(svg).toContain('href="data:image/jpeg;base64,clip"');
    expect(sg.getNode('clip')?.type).toBe('video');
  });
});
