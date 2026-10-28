/**
 * Export Utilities
 *
 * Pure utility functions used across export modules.
 * No DOM or WebGL dependencies.
 */

import { transitionDirection, transitionFrameCount, transitionProgress } from '@quar/animation';
import type { SlideTransition, SlideTransitionDirection, SlideTransitionType } from '@quar/types';

/**
 * Get the number of frames in a range (inclusive).
 */
export function getFrameCount(startFrame: number, endFrame: number): number {
  return Math.max(0, endFrame - startFrame + 1);
}

export interface PlaybackTiming {
  /** The timeline's frame rate. */
  frameRate: number;
  startFrame: number;
  endFrame: number;
  /** Frames per second in the output (default: the timeline's). */
  fps?: number;
  /** Playback speed: 2 plays twice as fast, 0.5 at half speed. */
  speed?: number;
}

/**
 * The output frame rate (at most `maxFps`) and the timeline frame — possibly
 * between two — each output frame shows when the range plays at `speed`.
 * A lower rate keeps the duration with fewer frames; rates that don't divide
 * the timeline's show the in-between moments.
 */
export function sampleTimeline(
  options: PlaybackTiming,
  maxFps = Infinity
): { fps: number; frames: number[] } {
  const { startFrame, endFrame } = options;
  const rate = Math.max(1, options.frameRate);
  const fps = Math.min(maxFps, Math.max(1, options.fps ?? rate));
  const speed = options.speed !== undefined && options.speed > 0 ? options.speed : 1;
  const seconds = getFrameCount(startFrame, endFrame) / rate / speed;
  const count = Math.max(1, Math.round(seconds * fps));
  const step = (rate * speed) / fps;
  return {
    fps,
    frames: Array.from({ length: count }, (_, k) => Math.min(endFrame, startFrame + k * step)),
  };
}

/** One slide of a slides export: what it draws, over its own timeline's whole length. */
export interface ExportSlide<Context> {
  ctx: Context;
  /** Its timeline's length, in frames */
  frameCount: number;
  /** How it comes on after the slide before (none: a cut; the first slide's plays no part) */
  transition?: SlideTransition | null;
}

/**
 * Partway through the transition into a slide: the outgoing slide held on
 * the frame it ended on, the incoming one (the shot's own) on its first.
 */
export interface ShotTransition<Context> {
  /** The outgoing slide, and the frame it holds */
  from: { ctx: Context; frame: number };
  type: SlideTransitionType;
  direction: SlideTransitionDirection;
  /** How far it has got, eased: 0 shows all the outgoing slide, 1 all the incoming one */
  progress: number;
}

/**
 * What an output frame shows: which slide's drawing, at which of its
 * timeline's frames — or, with `transition`, that slide on its way in.
 */
export interface Shot<Context> {
  ctx: Context;
  frame: number;
  transition?: ShotTransition<Context>;
}

/**
 * The output frames of slides played one after another, each its whole
 * timeline, at the same frame rate and speed (as `sampleTimeline` plays one).
 * Between two slides, the transition into the second (if it has one) plays
 * over its length at that rate and speed: the outgoing slide held on the
 * frame it ended on, the incoming one on its first, its progress stepping
 * evenly from the one to the other (neither end repeated); then the
 * incoming slide's timeline starts.
 */
export function sampleSlides<Context>(
  slides: readonly ExportSlide<Context>[],
  timing: Omit<PlaybackTiming, 'startFrame' | 'endFrame'>,
  maxFps = Infinity
): { fps: number; shots: Shot<Context>[] } {
  const fps = Math.min(maxFps, Math.max(1, timing.fps ?? timing.frameRate));
  const shots: Shot<Context>[] = [];
  let before: { ctx: Context; frame: number } | null = null;
  for (const slide of slides) {
    if (slide.frameCount < 1) continue;
    const sampled = sampleTimeline(
      { ...timing, startFrame: 0, endFrame: slide.frameCount - 1 },
      maxFps
    );
    const transition = before ? slide.transition : null;
    const count = transitionFrameCount(transition, fps, timing.speed);
    if (transition && before) {
      for (let k = 0; k < count; k++) {
        shots.push({
          ctx: slide.ctx,
          frame: 0,
          transition: {
            from: before,
            type: transition.type,
            direction: transitionDirection(transition),
            progress: transitionProgress(transition, (k + 1) / (count + 1)),
          },
        });
      }
    }
    for (const frame of sampled.frames) shots.push({ ctx: slide.ctx, frame });
    before = { ctx: slide.ctx, frame: sampled.frames.at(-1) ?? slide.frameCount - 1 };
  }
  return { fps, shots };
}

/** Whether any of the shots is partway through a transition. */
export function hasTransitions<Context>(shots: readonly Shot<Context>[]): boolean {
  return shots.some((shot) => shot.transition);
}

/**
 * Generate filenames for a frame sequence.
 *
 * Pattern supports {N} placeholder for frame number (zero-padded).
 */
export function generateFrameFilenames(
  pattern: string,
  startFrame: number,
  endFrame: number,
  extension: string
): string[] {
  const count = getFrameCount(startFrame, endFrame);
  const padLength = String(endFrame).length;
  const names: string[] = [];

  for (let i = 0; i < count; i++) {
    const frame = startFrame + i;
    const paddedFrame = String(frame).padStart(padLength, '0');
    const base = pattern.includes('{N}')
      ? pattern.replace('{N}', paddedFrame)
      : count > 1
        ? `${pattern}_${paddedFrame}`
        : pattern;
    const filename = base + '.' + extension;
    names.push(filename);
  }

  return names;
}
