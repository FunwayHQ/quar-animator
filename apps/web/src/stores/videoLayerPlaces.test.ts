/**
 * Video layers going where layers go: into and out of artboards (their
 * sounds onto the timeline they now play on), onto other pages (the
 * library is the document's), but not into symbols yet.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneGraph, createGroupNode } from '@quar/core';
import { createTimeline, scopeSounds } from '@quar/animation';
import type { VideoNode } from '@quar/types';
import { useEditorStore } from './editorStore';
import { intoArtboardBeneath } from '../services/intoArtboard';
import { toast } from '../components/common/Toast';
import { artboard, linkedSound, testVideo, videoLayer } from '../test/videoLayer';

const store = () => useEditorStore.getState();

/** An artboard, and beside it a video layer with its sound on the page's timeline. */
function scene() {
  const sg = new SceneGraph();
  sg.addNode(artboard('slide'));
  const layer = videoLayer(
    'v',
    'beach',
    {},
    { transform: { ...videoLayer('x', 'y').transform, position: { x: 600, y: 0 } } }
  );
  sg.addNode(layer);
  useEditorStore.setState({
    videos: [testVideo('beach')],
    timeline: createTimeline({ duration: 300, frameRate: 30, sounds: [linkedSound('s', layer)] }),
  });
  return sg;
}

const sounds = (scope: string | null) => scopeSounds(store().timeline, scope);

describe('video layers moved between timelines', () => {
  beforeEach(() => store().resetProject());

  it('take their sound into an artboard, and out again, undoably', () => {
    const sg = scene();
    store().pushUndo(sg);
    store().moveNodeKeepingPlacement(sg, 'v', 'slide');
    expect(sounds(null)).toEqual([]);
    expect(sounds('slide')).toEqual([linkedSound('s', sg.getNode('v') as VideoNode)]);

    store().moveNodeKeepingPlacement(sg, 'v', null);
    expect(sounds('slide')).toEqual([]);
    expect(sounds(null).map((clip) => clip.id)).toEqual(['s']);

    store().moveNodeKeepingPlacement(sg, 'v', 'slide');
    store().undo(sg);
    expect(sg.getNode('v')?.parent).toBeNull();
    expect(sounds(null).map((clip) => clip.id)).toEqual(['s']);
    expect(sounds('slide')).toEqual([]);
  });

  it('take their sound along inside a group', () => {
    const sg = scene();
    sg.addNode(createGroupNode('g', 'Group'));
    sg.moveNode('v', 'g');
    store().moveNodeKeepingPlacement(sg, 'g', 'slide');
    expect(sounds('slide').map((clip) => clip.id)).toEqual(['s']);
  });

  it('dropped onto an artboard go into it with their sound', () => {
    const sg = scene();
    sg.updateNode('v', {
      transform: { ...sg.getNode('v')!.transform, position: { x: 50, y: 50 } },
    });
    intoArtboardBeneath(sg, 'v');
    expect(sg.getNode('v')?.parent).toBe('slide');
    expect(sounds('slide').map((clip) => clip.id)).toEqual(['s']);
  });

  it('keep their clip and sound on another page, and show the same video back', () => {
    const sg = scene();
    store().addPage(sg);
    expect(sg.getNode('v')).toBeUndefined();
    expect(store().videos.map((video) => video.id)).toEqual(['beach']);
    store().switchPage(store().pages[0]!.id, sg);
    expect((sg.getNode('v') as VideoNode).clip).toEqual({ start: 30, offset: 0, duration: 4 });
    expect(sounds(null)).toEqual([linkedSound('s', sg.getNode('v') as VideoNode)]);
    expect(store().videos.map((video) => video.id)).toEqual(['beach']);
  });
});

describe('video layers and symbols', () => {
  let info: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    store().resetProject();
    info = vi.spyOn(toast, 'info').mockImplementation(() => {});
  });
  afterEach(() => info.mockRestore());

  it('aren’t made into a symbol, saying why', () => {
    const sg = scene();
    sg.addNode(createGroupNode('g', 'Group'));
    sg.moveNode('v', 'g');
    store().setSelection(['g']);
    expect(store().createSymbol(sg)).toBeNull();
    expect(store().symbols).toEqual([]);
    expect(store().undoStack).toEqual([]);
    expect(sg.getNode('v')?.parent).toBe('g');
    expect(info.mock.calls[0]?.[0]).toMatch(/symbols can’t hold videos/i);
  });
});
