/**
 * Video layers duplicated, copied and pasted: the copy shows the same video
 * of the library, its clip where it was, with a copy of its linked sound;
 * from another window only where that document has the video.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneGraph, createGroupNode } from '@quar/core';
import { createTimeline, scopeSounds } from '@quar/animation';
import type { RectangleNode, Sound, VideoNode } from '@quar/types';
import { useEditorStore } from './editorStore';
import { decodeClipboard, encodeClipboard } from '../services/systemClipboard';
import { toast } from '../components/common/Toast';
import { artboard, linkedSound, testVideo, videoLayer } from '../test/videoLayer';

const store = () => useEditorStore.getState();
const track: Sound = {
  id: 'track',
  name: 'beach.mp4',
  src: 'data:audio/mp4;base64,AAAA',
  duration: 4,
};

function rectangle(id: string): RectangleNode {
  return {
    ...createGroupNode(id, id),
    type: 'rectangle',
    width: 10,
    height: 10,
    cornerRadius: [0, 0, 0, 0],
    fills: [],
    strokes: [],
  } as unknown as RectangleNode;
}

/** A video layer from frame 30 with its sound, on the page or in an artboard. */
function scene(inArtboard = false) {
  const sg = new SceneGraph();
  if (inArtboard) sg.addNode(artboard('slide'));
  const layer = videoLayer('v', 'beach');
  sg.addNode(layer, inArtboard ? 'slide' : undefined);
  sg.addNode(rectangle('r'));
  const sounds = [linkedSound('s', layer)];
  useEditorStore.setState({
    videos: [testVideo('beach')],
    sounds: [track],
    timeline: createTimeline({
      duration: 300,
      frameRate: 30,
      ...(inArtboard ? { artboards: { slide: { duration: 200, sounds } } } : { sounds }),
    }),
  });
  return sg;
}

/** The pasted copy of `v`, the one layer selected. */
function pastedVideo(sg: SceneGraph): VideoNode {
  const [id] = [...store().selectedNodeIds];
  const node = id ? sg.getNode(id) : undefined;
  expect(node?.type).toBe('video');
  return node as VideoNode;
}

/** What Ctrl+C puts on the system clipboard, read back as another window reads it. */
function systemClipboard() {
  const payload = store().clipboardPayload();
  return decodeClipboard(encodeClipboard(payload!).text)!;
}

let info: ReturnType<typeof vi.spyOn>;

describe('copying video layers', () => {
  beforeEach(() => {
    store().resetProject();
    info = vi.spyOn(toast, 'info').mockImplementation(() => {});
  });
  afterEach(() => info.mockRestore());

  it('duplicates one as a layer showing the same video, with its own linked sound', () => {
    const sg = scene();
    store().setSelection(['v']);
    store().duplicateSelection(sg);

    const copy = pastedVideo(sg);
    expect(copy.id).not.toBe('v');
    expect(copy.videoId).toBe('beach');
    expect(copy.clip).toEqual({ start: 30, offset: 0, duration: 4 });
    const sounds = scopeSounds(store().timeline, null);
    expect(sounds).toHaveLength(2);
    const [original, copied] = sounds;
    expect(original).toMatchObject({ id: 's', linkedTo: 'v' });
    expect(copied).toMatchObject({ soundId: 'track', start: 30, linkedTo: copy.id });
    expect(copied!.id).not.toBe('s');
    // One video in the library, one sound
    expect(store().videos).toHaveLength(1);
    expect(store().sounds).toEqual([track]);
    expect(info).not.toHaveBeenCalled();

    store().undo(sg);
    expect(sg.getNode(copy.id)).toBeUndefined();
    expect(scopeSounds(store().timeline, null).map((clip) => clip.id)).toEqual(['s']);
  });

  it('pastes one in this window through the system clipboard, its sound with it', () => {
    const sg = scene();
    store().setSelection(['v']);
    store().copySelection(sg);
    store().pastePayload(sg, systemClipboard());
    const copy = pastedVideo(sg);
    expect(scopeSounds(store().timeline, null)[1]).toMatchObject({
      start: 30,
      linkedTo: copy.id,
    });
  });

  it('pastes one into the artboard it was copied from, its sound on that timeline', () => {
    const sg = scene(true);
    store().setSelection(['v']);
    store().duplicateSelection(sg);
    const copy = pastedVideo(sg);
    expect(copy.parent).toBe('slide');
    expect(scopeSounds(store().timeline, 'slide').map((clip) => clip.linkedTo)).toEqual([
      'v',
      copy.id,
    ]);
    expect(scopeSounds(store().timeline, null)).toEqual([]);
  });

  it('duplicates an artboard with its videos’ sounds linked to the copies', () => {
    const sg = scene(true);
    store().setSelection(['slide']);
    store().duplicateSelection(sg);
    const [slideCopy] = [...store().selectedNodeIds];
    const videoCopy = sg.getDescendants(slideCopy!).find((node) => node.type === 'video');
    expect(videoCopy).toBeDefined();
    const sounds = scopeSounds(store().timeline, slideCopy!);
    expect(sounds).toHaveLength(1);
    expect(sounds[0]).toMatchObject({ start: 30, linkedTo: videoCopy!.id });
    // Not also on the page's timeline
    expect(scopeSounds(store().timeline, null)).toEqual([]);
  });

  it('pastes into another window that has the video, at its frame rate', () => {
    const sg = scene();
    store().setSelection(['v']);
    store().copySelection(sg);
    const payload = systemClipboard();

    const other = new SceneGraph();
    store().resetProject();
    useEditorStore.setState({
      frameRate: 60,
      timeline: createTimeline({ duration: 600, frameRate: 60 }),
      videos: [testVideo('beach')],
    });
    store().pastePayload(other, payload);
    const copy = pastedVideo(other);
    expect(copy.clip.start).toBe(60);
    expect(scopeSounds(store().timeline, null)[0]).toMatchObject({
      start: 60,
      linkedTo: copy.id,
      soundId: 'track',
    });
    // The sound came along, as sounds do
    expect(store().sounds).toEqual([track]);
  });

  it('leaves the video out where its document hasn’t it, and says so once', () => {
    const sg = scene();
    store().setSelection(['v', 'r']);
    store().copySelection(sg);
    const payload = systemClipboard();

    const other = new SceneGraph();
    store().resetProject();
    store().pastePayload(other, payload);
    expect(other.getRootNodes().map((node) => node.type)).toEqual(['rectangle']);
    expect(scopeSounds(store().timeline, null)).toEqual([]);
    expect(store().sounds).toEqual([]);
    expect(info).toHaveBeenCalledOnce();
    expect(info.mock.calls[0]?.[0]).toMatch(/videos don’t travel between windows/);

    // Only the video: nothing is pasted, nor an undo step made
    store().setSelection([]);
    useEditorStore.setState({ clipboard: null });
    store().resetProject();
    const alone = scene();
    store().setSelection(['v']);
    store().copySelection(alone);
    const onlyVideo = systemClipboard();
    store().resetProject();
    const empty = new SceneGraph();
    store().pastePayload(empty, onlyVideo);
    expect(empty.getRootNodes()).toEqual([]);
    expect(store().undoStack).toHaveLength(0);
  });

  it('leaves videos out of a paste inside a symbol', () => {
    const sg = scene();
    store().setSelection(['v', 'r']);
    store().copySelection(sg);
    useEditorStore.setState({ editingSymbolId: 'sym' });
    store().pasteClipboard(sg);
    const pasted = [...store().selectedNodeIds].map((id) => sg.getNode(id)?.type);
    expect(pasted).toEqual(['rectangle']);
    expect(info.mock.calls[0]?.[0]).toMatch(/symbols can’t hold videos/);
  });

  it('takes only video layers that are whole from another window', () => {
    const sg = scene();
    store().setSelection(['v']);
    store().copySelection(sg);
    const { text } = encodeClipboard(store().clipboardPayload()!);
    const broken = text.replace('"videoId":"beach"', '"videoId":7');
    expect(decodeClipboard(broken)).toBeNull();
    const noClip = JSON.parse(text);
    delete noClip.nodes[0].clip;
    expect(decodeClipboard(JSON.stringify(noClip))).toBeNull();
    // Its sound's link kept
    expect(decodeClipboard(text)!.extras!.videoSounds).toEqual([
      linkedSound('s', videoLayer('v', 'beach')),
    ]);
  });
});
