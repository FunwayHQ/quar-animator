/**
 * Timeline ruler spacing: label as many frames as fit at the current zoom, at
 * "nice" intervals (1, 2, 5, 10 frames, half a second, a second, ...), with
 * unlabelled ticks between labels.
 */

/** Labels need room for numbers like "1200". */
export const MIN_LABEL_SPACING_PX = 48;
export const MIN_TICK_SPACING_PX = 6;

/** Candidate intervals in frames, ascending. */
export function rulerIntervals(frameRate: number): number[] {
  const fps = Math.max(1, Math.round(frameRate));
  const candidates = [1, 2, 5, 10, fps % 2 === 0 ? fps / 2 : 0];
  for (const seconds of [1, 2, 5, 10, 30, 60, 120, 300, 600]) candidates.push(fps * seconds);
  return [...new Set(candidates.filter((c) => c >= 1))].sort((a, b) => a - b);
}

export interface RulerScale {
  /** Frames between labelled marks. */
  labelStep: number;
  /** Frames between unlabelled ticks, or null when they'd be too dense. */
  tickStep: number | null;
  /** Frames that get a label. */
  labels: number[];
}

/**
 * Pick label and tick intervals for a ruler `widthPx` wide showing `duration`
 * frames. An unmeasured ruler (width 0) gets roughly ten labels.
 */
export function getRulerScale(duration: number, frameRate: number, widthPx: number): RulerScale {
  const frames = Math.max(1, Math.round(duration));
  const intervals = rulerIntervals(frameRate);
  const pxPerFrame = widthPx / frames;

  let labelStep: number;
  if (pxPerFrame > 0) {
    labelStep =
      intervals.find((step) => step * pxPerFrame >= MIN_LABEL_SPACING_PX) ??
      intervals[intervals.length - 1]!;
  } else {
    labelStep = intervals.find((step) => step >= frames / 10) ?? intervals[intervals.length - 1]!;
  }

  const tickStep =
    pxPerFrame > 0
      ? (intervals.find(
          (step) =>
            step < labelStep && labelStep % step === 0 && step * pxPerFrame >= MIN_TICK_SPACING_PX
        ) ?? null)
      : null;

  const labels: number[] = [];
  for (let frame = 0; frame < frames; frame += labelStep) labels.push(frame);
  return { labelStep, tickStep, labels };
}
