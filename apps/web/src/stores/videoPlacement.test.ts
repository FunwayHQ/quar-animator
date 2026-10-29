/**
 * Placing an imported video: its layer fitted to the artboard in view (or
 * the canvas view) and centred, its clip from the playhead, its sound
 * linked on the same timeline — one undo step.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SceneGraph, createDefaultTransform, createGroupNode } from '@quar/core';
import { scopeDuration, scopeSounds } from '@quar/animation';
import type { ArtboardNode, Sound, Video, VideoNode } from '@quar/types';

import { useEditorStore } from './editorStore';
import { placeVideoLayer } from './videoPlacement';
import { setCanvasViewBounds, setCanvasViewCenter } from '../services/canvasView';

const store = () => useEditorStore.getState();

const video = (overrides: Partial<Video> = {}): Video => ({
  id: 'video-1',
  name: 'Beach',
  mimeType: 'video/mp4',
  byteLength: 1000,
  width: 1280,
  height: 720,
  duration: 4,
  frameRate: 30,
  hasAlpha: false,
  strip: { rate: 4, height: 90, frames: [] },
  ...overrides,
});

const sound: Sound = {
  id: 'sound-1',
  name: 'Beach',
  src: 'data:audio/mp4;base64,AAAA',
  duration: 4,
};

function artboard(sg: SceneGraph, id: string, x: number, y: number, width: number, height: number) {
  sg.addNode({
    ...createGroupNode(id, id),
    type: 'artboard',
    width,
    height,
    fills: [],
    clipContent: true,
    transform: { ...createDefaultTransform(), position: { x, y }, anchor: { x: 0, y: 0 } },
  } as unknown as ArtboardNode);
}

/** Where a layer is on the canvas: the middle and size of its box there. */
function placed(sg: SceneGraph, id: string) {
  const node = sg.getNode(id) as VideoNode;
  const world = sg.getWorldTransform(id);
  const middle = { x: world.tx, y: world.ty };
  return {
    middle,
    width: node.width * Math.hypot(world.a, world.b),
    height: node.height * Math.hypot(world.c, world.d),
  };
}

describe('placeVideoLayer', () => {
  beforeEach(() => store().resetProject());
  afterEach(() => {
    setCanvasViewBounds(null);
    setCanvasViewCenter(null);
  });

  it('fits the video to the artboard in view, centred in it, its clip from the playhead', () => {
    const sg = new SceneGraph();
    artboard(sg, 'board', 100, 50, 800, 600);
    store().setTimelineScope('board');
    store().setCurrentFrame(12);
    const id = placeVideoLayer(sg, video(), null);

    const node = sg.getNode(id) as VideoNode;
    expect(node).toMatchObject({
      type: 'video',
      name: 'Beach',
      videoId: 'video-1',
      parent: 'board',
      naturalWidth: 1280,
      naturalHeight: 720,
      clip: { start: 12, offset: 0, duration: 4 },
    });
    // 1280 × 720 into 800 × 600: as wide as the artboard
    const box = placed(sg, id);
    expect(box.width).toBeCloseTo(800);
    expect(box.height).toBeCloseTo(450);
    expect(box.middle.x).toBeCloseTo(500);
    expect(box.middle.y).toBeCloseTo(350);
    expect([...store().selectedNodeIds]).toEqual([id]);
  });

  it('goes into the artboard the canvas is looking at when the page’s timeline is in view', () => {
    const sg = new SceneGraph();
    artboard(sg, 'board', 0, 0, 400, 400);
    setCanvasViewCenter(() => ({ x: 200, y: 200 }));
    const id = placeVideoLayer(sg, video({ width: 400, height: 800 }), sound);
    expect(sg.getNode(id)?.parent).toBe('board');
    expect(store().timelineScope).toBe('board');
    const box = placed(sg, id);
    expect(box.height).toBeCloseTo(400);
    expect(box.width).toBeCloseTo(200);
    // Its sound on the artboard's timeline, where the layer plays
    expect(scopeSounds(store().timeline, 'board')).toHaveLength(1);
    expect(scopeSounds(store().timeline, null)).toHaveLength(0);
  });

  it('fits it inside the canvas view, with a margin, outside every artboard', () => {
    const sg = new SceneGraph();
    setCanvasViewBounds(() => ({ x: -500, y: -200, width: 1000, height: 400 }));
    const id = placeVideoLayer(sg, video(), null);
    expect(sg.getNode(id)?.parent).toBeNull();
    const box = placed(sg, id);
    expect(box.height).toBeCloseTo(320);
    expect(box.width).toBeCloseTo((320 * 1280) / 720);
    expect(box.middle).toEqual({ x: 0, y: 0 });
  });

  it('keeps the video’s own size, at the origin, with no canvas to fit', () => {
    const sg = new SceneGraph();
    const id = placeVideoLayer(sg, video(), null);
    expect(placed(sg, id)).toEqual({ middle: { x: 0, y: 0 }, width: 1280, height: 720 });
  });

  it('puts its sound on the same timeline, linked to the layer, played as long as the clip', () => {
    const sg = new SceneGraph();
    store().setCurrentFrame(30);
    const id = placeVideoLayer(sg, video(), sound);
    expect(scopeSounds(store().timeline, null)).toEqual([
      expect.objectContaining({
        soundId: 'sound-1',
        start: 30,
        offset: 0,
        duration: 4,
        gain: 1,
        linkedTo: id,
      }),
    ]);
    expect(store().sounds).toEqual([sound]);
    // Placed again, the library has it once
    placeVideoLayer(sg, video(), sound);
    expect(store().sounds).toHaveLength(1);
  });

  it('starts the clip on the frame it’s given (a drop on the timeline)', () => {
    const sg = new SceneGraph();
    const id = placeVideoLayer(sg, video(), sound, 45);
    expect((sg.getNode(id) as VideoNode).clip.start).toBe(45);
    expect(scopeSounds(store().timeline, null)[0]?.start).toBe(45);
  });

  it('lengthens the timeline to play the video through', () => {
    const sg = new SceneGraph();
    // 300 frames at 30 fps; a 12 s video from frame 60 ends on 420
    placeVideoLayer(sg, video({ duration: 12 }), null, 60);
    expect(store().timelineDuration).toBe(420);
    expect(scopeDuration(store().timeline, null)).toBe(420);
  });

  describe('a GIF', () => {
    const gif = (overrides: Partial<Video> = {}) =>
      video({ id: 'gif-1', name: 'Wave', mimeType: 'image/gif', duration: 1, ...overrides });

    it('loops to fill the rest of the timeline from where it starts', () => {
      const sg = new SceneGraph();
      // 300 frames at 30 fps: from frame 60, 240 frames are left
      const id = placeVideoLayer(sg, gif(), null, 60);
      expect((sg.getNode(id) as VideoNode).clip).toEqual({
        start: 60,
        offset: 0,
        duration: 1,
        loop: true,
        loopFor: 8,
      });
      expect(store().timelineDuration).toBe(300);
    });

    it('plays a pass at least, the timeline lengthened for it', () => {
      const sg = new SceneGraph();
      const id = placeVideoLayer(sg, gif({ duration: 4 }), null, 290);
      expect((sg.getNode(id) as VideoNode).clip.loopFor).toBe(4);
      expect(store().timelineDuration).toBe(410);
    });

    it('loops to fill, too, when the file says it plays over and over', () => {
      const sg = new SceneGraph();
      const id = placeVideoLayer(sg, gif(), null, 60, { loopCount: 0 });
      expect((sg.getNode(id) as VideoNode).clip).toMatchObject({ loop: true, loopFor: 8 });
    });

    it('plays once and holds its last frame when the file has no loop count', () => {
      const sg = new SceneGraph();
      const id = placeVideoLayer(sg, gif(), null, 60, { loopCount: null });
      expect((sg.getNode(id) as VideoNode).clip).toEqual({
        start: 60,
        offset: 0,
        duration: 1,
        holdLastFrame: true,
      });
    });

    it('plays as many times as the file says: a pass and its repeats', () => {
      const sg = new SceneGraph();
      const id = placeVideoLayer(sg, gif(), null, 60, { loopCount: 2 });
      expect((sg.getNode(id) as VideoNode).clip).toEqual({
        start: 60,
        offset: 0,
        duration: 1,
        loop: true,
        loopFor: 3,
      });
    });

    it('repeats no further than the timeline’s end, a pass at least', () => {
      const sg = new SceneGraph();
      // 1 s × 101 from frame 60: the 8 s left
      const many = placeVideoLayer(sg, gif(), null, 60, { loopCount: 100 });
      expect((sg.getNode(many) as VideoNode).clip.loopFor).toBe(8);
      const late = placeVideoLayer(sg, gif({ duration: 2 }), null, 290, { loopCount: 3 });
      expect((sg.getNode(late) as VideoNode).clip.loopFor).toBe(2);
    });

    it('fills the timeline of the artboard it goes into, at that one’s length', () => {
      const sg = new SceneGraph();
      artboard(sg, 'board', 0, 0, 400, 400);
      store().setTimelineScope('board');
      store().setTimelineDuration(90);
      const id = placeVideoLayer(sg, gif(), null, 30);
      expect((sg.getNode(id) as VideoNode).clip.loopFor).toBe(2);
      expect(scopeDuration(store().timeline, 'board')).toBe(90);
    });
  });

  it('is one undo step: the layer, its sound clip and the timeline’s length together', () => {
    const sg = new SceneGraph();
    const steps = store().undoStack.length;
    const id = placeVideoLayer(sg, video({ duration: 12 }), sound);
    expect(store().undoStack.length).toBe(steps + 1);
    store().undo(sg);
    expect(sg.getNode(id)).toBeUndefined();
    expect(scopeSounds(store().timeline, null)).toEqual([]);
    expect(store().timelineDuration).toBe(300);
    // The library keeps the sound, as it keeps any the timeline no longer plays
    expect(store().sounds).toHaveLength(1);
    store().redo(sg);
    expect(sg.getNode(id)).toBeDefined();
    expect(scopeSounds(store().timeline, null)).toHaveLength(1);
  });
});
