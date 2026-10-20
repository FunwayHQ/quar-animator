/**
 * Tutorial Builder for Quar Animator
 * Small helpers that put together the projects shipped as tutorials: pages
 * holding an artboard, with text boxes and shapes on it, and their timelines.
 */

import type {
  ArtboardNode,
  Color,
  EllipseNode,
  Fill,
  Node,
  PolygonNode,
  RectangleNode,
  Stroke,
  TextNode,
  Timeline,
  Transform,
} from '@quar/types';
import { DEFAULT_ONION_SKIN_SETTINGS } from '@quar/core';
import { createAnimationSequence, createTimeline } from '@quar/animation';
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
  createdAt: string
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
    symbols: [],
  };
}
