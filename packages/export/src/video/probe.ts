/**
 * What's in a video file brought into the editor: its picture's size, its
 * length and frame rate, whether it can be transparent and has sound — and
 * whether this browser can decode it, or what stands in the way, said so
 * it can be told to whoever imports it.
 */

import type { InputVideoTrack } from 'mediabunny';
import { openMedia } from './media';

export interface VideoInfo {
  /** The container, as people know it: MP4, MOV, WebM */
  format: string;
  /** The container's type: video/mp4, video/quicktime, video/webm */
  mimeType: string;
  /** Its picture's size as shown (rotation applied), in pixels */
  width: number;
  height: number;
  /** The video's length, in seconds */
  duration: number;
  /** Its frames a second, as the frames keep to (on average where they don't) */
  frameRate: number;
  /** Whether its pictures may be transparent (WebM with alpha) */
  hasAlpha: boolean;
  /** Its video's codec: H.264, HEVC (H.265), VP8, VP9, AV1, ProRes */
  videoCodec: string;
  /** Its sound's codec (AAC, Opus…), null without sound */
  audioCodec: string | null;
  /** Whether this browser decodes its sound (false without sound) */
  canDecodeAudio: boolean;
}

/** Why a file can't be a video layer. */
export type VideoProblem = 'not-a-video' | 'no-video-track' | 'undecodable';

export type VideoProbe =
  | { ok: true; info: VideoInfo }
  | { ok: false; problem: VideoProblem; /** What's wrong, a sentence */ reason: string };

const VIDEO_CODECS: Record<string, string> = {
  avc: 'H.264',
  hevc: 'HEVC (H.265)',
  vp8: 'VP8',
  vp9: 'VP9',
  av1: 'AV1',
  prores: 'ProRes',
};

const AUDIO_CODECS: Record<string, string> = {
  aac: 'AAC',
  opus: 'Opus',
  mp3: 'MP3',
  vorbis: 'Vorbis',
  flac: 'FLAC',
  ac3: 'AC-3',
  eac3: 'E-AC-3',
  dts: 'DTS',
  ulaw: 'G.711',
  alaw: 'G.711',
};

function audioCodecName(codec: string | null): string {
  if (!codec) return 'an unknown codec';
  return AUDIO_CODECS[codec] ?? (codec.startsWith('pcm-') ? 'PCM' : codec);
}

/** The container's name as people know it (mediabunny's are longer). */
function formatName(name: string, mimeType: string): string {
  if (mimeType === 'video/quicktime') return 'MOV';
  return name;
}

const problem = (kind: VideoProblem, reason: string): VideoProbe => ({
  ok: false,
  problem: kind,
  reason,
});

/** Frames a second, to the thousandth: as the frames keep to, else their average. */
async function frameRateOf(track: InputVideoTrack): Promise<number> {
  const round = (rate: number) => Math.round(rate * 1000) / 1000;
  try {
    const { bestGuessFrameRate } = await track.computeFrameRateMetrics();
    if (bestGuessFrameRate > 0 && Number.isFinite(bestGuessFrameRate)) {
      return round(bestGuessFrameRate);
    }
  } catch {
    // Too few frames to tell: their average is next best
  }
  const { averagePacketRate } = await track.computePacketStats(256);
  return averagePacketRate > 0 && Number.isFinite(averagePacketRate)
    ? round(averagePacketRate)
    : 30;
}

/**
 * What a video file is and whether this browser can show it: a decodable
 * video track (its codec named when it isn't), its size, length, frame rate
 * and sound.
 */
export async function probeVideo(file: Blob): Promise<VideoProbe> {
  const { input } = await openMedia(file);
  try {
    if (!(await input.canRead())) {
      return problem('not-a-video', 'It isn’t a video this editor can read (MP4, MOV or WebM).');
    }
    const format = await input.getFormat();
    const track = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    if (!track) {
      return problem(
        'no-video-track',
        audio ? 'It has sound but no pictures.' : 'It has no video in it.'
      );
    }
    const codec = await track.getCodec();
    const codecName = codec ? VIDEO_CODECS[codec] : undefined;
    if (!(await track.canDecode())) {
      return problem(
        'undecodable',
        codecName
          ? `This browser can’t decode its ${codecName} video.`
          : 'Its video is in a format browsers can’t decode.'
      );
    }
    const width = await track.getDisplayWidth();
    const height = await track.getDisplayHeight();
    const duration = await track.computeDuration();
    if (!(width > 0 && height > 0 && duration > 0)) {
      return problem('no-video-track', 'Its video has no frames.');
    }
    const audioCodec = audio ? await audio.getCodec() : null;
    return {
      ok: true,
      info: {
        format: formatName(format.name, format.mimeType),
        mimeType: format.mimeType,
        width,
        height,
        duration,
        frameRate: await frameRateOf(track),
        hasAlpha: await track.canBeTransparent(),
        videoCodec: codecName ?? 'an unknown codec',
        audioCodec: audio ? audioCodecName(audioCodec) : null,
        canDecodeAudio: audio ? await audio.canDecode() : false,
      },
    };
  } catch {
    // Its insides couldn't be made sense of
    return problem('not-a-video', 'It isn’t a video this editor can read (MP4, MOV or WebM).');
  } finally {
    input.dispose();
  }
}
