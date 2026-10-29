import { File as NodeFile } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneGraph } from '@quar/core';
import { scopeSounds } from '@quar/animation';
import type { VideoNode } from '@quar/types';

import { useEditorStore } from '../stores/editorStore';
import { toast } from '../components/common/Toast';
import { videoFile } from './videoFiles';

const mocks = vi.hoisted(() => ({
  probeVideo: vi.fn(),
  makeVideoStrip: vi.fn(),
  extractVideoSound: vi.fn(),
}));

vi.mock('@quar/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@quar/export')>()),
  ...mocks,
}));

import {
  MAX_VIDEO_BYTES,
  VIDEO_FILE_TYPES,
  importVideoFiles,
  isGifFile,
  isVideoFile,
  sortGifFiles,
} from './videoImport';

const store = () => useEditorStore.getState();

const info = {
  format: 'MP4',
  mimeType: 'video/mp4',
  width: 1280,
  height: 720,
  duration: 4,
  frameRate: 30,
  hasAlpha: false,
  videoCodec: 'H.264',
  audioCodec: 'AAC',
  canDecodeAudio: true,
};
const strip = { rate: 4, height: 160, frames: ['data:image/webp;base64,AAAA'] };
const audio = { duration: 4 } as AudioBuffer;

function videoNodes(sg: SceneGraph): VideoNode[] {
  return [...sg.getNodes()].filter((node): node is VideoNode => node.type === 'video');
}

describe('isVideoFile', () => {
  it('takes MP4, MOV and WebM files, by their type or their name', () => {
    expect(isVideoFile(new File([], 'a.mp4', { type: 'video/mp4' }))).toBe(true);
    expect(isVideoFile(new File([], 'Holiday.MOV'))).toBe(true);
    expect(isVideoFile(new File([], 'clip.webm'))).toBe(true);
    expect(isVideoFile(new File([], 'clip.m4v'))).toBe(true);
    expect(isVideoFile(new File([], 'film.mkv', { type: 'video/x-matroska' }))).toBe(true);
    expect(isVideoFile(new File([], 'voice.webm', { type: 'audio/webm' }))).toBe(false);
    expect(isVideoFile(new File([], 'song.mp3'))).toBe(false);
    expect(isVideoFile(new File([], 'cat.png', { type: 'image/png' }))).toBe(false);
  });

  it('takes GIFs, by their type or their name', () => {
    expect(isVideoFile(new File([], 'wave.gif', { type: 'image/gif' }))).toBe(true);
    expect(isVideoFile(new File([], 'Wave.GIF'))).toBe(true);
    expect(VIDEO_FILE_TYPES.split(',')).toEqual(expect.arrayContaining(['image/gif', '.gif']));
  });
});

describe('GIF files', () => {
  // Node's own files: jsdom's can't be read as bytes
  const gif = (name: string, as: string, type = 'image/gif') =>
    new NodeFile([readFileSync(resolve(__dirname, '../test/fixtures/video', name))], as, {
      type,
    }) as unknown as File;

  it('are known by their type or their name', () => {
    expect(isGifFile(new File([], 'wave.gif', { type: 'image/gif' }))).toBe(true);
    expect(isGifFile(new File([], 'WAVE.GIF'))).toBe(true);
    expect(isGifFile(new File([], 'wave.gif', { type: 'image/png' }))).toBe(false);
    expect(isGifFile(new File([], 'clip.mp4', { type: 'video/mp4' }))).toBe(false);
  });

  it('sort into the animated ones (clips) and the still ones (pictures)', async () => {
    const wave = gif('gif-counter.gif', 'wave.gif');
    const logo = gif('gif-still.gif', 'logo.gif');
    const spark = gif('gif-transparent.gif', 'spark.gif', '');
    const photo = new NodeFile(['png'], 'photo.png', { type: 'image/png' }) as unknown as File;
    expect(await sortGifFiles([wave, photo, logo, spark])).toEqual({
      animated: [wave, spark],
      still: [logo],
    });
  });
});

describe('importVideoFiles', () => {
  const progress = { update: vi.fn(), done: vi.fn() };

  beforeEach(() => {
    store().resetProject();
    vi.clearAllMocks();
    mocks.probeVideo.mockResolvedValue({ ok: true, info });
    mocks.makeVideoStrip.mockImplementation(async (_file, _info, onProgress) => {
      onProgress?.(0.5);
      onProgress?.(1);
      return strip;
    });
    mocks.extractVideoSound.mockResolvedValue({
      file: new Blob(['m4a'], { type: 'audio/mp4' }),
      mimeType: 'audio/mp4',
      audio,
      copied: true,
    });
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    vi.spyOn(toast, 'error').mockImplementation(() => {});
    vi.spyOn(toast, 'info').mockImplementation(() => {});
    vi.spyOn(toast, 'progress').mockReturnValue(progress);
  });

  it('brings a video into the library, its layer placed and its sound linked', async () => {
    const sg = new SceneGraph();
    useEditorStore.setState({ currentFrame: 15, timelineExpanded: false });
    const file = new File(['mp4'], 'Beach day.mp4', { type: 'video/mp4' });
    await importVideoFiles(sg, [file]);

    const [video] = store().videos;
    expect(video).toMatchObject({
      name: 'Beach day',
      mimeType: 'video/mp4',
      byteLength: 3,
      width: 1280,
      height: 720,
      duration: 4,
      frameRate: 30,
      hasAlpha: false,
      strip,
    });
    expect(videoFile(video!.id)).toBe(file);
    const [node] = videoNodes(sg);
    expect(node).toMatchObject({ videoId: video!.id, name: 'Beach day', clip: { start: 15 } });
    const [sound] = store().sounds;
    expect(sound).toMatchObject({ name: 'Beach day', duration: 4 });
    expect(sound?.src).toBe(`data:audio/mp4;base64,${btoa('m4a')}`);
    expect(scopeSounds(store().timeline, null)).toMatchObject([
      { soundId: sound?.id, start: 15, linkedTo: node?.id },
    ]);
    // Where it can be seen
    expect(store().timelineExpanded).toBe(true);
    expect(toast.success).toHaveBeenCalledWith('Added “Beach day” (4 s) with its sound');
  });

  it('says how far it has got while it works, and stops saying so when it’s done', async () => {
    await importVideoFiles(new SceneGraph(), [new File(['mp4'], 'beach.mp4')]);
    expect(toast.progress).toHaveBeenCalledWith('Importing “beach.mp4”…');
    expect(progress.update).toHaveBeenCalledWith('Importing “beach.mp4”: frames 50%');
    expect(progress.update).toHaveBeenCalledWith('Importing “beach.mp4”: its sound…');
    expect(progress.done).toHaveBeenCalledOnce();
  });

  it('types the file it keeps as the video it is', async () => {
    await importVideoFiles(new SceneGraph(), [new File(['mov'], 'clip.mov')]);
    const [video] = store().videos;
    expect(videoFile(video!.id)?.type).toBe('video/mp4');
  });

  it('places the clip from the frame it was dropped on', async () => {
    const sg = new SceneGraph();
    await importVideoFiles(sg, [new File(['mp4'], 'beach.mp4')], 90);
    expect(videoNodes(sg)[0]?.clip.start).toBe(90);
    expect(scopeSounds(store().timeline, null)[0]?.start).toBe(90);
  });

  it('is one undo step', async () => {
    const sg = new SceneGraph();
    const steps = store().undoStack.length;
    await importVideoFiles(sg, [new File(['mp4'], 'beach.mp4')]);
    expect(store().undoStack.length).toBe(steps + 1);
    store().undo(sg);
    expect(videoNodes(sg)).toEqual([]);
    expect(scopeSounds(store().timeline, null)).toEqual([]);
  });

  it('says when the timeline was lengthened to play it through', async () => {
    mocks.probeVideo.mockResolvedValue({ ok: true, info: { ...info, duration: 12.5 } });
    await importVideoFiles(new SceneGraph(), [new File(['mp4'], 'long.mp4')], 0);
    expect(store().timelineDuration).toBe(375);
    expect(toast.success).toHaveBeenCalledWith(
      'Added “long” (12.5 s) with its sound; the timeline now runs 12.5 s to play it through'
    );
  });

  it('brings in a video without sound on its own', async () => {
    mocks.extractVideoSound.mockResolvedValue(null);
    const sg = new SceneGraph();
    await importVideoFiles(sg, [new File(['mp4'], 'silent.mp4')]);
    expect(videoNodes(sg)).toHaveLength(1);
    expect(store().sounds).toEqual([]);
    expect(scopeSounds(store().timeline, null)).toEqual([]);
    expect(toast.success).toHaveBeenCalledWith('Added “silent” (4 s)');
  });

  it('brings in a video whose sound this browser can’t play without it, saying so', async () => {
    mocks.extractVideoSound.mockRejectedValue(new Error('This browser can’t play its sound.'));
    const sg = new SceneGraph();
    await importVideoFiles(sg, [new File(['mp4'], 'odd.mp4')]);
    expect(videoNodes(sg)).toHaveLength(1);
    expect(store().sounds).toEqual([]);
    expect(toast.info).toHaveBeenCalledWith(
      '“odd” came in without its sound: this browser can’t play it.'
    );
  });

  it('takes no video in while a symbol is edited: symbols can’t hold them', async () => {
    useEditorStore.setState({ editingSymbolId: 'symbol-1' });
    const sg = new SceneGraph();
    await importVideoFiles(sg, [new File(['mp4'], 'a.mp4'), new File(['mp4'], 'b.mp4')]);
    expect(toast.error).toHaveBeenCalledOnce();
    expect(toast.error).toHaveBeenCalledWith(
      'Videos can’t be imported while a symbol is edited: symbols can’t hold videos yet.'
    );
    expect(mocks.probeVideo).not.toHaveBeenCalled();
    expect(store().videos).toEqual([]);
    useEditorStore.setState({ editingSymbolId: null });
  });

  it('keeps the video’s type in lower case, whatever the file says', async () => {
    mocks.probeVideo.mockResolvedValue({
      ok: true,
      info: { ...info, mimeType: 'video/QuickTime' },
    });
    const file = new File(['mov'], 'clip.mov', { type: '' });
    await importVideoFiles(new SceneGraph(), [file]);
    const [video] = store().videos;
    expect(video?.mimeType).toBe('video/quicktime');
    expect(videoFile(video!.id)?.type).toBe('video/quicktime');
  });

  it('turns away a video over 100 MB before reading it', async () => {
    const big = new File(['x'], 'huge.mp4', { type: 'video/mp4' });
    Object.defineProperty(big, 'size', { value: MAX_VIDEO_BYTES + 1 });
    await importVideoFiles(new SceneGraph(), [big]);
    expect(toast.error).toHaveBeenCalledWith(
      '“huge.mp4” is too large: a video can be up to 100 MB.'
    );
    expect(mocks.probeVideo).not.toHaveBeenCalled();
    expect(store().videos).toEqual([]);
  });

  it('turns away one this browser can’t decode, saying why and what to try', async () => {
    mocks.probeVideo.mockResolvedValue({
      ok: false,
      problem: 'undecodable',
      reason: 'This browser can’t decode its HEVC (H.265) video.',
    });
    const sg = new SceneGraph();
    await importVideoFiles(sg, [new File(['mov'], 'phone.mov')]);
    expect(toast.error).toHaveBeenCalledWith(
      '“phone.mov” can’t be imported. This browser can’t decode its HEVC (H.265) video. Try an MP4 (H.264) file, or another browser.'
    );
    expect(store().videos).toEqual([]);
    expect(videoNodes(sg)).toEqual([]);
    expect(progress.done).toHaveBeenCalledOnce();
  });

  it('turns away a transparent video this browser can’t show as it is, naming browsers that can', async () => {
    mocks.probeVideo.mockResolvedValue({
      ok: false,
      problem: 'transparency',
      reason: 'This browser can’t show its transparency correctly.',
    });
    const sg = new SceneGraph();
    await importVideoFiles(sg, [new File(['webm'], 'smoke.webm')]);
    expect(toast.error).toHaveBeenCalledWith(
      '“smoke.webm” can’t be imported. This browser can’t show its transparency correctly. Try it in Chrome, Edge or Safari.'
    );
    expect(mocks.makeVideoStrip).not.toHaveBeenCalled();
    expect(store().videos).toEqual([]);
    expect(videoNodes(sg)).toEqual([]);
  });

  it('turns away what isn’t a video, and points a sound file the right way', async () => {
    mocks.probeVideo.mockResolvedValueOnce({
      ok: false,
      problem: 'not-a-video',
      reason: 'It isn’t a video this editor can read (MP4, MOV or WebM).',
    });
    mocks.probeVideo.mockResolvedValueOnce({
      ok: false,
      problem: 'no-video-track',
      reason: 'It has sound but no pictures.',
    });
    await importVideoFiles(new SceneGraph(), [
      new File(['x'], 'junk.mp4'),
      new File(['x'], 'voice.mp4'),
    ]);
    expect(toast.error).toHaveBeenCalledWith(
      '“junk.mp4” can’t be imported. It isn’t a video this editor can read (MP4, MOV or WebM). Try an MP4 (H.264) file.'
    );
    expect(toast.error).toHaveBeenCalledWith(
      '“voice.mp4” can’t be imported. It has sound but no pictures. File › Import Sound takes its sound.'
    );
  });

  it('brings in an animated GIF as a clip that loops to fill the timeline, without sound', async () => {
    mocks.probeVideo.mockResolvedValue({
      ok: true,
      info: {
        ...info,
        format: 'GIF',
        mimeType: 'image/gif',
        width: 480,
        height: 270,
        duration: 3,
        frameRate: 15,
        videoCodec: 'GIF',
        audioCodec: null,
        canDecodeAudio: false,
      },
    });
    const sg = new SceneGraph();
    useEditorStore.setState({ currentFrame: 30 });
    const file = new File(['GIF89a'], 'Wave.gif', { type: 'image/gif' });
    await importVideoFiles(sg, [file]);

    const [video] = store().videos;
    expect(video).toMatchObject({
      name: 'Wave',
      mimeType: 'image/gif',
      duration: 3,
      frameRate: 15,
    });
    expect(videoFile(video!.id)).toBe(file);
    expect(videoNodes(sg)[0]?.clip).toEqual({
      start: 30,
      offset: 0,
      duration: 3,
      loop: true,
      loopFor: 9,
    });
    // Nothing to take its sound from
    expect(mocks.extractVideoSound).not.toHaveBeenCalled();
    expect(progress.update).not.toHaveBeenCalledWith('Importing “Wave.gif”: its sound…');
    expect(store().sounds).toEqual([]);
    expect(toast.success).toHaveBeenCalledWith('Added “Wave” (3 s)');
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('plays a GIF as many times as its file says, holding its last frame where it plays once', async () => {
    const gifInfo = {
      ...info,
      format: 'GIF',
      mimeType: 'image/gif',
      duration: 1,
      audioCodec: null,
      canDecodeAudio: false,
    };
    const sg = new SceneGraph();
    mocks.probeVideo.mockResolvedValueOnce({ ok: true, info: { ...gifInfo, loopCount: 2 } });
    mocks.probeVideo.mockResolvedValueOnce({ ok: true, info: { ...gifInfo, loopCount: null } });
    await importVideoFiles(sg, [
      new File(['GIF89a'], 'thrice.gif', { type: 'image/gif' }),
      new File(['GIF89a'], 'once.gif', { type: 'image/gif' }),
    ]);
    const clips = Object.fromEntries(videoNodes(sg).map((node) => [node.name, node.clip]));
    expect(clips.thrice).toMatchObject({ duration: 1, loop: true, loopFor: 3 });
    expect(clips.once).toEqual({ start: 0, offset: 0, duration: 1, holdLastFrame: true });
  });

  it('turns away a GIF of one frame, pointing to where pictures come in', async () => {
    mocks.probeVideo.mockResolvedValue({
      ok: false,
      problem: 'still-picture',
      reason: 'It’s a still picture, not an animated GIF.',
    });
    await importVideoFiles(new SceneGraph(), [
      new File(['gif'], 'logo.gif', { type: 'image/gif' }),
    ]);
    expect(toast.error).toHaveBeenCalledWith(
      '“logo.gif” can’t be imported. It’s a still picture, not an animated GIF. File › Import Image… takes it.'
    );
    expect(store().videos).toEqual([]);
  });

  it('says so when its pictures can’t be decoded after all, and goes on with the rest', async () => {
    mocks.makeVideoStrip.mockRejectedValueOnce(
      new Error('No pictures could be decoded from the video.')
    );
    const sg = new SceneGraph();
    await importVideoFiles(sg, [new File(['x'], 'broken.mp4'), new File(['x'], 'fine.mp4')]);
    expect(toast.error).toHaveBeenCalledWith(
      '“broken.mp4” can’t be imported. No pictures could be decoded from the video.'
    );
    expect(videoNodes(sg).map((node) => node.name)).toEqual(['fine']);
  });
});
