import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sound } from '@quar/types';

const decodeSound = vi.hoisted(() => vi.fn());
vi.mock('@quar/export', () => ({ decodeSound }));

import {
  MAX_SOUND_BYTES,
  decodedSound,
  keepDecodedSounds,
  readSoundFile,
  soundFromDecoded,
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

describe('soundFromDecoded', () => {
  it('makes a sound of a file decoded already, kept decoded', async () => {
    const decoded = audio(2, [0]);
    const sound = await soundFromDecoded(
      'Beach',
      new Blob(['m4a'], { type: 'audio/mp4' }),
      decoded
    );
    expect(sound).toMatchObject({ name: 'Beach', duration: 2 });
    expect(sound.src).toBe(`data:audio/mp4;base64,${btoa('m4a')}`);
    expect(await decodedSound(sound)).toBe(decoded);
    expect(decodeSound).not.toHaveBeenCalled();
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

  it('draws each column at the volume in its middle (a fade, say)', () => {
    const peaks = Float32Array.from([1, 1, 1, 1]);
    // Rising over the 0.04 s: columns at 0.01 and 0.03 s in
    expect(waveformPath(peaks, 0, 0.04, 2, (t) => t / 0.04)).toBe(
      'M0 0.5L0.5 0.375L1.5 0.125L2.0 0.5L1.5 0.875L0.5 0.625Z'
    );
  });

  it('draws it as loud as the clip plays it, no louder than full scale', () => {
    const peaks = Float32Array.from([0.2, 1, 0.4, 0.6]);
    expect(waveformPath(peaks, 0.01, 0.02, 2, () => 0.5)).toBe(
      'M0 0.5L0.5 0.250L1.5 0.400L2.0 0.5L1.5 0.600L0.5 0.750Z'
    );
    // At 200% the peak of 1 stays at full scale, 0.4 doubles
    expect(waveformPath(peaks, 0.01, 0.02, 2, () => 2)).toBe(
      'M0 0.5L0.5 0.000L1.5 0.100L2.0 0.5L1.5 0.900L0.5 1.000Z'
    );
    expect(waveformPath(peaks, 0.01, 0.02, 2, () => 0)).toBe(
      'M0 0.5L0.5 0.500L1.5 0.500L2.0 0.5L1.5 0.500L0.5 0.500Z'
    );
  });
});
