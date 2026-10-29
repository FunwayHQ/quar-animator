/**
 * Tests for the videos of a project file: the library's entries in the JSON,
 * each video's file a buffer of its own in the .quar, read back as Blobs.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SceneGraph, DEFAULT_ONION_SKIN_SETTINGS, decodeQuarBinary } from '@quar/core';
import { createAnimationSequence, createTimeline } from '@quar/animation';
import type { Video, VideoNode } from '@quar/types';
import {
  deserializeProject,
  downloadProjectFile,
  projectDataToBinary,
  projectFileBlob,
  readProjectFile,
  serializeProject,
} from './projectSerializer';
import type { EditorStateSnapshot, OpenedProjectState, ProjectData } from './projectSerializer';

const fixture = (name: string) =>
  new Uint8Array(readFileSync(resolve(__dirname, '../test/fixtures/video', name)));
const mp4 = fixture('clip-h264-aac.mp4');
const webm = fixture('clip-vp9-opus.webm');

/** A Blob's bytes, read as the browser reads a dropped file */
/** Whether two files' bytes are the same (at once: toEqual compares a byte at a time) */
const sameBytes = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));

const bytesOf = (blob: Blob) =>
  new Promise<Uint8Array>((done, fail) => {
    const reader = new FileReader();
    reader.onload = () => done(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => fail(reader.error ?? new Error('unreadable'));
    reader.readAsArrayBuffer(blob);
  });

const STILL = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

const video = (id: string, mimeType = 'video/mp4'): Video => ({
  id,
  name: `${id}.mp4`,
  mimeType,
  byteLength: mimeType === 'video/webm' ? webm.length : mp4.length,
  width: 160,
  height: 90,
  duration: 2,
  frameRate: 30,
  hasAlpha: false,
  strip: { rate: 4, height: 90, frames: [STILL, STILL] },
});

const videoNode = (id: string, videoId: string): VideoNode => ({
  id,
  name: id,
  type: 'video',
  parent: null,
  children: [],
  transform: {
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    anchor: { x: 0.5, y: 0.5 },
    skew: { x: 0, y: 0 },
  },
  visible: true,
  locked: false,
  opacity: 1,
  blendMode: 'normal',
  videoId,
  width: 160,
  height: 90,
  naturalWidth: 160,
  naturalHeight: 90,
  cornerRadius: [0, 0, 0, 0],
  clip: { start: 12, offset: 0.5, duration: 1.5 },
});

const scene = (...nodes: VideoNode[]) => {
  const sceneGraph = new SceneGraph();
  for (const node of nodes) sceneGraph.addNode(node);
  return sceneGraph;
};

const editorState = (videos: Video[], extra: Partial<EditorStateSnapshot> = {}) => ({
  timeline: createTimeline(),
  timelineDuration: 300,
  frameRate: 30,
  autoKeyframe: false,
  onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
  videos,
  ...extra,
});

const files = new Map<string, Blob>([
  ['clip', new Blob([mp4], { type: 'video/mp4' })],
  ['loop', new Blob([webm], { type: 'video/webm' })],
]);

function open(data: ProjectData, sceneGraph = new SceneGraph()): OpenedProjectState {
  let applied: OpenedProjectState = {};
  deserializeProject(data, sceneGraph, (state) => {
    applied = state;
  });
  return applied;
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
});

describe('videos in a project file', () => {
  it('keeps the videos some layer shows, on any page or in a symbol, and only those', () => {
    const page = (id: string, nodes: VideoNode[]) => ({
      id,
      name: id,
      sceneGraphJSON: { nodes, rootNodeIds: nodes.map((node) => node.id) },
      timeline: createTimeline(),
      animationSequence: createAnimationSequence(),
      selectedNodeIds: [],
      undoStack: [],
      redoStack: [],
    });
    const data = serializeProject(
      'Clips',
      scene(videoNode('a', 'clip')),
      editorState([video('clip'), video('other'), video('symbolic'), video('unused')], {
        pages: [page('p1', []), page('p2', [videoNode('b', 'other')])],
        activePageId: 'p1',
        symbols: [
          {
            id: 'sym',
            name: 'Symbol',
            sceneGraphJSON: {
              nodes: [videoNode('c', 'symbolic')],
              rootNodeIds: ['c'],
            },
            width: 100,
            height: 100,
          } as never,
        ],
      })
    );

    expect(data.videos?.map((entry) => entry.id)).toEqual(['clip', 'other', 'symbolic']);
    // What's known about each, its file kept apart
    expect(data.videos?.[0]).toEqual(video('clip'));
  });

  it("writes each video's file into the .quar as a buffer of its own, and opens it", async () => {
    const data = serializeProject(
      'Clips',
      scene(videoNode('a', 'clip'), videoNode('b', 'loop')),
      editorState([video('clip'), video('loop', 'video/webm')])
    );

    const blob = projectFileBlob(data, (id) => files.get(id));
    const binary = (await bytesOf(blob)).buffer as ArrayBuffer;
    // Each file's bytes as they are (never base64 text), its entry naming it
    const decoded = decodeQuarBinary(binary);
    const buffers = decoded.buffers.filter((buffer) => buffer.mimeType.startsWith('video/'));
    expect(buffers.map((buffer) => buffer.mimeType)).toEqual(['video/mp4', 'video/webm']);
    expect(sameBytes(buffers[0]!.data, mp4)).toBe(true);
    expect(sameBytes(buffers[1]!.data, webm)).toBe(true);
    const entries = decoded.json.videos as Array<{ file: string }>;
    expect(entries.map((entry) => decoded.buffers[Number(entry.file.slice(7))]!.mimeType)).toEqual([
      'video/mp4',
      'video/webm',
    ]);
    expect(blob.size).toBeLessThan(mp4.length + webm.length + 4096);

    const sceneGraph = new SceneGraph();
    const applied = open(
      await readProjectFile(new File([blob], 'Clips.quar', { type: '' })),
      sceneGraph
    );
    expect(applied.videos).toEqual([video('clip'), video('loop', 'video/webm')]);
    const clip = applied.videoFiles?.get('clip');
    expect(clip?.type).toBe('video/mp4');
    expect(sameBytes(await bytesOf(clip!), mp4)).toBe(true);
    expect(sameBytes(await bytesOf(applied.videoFiles!.get('loop')!), webm)).toBe(true);
    expect(sceneGraph.getNode('a')).toMatchObject({ type: 'video', videoId: 'clip' });
  });

  it('keeps a GIF as it keeps a video: its file a buffer of the .quar, typed as a GIF, its clip looping', async () => {
    const gifBytes = fixture('gif-counter.gif');
    const gif: Video = { ...video('wave', 'image/gif'), name: 'wave', byteLength: gifBytes.length };
    const layer: VideoNode = {
      ...videoNode('g', 'wave'),
      clip: { start: 30, offset: 0, duration: 1, loop: true, loopFor: 9 },
    };
    const data = serializeProject('Waves', scene(layer), editorState([gif]));
    const blob = projectFileBlob(data, (id) =>
      id === 'wave' ? new Blob([gifBytes], { type: 'image/gif' }) : undefined
    );
    const decoded = decodeQuarBinary((await bytesOf(blob)).buffer as ArrayBuffer);
    expect(decoded.buffers.map((buffer) => buffer.mimeType)).toContain('image/gif');

    const sceneGraph = new SceneGraph();
    const applied = open(await readProjectFile(new File([blob], 'Waves.quar')), sceneGraph);
    expect(applied.videos).toEqual([gif]);
    const file = applied.videoFiles?.get('wave');
    expect(file?.type).toBe('image/gif');
    expect(sameBytes(await bytesOf(file!), gifBytes)).toBe(true);
    expect((sceneGraph.getNode('g') as VideoNode).clip).toEqual(layer.clip);
  });

  it('keeps a video whose file the document lacks, without one', async () => {
    const data = serializeProject(
      'Clips',
      scene(videoNode('a', 'clip')),
      editorState([video('clip')])
    );
    const parsed = await readProjectFile(
      new File([projectFileBlob(data, () => undefined)], 'Clips.quar')
    );
    const applied = open(parsed);
    expect(applied.videos).toEqual([video('clip')]);
    expect(applied.videoFiles?.size).toBe(0);
  });

  it('keeps no video in the copy the browser stores, nor in its JSON', () => {
    const data = serializeProject(
      'Clips',
      scene(videoNode('a', 'clip')),
      editorState([video('clip')])
    );
    const decoded = decodeQuarBinary(projectDataToBinary(data));
    expect(decoded.buffers.some((buffer) => buffer.mimeType.startsWith('video/'))).toBe(false);
    expect(decoded.json.videos).toEqual([video('clip')]);
  });

  it('downloads the whole file, the videos in it', async () => {
    let downloaded: Blob | undefined;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: (blob: Blob) => {
        downloaded = blob;
        return 'blob:project';
      },
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => {} });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const data = serializeProject(
      'Clips',
      scene(videoNode('a', 'clip')),
      editorState([video('clip')])
    );

    downloadProjectFile('Clips', data, (id) => files.get(id));

    const applied = open(await readProjectFile(new File([downloaded!], 'Clips.quar')));
    expect(sameBytes(await bytesOf(applied.videoFiles!.get('clip')!), mp4)).toBe(true);
  });

  it('leaves out videos a damaged file got wrong, and opens the layers of missing ones', () => {
    const data = {
      ...serializeProject(
        'Damaged',
        scene(videoNode('a', 'clip'), videoNode('b', 'gone'), {
          ...videoNode('c', 'clip'),
          clip: { start: 'soon', duration: -1 },
        } as never),
        editorState([])
      ),
      videos: [
        { ...video('clip'), file: new Blob([mp4], { type: 'video/mp4' }) },
        // Another of the same id, and one whose file isn't a video's
        { ...video('clip'), name: 'second' },
        { ...video('wrong-file'), file: new Blob([mp4], { type: 'image/png' }) },
        { ...video('no-size'), width: 0 },
        { ...video('no-length'), duration: 'long' },
        { ...video('no-type'), mimeType: 7 },
        { ...video('bad-strip'), strip: { rate: 4, height: 90, frames: [STILL, 3] } },
        { name: 'no id', mimeType: 'video/mp4', width: 1, height: 1, duration: 1 },
        null,
      ],
    } as unknown as ProjectData;

    const sceneGraph = new SceneGraph();
    const applied = open(data, sceneGraph);

    expect(applied.videos?.map((entry) => entry.id)).toEqual(['clip', 'wrong-file', 'bad-strip']);
    expect(applied.videos?.[0]?.name).toBe('clip.mp4');
    expect(applied.videos?.[2]?.strip.frames).toEqual([]);
    expect([...(applied.videoFiles?.keys() ?? [])]).toEqual(['clip']);
    // A layer whose video is missing opens all the same; a broken clip shows nothing
    expect(sceneGraph.getNode('b')).toMatchObject({ type: 'video', videoId: 'gone' });
    expect(sceneGraph.getNode('c')).toMatchObject({
      clip: { start: 0, offset: 0, duration: 0 },
    });
  });

  it("keeps a video's sound linked to its layer", () => {
    const linked = {
      id: 'sound-clip',
      soundId: 'voice',
      start: 12,
      offset: 0.5,
      duration: 1.5,
      gain: 1,
      linkedTo: 'a',
    };
    const data = serializeProject(
      'Clips',
      scene(videoNode('a', 'clip')),
      editorState([video('clip')], {
        timeline: createTimeline({
          sounds: [linked, { ...linked, id: 'odd', linkedTo: 7 } as never],
        }),
      })
    );
    const applied = open(JSON.parse(JSON.stringify(data)) as ProjectData);
    expect(applied.timeline?.sounds).toEqual([
      linked,
      { ...linked, id: 'odd', linkedTo: undefined },
    ]);
  });

  it('opens an older file, with no videos, as it did', () => {
    const data = JSON.parse(
      JSON.stringify(serializeProject('Old', new SceneGraph(), editorState([])))
    ) as ProjectData & { videos?: unknown };
    delete data.videos;

    const applied = open(data);
    expect(applied.videos).toEqual([]);
    expect(applied.videoFiles?.size).toBe(0);
  });
});
