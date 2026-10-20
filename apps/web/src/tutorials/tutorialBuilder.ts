/**
 * Tutorial Builder for Quar Animator
 * Small helpers that put together the projects shipped as tutorials: pages
 * holding an artboard, with text boxes and shapes on it, and their timelines.
 */

import type {
  ArtboardNode,
  BoneNode,
  Color,
  EllipseNode,
  Fill,
  GroupNode,
  MaskMode,
  Node,
  PathNode,
  PathPoint,
  PolygonNode,
  RectangleNode,
  Stroke,
  SymbolDefinition,
  SymbolInstanceNode,
  TextNode,
  Timeline,
  Transform,
} from '@quar/types';
import { createBoneNode } from '@quar/rigging';
import type { EasingFunction } from '@quar/types';
import { DEFAULT_ONION_SKIN_SETTINGS } from '@quar/core';
import {
  addKeyframe,
  createAnimationSequence,
  createTimeline,
  getOrCreateTrack,
} from '@quar/animation';
import type { AnimationSequence } from '@quar/animation';
import type { ProjectDataV2, SerializedPage } from '../services/projectSerializer';

// ============================================================================
// Palette
// ============================================================================

export const INK: Color = { r: 31, g: 36, b: 48, a: 1 };
export const MUTED: Color = { r: 96, g: 104, b: 122, a: 1 };
export const PAPER: Color = { r: 250, g: 249, b: 246, a: 1 };
export const VIOLET: Color = { r: 168, g: 85, b: 247, a: 1 };
export const TEAL: Color = { r: 20, g: 184, b: 166, a: 1 };
export const CORAL: Color = { r: 249, g: 115, b: 22, a: 1 };
export const SKY: Color = { r: 59, g: 130, b: 246, a: 1 };

/** Tutorial pages are 800 × 450 artboards centered on the origin. */
export const PAGE_WIDTH = 800;
export const PAGE_HEIGHT = 450;
export const FRAME_RATE = 30;
export const DURATION = 150;

// ============================================================================
// Nodes
// ============================================================================

/** Builds the nodes of one tutorial, with ids that stay the same every time. */
export class TutorialNodes {
  private count = 0;

  constructor(private readonly prefix: string) {}

  id(): string {
    this.count += 1;
    return `${this.prefix}-${this.count}`;
  }
}

function transform(x: number, y: number, rotation = 0): Transform {
  return {
    position: { x, y },
    rotation,
    scale: { x: 1, y: 1 },
    anchor: { x: 0.5, y: 0.5 },
    skew: { x: 0, y: 0 },
  };
}

function base(id: string, name: string, x: number, y: number, parent: string | null) {
  return {
    id,
    name,
    parent,
    children: [] as string[],
    transform: transform(x, y),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal' as const,
  };
}

export function solid(color: Color): Fill[] {
  return [{ type: 'solid', color: { ...color }, opacity: 1, visible: true }];
}

export function outline(color: Color, width: number): Stroke[] {
  return [{ color: { ...color }, width, opacity: 1, cap: 'round', join: 'round', visible: true }];
}

export function artboard(ids: TutorialNodes, name: string, fill: Color = PAPER): ArtboardNode {
  return {
    ...base(ids.id(), name, 0, 0, null),
    type: 'artboard',
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    fills: solid(fill),
    clipContent: true,
  };
}

export interface TextOptions {
  size?: number;
  weight?: 400 | 700;
  color?: Color;
  lineHeight?: number;
  align?: TextNode['textAlign'];
  name?: string;
}

/**
 * A fixed size text box with its top-left corner at (left, top) on the page
 * (Y up), wrapping its text at `width`.
 */
export function text(
  ids: TutorialNodes,
  parent: string,
  content: string,
  left: number,
  top: number,
  width: number,
  height: number,
  options: TextOptions = {}
): TextNode {
  return {
    ...base(ids.id(), options.name ?? content.split('\n')[0]!.slice(0, 24), 0, 0, parent),
    transform: transform(left + width / 2, top - height / 2),
    type: 'text',
    content,
    fontFamily: 'Inter',
    fontSize: options.size ?? 15,
    fontWeight: options.weight ?? 400,
    fontStyle: 'normal',
    textAlign: options.align ?? 'left',
    lineHeight: options.lineHeight ?? 1.45,
    letterSpacing: 0,
    textResize: 'fixed',
    boxWidth: width,
    boxHeight: height,
    fills: solid(options.color ?? INK),
    strokes: [],
  };
}

/**
 * Text not in a fixed box, its first line's top-left near (left, top):
 * auto width, or auto height when given a width to wrap at. It's anchored at
 * its first baseline, so where it starts doesn't depend on measuring it.
 */
export function looseText(
  ids: TutorialNodes,
  parent: string,
  content: string,
  left: number,
  top: number,
  options: TextOptions & { width?: number } = {}
): TextNode {
  const size = options.size ?? 15;
  const node = text(ids, parent, content, 0, 0, 1, 1, options);
  return {
    ...node,
    // Inter's ascender is about 0.97 em
    transform: {
      ...node.transform,
      position: { x: left, y: top - size * 0.97 },
      anchor: { x: 0, y: 0 },
    },
    textResize: options.width ? 'auto-height' : 'auto-width',
    boxWidth: options.width,
    boxHeight: undefined,
  };
}

export function rectangle(
  ids: TutorialNodes,
  parent: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: Color,
  cornerRadius = 0
): RectangleNode {
  return {
    ...base(ids.id(), name, x, y, parent),
    type: 'rectangle',
    width,
    height,
    cornerRadius: [cornerRadius, cornerRadius, cornerRadius, cornerRadius],
    fills: solid(fill),
    strokes: [],
  };
}

export function ellipse(
  ids: TutorialNodes,
  parent: string,
  name: string,
  x: number,
  y: number,
  radius: number,
  fill: Color
): EllipseNode {
  return {
    ...base(ids.id(), name, x, y, parent),
    type: 'ellipse',
    radiusX: radius,
    radiusY: radius,
    fills: solid(fill),
    strokes: [],
  };
}

export function star(
  ids: TutorialNodes,
  parent: string,
  name: string,
  x: number,
  y: number,
  radius: number,
  fill: Color
): PolygonNode {
  return {
    ...base(ids.id(), name, x, y, parent),
    type: 'polygon',
    sides: 5,
    radius,
    innerRadius: radius * 0.45,
    fills: solid(fill),
    strokes: [],
  };
}

export function group(
  ids: TutorialNodes,
  parent: string,
  name: string,
  mask?: { nodeId: string; mode: MaskMode }
): GroupNode {
  return {
    ...base(ids.id(), name, 0, 0, parent),
    // No anchor: children keep the page's coordinates
    transform: { ...transform(0, 0), anchor: { x: 0, y: 0 } },
    type: 'group',
    ...(mask && { maskNodeId: mask.nodeId, maskMode: mask.mode }),
  };
}

/** A path through corner points, relative to (x, y), optionally with curve handles. */
export function path(
  ids: TutorialNodes,
  parent: string,
  name: string,
  x: number,
  y: number,
  points: Array<[x: number, y: number, handleIn?: [number, number], handleOut?: [number, number]]>,
  paint: { fill?: Color; stroke?: Color; strokeWidth?: number },
  closed = true
): PathNode {
  const pathPoints: PathPoint[] = points.map(([px, py, handleIn, handleOut]) => ({
    position: { x: px, y: py },
    handleIn: handleIn ? { x: handleIn[0], y: handleIn[1] } : null,
    handleOut: handleOut ? { x: handleOut[0], y: handleOut[1] } : null,
    type: handleIn || handleOut ? 'smooth' : 'corner',
  }));
  return {
    ...base(ids.id(), name, x, y, parent),
    type: 'path',
    points: pathPoints,
    closed,
    fills: paint.fill ? solid(paint.fill) : [],
    strokes: paint.stroke ? outline(paint.stroke, paint.strokeWidth ?? 4) : [],
  };
}

/** A bone from (x, y) in its parent's space, pointing `rotation` degrees from +x. */
export function bone(
  ids: TutorialNodes,
  parent: string,
  name: string,
  x: number,
  y: number,
  length: number,
  rotation = 0
): BoneNode {
  return { ...createBoneNode(ids.id(), name, { x, y }, length, rotation), parent };
}

/** A symbol made of these nodes (their own coordinates, roots at the top level). */
export function symbolDefinition(id: string, name: string, nodes: Node[]): SymbolDefinition {
  const withChildren = nodes.map((node) => ({ ...node, children: [] as string[] }));
  const byId = new Map(withChildren.map((node) => [node.id, node]));
  for (const node of withChildren) {
    if (node.parent) byId.get(node.parent)?.children.push(node.id);
  }
  return {
    id,
    name,
    sceneGraphJSON: {
      nodes: withChildren,
      rootNodeIds: withChildren.filter((node) => !node.parent).map((node) => node.id),
    },
  };
}

export function symbolInstance(
  ids: TutorialNodes,
  parent: string,
  symbol: SymbolDefinition,
  x: number,
  y: number,
  scale = 1,
  rotation = 0
): SymbolInstanceNode {
  return {
    ...base(ids.id(), symbol.name, x, y, parent),
    transform: { ...transform(x, y, rotation), scale: { x: scale, y: scale } },
    type: 'symbol-instance',
    symbolId: symbol.id,
    overrides: [],
  };
}

// ============================================================================
// Lessons
// ============================================================================

// Text column on the left of each page, example on the right (Y up)
export const LEFT = -370;
const TITLE_TOP = 190;
const BODY_TOP = 130;
const BODY_WIDTH = 390;
const BODY_HEIGHT = 340;

export function lesson(
  ids: TutorialNodes,
  name: string,
  title: string,
  body: string
): { board: Node; nodes: Node[] } {
  const board = artboard(ids, name);
  return {
    board,
    nodes: [
      board,
      text(ids, board.id, title, LEFT, TITLE_TOP, 740, 44, {
        size: 28,
        weight: 700,
        name: 'Title',
      }),
      text(ids, board.id, body, LEFT, BODY_TOP, BODY_WIDTH, BODY_HEIGHT, { name: 'Lesson' }),
    ],
  };
}

export function key(
  timeline: Timeline,
  nodeId: string,
  property: string,
  frames: Array<[frame: number, value: number, easing?: EasingFunction]>
): void {
  const track = getOrCreateTrack<number>(timeline, nodeId, property);
  for (const [frame, value, easing] of frames) addKeyframe(track, frame, value, easing);
}

// ============================================================================
// Pages and Projects
// ============================================================================

export interface TutorialPage {
  name: string;
  /** The artboard first; every other node has a parent among them. */
  nodes: Node[];
  timeline?: Timeline;
  sequence?: AnimationSequence;
}

export function emptyTimeline(): Timeline {
  return createTimeline({ duration: DURATION, frameRate: FRAME_RATE });
}

/** A page's scene graph as saved: children listed on their parents. */
function serializePage(id: string, page: TutorialPage): SerializedPage {
  const nodes = page.nodes.map((node) => ({ ...node, children: [] as string[] }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    if (node.parent) byId.get(node.parent)?.children.push(node.id);
  }
  return {
    id,
    name: page.name,
    sceneGraph: { nodes, rootNodeIds: nodes.filter((n) => !n.parent).map((n) => n.id) },
    timeline: page.timeline ?? emptyTimeline(),
    animationSequence: page.sequence ?? createAnimationSequence(),
  };
}

export function tutorialProject(
  id: string,
  name: string,
  pages: TutorialPage[],
  createdAt: string,
  symbols: SymbolDefinition[] = []
): ProjectDataV2 {
  const serialized = pages.map((page, index) => serializePage(`${id}-page-${index + 1}`, page));
  return {
    version: '2.0',
    name,
    createdAt,
    updatedAt: createdAt,
    pages: serialized,
    activePageId: serialized[0]!.id,
    settings: {
      timelineDuration: DURATION,
      frameRate: FRAME_RATE,
      autoKeyframe: false,
      onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
      guides: [],
    },
    symbols,
  };
}
