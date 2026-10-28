import { describe, expect, it, vi } from 'vitest';
import type { SlideTransitionDirection } from '@quar/types';
import type { FrameRenderContext } from './frameRenderer';
import {
  createShotRenderer,
  drawTransition,
  transitionDraw,
  type TransitionLayer,
  type TransitionTarget,
} from './slideTransition';

const W = 400;
const H = 200;
const at = (layers: TransitionLayer[], image: 'from' | 'to') =>
  layers.find((layer) => layer.image === image);

describe('what a transition draws', () => {
  it('fade: the two cross-dissolved, adding up', () => {
    const draw = transitionDraw('fade', 'left', 0.25, W, H);
    expect(draw.blend).toBe('add');
    expect(draw.background).toBe(false);
    expect(draw.layers).toEqual([
      { image: 'from', x: 0, y: 0, alpha: 0.75 },
      { image: 'to', x: 0, y: 0, alpha: 0.25 },
    ]);
    // All one, then all the other
    expect(transitionDraw('fade', 'left', 0, W, H).layers.map((l) => l.alpha)).toEqual([1, 0]);
    expect(transitionDraw('fade', 'left', 1, W, H).layers.map((l) => l.alpha)).toEqual([0, 1]);
  });

  it('fade-through: out to the background, then in from it', () => {
    const out = transitionDraw('fade-through', 'left', 0.25, W, H);
    expect(out.background).toBe(true);
    expect(out.layers).toEqual([{ image: 'from', x: 0, y: 0, alpha: 0.5 }]);
    // Halfway: only the background
    expect(transitionDraw('fade-through', 'left', 0.5, W, H).layers).toEqual([
      { image: 'to', x: 0, y: 0, alpha: 0 },
    ]);
    expect(transitionDraw('fade-through', 'left', 0.75, W, H).layers).toEqual([
      { image: 'to', x: 0, y: 0, alpha: 0.5 },
    ]);
    expect(transitionDraw('fade-through', 'left', 1, W, H).layers[0]?.alpha).toBe(1);
  });

  it.each<[SlideTransitionDirection, { x: number; y: number }, { x: number; y: number }]>([
    ['left', { x: -100, y: 0 }, { x: 300, y: 0 }],
    ['right', { x: 100, y: 0 }, { x: -300, y: 0 }],
    ['up', { x: 0, y: -50 }, { x: 0, y: 150 }],
    ['down', { x: 0, y: 50 }, { x: 0, y: -150 }],
  ])('push %s: both move, the incoming one in from the far edge', (direction, from, to) => {
    const { layers } = transitionDraw('push', direction, 0.25, W, H);
    expect(at(layers, 'from')).toMatchObject({ ...from, alpha: 1 });
    expect(at(layers, 'to')).toMatchObject({ ...to, alpha: 1 });
    // Drawn in order: the incoming one last
    expect(layers.map((l) => l.image)).toEqual(['from', 'to']);
  });

  it('push: the two meet without a seam, in whole pixels', () => {
    for (const t of [0, 1 / 3, 0.5, 0.71, 1]) {
      const { layers } = transitionDraw('push', 'left', t, 100, 50);
      const from = at(layers, 'from')!;
      const to = at(layers, 'to')!;
      expect(to.x - from.x).toBe(100);
      expect(Number.isInteger(from.x)).toBe(true);
    }
    // At its ends: all the outgoing slide, then all the incoming one
    expect(at(transitionDraw('push', 'left', 0, W, H).layers, 'to')?.x).toBe(W);
    expect(at(transitionDraw('push', 'left', 1, W, H).layers, 'to')?.x).toBe(0);
    expect(at(transitionDraw('push', 'left', 1, W, H).layers, 'from')?.x).toBe(-W);
  });

  it.each<[SlideTransitionDirection, { x: number; y: number }]>([
    ['left', { x: 300, y: 0 }],
    ['right', { x: -300, y: 0 }],
    ['up', { x: 0, y: 150 }],
    ['down', { x: 0, y: -150 }],
  ])('slide-over %s: the incoming one moves in over the outgoing one, which holds', (d, to) => {
    const { layers } = transitionDraw('slide-over', d, 0.25, W, H);
    expect(layers).toEqual([
      { image: 'from', x: 0, y: 0, alpha: 1 },
      { image: 'to', ...to, alpha: 1 },
    ]);
  });

  it.each<[SlideTransitionDirection, object, object]>([
    ['left', { x: 300, y: 0, width: 100, height: H }, { x: 0, y: 0, width: 300, height: H }],
    ['right', { x: 0, y: 0, width: 100, height: H }, { x: 100, y: 0, width: 300, height: H }],
    ['up', { x: 0, y: 150, width: W, height: 50 }, { x: 0, y: 0, width: W, height: 150 }],
    ['down', { x: 0, y: 0, width: W, height: 50 }, { x: 0, y: 50, width: W, height: 150 }],
  ])('wipe %s: the incoming one revealed by a moving edge', (d, revealed, rest) => {
    const { layers } = transitionDraw('wipe', d, 0.25, W, H);
    expect(at(layers, 'to')).toEqual({ image: 'to', x: 0, y: 0, alpha: 1, clip: revealed });
    expect(at(layers, 'from')).toEqual({ image: 'from', x: 0, y: 0, alpha: 1, clip: rest });
  });

  it('wipe: nothing revealed at the start, everything at the end', () => {
    expect(at(transitionDraw('wipe', 'left', 0, W, H).layers, 'to')?.clip?.width).toBe(0);
    expect(at(transitionDraw('wipe', 'left', 1, W, H).layers, 'from')?.clip?.width).toBe(0);
    expect(at(transitionDraw('wipe', 'left', 1, W, H).layers, 'to')?.clip?.width).toBe(W);
  });

  it('keeps progress within 0–1', () => {
    expect(transitionDraw('fade', 'left', 2, W, H).layers[1]?.alpha).toBe(1);
    expect(transitionDraw('fade', 'left', Number.NaN, W, H).layers[0]?.alpha).toBe(1);
  });
});

/** A 2D context that writes down what's done with it. */
function recordingContext(width = W, height = H) {
  const calls: Array<[string, ...unknown[]]> = [];
  const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '' };
  const record =
    (name: string) =>
    (...args: unknown[]) =>
      calls.push([name, ...args]);
  const context = {
    canvas: { width, height },
    save: record('save'),
    restore: record('restore'),
    setTransform: record('setTransform'),
    clearRect: record('clearRect'),
    beginPath: record('beginPath'),
    clip: record('clip'),
    rect: record('rect'),
    fillRect: (...args: unknown[]) => calls.push(['fillRect', state.fillStyle, ...args]),
    drawImage: (...args: unknown[]) =>
      calls.push(['drawImage', state.globalCompositeOperation, state.globalAlpha, ...args]),
    get globalAlpha() {
      return state.globalAlpha;
    },
    set globalAlpha(value: number) {
      state.globalAlpha = value;
    },
    get globalCompositeOperation() {
      return state.globalCompositeOperation;
    },
    set globalCompositeOperation(value: string) {
      state.globalCompositeOperation = value;
    },
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(value: string) {
      state.fillStyle = value;
    },
  };
  return { context: context as unknown as TransitionTarget, calls };
}

const FROM = { name: 'from' } as unknown as CanvasImageSource;
const TO = { name: 'to' } as unknown as CanvasImageSource;
const draws = (calls: Array<[string, ...unknown[]]>) =>
  calls.filter(([name]) => name === 'drawImage');

describe('drawing a transition', () => {
  const black = { r: 0, g: 0, b: 0, a: 1 };

  it('cross-dissolves with the two added up, on a cleared canvas', () => {
    const { context, calls } = recordingContext();
    drawTransition(
      context,
      { from: FROM, to: TO },
      transitionDraw('fade', 'left', 0.25, W, H),
      black
    );
    expect(calls[0]).toEqual(['save']);
    expect(calls).toContainEqual(['clearRect', 0, 0, W, H]);
    // No background for a crossfade: both slides have it
    expect(calls.some(([name]) => name === 'fillRect')).toBe(false);
    expect(draws(calls)).toEqual([
      ['drawImage', 'lighter', 0.75, FROM, 0, 0],
      ['drawImage', 'lighter', 0.25, TO, 0, 0],
    ]);
  });

  it('fades through the background colour (none, when transparent)', () => {
    const { context, calls } = recordingContext();
    const draw = transitionDraw('fade-through', 'left', 0.25, W, H);
    drawTransition(context, { from: FROM, to: TO }, draw, { r: 26, g: 26, b: 26, a: 1 });
    expect(calls).toContainEqual(['fillRect', 'rgba(26, 26, 26, 1)', 0, 0, W, H]);
    expect(draws(calls)).toEqual([['drawImage', 'source-over', 0.5, FROM, 0, 0]]);

    const clear = recordingContext();
    drawTransition(clear.context, { from: FROM, to: TO }, draw, null);
    expect(clear.calls.some(([name]) => name === 'fillRect')).toBe(false);
  });

  it('draws a wipe’s parts clipped, and leaves out what shows nothing', () => {
    const { context, calls } = recordingContext();
    drawTransition(
      context,
      { from: FROM, to: TO },
      transitionDraw('wipe', 'down', 0.5, W, H),
      null
    );
    expect(calls.filter(([name]) => name === 'rect')).toEqual([
      ['rect', 0, 100, W, 100],
      ['rect', 0, 0, W, 100],
    ]);
    expect(draws(calls).map((call) => call[3])).toEqual([FROM, TO]);

    const start = recordingContext();
    drawTransition(
      start.context,
      { from: FROM, to: TO },
      transitionDraw('wipe', 'down', 0, W, H),
      null
    );
    expect(draws(start.calls).map((call) => call[3])).toEqual([FROM]);
  });

  it('moves a push’s slides by their offsets', () => {
    const { context, calls } = recordingContext();
    drawTransition(context, { from: FROM, to: TO }, transitionDraw('push', 'up', 0.5, W, H), null);
    expect(draws(calls)).toEqual([
      ['drawImage', 'source-over', 1, FROM, 0, -100],
      ['drawImage', 'source-over', 1, TO, 0, 100],
    ]);
  });
});

describe('drawing an export’s shots', () => {
  /** Canvases that keep their 2D drawing's calls, and a renderer drawing on one of its own. */
  function setup() {
    const made: Array<{ canvas: HTMLCanvasElement; calls: Array<[string, ...unknown[]]> }> = [];
    const createCanvas = () => {
      const { context, calls } = recordingContext(0, 0);
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => context,
        toBlob: (done: (blob: Blob | null) => void) => done(new Blob(['png'])),
      } as unknown as HTMLCanvasElement;
      (context as unknown as { canvas: HTMLCanvasElement }).canvas = canvas;
      made.push({ canvas, calls });
      return canvas;
    };
    const screen = { width: W, height: H, name: 'webgl' } as unknown as HTMLCanvasElement;
    const renderFrame = vi.fn((_ctx: FrameRenderContext, _frame: number) => screen);
    return { made, createCanvas, screen, renderFrame };
  }
  const a = { name: 'slide a' } as unknown as FrameRenderContext;
  const b = { name: 'slide b' } as unknown as FrameRenderContext;
  const into = (progress: number, fromFrame = 29) => ({
    ctx: b,
    frame: 0,
    transition: {
      from: { ctx: a, frame: fromFrame },
      type: 'fade' as const,
      direction: 'left' as const,
      progress,
    },
  });

  it('draws a plain shot with the frame renderer, as it is', () => {
    const { createCanvas, screen, renderFrame, made } = setup();
    const shots = createShotRenderer({ renderFrame }, { background: null, createCanvas });
    expect(shots.render({ ctx: a, frame: 3 })).toBe(screen);
    expect(renderFrame).toHaveBeenCalledWith(a, 3);
    expect(made).toHaveLength(0);
  });

  it('holds a transition’s two frames, drawing each once, the outgoing one from the frame just shown', () => {
    const { createCanvas, renderFrame, made } = setup();
    const shots = createShotRenderer({ renderFrame }, { background: null, createCanvas });
    shots.render({ ctx: a, frame: 29 });
    renderFrame.mockClear();

    const first = shots.render(into(0.1));
    shots.render(into(0.5));
    const last = shots.render(into(0.9));
    // Only the incoming slide's first frame is drawn: the outgoing one was on screen already
    expect(renderFrame.mock.calls).toEqual([[b, 0]]);
    expect(first).toBe(last);
    expect([first.width, first.height]).toEqual([W, H]);
    // The out canvas got the blend each time: the two held frames, cross-dissolved
    const out = made.find((one) => one.canvas === first)!;
    const blends = draws(out.calls);
    expect(blends).toHaveLength(6);
    expect(blends.slice(-2).map((call) => call[2])).toEqual([0.09999999999999998, 0.9]);

    // Then the incoming slide plays from its start
    shots.render({ ctx: b, frame: 0 });
    expect(renderFrame).toHaveBeenLastCalledWith(b, 0);
  });

  it('draws the outgoing frame when it isn’t the one just drawn', () => {
    const { createCanvas, renderFrame } = setup();
    const shots = createShotRenderer({ renderFrame }, { background: null, createCanvas });
    shots.render({ ctx: a, frame: 12 });
    renderFrame.mockClear();
    shots.render(into(0.2, 29));
    expect(renderFrame.mock.calls).toEqual([
      [a, 29],
      [b, 0],
    ]);
  });

  it('draws every shot on one canvas, when fixed (a video’s source)', () => {
    const { createCanvas, renderFrame, screen } = setup();
    const shots = createShotRenderer(
      { renderFrame },
      { background: null, createCanvas, fixed: true }
    );
    const plain = shots.render({ ctx: a, frame: 29 });
    expect(plain).not.toBe(screen);
    expect(shots.render(into(0.5))).toBe(plain);
    expect(shots.render({ ctx: b, frame: 0 })).toBe(plain);
  });

  it('gives a shot as a PNG', async () => {
    const { createCanvas, renderFrame } = setup();
    const shots = createShotRenderer({ renderFrame }, { background: null, createCanvas });
    shots.render({ ctx: a, frame: 29 });
    expect(await shots.renderAsBlob(into(0.5))).toBeInstanceOf(Blob);
  });
});
