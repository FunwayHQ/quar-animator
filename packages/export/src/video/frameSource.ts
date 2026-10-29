/**
 * A video's frames, decoded as they're asked for: whatever's decoded
 * nearest the moment asked for is given at once (a canvas drawn every
 * animation frame can't wait), and the moment itself is decoded meanwhile.
 * While it plays it decodes on through the video a few frames ahead;
 * when the playhead jumps it seeks, only to the latest moment asked for.
 * A handful of pictures are kept, in canvases of a pool drawn over in turn.
 */

import type { CanvasSink, Input, WrappedCanvas } from 'mediabunny';
import { openMedia, videoTrackOf } from './media';

/** A decoded picture of the video. */
export interface DecodedFrame {
  /** The picture: a canvas of the source's, drawn over once it's no longer kept */
  canvas: HTMLCanvasElement | OffscreenCanvas;
  /** When it shows in the video, from and for how long, in seconds */
  timestamp: number;
  duration: number;
  /** Different for each picture decoded */
  key: number;
}

/** The picture given for a moment, and how far the moment is from it (0: it's that moment's). */
export interface FramePick {
  frame: DecodedFrame;
  distance: number;
}

export interface VideoFrameSource {
  /**
   * The decoded picture nearest `seconds` into the video (null while none
   * is), the one at `seconds` decoded if it isn't there yet. `playing`
   * says the moments asked for run on, so it decodes on ahead.
   */
  frameAt(seconds: number, playing?: boolean): FramePick | null;
  /** Resolves once the video is open to decode (rejects if it can't be) */
  readonly ready: Promise<void>;
  /** Stop decoding and let the video and its pictures go. */
  dispose(): void;
}

export interface VideoFrameSourceOptions {
  /** The pictures' longest side at most, in pixels (default 1920; never larger than the video) */
  maxSize?: number;
  /** Pictures kept decoded (default 6, 3 at least) */
  keep?: number;
  /** Hears each picture decoded */
  onFrame?: (frame: DecodedFrame) => void;
}

const MAX_SIZE = 1920;
const KEEP = 6;
/** While playing, a moment this far past the frames decoded is decoded on to; further, a run starts there */
const PLAYING_RUN_ON = 2;
/** Stopped, the playhead stepped on this far is decoded on to; further, it seeks */
const STEPPING_RUN_ON = 0.5;
/** A run not decoded on for this long is let go (it holds decoded frames), in ms */
const RUN_IDLE = 2000;
/** Moments are nudged on by this much: a frame boundary in floating point lands in the frame it begins */
const NUDGE = 1e-5;

/** How far, in seconds, a moment is from a frame's span (0 inside it). */
function distanceTo(frame: DecodedFrame, at: number): number {
  if (at < frame.timestamp) return frame.timestamp - at;
  return Math.max(0, at - (frame.timestamp + frame.duration));
}

/** Whether a frame is the one shown at a moment. */
function covers(frame: DecodedFrame, at: number): boolean {
  return frame.timestamp <= at && at < frame.timestamp + Math.max(frame.duration, 2 * NUDGE);
}

export function createVideoFrameSource(
  file: Blob,
  options: VideoFrameSourceOptions = {}
): VideoFrameSource {
  const keep = Math.max(3, Math.round(options.keep ?? KEEP));
  let disposed = false;
  let failed = false;
  let input: Input | null = null;
  let sink: CanvasSink | null = null;
  // Where the video's pictures are, in its own time
  let first = 0;
  let end = Infinity;

  /** The pictures kept, the oldest drawn first */
  const frames: DecodedFrame[] = [];
  let nextKey = 1;
  /** The latest moment asked for that isn't decoded (as asked; clamped when it's decoded) */
  let wanted: { seconds: number; playing: boolean } | null = null;
  /** The moment last asked for while playing: decoding runs on ahead of it */
  let playhead: number | null = null;
  /** A frame decoded for a moment it doesn't strictly span (an odd last frame): that moment's */
  let answered: { at: number; frame: DecodedFrame } | null = null;
  /** Decoding on through the video, and the timestamp of the last frame it gave */
  let run: {
    frames: AsyncGenerator<WrappedCanvas, void, unknown>;
    at: number;
    /** When it last gave a frame, in ms */
    used: number;
  } | null = null;
  let busy = false;

  const ready = (async () => {
    const opened = await openMedia(file);
    input = opened.input;
    if (disposed) {
      input.dispose();
      return;
    }
    const track = await videoTrackOf(input);
    const width = await track.getDisplayWidth();
    const height = await track.getDisplayHeight();
    const scale = Math.min(1, (options.maxSize ?? MAX_SIZE) / Math.max(width, height, 1));
    const size =
      scale >= 1
        ? {}
        : width >= height
          ? { width: Math.round(width * scale) }
          : { height: Math.round(height * scale) };
    first = await track.getFirstTimestamp();
    end = await track.computeDuration();
    sink = new opened.mb.CanvasSink(track, {
      ...size,
      alpha: await track.canBeTransparent(),
      poolSize: keep,
    });
  })();
  ready.catch(() => {
    failed = true;
  });

  /** A moment inside the video, where its pictures are. */
  const clamp = (seconds: number) =>
    Math.min(Math.max(seconds + NUDGE, first), Math.max(first, end - NUDGE));

  const decodedAt = (at: number): DecodedFrame | undefined =>
    frames.find((frame) => covers(frame, at)) ??
    (answered && answered.at === at && frames.includes(answered.frame)
      ? answered.frame
      : undefined);

  function nearest(at: number): DecodedFrame | undefined {
    let best: DecodedFrame | undefined;
    for (const frame of frames) {
      if (!best || distanceTo(frame, at) < distanceTo(best, at)) best = frame;
    }
    return best;
  }

  function keepFrame({ canvas, timestamp, duration }: WrappedCanvas): DecodedFrame {
    // The pool has drawn over its oldest canvas: the picture that was in it is gone
    const reused = frames.findIndex((frame) => frame.canvas === canvas);
    if (reused >= 0) frames.splice(reused, 1);
    const frame = { canvas, timestamp, duration, key: nextKey++ };
    frames.push(frame);
    if (frames.length > keep) frames.shift();
    options.onFrame?.(frame);
    return frame;
  }

  async function stopRun(): Promise<void> {
    const stopping = run;
    run = null;
    await stopping?.frames.return();
  }

  /** The run's next frame, kept; null at the video's end. */
  async function runOn(): Promise<DecodedFrame | null> {
    if (!run) return null;
    const current = run;
    const next = await current.frames.next();
    if (disposed) return null;
    if (next.done) {
      if (run === current) run = null;
      return null;
    }
    current.at = next.value.timestamp;
    current.used = Date.now();
    return keepFrame(next.value);
  }

  async function startRun(at: number): Promise<void> {
    if (!sink) return;
    await stopRun();
    run = { frames: sink.canvases(at), at: -Infinity, used: Date.now() };
    const frame = await runOn();
    if (frame) answered = { at, frame };
  }

  /** Decodes what's wanted, one thing at a time, until nothing is. */
  async function pump(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      await ready;
      while (!disposed && sink) {
        const want = wanted;
        if (want) {
          const at = clamp(want.seconds);
          if (decodedAt(at)) {
            if (wanted === want) wanted = null;
            continue;
          }
          const span = want.playing ? PLAYING_RUN_ON : STEPPING_RUN_ON;
          if (run && at >= run.at - NUDGE && at - run.at < span) {
            // Steadily on: the next frames are on their way already
            if (!(await runOn())) await startRun(at);
          } else if (want.playing) {
            await startRun(at);
          } else {
            // A jump: that moment alone, decoded from the keyframe before it
            await stopRun();
            if (wanted === want) wanted = null;
            const decoded = await sink.getCanvas(at);
            if (decoded && !disposed) answered = { at, frame: keepFrame(decoded) };
          }
          continue;
        }
        // Nothing missing: while playing, decode on a few frames past the playhead,
        // leaving the one shown and the one before it in the pool
        const ahead = playhead;
        if (ahead !== null && run && frames.filter((f) => f.timestamp > ahead).length < keep - 2) {
          if (!(await runOn())) break;
          continue;
        }
        break;
      }
    } catch (error) {
      if (!disposed) {
        failed = true;
        console.warn('A video stopped decoding:', error);
      }
    } finally {
      busy = false;
    }
  }

  return {
    ready,
    frameAt(seconds, playing = false) {
      if (disposed || failed || !Number.isFinite(seconds)) return null;
      const at = clamp(seconds);
      playhead = playing ? at : null;
      const exact = decodedAt(at);
      if (!exact) wanted = { seconds, playing };
      if (!exact || playing) void pump();
      // Stopped a while: the run (and the frames it decoded ahead) goes, the pictures kept stay
      else if (run && !busy && Date.now() - run.used > RUN_IDLE) void stopRun();
      if (exact) return { frame: exact, distance: 0 };
      const near = nearest(at);
      return near ? { frame: near, distance: distanceTo(near, at) } : null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      wanted = null;
      void stopRun();
      frames.length = 0;
      input?.dispose();
    },
  };
}
