import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { InputAudioTrack, InputVideoTrack } from 'mediabunny';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { probeVideo } from './probe';
import { extractVideoSound } from './sound';

/** The small videos the app's tests use (apps/web/src/test/fixtures/video, its README says what each is). */
function fixture(name: string): Blob {
  return new Blob([
    readFileSync(resolve(__dirname, '../../../../apps/web/src/test/fixtures/video', name)),
  ]);
}

/** Node has no WebCodecs: whether a track decodes is the browser's to say, stood in for here. */
function decodes(video: boolean, audio = true) {
  vi.spyOn(InputVideoTrack.prototype, 'canDecode').mockResolvedValue(video);
  vi.spyOn(InputAudioTrack.prototype, 'canDecode').mockResolvedValue(audio);
}

describe('probeVideo', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads an MP4: its size, length, frame rate and sound', async () => {
    decodes(true);
    expect(await probeVideo(fixture('clip-h264-aac.mp4'))).toEqual({
      ok: true,
      info: {
        format: 'MP4',
        mimeType: 'video/mp4',
        width: 160,
        height: 90,
        duration: 2,
        frameRate: 30,
        hasAlpha: false,
        videoCodec: 'H.264',
        audioCodec: 'AAC',
        canDecodeAudio: true,
      },
    });
  });

  it('reads a QuickTime file as a MOV', async () => {
    decodes(true);
    const probe = await probeVideo(fixture('clip-h264-aac.mov'));
    expect(probe).toMatchObject({ ok: true, info: { format: 'MOV', mimeType: 'video/quicktime' } });
  });

  it('reads a WebM, its frame rate the one the frames keep to', async () => {
    decodes(true);
    const probe = await probeVideo(fixture('clip-vp9-opus.webm'));
    expect(probe).toMatchObject({
      ok: true,
      info: {
        format: 'WebM',
        mimeType: 'video/webm',
        duration: 2,
        frameRate: 30,
        videoCodec: 'VP9',
        audioCodec: 'Opus',
      },
    });
  });

  it('knows a video that can be transparent', async () => {
    decodes(true);
    const probe = await probeVideo(fixture('clip-vp9-alpha.webm'));
    expect(probe).toMatchObject({ ok: true, info: { hasAlpha: true, duration: 1 } });
  });

  it('knows a video without sound', async () => {
    decodes(true);
    const probe = await probeVideo(fixture('clip-no-audio.mp4'));
    expect(probe).toMatchObject({ ok: true, info: { audioCodec: null, canDecodeAudio: false } });
  });

  it('says whether this browser can play its sound', async () => {
    decodes(true, false);
    const probe = await probeVideo(fixture('clip-h264-aac.mp4'));
    expect(probe).toMatchObject({ ok: true, info: { audioCodec: 'AAC', canDecodeAudio: false } });
  });

  it('names the codec this browser can’t decode', async () => {
    decodes(false);
    expect(await probeVideo(fixture('clip-vp9-opus.webm'))).toEqual({
      ok: false,
      problem: 'undecodable',
      reason: 'This browser can’t decode its VP9 video.',
    });
  });

  it('turns away what isn’t a video', async () => {
    decodes(true);
    expect(await probeVideo(fixture('not-a-video.mp4'))).toEqual({
      ok: false,
      problem: 'not-a-video',
      reason: 'It isn’t a video this editor can read (MP4, MOV or WebM).',
    });
  });

  it('turns away a file with sound but no pictures', async () => {
    decodes(true);
    // The fixture's sound alone, as a sound file would be
    const sound = await extractVideoSound(fixture('clip-h264-aac.mp4'), {
      decode: async () => ({ duration: 2 }) as AudioBuffer,
    });
    expect(await probeVideo(sound!.file)).toEqual({
      ok: false,
      problem: 'no-video-track',
      reason: 'It has sound but no pictures.',
    });
  });
});
