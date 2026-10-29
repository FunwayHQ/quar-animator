/**
 * A video's sound, taken out of it at import into a sound file of its own
 * — for the sound library, where it plays as a clip linked to the video's
 * layer.
 */

import type { InputAudioTrack } from 'mediabunny';
import { SOUNDTRACK_RATE } from '../soundtrack';
import { openMedia, type Mediabunny } from './media';

export interface VideoSoundFile {
  /** The sound as a file of its own */
  file: Blob;
  /** Its type: audio/mp4, audio/webm or audio/wav */
  mimeType: string;
  /** It decoded, as it'll be played (its duration is the sound's length) */
  audio: AudioBuffer;
  /** Whether its stream was copied out as it was, or decoded and written as a WAV */
  copied: boolean;
}

export interface VideoSoundOptions {
  /**
   * Decodes a sound file as the editor plays it, throwing where it can't
   * (by default the Web Audio API, at the soundtrack's rate)
   */
  decode?: (file: Blob) => Promise<AudioBuffer>;
}

type SoundContainer = 'mp4' | 'webm' | 'wav';

const CONTAINER_TYPES: Record<SoundContainer, string> = {
  mp4: 'audio/mp4',
  webm: 'audio/webm',
  wav: 'audio/wav',
};

/**
 * The audio file a sound stream is copied into as it is: one the browsers'
 * audio decoders read for that codec (MP4 for AAC and MP3, WebM for Opus and
 * Vorbis, WAV for PCM); null for a codec none of them would.
 */
export function soundContainerFor(codec: string | null): SoundContainer | null {
  switch (codec) {
    case 'aac':
    case 'mp3':
    case 'flac':
    case 'ac3':
    case 'eac3':
      return 'mp4';
    case 'opus':
    case 'vorbis':
      return 'webm';
    default:
      return codec?.startsWith('pcm-') ? 'wav' : null;
  }
}

function decodeWithWebAudio(file: Blob): Promise<AudioBuffer> {
  return file
    .arrayBuffer()
    .then((bytes) => new OfflineAudioContext(1, 1, SOUNDTRACK_RATE).decodeAudioData(bytes));
}

/** Samples (−1…1, channel by channel) as a 16-bit PCM WAV file. */
export function encodeWav(channels: readonly Float32Array[], sampleRate: number): Blob {
  const count = Math.max(1, channels.length);
  const frames = channels[0]?.length ?? 0;
  const bytes = frames * count * 2;
  const view = new DataView(new ArrayBuffer(44 + bytes));
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, bytes, true);
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < count; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c]?.[i] ?? 0));
      view.setInt16(at, Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff), true);
      at += 2;
    }
  }
  return new Blob([view.buffer], { type: 'audio/wav' });
}

/** The track's stream copied, as it is, into an audio file of its own; null where it can't be. */
async function copiedOut(
  mb: Mediabunny,
  file: Blob,
  codec: string | null
): Promise<{ file: Blob; mimeType: string } | null> {
  const container = soundContainerFor(codec);
  if (!container) return null;
  // An input of its own: the conversion runs through it
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    const target = new mb.BufferTarget();
    const format =
      container === 'mp4'
        ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' })
        : container === 'webm'
          ? new mb.WebMOutputFormat()
          : new mb.WavOutputFormat();
    const conversion = await mb.Conversion.init({
      input,
      output: new mb.Output({ format, target }),
      tracks: 'primary',
      video: { discard: true },
      copy: { mode: 'forced' },
      showWarnings: false,
    });
    if (!conversion.isValid || !conversion.utilizedTracks.some((t) => t.type === 'audio')) {
      return null;
    }
    await conversion.execute();
    if (!target.buffer) return null;
    const mimeType = CONTAINER_TYPES[container];
    return { file: new Blob([target.buffer], { type: mimeType }), mimeType };
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}

/** The track decoded and written as a WAV, each stretch where it plays (from the video's start). */
async function decodedAsWav(mb: Mediabunny, track: InputAudioTrack): Promise<Blob> {
  const parts: Array<{ timestamp: number; buffer: AudioBuffer }> = [];
  let rate = 0;
  let channelCount = 1;
  let end = 0;
  for await (const { buffer, timestamp, duration } of new mb.AudioBufferSink(track).buffers()) {
    parts.push({ buffer, timestamp });
    rate ||= buffer.sampleRate;
    channelCount = Math.max(channelCount, buffer.numberOfChannels);
    end = Math.max(end, timestamp + duration);
  }
  if (parts.length === 0 || rate <= 0) throw new Error('The sound decoded to nothing.');
  const length = Math.ceil(end * rate - 1e-6);
  const channels = Array.from({ length: channelCount }, () => new Float32Array(length));
  for (const { buffer, timestamp } of parts) {
    const at = Math.round(timestamp * rate);
    for (let c = 0; c < channelCount; c++) {
      // A stretch with fewer channels (mono) plays its first in each
      const samples = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
      const from = Math.max(0, -at);
      const target = channels[c];
      if (target && from < samples.length) target.set(samples.subarray(from), at + from);
    }
  }
  return encodeWav(channels, rate);
}

/**
 * A video's sound as a file of its own, null where it has none. Its stream
 * is copied out without re-encoding (the same sound, and a fraction of a
 * WAV's size: AAC is about a tenth); where it can't be copied, or the copy
 * doesn't play in this browser, it's decoded and written as a WAV, larger
 * but read everywhere. Either way it's decoded once to be sure it plays;
 * where it won't, an error says so.
 */
export async function extractVideoSound(
  file: Blob,
  options: VideoSoundOptions = {}
): Promise<VideoSoundFile | null> {
  const decode = options.decode ?? decodeWithWebAudio;
  const { mb, input } = await openMedia(file);
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;
    const copy = await copiedOut(mb, file, await track.getCodec());
    if (copy) {
      try {
        return { ...copy, audio: await decode(copy.file), copied: true };
      } catch {
        // Not a file this browser plays: decoded instead
      }
    }
    try {
      const wav = await decodedAsWav(mb, track);
      return { file: wav, mimeType: 'audio/wav', audio: await decode(wav), copied: false };
    } catch {
      throw new Error('This browser can’t play its sound.');
    }
  } finally {
    input.dispose();
  }
}
