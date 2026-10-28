/**
 * Slide Transitions — the compositor
 *
 * One slide giving way to the next, drawn the same way for every output
 * (MP4, WebM, GIF, PNG sequence and the presentation player): from the
 * outgoing slide's held frame and the incoming one's first, both already
 * fitted into the output's size (each slide's viewport is widened to it),
 * and how far the transition has got.
 *
 * `transitionDraw` works out what goes where at a moment (pure, tested);
 * `drawTransition` draws that on a 2D canvas; `createShotRenderer` draws an
 * export's shots, holding each transition's two frames as it plays.
 */

import type { Color, SlideTransitionDirection, SlideTransitionType } from '@quar/types';
import type { Shot } from './exportUtils';
import type { FrameRenderContext, FrameRendererHandle } from './frameRenderer';

/** A rectangle of the output, in pixels. */
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One of the two slides, drawn at an offset, so opaque, within a part of the output. */
export interface TransitionLayer {
  /** The outgoing slide's held frame, or the incoming one's first */
  image: 'from' | 'to';
  /** Where its top-left corner goes, in pixels */
  x: number;
  y: number;
  /** 0–1 */
  alpha: number;
  /** The part of the output it shows (all of it when absent) */
  clip?: PixelRect;
}

/** What a transition draws at a moment, in order. */
export interface TransitionDraw {
  /** The background colour first (a fade through it) */
  background: boolean;
  /** `add`: the layers add up, a cross-dissolve; `over`: each over the ones before */
  blend: 'add' | 'over';
  layers: TransitionLayer[];
}

/** The way each direction moves, on screen (y down). */
const MOTION: Record<SlideTransitionDirection, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

/**
 * What a transition draws `progress` of the way through (eased, 0–1) on a
 * `width` × `height` output:
 * - fade: the two cross-dissolved;
 * - fade-through: the outgoing slide out to the background, then the incoming one in;
 * - push: both moving the one way, the incoming one pushing the outgoing off;
 * - slide-over: the incoming one moving in over the outgoing one, which holds still;
 * - wipe: the incoming one revealed by an edge moving the one way.
 * Moves are whole pixels, so the two slides of a push meet without a seam.
 */
export function transitionDraw(
  type: SlideTransitionType,
  direction: SlideTransitionDirection,
  progress: number,
  width: number,
  height: number
): TransitionDraw {
  const t = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  if (type === 'fade') {
    return {
      background: false,
      blend: 'add',
      layers: [
        { image: 'from', x: 0, y: 0, alpha: 1 - t },
        { image: 'to', x: 0, y: 0, alpha: t },
      ],
    };
  }
  if (type === 'fade-through') {
    return {
      background: true,
      blend: 'over',
      layers:
        t < 0.5
          ? [{ image: 'from', x: 0, y: 0, alpha: 1 - 2 * t }]
          : [{ image: 'to', x: 0, y: 0, alpha: 2 * t - 1 }],
    };
  }

  const way = MOTION[direction];
  const span = way.x !== 0 ? width : height;
  const shift = Math.round(t * span);
  // `distance` along the motion (+ 0: never -0)
  const along = (distance: number) => ({ x: way.x * distance + 0, y: way.y * distance + 0 });
  // Where the incoming slide is, coming in from the edge the motion starts at
  const incoming = along(shift - span);
  if (type === 'push') {
    return {
      background: false,
      blend: 'over',
      layers: [
        { image: 'from', ...along(shift), alpha: 1 },
        { image: 'to', ...incoming, alpha: 1 },
      ],
    };
  }
  if (type === 'slide-over') {
    return {
      background: false,
      blend: 'over',
      layers: [
        { image: 'from', x: 0, y: 0, alpha: 1 },
        { image: 'to', ...incoming, alpha: 1 },
      ],
    };
  }

  // A wipe: the part revealed grows from the edge it comes in at; the rest still shows the outgoing slide
  const { revealed, rest } = wipeParts(direction, shift, width, height);
  return {
    background: false,
    blend: 'over',
    layers: [
      { image: 'from', x: 0, y: 0, alpha: 1, clip: rest },
      { image: 'to', x: 0, y: 0, alpha: 1, clip: revealed },
    ],
  };
}

/** A wipe's two parts, `shift` pixels revealed. */
function wipeParts(
  direction: SlideTransitionDirection,
  shift: number,
  width: number,
  height: number
): { revealed: PixelRect; rest: PixelRect } {
  switch (direction) {
    case 'left':
      return {
        revealed: { x: width - shift, y: 0, width: shift, height },
        rest: { x: 0, y: 0, width: width - shift, height },
      };
    case 'right':
      return {
        revealed: { x: 0, y: 0, width: shift, height },
        rest: { x: shift, y: 0, width: width - shift, height },
      };
    case 'up':
      return {
        revealed: { x: 0, y: height - shift, width, height: shift },
        rest: { x: 0, y: 0, width, height: height - shift },
      };
    case 'down':
      return {
        revealed: { x: 0, y: 0, width, height: shift },
        rest: { x: 0, y: shift, width, height: height - shift },
      };
  }
}

/** The 2D drawing a transition needs (a canvas's context, or a stand-in in tests). */
export type TransitionTarget = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'setTransform'
  | 'clearRect'
  | 'fillRect'
  | 'beginPath'
  | 'rect'
  | 'clip'
  | 'drawImage'
  | 'fillStyle'
  | 'globalAlpha'
  | 'globalCompositeOperation'
> & { canvas: { width: number; height: number } };

/**
 * Draw a transition on `target` (its whole canvas): what `draw` says, from
 * the two slides' frames (each the canvas's size), on `background` where
 * it shows (nothing, for a transparent output).
 */
export function drawTransition(
  target: TransitionTarget,
  frames: Record<TransitionLayer['image'], CanvasImageSource>,
  draw: TransitionDraw,
  background: Color | null
): void {
  const { width, height } = target.canvas;
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.globalCompositeOperation = 'source-over';
  target.globalAlpha = 1;
  target.clearRect(0, 0, width, height);
  if (draw.background && background) {
    target.fillStyle = `rgba(${background.r}, ${background.g}, ${background.b}, ${background.a})`;
    target.fillRect(0, 0, width, height);
  }
  for (const layer of draw.layers) {
    if (!(layer.alpha > 0)) continue;
    const clip = layer.clip;
    if (clip && (clip.width <= 0 || clip.height <= 0)) continue;
    target.save();
    if (clip) {
      target.beginPath();
      target.rect(clip.x, clip.y, clip.width, clip.height);
      target.clip();
    }
    // Added up, a cross-dissolve keeps whole what both slides cover, transparent or not
    target.globalCompositeOperation = draw.blend === 'add' ? 'lighter' : 'source-over';
    target.globalAlpha = Math.min(1, layer.alpha);
    target.drawImage(frames[layer.image], layer.x, layer.y);
    target.restore();
  }
  target.restore();
}

/** Draws an export's shots, transitions too. */
export interface ShotRenderer {
  /**
   * Draw a shot. A plain one is the frame renderer's canvas (the shot
   * canvas with `fixed`); a transition is drawn on the shot canvas.
   */
  render(shot: Shot<FrameRenderContext>): HTMLCanvasElement;
  /** Draw a shot, as a PNG */
  renderAsBlob(shot: Shot<FrameRenderContext>): Promise<Blob | null>;
}

export interface ShotRendererOptions {
  /** What a fade through shows between the slides (null: nothing, for a transparent output) */
  background: Color | null;
  /** Every shot on the one canvas (a video's source draws from one) */
  fixed?: boolean;
  /** Makes the canvases it draws on (a stand-in, in tests) */
  createCanvas?: () => HTMLCanvasElement;
}

type Held = { ctx: FrameRenderContext; frame: number };
const sameShot = (a: Held | null, b: Held) => !!a && a.ctx === b.ctx && a.frame === b.frame;

/**
 * Draw shots with `renderer`. A transition's two frames are drawn once
 * each as it begins and held while it plays: the outgoing slide's is taken
 * from the frame just drawn when that's the one it holds (as it is in an
 * export and the player), so it isn't drawn again — which, with physics,
 * would start the simulation over.
 */
export function createShotRenderer(
  renderer: Pick<FrameRendererHandle, 'renderFrame'>,
  options: ShotRendererOptions
): ShotRenderer {
  const make = options.createCanvas ?? (() => document.createElement('canvas'));
  let canvases: Record<'from' | 'to' | 'out', HTMLCanvasElement> | null = null;
  // The plain shot drawn last (still on the renderer's canvas), and the frames a transition holds
  let last: { shot: Held; canvas: HTMLCanvasElement } | null = null;
  let heldFrom: Held | null = null;
  let heldTo: Held | null = null;

  const draw2d = (canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create a canvas to draw slide transitions on.');
    return context;
  };

  /** The three canvases, the size of the renderer's (made, or resized, as needed). */
  const sized = (width: number, height: number) => {
    canvases ??= { from: make(), to: make(), out: make() };
    for (const canvas of Object.values(canvases)) {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        heldFrom = heldTo = null;
      }
    }
    return canvases;
  };

  /** A frame copied onto one of the canvases. */
  const copy = (source: HTMLCanvasElement, onto: HTMLCanvasElement) => {
    const context = draw2d(onto);
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
    context.clearRect(0, 0, onto.width, onto.height);
    context.drawImage(source, 0, 0);
  };

  function render(shot: Shot<FrameRenderContext>): HTMLCanvasElement {
    const transition = shot.transition;
    if (!transition) {
      const drawn = renderer.renderFrame(shot.ctx, shot.frame);
      last = { shot: { ctx: shot.ctx, frame: shot.frame }, canvas: drawn };
      // A transition after this one draws its frames afresh
      heldFrom = heldTo = null;
      if (!options.fixed) return drawn;
      const out = sized(drawn.width, drawn.height).out;
      copy(drawn, out);
      return out;
    }

    const into = { ctx: shot.ctx, frame: shot.frame };
    let held = canvases;
    if (!held || !sameShot(heldFrom, transition.from) || !sameShot(heldTo, into)) {
      // The outgoing slide's frame: the one just drawn, or drawn now
      const shown = last && sameShot(last.shot, transition.from) ? last.canvas : null;
      const from = shown ?? renderer.renderFrame(transition.from.ctx, transition.from.frame);
      held = sized(from.width, from.height);
      copy(from, held.from);
      copy(renderer.renderFrame(into.ctx, into.frame), held.to);
      heldFrom = transition.from;
      heldTo = into;
      last = null;
    }
    drawTransition(
      draw2d(held.out),
      { from: held.from, to: held.to },
      transitionDraw(
        transition.type,
        transition.direction,
        transition.progress,
        held.out.width,
        held.out.height
      ),
      options.background
    );
    return held.out;
  }

  function renderAsBlob(shot: Shot<FrameRenderContext>): Promise<Blob | null> {
    const canvas = render(shot);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
  }

  return { render, renderAsBlob };
}
