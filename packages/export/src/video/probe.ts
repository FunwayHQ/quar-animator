/**
 * What's in a video file brought into the editor: its picture's size, its
 * length and frame rate, whether it can be transparent and has sound — and
 * whether this browser can decode it (and show its transparency), or what
 * stands in the way, said so it can be told to whoever imports it. An
 * animated GIF is a video without sound, read by the GIF decoder (any
 * browser shows it).
 */

import type { InputVideoTrack } from 'mediabunny';
import { GIF_TYPE, gifHasTransparency, isGifFile, readGif, type GifInfo } from './gif';
import { openMedia, type Mediabunny } from './media';

export interface VideoInfo {
  /** The container, as people know it: MP4, MOV, WebM, GIF */
  format: string;
  /** The container's type: video/mp4, video/quicktime, video/webm, image/gif */
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
  /** Its video's codec: H.264, HEVC (H.265), VP8, VP9, AV1, ProRes (a GIF's: GIF) */
  videoCodec: string;
  /** Its sound's codec (AAC, Opus…), null without sound */
  audioCodec: string | null;
  /** Whether this browser decodes its sound (false without sound) */
  canDecodeAudio: boolean;
  /**
   * A GIF's: how many times it repeats after its first pass, as it says (0
   * over and over; null without a count, when it plays once). Videos have none.
   */
  loopCount?: number | null;
}

/** Why a file can't be a video layer (a GIF of one frame is a still picture). */
export type VideoProblem =
  | 'not-a-video'
  | 'no-video-track'
  | 'undecodable'
  | 'transparency'
  | 'still-picture';

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

const roundRate = (rate: number) => Math.round(rate * 1000) / 1000;

/**
 * What a GIF is: its size, its length (its delays together), its frames
 * over its length as its frame rate, whether any frame shows through —
 * and no sound. One of a single frame is a still picture.
 */
async function probeGif(file: Blob): Promise<VideoProbe> {
  let gif: GifInfo;
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
    gif = readGif(bytes);
  } catch {
    return problem('not-a-video', 'It isn’t a GIF this editor can read.');
  }
  if (gif.frames.length < 2) {
    return problem('still-picture', 'It’s a still picture, not an animated GIF.');
  }
  return {
    ok: true,
    info: {
      format: 'GIF',
      mimeType: GIF_TYPE,
      width: gif.width,
      height: gif.height,
      duration: gif.duration,
      frameRate: roundRate(gif.frames.length / gif.duration),
      hasAlpha: await gifHasTransparency(bytes, gif),
      videoCodec: 'GIF',
      audioCodec: null,
      canDecodeAudio: false,
      loopCount: gif.loopCount,
    },
  };
}

/** Frames a second, to the thousandth: as the frames keep to, else their average. */
async function frameRateOf(track: InputVideoTrack): Promise<number> {
  try {
    const { bestGuessFrameRate } = await track.computeFrameRateMetrics();
    if (bestGuessFrameRate > 0 && Number.isFinite(bestGuessFrameRate)) {
      return roundRate(bestGuessFrameRate);
    }
  } catch {
    // Too few frames to tell: their average is next best
  }
  const { averagePacketRate } = await track.computePacketStats(256);
  return averagePacketRate > 0 && Number.isFinite(averagePacketRate)
    ? roundRate(averagePacketRate)
    : 30;
}

/** Frames that keep an alpha channel, as WebCodecs names them */
const ALPHA_FORMATS = new Set([
  'I420A',
  'I420AP10',
  'I420AP12',
  'I422A',
  'I422AP10',
  'I422AP12',
  'I444A',
  'I444AP10',
  'I444AP12',
  'RGBA',
  'BGRA',
]);

/**
 * Whether this browser draws an RGBA frame's colours as they are (WebCodecs'
 * frames aren't premultiplied): a grey 128 pixel at alpha 64, drawn and read
 * back. Firefox draws them as if premultiplied, so it reads back wrong.
 */
function drawsRgbaFramesAsTheyAre(): boolean {
  if (typeof VideoFrame === 'undefined') return false;
  let frame: VideoFrame | null = null;
  try {
    frame = new VideoFrame(Uint8Array.from([128, 128, 128, 64]), {
      format: 'RGBA',
      codedWidth: 1,
      codedHeight: 1,
      timestamp: 0,
    });
    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(1, 1)
        : Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
    const context = canvas.getContext('2d');
    if (!context) return false;
    context.drawImage(frame, 0, 0);
    const [red = 0, , , alpha = 0] = context.getImageData(0, 0, 1, 1).data;
    return Math.abs(red - 128) <= 8 && Math.abs(alpha - 64) <= 8;
  } catch {
    return false;
  } finally {
    frame?.close();
  }
}

/**
 * Whether this browser shows a transparent video's see-through parts as they
 * are: its first frame decodes with its alpha (mediabunny decodes a WebM's
 * alpha stream and puts it in each frame), and frames like it are drawn
 * right — Firefox's decoder gives RGBA frames, which it then draws wrongly.
 */
async function showsTransparency(mb: Mediabunny, track: InputVideoTrack): Promise<boolean> {
  try {
    const sample = await new mb.VideoSampleSink(track).getSample(await track.getFirstTimestamp());
    if (!sample) return false;
    try {
      const format = sample.format;
      if (!format || !ALPHA_FORMATS.has(format)) return false;
      return (format !== 'RGBA' && format !== 'BGRA') || drawsRgbaFramesAsTheyAre();
    } finally {
      sample.close();
    }
  } catch {
    return false;
  }
}

/**
 * What a video file is and whether this browser can show it: a decodable
 * video track (its codec named when it isn't), its size, length, frame rate
 * and sound. A GIF (known by its first bytes) is read as one.
 */
export async function probeVideo(file: Blob): Promise<VideoProbe> {
  if (await isGifFile(file)) return probeGif(file);
  const { mb, input } = await openMedia(file);
  try {
    if (!(await input.canRead())) {
      return problem(
        'not-a-video',
        'It isn’t a video this editor can read (MP4, MOV, WebM or GIF).'
      );
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
    const hasAlpha = await track.canBeTransparent();
    if (hasAlpha && !(await showsTransparency(mb, track))) {
      return problem('transparency', 'This browser can’t show its transparency correctly.');
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
        hasAlpha,
        videoCodec: codecName ?? 'an unknown codec',
        audioCodec: audio ? audioCodecName(audioCodec) : null,
        canDecodeAudio: audio ? await audio.canDecode() : false,
      },
    };
  } catch {
    // Its insides couldn't be made sense of
    return problem('not-a-video', 'It isn’t a video this editor can read (MP4, MOV, WebM or GIF).');
  } finally {
    input.dispose();
  }
}
