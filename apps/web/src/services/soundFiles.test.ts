import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sound } from '@quar/types';

const decodeSound = vi.hoisted(() => vi.fn());
vi.mock('@quar/export', () => ({ decodeSound }));

import {
  MAX_SOUND_BYTES,
  decodedSound,
  keepDecodedSounds,
  readSoundFile,
  soundPeaks,
  soundType,
  waveformPath,
} from './soundFiles';

function audio(duration: number, ...channels: number[][]): AudioBuffer {
  return {
    duration,
    length: channels[0]?.length ?? 0,
    numberOfChannels: channels.length,
    getChannelData: (channel: number) => Float32Array.from(channels[channel] ?? []),
  } as unknown as AudioBuffer;
}

beforeEach(() => decodeSound.mockClear());

describe('soundType', () => {
  it('takes the system’s type, else the name’s', () => {
    expect(soundType(new File([], 'a.wav', { type: 'audio/wav' }))).toBe('audio/wav');
    expect(soundType(new File([], 'Voice.M4A'))).toBe('audio/mp4');
    expect(soundType(new File([], 'song.mp3', { type: 'application/octet-stream' }))).toBe(
      'audio/mpeg'
    );
    expect(soundType(new File([], 'cat.png', { type: 'image/png' }))).toBeNull();
    expect(soundType(new File([], 'notes'))).toBeNull();
  });
});

describe('readSoundFile', () => {
  it('reads a sound as data of its type, with its length, named after the file', async () => {
    decodeSound.mockResolvedValue(audio(2.5, [0]));
    const sound = await readSoundFile(new File(['ID3'], 'Theme song.mp3'));
    expect(sound).toMatchObject({ name: 'Theme song', duration: 2.5 });
    expect(sound.src).toBe(`data:audio/mpeg;base64,${btoa('ID3')}`);
    expect(decodeSound).toHaveBeenCalledWith(sound.src);
    // Kept decoded: not decoded again
    await decodedSound(sound);
    expect(decodeSound).toHaveBeenCalledOnce();
  });

  it('says why a file can’t be a sound', async () => {
    await expect(readSoundFile(new File(['x'], 'cat.png', { type: 'image/png' }))).rejects.toThrow(
      'isn’t a sound file'
    );
    const big = new File(['x'], 'long.wav', { type: 'audio/wav' });
    Object.defineProperty(big, 'size', { value: MAX_SOUND_BYTES + 1 });
    await expect(readSoundFile(big)).rejects.toThrow('up to 50 MB');
    decodeSound.mockRejectedValueOnce(new Error('EncodingError'));
    await expect(readSoundFile(new File(['x'], 'odd.flac'))).rejects.toThrow(
      'this browser can’t read its format'
    );
  });
});

describe('decodedSound', () => {
  const sound = (id: string): Sound => ({
    id,
    name: id,
    src: `data:audio/wav;base64,${id}`,
    duration: 1,
  });

  it('decodes once, again after a failure, and lets go of sounds no longer kept', async () => {
    decodeSound.mockRejectedValueOnce(new Error('busy')).mockResolvedValue(audio(1, [0]));
    await expect(decodedSound(sound('one'))).rejects.toThrow('busy');
    await decodedSound(sound('one'));
    await decodedSound(sound('one'));
    expect(decodeSound).toHaveBeenCalledTimes(2);

    keepDecodedSounds([]);
    await decodedSound(sound('one'));
    expect(decodeSound).toHaveBeenCalledTimes(3);
  });
});

describe('waveforms', () => {
  it('takes the loudest sample of each hundredth of a second, over the channels', () => {
    // 0.02 s at 200 samples a second: two peaks of two samples each
    const peaks = soundPeaks(audio(0.02, [0.1, -0.5, 0.2, 0.1], [0.3, 0.2, -0.9, 0]));
    expect([...peaks].map((peak) => Math.round(peak * 10) / 10)).toEqual([0.5, 0.9]);
  });

  it('draws a stretch of the sound mirrored about its middle, a column a peak at most', () => {
    const peaks = Float32Array.from([0.2, 1, 0.4, 0.6]);
    // 0.01–0.03 s: the peaks 1 and 0.4, in two columns over a width of 2
    expect(waveformPath(peaks, 0.01, 0.02, 2)).toBe(
      'M0 0.5L0.5 0.000L1.5 0.300L2.0 0.5L1.5 0.700L0.5 1.000Z'
    );
    // Fewer columns than peaks: each the loudest of its share
    expect(waveformPath(peaks, 0, 0.04, 1)).toBe('M0 0.5L0.5 0.000L1.0 0.5L0.5 1.000Z');
    expect(waveformPath(peaks, 1, 0.5, 10)).toBe('');
  });
});
