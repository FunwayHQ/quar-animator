import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { InputAudioTrack, InputVideoTrack, VideoSampleSink } from 'mediabunny';
import type { VideoSample } from 'mediabunny';
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

/** A transparent video's first frame as this browser decodes it, in this pixel format (Node can't decode). */
function firstFrame(format: string | null) {
  return vi
    .spyOn(VideoSampleSink.prototype, 'getSample')
    .mockResolvedValue({ format, close: vi.fn() } as unknown as VideoSample);
}

/**
 * How this browser draws an RGBA frame of a grey 128 pixel at alpha 64:
 * straight, as WebCodecs' frames are, or as if premultiplied (Firefox),
 * read back wrapped round.
 */
function drawsRgbaFrames(how: 'straight' | 'premultiplied') {
  class FakeFrame {
    constructor(readonly data: Uint8Array) {}
    close() {}
  }
  class FakeCanvas {
    getContext() {
      let drawn = new Uint8ClampedArray(4);
      return {
        drawImage: (frame: FakeFrame) => {
          const [r = 0, g = 0, b = 0, a = 0] = frame.data;
          const read = (c: number) => (how === 'straight' ? c : Math.round((c * 255) / a) % 256);
          drawn = Uint8ClampedArray.from([read(r), read(g), read(b), a]);
        },
        getImageData: () => ({ data: drawn }),
      };
    }
  }
  vi.stubGlobal('VideoFrame', FakeFrame);
  vi.stubGlobal('OffscreenCanvas', FakeCanvas);
}

describe('probeVideo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

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
    firstFrame('I420A');
    const probe = await probeVideo(fixture('clip-vp9-alpha.webm'));
    expect(probe).toMatchObject({ ok: true, info: { hasAlpha: true, duration: 1 } });
  });

  it('decodes no frame of a video that can’t be transparent', async () => {
    decodes(true);
    const decoded = firstFrame('I420');
    expect(await probeVideo(fixture('clip-vp9-opus.webm'))).toMatchObject({ ok: true });
    expect(decoded).not.toHaveBeenCalled();
  });

  describe('a transparent video this browser can’t show as it is', () => {
    const cantShow = {
      ok: false,
      problem: 'transparency',
      reason: 'This browser can’t show its transparency correctly.',
    };

    it('is turned away when its frames come out without their alpha', async () => {
      decodes(true);
      firstFrame('I420');
      expect(await probeVideo(fixture('clip-vp9-alpha.webm'))).toEqual(cantShow);
    });

    it('is turned away when its first frame can’t be decoded with its alpha', async () => {
      decodes(true);
      vi.spyOn(VideoSampleSink.prototype, 'getSample').mockRejectedValue(
        new Error('CPU color/alpha merging requires a known VideoFrame format.')
      );
      expect(await probeVideo(fixture('clip-vp9-alpha.webm'))).toEqual(cantShow);
    });

    it('is turned away when its frames are RGBA ones this browser draws as if premultiplied (Firefox)', async () => {
      decodes(true);
      firstFrame('BGRA');
      drawsRgbaFrames('premultiplied');
      expect(await probeVideo(fixture('clip-vp9-alpha.webm'))).toEqual(cantShow);
    });

    it('is taken when its RGBA frames are drawn as they are', async () => {
      decodes(true);
      firstFrame('BGRA');
      drawsRgbaFrames('straight');
      expect(await probeVideo(fixture('clip-vp9-alpha.webm'))).toMatchObject({
        ok: true,
        info: { hasAlpha: true },
      });
    });
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
      reason: 'It isn’t a video this editor can read (MP4, MOV, WebM or GIF).',
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

describe('probeVideo with a GIF', () => {
  it('reads an animated GIF: its size, its length, its frames over its length, no sound', async () => {
    expect(await probeVideo(fixture('gif-counter.gif'))).toEqual({
      ok: true,
      info: {
        format: 'GIF',
        mimeType: 'image/gif',
        width: 64,
        height: 36,
        duration: 1,
        frameRate: 10,
        hasAlpha: false,
        videoCodec: 'GIF',
        audioCodec: null,
        canDecodeAudio: false,
        loopCount: 0,
      },
    });
  });

  it('knows a GIF that shows through somewhere', async () => {
    const probe = await probeVideo(fixture('gif-transparent.gif'));
    expect(probe).toMatchObject({ ok: true, info: { hasAlpha: true, duration: 1 } });
  });

  it('knows a GIF by its bytes, whatever the file is called', async () => {
    const untyped = new Blob([await fixture('gif-counter.gif').arrayBuffer()], { type: '' });
    expect(await probeVideo(untyped)).toMatchObject({ ok: true, info: { mimeType: 'image/gif' } });
  });

  it('turns away a GIF of one frame: it’s a picture', async () => {
    expect(await probeVideo(fixture('gif-still.gif'))).toEqual({
      ok: false,
      problem: 'still-picture',
      reason: 'It’s a still picture, not an animated GIF.',
    });
  });

  it('turns away a GIF with no pictures in it', async () => {
    const header = (await fixture('gif-counter.gif').arrayBuffer()).slice(0, 40);
    expect(await probeVideo(new Blob([header]))).toEqual({
      ok: false,
      problem: 'not-a-video',
      reason: 'It isn’t a GIF this editor can read.',
    });
  });
});
