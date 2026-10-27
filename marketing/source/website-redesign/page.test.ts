/**
 * Builds funwayinteractive.com's home page as a Quar Animator project from what
 * measure.mjs read off the live page (text.json, the hero picture, the logo),
 * with the site's own motion and a reveal sequence. Run by build-page.sh, which
 * puts it in the app's tests for one run (it uses the editor's own types, SVG
 * import, sequence compiler and .quar writer). Writes FUNWAY_OUT.
 */
import { it } from 'vitest';
import fs from 'node:fs';
import type {
  ArtboardNode,
  Color,
  EasingFunction,
  Effect,
  EllipseNode,
  Fill,
  Gradient,
  GradientStop,
  GroupNode,
  ImageNode,
  Node,
  PathNode,
  PathPoint,
  RectangleNode,
  Stroke,
  TextNode,
  Vector2,
} from '@quar/types';
import { SceneGraph, importSvg, DEFAULT_ONION_SKIN_SETTINGS } from '@quar/core';
import {
  addKeyframe,
  captureRestPose,
  compileAnimationSequence,
  createTimeline,
  getOrCreateTrack,
} from '@quar/animation';
import type { AnimationPresetId, AnimationSequenceStep } from '@quar/animation';
import { projectDataToBinary, type ProjectDataV2 } from './services/projectSerializer';

const DIR = process.env.FUNWAY_DIR ?? '';
const OUT = process.env.FUNWAY_OUT ?? `${DIR}/Funway.quar`;
const W = 1440;
const H = 3344;
const FPS = 30;
const DURATION = 420; // 14 s: every loop below fits a whole number of times
const X = (px: number) => px - W / 2;
const Y = (py: number) => H / 2 - py;

interface MeasuredLine {
  text: string;
  left: number;
  right: number;
  top: number;
  baseline: number;
}
interface MeasuredText {
  i: number;
  rect: { x: number; y: number; w: number; h: number };
  family: string;
  weight: number;
  size: number;
  lineHeight: number;
  ls: number;
  color: string;
  align: string;
  lines: MeasuredLine[];
}
interface MeasuredSvg {
  rect: { x: number; y: number; w: number; h: number };
  html: string;
  parent: string;
}

// ============================================================================
// Paint
// ============================================================================

const rgba = (r: number, g: number, b: number, a = 1): Color => ({ r, g, b, a });
const css = (value: string): Color => {
  const m = value.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`not a colour: ${value}`);
  const [r, g, b, a] = m[1]!.split(',').map((part) => Number.parseFloat(part));
  return rgba(r!, g!, b!, a ?? 1);
};
const RED = rgba(236, 30, 36);
const GOLD = rgba(212, 160, 60);
const GOLD_2 = rgba(232, 168, 56);
const WHITE = rgba(255, 255, 255);
const BODY = rgba(14, 15, 20);
const alpha = (color: Color, a: number): Color => ({ ...color, a });

const solid = (color: Color): Fill => ({ type: 'solid', color, opacity: 1, visible: true });
const gradientFill = (gradient: Gradient): Fill => ({
  type: 'gradient',
  gradient,
  color: gradient.stops[0]!.color,
  opacity: 1,
  visible: true,
});
const stops = (...list: Array<[number, Color]>): GradientStop[] =>
  list.map(([offset, color]) => ({ offset, color }));
/** Linear, between two points of the shape's box (0–1, Y up). */
const linear = (start: Vector2, end: Vector2, list: GradientStop[]): Fill =>
  gradientFill({ type: 'linear', stops: list, start, end, angle: 0 });
const radial = (center: Vector2, radius: number, list: GradientStop[]): Fill =>
  gradientFill({ type: 'radial', stops: list, center, radius });
const TOP_DOWN = [
  { x: 0.5, y: 1 },
  { x: 0.5, y: 0 },
] as const;
const DIAGONAL = [
  { x: 0, y: 1 },
  { x: 1, y: 0 },
] as const; // CSS 135deg

const inside = (color: Color, width = 1, gradient?: Gradient): Stroke => ({
  color,
  width,
  opacity: 1,
  cap: 'butt',
  join: 'miter',
  visible: true,
  align: 'inside',
  ...(gradient && { gradient }),
});
/** A border lighter along its top, as the site's glass edges are. */
const glassEdge = (bottom: number, top: number, base = WHITE): Stroke =>
  inside(alpha(base, bottom), 1, {
    type: 'linear',
    start: { x: 0.5, y: 0 },
    end: { x: 0.5, y: 1 },
    angle: 90,
    stops: stops([0, alpha(base, bottom)], [0.9, alpha(base, bottom)], [1, alpha(base, top)]),
  });

// Blurs are given as CSS writes them (2σ); the editor's are 3σ
const CSS_BLUR = 1.5;
let effectCount = 0;
const shadow = (color: Color, offsetY: number, blur: number, spread = 0, offsetX = 0): Effect => ({
  id: `fx-${++effectCount}`,
  type: 'drop-shadow',
  visible: true,
  color: alpha(color, 1),
  offsetX,
  offsetY,
  blur: blur * CSS_BLUR,
  spread,
  opacity: color.a,
});
const blur = (radius: number): Effect => ({
  id: `fx-${++effectCount}`,
  type: 'layer-blur',
  visible: true,
  radius: radius * CSS_BLUR,
});
const innerShadow = (color: Color, offsetY: number, blur: number): Effect => ({
  id: `fx-${++effectCount}`,
  type: 'inner-shadow',
  visible: true,
  color: alpha(color, 1),
  offsetX: 0,
  offsetY,
  blur: blur * CSS_BLUR,
  spread: 0,
  opacity: color.a,
});

/** A CSS linear-gradient's colour at a point of the box it fills. */
function cssLinearAt(
  angle: number,
  list: Array<[number, Color]>,
  box: { x: number; y: number; w: number; h: number },
  x: number,
  y: number
): Color {
  const a = (angle * Math.PI) / 180;
  const length = Math.abs(box.w * Math.sin(a)) + Math.abs(box.h * Math.cos(a));
  const t =
    0.5 + ((x - box.x - box.w / 2) * Math.sin(a) - (y - box.y - box.h / 2) * Math.cos(a)) / length;
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 1; i < list.length; i++) {
    const [o1, c1] = list[i]!;
    const [o0, c0] = list[i - 1]!;
    if (clamped <= o1) {
      const f = o1 > o0 ? (clamped - o0) / (o1 - o0) : 0;
      const mix = (p: number, q: number) => Math.round(p + (q - p) * f);
      return rgba(mix(c0.r, c1.r), mix(c0.g, c1.g), mix(c0.b, c1.b), c0.a + (c1.a - c0.a) * f);
    }
  }
  return list.at(-1)![1];
}

// ============================================================================
// Nodes
// ============================================================================

const nodes: Node[] = [];
const byId = new Map<string, Node>();
let count = 0;
const id = () => `fw-${++count}`;
function add<T extends Node>(node: T): T {
  nodes.push(node);
  byId.set(node.id, node);
  return node;
}
function base(name: string, parent: string | null, x = 0, y = 0) {
  return {
    id: id(),
    name,
    parent,
    children: [] as string[],
    transform: {
      position: { x, y },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal' as const,
  };
}

function group(name: string, parent: string | null): GroupNode {
  const node = base(name, parent);
  return add({ ...node, transform: { ...node.transform, anchor: { x: 0, y: 0 } }, type: 'group' });
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
function rect(
  name: string,
  parent: string,
  box: Box,
  paint: {
    fills?: Fill[];
    strokes?: Stroke[];
    radius?: number;
    effects?: Effect[];
    opacity?: number;
  } = {}
): RectangleNode {
  const r = paint.radius ?? 0;
  return add({
    ...base(name, parent, X(box.x + box.w / 2), Y(box.y + box.h / 2)),
    type: 'rectangle',
    width: box.w,
    height: box.h,
    cornerRadius: [r, r, r, r],
    fills: paint.fills ?? [],
    strokes: paint.strokes ?? [],
    ...(paint.effects && { effects: paint.effects }),
    ...(paint.opacity !== undefined && { opacity: paint.opacity }),
  });
}

function circle(
  name: string,
  parent: string,
  cx: number,
  cy: number,
  r: number,
  fill: Color,
  effects?: Effect[]
): EllipseNode {
  return add({
    ...base(name, parent, X(cx), Y(cy)),
    type: 'ellipse',
    radiusX: r,
    radiusY: r,
    fills: [solid(fill)],
    strokes: [],
    ...(effects && { effects }),
  });
}

/** A path of closed contours given in page pixels, centred on its own position. */
function contoursPath(
  name: string,
  parent: string,
  contours: Vector2[][],
  fill: Color,
  opacity = 1
): PathNode {
  const xs = contours.flat().map((p) => p.x);
  const ys = contours.flat().map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const local = (points: Vector2[]): PathPoint[] =>
    points.map((p) => ({
      position: { x: p.x - cx, y: cy - p.y },
      handleIn: null,
      handleOut: null,
      type: 'corner',
    }));
  return add({
    ...base(name, parent, X(cx), Y(cy)),
    opacity,
    type: 'path',
    points: local(contours[0]!),
    subpaths: contours.slice(1).map(local),
    closed: true,
    fillRule: 'nonzero',
    fills: [solid(fill)],
    strokes: [],
  });
}
const boxContour = (x: number, y: number, w: number, h: number): Vector2[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

/** Text measured on the live page, its lines as the browser broke them, baselines where it drew them. */
function text(
  t: MeasuredText,
  parent: string,
  name: string,
  options: { fill?: Fill; effects?: Effect[]; content?: string[]; pinRight?: boolean } = {}
): TextNode {
  const lines = options.content ?? t.lines.map((line) => line.text);
  const first = t.lines[0]!;
  const centered = t.align === 'center' && lines.length > 1;
  const boxWidth = t.rect.w + 160;
  const left = centered ? t.rect.x + t.rect.w / 2 - boxWidth / 2 : first.left;
  const node = base(name, parent, X(left), Y(first.baseline));
  // Pinned by its right edge, for text that runs up to its neighbour: the space
  // between them stays, set in whatever font. Anchored (1, 0) the origin is the
  // box's bottom right, the line's height below the ascender (Outfit's is 1 em).
  const pinned = options.pinRight && lines.length === 1;
  const position = pinned
    ? { x: X(first.right - t.ls), y: Y(first.baseline) - (t.lineHeight - t.size) }
    : node.transform.position;
  return add({
    ...node,
    transform: { ...node.transform, position, anchor: { x: pinned ? 1 : 0, y: 0 } },
    type: 'text',
    content: lines.join('\n'),
    fontFamily: t.family,
    fontSize: t.size,
    fontWeight: t.weight as TextNode['fontWeight'],
    fontStyle: 'normal',
    textAlign: centered ? 'center' : 'left',
    lineHeight: t.lineHeight / t.size,
    letterSpacing: t.ls,
    textResize: centered ? 'auto-height' : 'auto-width',
    ...(centered && { boxWidth }),
    fills: [options.fill ?? solid(css(t.color))],
    strokes: [],
    ...(options.effects && { effects: options.effects }),
  });
}

/** A gradient-clipped heading: the CSS gradient sampled across where its glyphs are. */
function gradientText(
  t: MeasuredText,
  parent: string,
  name: string,
  angle: number,
  list: Array<[number, Color]>,
  effects?: Effect[]
): TextNode {
  const line = t.lines[0]!;
  const y = line.baseline - t.size * 0.35;
  const samples = [0, 0.25, 0.5, 0.75, 1].map(
    (f) =>
      [f, cssLinearAt(angle, list, t.rect, line.left + (line.right - line.left) * f, y)] as [
        number,
        Color,
      ]
  );
  return text(t, parent, name, {
    fill: linear({ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, stops(...samples)),
    effects,
  });
}

/** An inline SVG icon from the page, imported as vector layers in a group centred on where it was. */
function icon(svg: MeasuredSvg, parent: string, name: string, opacity = 1): GroupNode {
  const markup = svg.html
    .replace(/\swidth="[^"]*"/, ' width="24"')
    .replace(/\sheight="[^"]*"/, ' height="24"')
    .replace(/\sstyle="[^"]*"/, '');
  const scene = new SceneGraph();
  const result = importSvg(markup, scene, id, {
    centerAtOrigin: true,
    scale: svg.rect.w / 24,
    position: { x: X(svg.rect.x + svg.rect.w / 2), y: Y(svg.rect.y + svg.rect.h / 2) },
  });
  return adopt(result.nodes, result.rootIds, parent, name, opacity);
}
function adopt(
  imported: Node[],
  rootIds: string[],
  parent: string,
  name: string,
  opacity = 1
): GroupNode {
  const holder =
    rootIds.length === 1 && imported.find((n) => n.id === rootIds[0])?.type === 'group'
      ? (imported.find((n) => n.id === rootIds[0]) as GroupNode)
      : undefined;
  if (holder) {
    for (const node of imported) {
      const copy = { ...node, children: [] as string[] } as Node;
      if (copy.id === holder.id) Object.assign(copy, { parent, name, opacity });
      add(copy);
    }
    return byId.get(holder.id) as GroupNode;
  }
  const wrapper = group(name, parent);
  wrapper.opacity = opacity;
  for (const node of imported) {
    const copy = { ...node, children: [] as string[] } as Node;
    if (rootIds.includes(copy.id)) copy.parent = wrapper.id;
    add(copy);
  }
  return wrapper;
}

function maskGroup(
  name: string,
  parent: string,
  mode: 'clip' | 'alpha',
  mask: (holder: string) => Node
): GroupNode {
  const holder = group(name, parent);
  const maskNode = mask(holder.id);
  holder.maskNodeId = maskNode.id;
  holder.maskMode = mode;
  return holder;
}

const triangle = (name: string, parent: string, left: number, midY: number, color: Color) =>
  contoursPath(
    name,
    parent,
    [
      [
        { x: left, y: midY - 3.6 },
        { x: left + 6, y: midY },
        { x: left, y: midY + 3.6 },
      ],
    ],
    color
  );

// ============================================================================
// Motion
// ============================================================================

const timeline = createTimeline({ id: 'funway-timeline', duration: DURATION, frameRate: FPS });
function key(nodeId: string, property: string, frames: Array<[number, number, EasingFunction?]>) {
  const track = getOrCreateTrack<number>(timeline, nodeId, property);
  for (const [frame, value, easing] of frames) addKeyframe(track, frame, value, easing ?? 'linear');
}
const EASE_IN_OUT: EasingFunction = { type: 'cubicBezier', points: [0.42, 0, 0.58, 1] };
/** On for `onFor` frames of each period, then `low` (no step easing: a pair of keys at each change). */
function blink(nodeId: string, period: number, onFor: number, low: number, phase = 0) {
  const value = (frame: number) => ((frame + phase) % period < onFor ? 1 : low);
  const frames: Array<[number, number]> = [[0, value(0)]];
  for (let frame = 1; frame <= DURATION; frame++) {
    if (value(frame) !== value(frame - 1)) {
      if (frames.at(-1)![0] !== frame - 1) frames.push([frame - 1, value(frame - 1)]);
      frames.push([frame, value(frame)]);
    }
  }
  if (frames.at(-1)![0] !== DURATION) frames.push([DURATION, value(DURATION)]);
  key(nodeId, 'opacity', frames);
}
/** One run of a cycle repeated through the timeline: `at(phase)` gives the values, keyed at `phases`. */
function cycle(
  nodeId: string,
  property: string,
  period: number,
  delay: number,
  phases: number[],
  at: (phase: number) => number,
  easing: EasingFunction = 'linear'
) {
  const frames: Array<[number, number, EasingFunction]> = [];
  const first = Math.floor(-delay / period) - 1;
  for (let k = first; k * period + delay < DURATION; k++) {
    const start = k * period + delay;
    phases.forEach((phase, index) => {
      const frame = Math.round(start + phase * period) - (index === phases.length - 1 ? 1 : 0);
      if (frame >= 0 && frame <= DURATION) frames.push([frame, at(phase), easing]);
    });
  }
  const sample = (frame: number) => {
    const p = ((((frame - delay) % period) + period) % period) / period;
    return at(p);
  };
  if (!frames.some(([f]) => f === 0)) frames.push([0, sample(0), 'linear']);
  if (!frames.some(([f]) => f === DURATION)) frames.push([DURATION, sample(DURATION), easing]);
  frames.sort((a, b) => a[0] - b[0]);
  key(nodeId, property, frames);
}

const steps: AnimationSequenceStep[] = [];
let stepCount = 0;
/** A reveal step: `gap` frames after the previous one starts, as the site's scroll reveals (40 px, 0.8 s). */
function reveal(node: Node, gap: number, presetId: AnimationPresetId = 'rise-in') {
  steps.push({
    id: `fw-step-${++stepCount}`,
    nodeId: node.id,
    presetId,
    trigger: steps.length === 0 ? 'afterPrevious' : 'withPrevious',
    delay: gap,
    duration: 24,
    ...(presetId === 'rise-in' && { intensity: 40 / 48 }),
  });
}

// ============================================================================
// The page
// ============================================================================

it('builds the Funway home page', () => {
  const measured = JSON.parse(fs.readFileSync(`${DIR}/text.json`, 'utf8')) as {
    texts: MeasuredText[];
    svgs: MeasuredSvg[];
  };
  const T = (i: number) => measured.texts[i]!;
  const svgs = measured.svgs;
  const heroJpeg = fs.readFileSync(`${DIR}/assets/hero-back1.jpg`).toString('base64');
  const logoSvg = fs.readFileSync(`${DIR}/assets/funway-logo.svg`, 'utf8');

  const board: ArtboardNode = add({
    ...base('Funway Interactive — Home', null),
    type: 'artboard',
    width: W,
    height: H,
    fills: [solid(BODY)],
    clipContent: true,
  });
  const A = board.id;

  // --- Section backgrounds ---------------------------------------------------
  const backgrounds = group('Section backgrounds', A);
  rect(
    'Services background',
    backgrounds.id,
    { x: 0, y: 713, w: W, h: 1022 },
    {
      fills: [
        linear(
          ...TOP_DOWN,
          stops([0, rgba(12, 13, 18)], [0.5, rgba(16, 17, 26)], [1, rgba(12, 13, 18)])
        ),
        radial(
          { x: 0.85, y: 0.85 },
          1.2,
          stops([0, rgba(232, 168, 56, 0.08)], [0.4, rgba(232, 168, 56, 0)])
        ),
        radial(
          { x: 0.1, y: 0.1 },
          1.27,
          stops([0, rgba(236, 30, 36, 0.08)], [0.45, rgba(236, 30, 36, 0)])
        ),
      ],
    }
  );
  rect(
    'Blog background',
    backgrounds.id,
    { x: 0, y: 2485, w: W, h: 515 },
    {
      fills: [linear(...TOP_DOWN, stops([0, rgba(21, 22, 25)], [1, BODY]))],
    }
  );
  rect(
    'Blog top edge',
    backgrounds.id,
    { x: 0, y: 2485, w: W, h: 1 },
    { fills: [solid(rgba(255, 255, 255, 0.06))] }
  );
  rect(
    'Footer background',
    backgrounds.id,
    { x: 0, y: 3000, w: W, h: 344 },
    { fills: [solid(rgba(8, 9, 12, 0.7))] }
  );
  rect(
    'Footer top edge',
    backgrounds.id,
    { x: 0, y: 3000, w: W, h: 1 },
    { fills: [solid(rgba(255, 255, 255, 0.06))] }
  );
  rect(
    'Footer top light',
    backgrounds.id,
    { x: 0, y: 3001, w: W, h: 1 },
    { fills: [solid(rgba(255, 255, 255, 0.03))] }
  );

  // --- Hero ------------------------------------------------------------------
  const hero = group('Hero', A);
  const picture = maskGroup('Hero picture', hero.id, 'clip', (holder) =>
    rect('Hero frame', holder, { x: 0, y: 0, w: W, h: 713 }, { fills: [solid(WHITE)] })
  );
  const image: ImageNode = add({
    ...base('Data grid (hero-back1.jpg)', picture.id, X(720), Y(-48.7 + 810.4 / 2)),
    type: 'image',
    src: `data:image/jpeg;base64,${heroJpeg}`,
    width: 1440,
    height: 810.4,
    naturalWidth: 1672,
    naturalHeight: 941,
    cornerRadius: [0, 0, 0, 0],
  });
  rect(
    'Hero shade',
    picture.id,
    { x: 0, y: 0, w: W, h: 713 },
    {
      fills: [
        linear(
          ...TOP_DOWN,
          stops([0, rgba(8, 9, 12, 0.86)], [0.42, rgba(8, 9, 12, 0.52)], [1, rgba(8, 9, 12, 0.8)])
        ),
      ],
    }
  );
  key(image.id, 'transform.scale.x', [
    [0, 1.06],
    [150, 1, 'easeOutCubic'],
    [DURATION - 1, 1.03],
  ]);
  key(image.id, 'transform.scale.y', [
    [0, 1.06],
    [150, 1, 'easeOutCubic'],
    [DURATION - 1, 1.03],
  ]);

  const badge = group('Badge', hero.id);
  rect(
    'Badge pill',
    badge.id,
    { x: 534, y: 128, w: 371, h: 40 },
    {
      radius: 20,
      fills: [solid(rgba(212, 160, 60, 0.08))],
      strokes: [inside(rgba(212, 160, 60, 0.35))],
    }
  );
  icon(svgs[1]!, badge.id, 'Rocket');
  text(T(9), badge.id, 'Software • Penetration Testing • Security • SEO');
  const build = text(T(10), hero.id, 'We Build It.', { pinRight: true });
  const breakIt = text(T(11), hero.id, 'We Break It.');
  const prove = text(T(12), hero.id, 'We Prove It.');
  const intro = text(T(13), hero.id, 'Intro');
  const heroButtons = group('Hero buttons', hero.id);
  const ctaButton = (name: string, parent: string, box: Box) =>
    rect(name, parent, box, {
      radius: 8,
      fills: [
        linear(...DIAGONAL, stops([0, rgba(236, 30, 36, 0.7)], [1, rgba(212, 160, 60, 0.7)])),
      ],
      strokes: [glassEdge(0.15, 0.3)],
      effects: [shadow(rgba(236, 30, 36, 0.2), 2, 12)],
    });
  ctaButton('Explore Services button', heroButtons.id, { x: 562, y: 544, w: 165, h: 41 });
  text(T(14), heroButtons.id, 'Explore Services');
  text(T(15), heroButtons.id, 'Start a Consultation');

  // --- Services --------------------------------------------------------------
  const services = group('Services', A);
  const servicesTitle = gradientText(
    T(16),
    services.id,
    'Four Service Lines. One Engineering Team.',
    135,
    [
      [0, WHITE],
      [1, GOLD],
    ]
  );
  const servicesIntro = text(T(17), services.id, 'Services intro');
  const cards: GroupNode[] = [];
  const cardSpecs = [
    {
      name: 'Software Development',
      box: { x: 144, y: 937, w: 368, h: 372 },
      svg: 2,
      title: 18,
      body: 19,
      link: 20,
    },
    {
      name: 'Penetration Testing',
      box: { x: 536, y: 937, w: 368, h: 372 },
      svg: 3,
      title: 21,
      body: 22,
      link: 23,
    },
    {
      name: 'Security Consulting',
      box: { x: 928, y: 937, w: 368, h: 372 },
      svg: 4,
      title: 24,
      body: 25,
      link: 26,
    },
    {
      name: 'SEO Intelligence',
      box: { x: 144, y: 1333, w: 368, h: 322 },
      svg: 5,
      title: 27,
      body: 28,
      link: 29,
      gold: true,
    },
  ];
  for (const spec of cardSpecs) {
    const card = group(`Card · ${spec.name}`, services.id);
    cards.push(card);
    rect('Glass', card.id, spec.box, {
      radius: 16,
      fills: [
        linear(
          ...DIAGONAL,
          stops(
            [0, rgba(255, 255, 255, 0.05)],
            [0.5, rgba(255, 255, 255, 0.02)],
            [1, rgba(255, 255, 255, 0.04)]
          )
        ),
      ],
      strokes: [spec.gold ? inside(rgba(212, 160, 60, 0.3)) : glassEdge(0.08, 0.14)],
      effects: [shadow(rgba(0, 0, 0, 0.3), 8, 32), shadow(rgba(0, 0, 0, 0.15), 2, 8)],
    });
    rect(
      'Icon tile',
      card.id,
      { x: spec.box.x + 33, y: spec.box.y + 33, w: 48, h: 48 },
      {
        radius: 12,
        fills: [
          linear(
            ...DIAGONAL,
            stops(
              [0, rgba(236, 30, 36, spec.gold ? 0.25 : 0.2)],
              [1, rgba(212, 160, 60, spec.gold ? 0.3 : 0.2)]
            )
          ),
        ],
      }
    );
    icon(svgs[spec.svg]!, card.id, 'Icon');
    text(T(spec.title), card.id, spec.name);
    text(T(spec.body), card.id, 'Description');
    text(T(spec.link), card.id, T(spec.link).lines[0]!.text);
  }

  // --- funway.boutique banner -----------------------------------------------
  const BANNER = { x: 144, y: 1790.6, w: 1152, h: 309.2 };
  const banner = group('funway.boutique banner', A);
  // box-shadow 0 40px 90px -42px: the card shrunk 42 px, 40 px down, blurred
  rect(
    'Banner glow',
    banner.id,
    { x: BANNER.x + 42, y: BANNER.y + 42 + 40, w: BANNER.w - 84, h: BANNER.h - 84 },
    {
      radius: 20,
      fills: [solid(rgba(236, 30, 36, 0.45))],
      effects: [blur(90)],
    }
  );
  rect('Banner', banner.id, BANNER, {
    radius: 20,
    fills: [
      linear(...TOP_DOWN, stops([0, rgba(12, 14, 20)], [1, rgba(8, 9, 13)])),
      radial(
        { x: 1.08, y: -0.3 },
        1.3,
        stops([0, rgba(212, 160, 60, 0.18)], [0.55, rgba(212, 160, 60, 0)])
      ),
      radial(
        { x: 0.08, y: 1.25 },
        1.3,
        stops([0, rgba(236, 30, 36, 0.22)], [0.55, rgba(236, 30, 36, 0)])
      ),
    ],
    effects: [innerShadow(rgba(255, 255, 255, 0.05), 1, 0)],
  });
  const bannerShape = (name: string, holder: string) =>
    rect(name, holder, BANNER, { radius: 20, fills: [solid(WHITE)] });
  const behind = maskGroup('Behind the content', banner.id, 'clip', (holder) =>
    bannerShape('Banner shape', holder)
  );
  const grid = maskGroup('Pixel grid', behind.id, 'alpha', (holder) =>
    rect('Grid fade', holder, BANNER, {
      fills: [radial({ x: 0.35, y: 0.6 }, 0.88, stops([0.25, WHITE], [0.78, alpha(WHITE, 0)]))],
    })
  );
  const rows = Array.from({ length: 13 }, (_, k) =>
    boxContour(BANNER.x, BANNER.y + k * 24, BANNER.w, 1)
  );
  const columns = Array.from({ length: 48 }, (_, k) =>
    boxContour(BANNER.x + k * 24, BANNER.y, 1, BANNER.h)
  );
  contoursPath('Grid rows', grid.id, rows, rgba(236, 30, 36, 0.06));
  contoursPath('Grid columns', grid.id, columns, rgba(212, 160, 60, 0.05));
  // Sparks rising through the card (gb-float; 8 s on the site, 7 here so two fit)
  const sparks = group('Sparks', behind.id);
  const SPARK_PERIOD = 210;
  [
    [0.1, RED, 0],
    [0.26, GOLD, 1.6],
    [0.44, RED, 3.1],
    [0.63, GOLD, 0.8],
    [0.8, GOLD, 2.4],
    [0.92, RED, 4.2],
  ].forEach(([at, color, delay], index) => {
    const x = BANNER.x + BANNER.w * (at as number) + 3;
    const spark = rect(
      `Spark ${index + 1}`,
      sparks.id,
      { x: x - 3, y: BANNER.y + BANNER.h + 2, w: 6, h: 6 },
      {
        radius: 1,
        fills: [solid(color as Color)],
        effects: [shadow(color as Color, 0, 8)],
      }
    );
    const y0 = spark.transform.position.y;
    const d = ((delay as number) * FPS * 7) / 8;
    cycle(spark.id, 'transform.position.y', SPARK_PERIOD, d, [0, 1], (p) => y0 + 260 * p);
    cycle(spark.id, 'transform.scale.x', SPARK_PERIOD, d, [0, 1], (p) => 0.6 + 0.4 * p);
    cycle(spark.id, 'transform.scale.y', SPARK_PERIOD, d, [0, 1], (p) => 0.6 + 0.4 * p);
    cycle(spark.id, 'opacity', SPARK_PERIOD, d, [0, 0.12, 0.88, 1], (p) =>
      p <= 0 || p >= 1 ? 0 : 0.95
    );
  });

  const content = group('Banner content', banner.id);
  rect(
    'Arcade screen',
    content.id,
    { x: 184, y: 1879, w: 132, h: 132 },
    {
      radius: 16,
      fills: [
        radial(
          { x: 0.5, y: 0.68 },
          0.84,
          stops([0, rgba(236, 30, 36, 0.28)], [1, rgba(8, 9, 13, 0.92)])
        ),
      ],
      strokes: [inside(rgba(236, 30, 36, 0.45))],
      effects: [
        shadow(rgba(236, 30, 36, 0.18), 0, 34),
        innerShadow(rgba(236, 30, 36, 0.28), 0, 34),
      ],
    }
  );
  // (58 px in the middle of its screen: the measured box tilts with the bob)
  const pad = icon(
    { ...svgs[6]!, rect: { x: 250 - 29, y: 1945 - 29, w: 58, h: 58 } },
    content.id,
    'Gamepad'
  );
  pad.effects = [shadow(rgba(212, 160, 60, 0.6), 0, 12)];
  const padY = pad.transform.position.y;
  // gb-bob: up 7 px and tilted 5° half way, 2.6 s on the site (2.8 here: five a loop)
  cycle(
    pad.id,
    'transform.position.y',
    84,
    0,
    [0, 0.5, 1],
    (p) => padY + (p === 0.5 ? 7 : 0),
    EASE_IN_OUT
  );
  cycle(pad.id, 'transform.rotation', 84, 0, [0, 0.5, 1], (p) => (p === 0.5 ? 5 : 0), EASE_IN_OUT);
  const ready = text(T(30), content.id, 'Player 1 · Ready');
  blink(ready.id, 30, 15, 0.15);

  const dotRing = circle('Ping', content.id, 360, 1849, 4, rgba(236, 30, 36, 1));
  circle('Live dot', content.id, 360, 1849, 4, RED);
  cycle(dotRing.id, 'transform.scale.x', 52.5, 0, [0, 1], (p) => 1 + 2.75 * p, 'easeOutQuad');
  cycle(dotRing.id, 'transform.scale.y', 52.5, 0, [0, 1], (p) => 1 + 2.75 * p, 'easeOutQuad');
  cycle(dotRing.id, 'opacity', 52.5, 0, [0, 1], (p) => 0.6 * (1 - p), 'easeOutQuad');
  text(T(31), content.id, 'Also by Funway — Now playing');
  gradientText(
    T(32),
    content.id,
    'funway.boutique',
    100,
    [
      [0, WHITE],
      [0.58, GOLD],
      [1, RED],
    ],
    [shadow(rgba(236, 30, 36, 0.22), 0, 30)]
  );
  const cursor = rect(
    'Cursor',
    content.id,
    { x: 707, y: 1875, w: 22, h: 42 },
    {
      fills: [solid(RED)],
      effects: [shadow(rgba(236, 30, 36, 0.7), 0, 10)],
    }
  );
  blink(cursor.id, 30, 15, 0, 7);
  text(T(33), content.id, 'Indie games');
  const BTN = { x: 356, y: 2006, w: 182, h: 50 };
  const ping = rect(
    'Button ping',
    content.id,
    { x: BTN.x - 2, y: BTN.y - 2, w: BTN.w + 4, h: BTN.h + 4 },
    {
      radius: 11.6,
      fills: [solid(rgba(212, 160, 60, 1))],
    }
  );
  cycle(
    ping.id,
    'transform.scale.x',
    60,
    0,
    [0, 1],
    (p) => 1 + (32 / (BTN.w + 4)) * p,
    'easeOutQuad'
  );
  cycle(
    ping.id,
    'transform.scale.y',
    60,
    0,
    [0, 1],
    (p) => 1 + (32 / (BTN.h + 4)) * p,
    'easeOutQuad'
  );
  cycle(ping.id, 'opacity', 60, 0, [0, 1], (p) => 0.45 * (1 - p), 'easeOutQuad');
  rect(
    'Button glow',
    content.id,
    { x: BTN.x + 10, y: BTN.y + 10 + 16, w: BTN.w - 20, h: BTN.h - 20 },
    {
      radius: 9.6,
      fills: [solid(rgba(236, 30, 36, 0.6))],
      effects: [blur(32)],
    }
  );
  rect(
    'Button base',
    content.id,
    { ...BTN, y: BTN.y + 6 },
    { radius: 9.6, fills: [solid(rgba(122, 20, 24))] }
  );
  rect('Press Start button', content.id, BTN, {
    radius: 9.6,
    fills: [linear(...DIAGONAL, stops([0, RED], [1, GOLD]))],
  });
  icon(svgs[7]!, content.id, 'Play');
  text(T(34), content.id, 'PRESS START');
  for (const [index, label] of [
    [35, 'Indie'],
    [36, 'Strategy'],
    [37, 'Crafted'],
  ] as const) {
    const t = T(index);
    triangle(`▸ ${label}`, content.id, t.lines[0]!.left - 12.8, t.lines[0]!.baseline - 4, GOLD);
    text(t, content.id, label);
  }

  const front = maskGroup('In front', banner.id, 'clip', (holder) =>
    bannerShape('Banner shape', holder)
  );
  // gb-scan: 1 px lines every 3 px drifting down 144 px every 7 s
  const lines = Array.from({ length: 199 }, (_, k) =>
    boxContour(BANNER.x, BANNER.y - 288 + k * 3 + 2, BANNER.w, 1)
  );
  const scan = contoursPath('Scanlines', front.id, lines, rgba(0, 0, 0, 0.16), 0.45);
  key(scan.id, 'transform.position.y', [
    [0, scan.transform.position.y],
    [DURATION, scan.transform.position.y - 288],
  ]);
  // gb-orbit: the neon edge, a conic gradient turning once every 7 s, seen through a 1.5 px ring
  // (the edge's stroke gradient turns: clockwise, as the site's does)
  const conic: Gradient = {
    type: 'conic',
    center: { x: 0.5, y: 0.5 },
    angle: 0,
    stops: stops(
      [0, alpha(GOLD, 0.86)],
      [0.1667, alpha(GOLD, 0)],
      [0.3333, alpha(GOLD, 0)],
      [0.5278, GOLD],
      [0.75, RED],
      [0.9722, GOLD],
      [1, alpha(GOLD, 0.86)]
    ),
  };
  const neon = rect('Neon edge', banner.id, BANNER, {
    radius: 20,
    strokes: [inside(GOLD, 1.5, conic)],
  });
  key(neon.id, 'strokes.0.gradient.angle', [
    [0, 0],
    [DURATION, -720],
  ]);

  // --- Call to action --------------------------------------------------------
  const cta = group('Ready to Start', A);
  const ctaTitle = gradientText(T(38), cta.id, 'Ready to Start?', 135, [
    [0, WHITE],
    [1, GOLD],
  ]);
  const ctaText = text(T(39), cta.id, 'Consultation');
  const ctaButtonGroup = group('Get in Touch', cta.id);
  ctaButton('Get in Touch button', ctaButtonGroup.id, { x: 631, y: 2348, w: 179, h: 55 });
  text(T(40), ctaButtonGroup.id, 'Get in Touch');

  // --- Blog ------------------------------------------------------------------
  const blog = group('Blog', A);
  const blogHead = group('Blog heading', blog.id);
  text(T(41), blogHead.id, 'From the blog');
  gradientText(T(42), blogHead.id, 'Latest from Funway', 135, [
    [0, WHITE],
    [1, GOLD],
  ]);
  text(T(43), blogHead.id, 'All posts →');
  const posts: GroupNode[] = [];
  for (const [x, title, body, date] of [
    [144, 44, 45, 46],
    [535, 47, 48, 49],
    [925, 50, 51, 52],
  ] as const) {
    const post = group(
      `Post · ${T(title)
        .lines.map((l) => l.text)
        .join(' ')
        .slice(0, 40)}`,
      blog.id
    );
    posts.push(post);
    const card = { x, y: 2660, w: 371, h: 244 };
    rect('Glass', post.id, card, {
      radius: 16,
      fills: [
        linear(
          ...DIAGONAL,
          stops(
            [0, rgba(255, 255, 255, 0.05)],
            [0.5, rgba(255, 255, 255, 0.02)],
            [1, rgba(255, 255, 255, 0.04)]
          )
        ),
      ],
      strokes: [glassEdge(0.08, 0.14)],
      effects: [shadow(rgba(0, 0, 0, 0.3), 8, 32), shadow(rgba(0, 0, 0, 0.15), 2, 8)],
    });
    const top = maskGroup('Accent', post.id, 'clip', (holder) =>
      rect('Card shape', holder, card, { radius: 16, fills: [solid(WHITE)] })
    );
    rect(
      'Accent line',
      top.id,
      { ...card, h: 2 },
      {
        fills: [linear({ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, stops([0, RED], [1, GOLD]))],
        opacity: 0.7,
      }
    );
    text(T(title), post.id, 'Title');
    text(T(body), post.id, 'Summary');
    text(T(date), post.id, 'Date');
  }

  // --- Footer ----------------------------------------------------------------
  const footer = group('Footer', A);
  const brand = group('Brand', footer.id);
  gradientText(T(53), brand.id, 'Funway Interactive', 135, [
    [0, WHITE],
    [1, GOLD],
  ]);
  text(T(54), brand.id, 'About Funway');
  const column = (name: string, indices: number[]) => {
    const g = group(name, footer.id);
    for (const i of indices) text(T(i), g.id, T(i).lines[0]!.text);
    return g;
  };
  const colServices = column('Services links', [55, 56, 57, 58, 59]);
  const colExplore = column('Explore links', [60, 61, 62, 63, 64]);
  const colContact = column('Contact', [65, 66, 67, 68, 69]);
  const bottom = group('Bottom row', footer.id);
  for (const i of [70, 71, 72]) text(T(i), bottom.id, T(i).lines[0]!.text);
  rect(
    'Divider',
    bottom.id,
    { x: 144, y: 3275, w: 1152, h: 1 },
    { fills: [solid(rgba(255, 255, 255, 0.06))] }
  );
  text(T(73), bottom.id, 'Copyright');

  // --- Navigation (fixed over the hero) --------------------------------------
  const nav = group('Navigation', A);
  rect('Bar', nav.id, { x: 0, y: 0, w: W, h: 65 }, { fills: [solid(rgba(14, 15, 20, 0.72))] });
  rect(
    'Bar edge',
    nav.id,
    { x: 0, y: 64, w: W, h: 1 },
    { fills: [solid(rgba(255, 255, 255, 0.03))] }
  );
  const logoScene = new SceneGraph();
  const logo = importSvg(logoSvg, logoScene, id, {
    centerAtOrigin: true,
    scale: 170 / 626,
    position: { x: X(229), y: Y(32) },
  });
  adopt(logo.nodes, logo.rootIds, nav.id, 'Funway logo');
  for (const i of [0, 5, 6, 7]) text(T(i), nav.id, T(i).lines[0]!.text);
  icon(svgs[0]!, nav.id, 'Chevron', 0.6);
  ctaButton('Contact button', nav.id, { x: 1189, y: 12, w: 107, h: 41 });
  text(T(8), nav.id, 'Contact');

  // --- Loop fade: the page out of and back into its background at the seam ---
  const fade = rect('Loop fade', A, { x: 0, y: 0, w: W, h: H }, { fills: [solid(BODY)] });
  fade.locked = true; // over everything: clicks go through to the page
  key(fade.id, 'opacity', [
    [0, 1],
    [14, 0, 'easeOutQuad'],
    [DURATION - 22, 0],
    [DURATION - 2, 1, 'easeInQuad'],
    [DURATION, 1],
  ]);

  // --- Reveal sequence: top to bottom ---------------------------------------
  reveal(nav, 8, 'fade-in');
  reveal(badge, 5);
  reveal(build, 4);
  reveal(breakIt, 4);
  reveal(prove, 4);
  reveal(intro, 5);
  reveal(heroButtons, 5);
  reveal(servicesTitle, 9);
  reveal(servicesIntro, 4);
  cards.forEach((card) => reveal(card, 4));
  reveal(banner, 8);
  reveal(ctaTitle, 8);
  reveal(ctaText, 4);
  reveal(ctaButtonGroup, 4);
  reveal(blogHead, 8);
  posts.forEach((post) => reveal(post, 4));
  reveal(brand, 8);
  reveal(colServices, 3);
  reveal(colExplore, 3);
  reveal(colContact, 3);
  reveal(bottom, 4);

  // Children lists, then the sequence compiled into tagged keyframes
  for (const node of nodes) node.children = [];
  for (const node of nodes) if (node.parent) byId.get(node.parent)!.children.push(node.id);
  const restPoses = Object.fromEntries(
    steps.map((step) => [step.nodeId, captureRestPose(byId.get(step.nodeId)!)])
  );
  const sequence = { steps, restPoses };
  const compiled = compileAnimationSequence(timeline, sequence, (nodeId) => byId.get(nodeId));

  const createdAt = '2026-10-27T12:00:00.000Z';
  const data: ProjectDataV2 = {
    version: '2.0',
    name: 'Funway Interactive — Home',
    createdAt,
    updatedAt: createdAt,
    pages: [
      {
        id: 'funway-page-1',
        name: 'Home',
        sceneGraph: { nodes, rootNodeIds: nodes.filter((n) => !n.parent).map((n) => n.id) },
        timeline: compiled,
        animationSequence: sequence,
      },
    ],
    activePageId: 'funway-page-1',
    settings: {
      timelineDuration: DURATION,
      frameRate: FPS,
      autoKeyframe: false,
      onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
      guides: [],
      backgroundColor: rgba(8, 9, 12),
    },
    symbols: [],
  };
  fs.writeFileSync(OUT, Buffer.from(projectDataToBinary(data)));
  console.log(
    `${nodes.length} layers, ${compiled.tracks.length} tracks, ${steps.length} steps -> ${OUT}`
  );
});
