import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ALL_FORMATS, AudioBufferSink, BlobSource, Input, InputAudioTrack } from 'mediabunny';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { encodeWav, extractVideoSound, soundContainerFor } from './sound';

/** The small videos the app's tests use (apps/web/src/test/fixtures/video, its README says what each is). */
function fixture(name: string): Blob {
  return new Blob([
    readFileSync(resolve(__dirname, '../../../../apps/web/src/test/fixtures/video', name)),
  ]);
}

/** Node has no Web Audio: a decoded sound as long as the file's sound track says. */
async function decodeHere(file: Blob): Promise<AudioBuffer> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryAudioTrack();
  if (!track) throw new Error('No sound');
  return { duration: await track.computeDuration() } as AudioBuffer;
}

/** What's in a file: its container and its tracks. */
async function contents(file: Blob) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  return {
    format: (await input.getFormat()).name,
    audio: await (await input.getPrimaryAudioTrack())?.getCodec(),
    video: await input.getPrimaryVideoTrack(),
  };
}

/** Decoded sound as mediabunny's AudioBufferSink gives it (Node can't decode, so it's stood in for). */
function decodedParts(parts: Array<{ timestamp: number; channels: number[][] }>, rate = 8) {
  vi.spyOn(AudioBufferSink.prototype, 'buffers').mockImplementation(async function* () {
    for (const { timestamp, channels } of parts) {
      const length = channels[0]!.length;
      yield {
        timestamp,
        duration: length / rate,
        buffer: {
          sampleRate: rate,
          numberOfChannels: channels.length,
          length,
          getChannelData: (c: number) => Float32Array.from(channels[c]!),
        } as unknown as AudioBuffer,
      };
    }
  });
}

/** The samples of a 16-bit WAV, channel by channel. */
async function wavSamples(file: Blob) {
  const view = new DataView(await file.arrayBuffer());
  const channels = view.getUint16(22, true);
  const rate = view.getUint32(24, true);
  const frames = view.getUint32(40, true) / 2 / channels;
  const samples = Array.from({ length: channels }, (_, c) =>
    Array.from({ length: frames }, (_, i) => view.getInt16(44 + (i * channels + c) * 2, true))
  );
  return { rate, samples };
}

describe('the file a video’s sound is copied into', () => {
  it('is one the browsers’ audio decoders read for that codec', () => {
    expect(soundContainerFor('aac')).toBe('mp4');
    expect(soundContainerFor('mp3')).toBe('mp4');
    expect(soundContainerFor('opus')).toBe('webm');
    expect(soundContainerFor('vorbis')).toBe('webm');
    expect(soundContainerFor('pcm-s16')).toBe('wav');
    expect(soundContainerFor('pcm-f32')).toBe('wav');
    expect(soundContainerFor('dts')).toBeNull();
    expect(soundContainerFor(null)).toBeNull();
  });
});

describe('encodeWav', () => {
  it('writes 16-bit PCM, its channels interleaved, clipped to full scale', async () => {
    const wav = encodeWav(
      [Float32Array.from([0, 0.5, -1, 2]), Float32Array.from([1, -0.5, 0, -2])],
      8000
    );
    expect(wav.type).toBe('audio/wav');
    const head = new TextDecoder().decode(new Uint8Array(await wav.arrayBuffer()).slice(0, 16));
    // The RIFF chunk's size: 36 bytes of header after it, 16 of samples
    expect(head).toBe('RIFF4\u0000\u0000\u0000WAVEfmt ');
    expect(await wavSamples(wav)).toEqual({
      rate: 8000,
      samples: [
        [0, 16384, -32768, 32767],
        [32767, -16384, 0, -32768],
      ],
    });
  });
});

describe('extractVideoSound', () => {
  afterEach(() => vi.restoreAllMocks());

  it('copies an MP4’s AAC out as it is, into an audio-only MP4', async () => {
    const video = fixture('clip-h264-aac.mp4');
    const sound = await extractVideoSound(video, { decode: decodeHere });
    expect(sound).toMatchObject({ mimeType: 'audio/mp4', copied: true, audio: { duration: 2 } });
    expect(sound?.file.type).toBe('audio/mp4');
    // A quarter of the video's size: the pictures are left behind
    expect(sound!.file.size).toBeLessThan(video.size / 3);
    expect(await contents(sound!.file)).toEqual({ format: 'MP4', audio: 'aac', video: null });
  });

  it('copies a MOV’s sound the same way', async () => {
    const sound = await extractVideoSound(fixture('clip-h264-aac.mov'), { decode: decodeHere });
    expect(sound).toMatchObject({ mimeType: 'audio/mp4', copied: true });
  });

  it('copies a WebM’s Opus out into an audio-only WebM', async () => {
    const sound = await extractVideoSound(fixture('clip-vp9-opus.webm'), { decode: decodeHere });
    expect(sound).toMatchObject({ mimeType: 'audio/webm', copied: true });
    expect(await contents(sound!.file)).toEqual({ format: 'WebM', audio: 'opus', video: null });
  });

  it('finds nothing in a video without sound', async () => {
    expect(await extractVideoSound(fixture('clip-no-audio.mp4'), { decode: decodeHere })).toBe(
      null
    );
  });

  it('decodes the sound into a WAV where the copy doesn’t play here', async () => {
    decodedParts([
      {
        timestamp: 0,
        channels: [
          [0, 0.5],
          [0, -0.5],
        ],
      },
      {
        timestamp: 0.25,
        channels: [
          [1, -1],
          [1, -1],
        ],
      },
    ]);
    const decode = vi.fn(async (file: Blob) => {
      if (file.type !== 'audio/wav') throw new Error('Unable to decode audio data');
      return { duration: 0.5 } as AudioBuffer;
    });
    const sound = await extractVideoSound(fixture('clip-h264-aac.mp4'), { decode });
    expect(sound).toMatchObject({ mimeType: 'audio/wav', copied: false, audio: { duration: 0.5 } });
    expect(await wavSamples(sound!.file)).toEqual({
      rate: 8,
      samples: [
        [0, 16384, 32767, -32768],
        [0, -16384, 32767, -32768],
      ],
    });
  });

  it('puts each decoded stretch where it plays, silence in any gap', async () => {
    decodedParts([
      { timestamp: 0.25, channels: [[0.5, 0.5]] },
      { timestamp: 0.75, channels: [[1]] },
    ]);
    vi.spyOn(InputAudioTrack.prototype, 'getCodec').mockResolvedValue('dts');
    const sound = await extractVideoSound(fixture('clip-h264-aac.mp4'), {
      decode: async () => ({ duration: 1 }) as AudioBuffer,
    });
    expect(sound?.copied).toBe(false);
    expect((await wavSamples(sound!.file)).samples).toEqual([[0, 0, 16384, 16384, 0, 0, 32767]]);
  });

  it('decodes a sound that starts after the video does, so it doesn’t play early', async () => {
    // The fixture's sound starts 0.476 s in (a copy would start it at once)
    decodedParts([{ timestamp: 0.5, channels: [[1, 1]] }]);
    const sound = await extractVideoSound(fixture('clip-late-sound.mp4'), {
      decode: async () => ({ duration: 1 }) as AudioBuffer,
    });
    expect(sound?.copied).toBe(false);
    expect((await wavSamples(sound!.file)).samples).toEqual([[0, 0, 0, 0, 32767, 32767]]);
  });

  it('says so when this browser can’t play the sound either way', async () => {
    decodedParts([{ timestamp: 0, channels: [[0]] }]);
    await expect(
      extractVideoSound(fixture('clip-h264-aac.mp4'), {
        decode: async () => {
          throw new Error('Unable to decode audio data');
        },
      })
    ).rejects.toThrow('This browser can’t play its sound.');
  });
});
