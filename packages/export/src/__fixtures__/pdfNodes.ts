/**
 * Layers to draw into PDFs in tests.
 */

import type {
  ArtboardNode,
  Color,
  EllipseNode,
  Fill,
  GroupNode,
  ImageNode,
  Node,
  PathNode,
  PathPoint,
  RectangleNode,
  Stroke,
  TextNode,
} from '@quar/types';

type Base = Pick<
  Node,
  | 'id'
  | 'name'
  | 'parent'
  | 'children'
  | 'transform'
  | 'visible'
  | 'locked'
  | 'opacity'
  | 'blendMode'
>;

export function base(id: string, x = 0, y = 0): Base {
  return {
    id,
    name: id,
    parent: null,
    children: [],
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
    blendMode: 'normal',
  };
}

export const RED: Color = { r: 255, g: 0, b: 0, a: 1 };
export const BLUE: Color = { r: 0, g: 0, b: 255, a: 1 };

export function solid(color: Color, opacity = 1): Fill {
  return { type: 'solid', color, opacity, visible: true };
}

export function line(color: Color, width: number, more: Partial<Stroke> = {}): Stroke {
  return { color, width, opacity: 1, cap: 'butt', join: 'miter', visible: true, ...more };
}

export function rect(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  more: Partial<RectangleNode> = {}
): RectangleNode {
  return {
    ...base(id, x, y),
    type: 'rectangle',
    width,
    height,
    cornerRadius: [0, 0, 0, 0],
    fills: [solid(RED)],
    strokes: [],
    ...more,
  };
}

export function ellipse(
  id: string,
  x: number,
  y: number,
  rx: number,
  ry: number,
  more: Partial<EllipseNode> = {}
): EllipseNode {
  return {
    ...base(id, x, y),
    type: 'ellipse',
    radiusX: rx,
    radiusY: ry,
    fills: [solid(BLUE)],
    strokes: [],
    ...more,
  };
}

export function corner(x: number, y: number): PathPoint {
  return { position: { x, y }, handleIn: null, handleOut: null, type: 'corner' };
}

export function path(id: string, points: PathPoint[], more: Partial<PathNode> = {}): PathNode {
  return {
    ...base(id),
    type: 'path',
    points,
    closed: true,
    fills: [solid(RED)],
    strokes: [],
    ...more,
  };
}

export function group(id: string, children: string[], more: Partial<GroupNode> = {}): GroupNode {
  return { ...base(id), type: 'group', children, ...more };
}

export function artboard(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  more: Partial<ArtboardNode> = {}
): ArtboardNode {
  return {
    ...base(id, x, y),
    type: 'artboard',
    width,
    height,
    fills: [solid({ r: 255, g: 255, b: 255, a: 1 })],
    clipContent: true,
    ...more,
  };
}

export function text(id: string, content: string, more: Partial<TextNode> = {}): TextNode {
  return {
    ...base(id),
    type: 'text',
    content,
    fontFamily: 'Inter',
    fontSize: 20,
    fontWeight: 400,
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    fills: [solid(RED)],
    strokes: [],
    ...more,
  } as TextNode;
}

export function image(
  id: string,
  width: number,
  height: number,
  more: Partial<ImageNode> = {}
): ImageNode {
  return {
    ...base(id),
    type: 'image',
    src: 'data:image/png;base64,AAAA',
    width,
    height,
    naturalWidth: width,
    naturalHeight: height,
    cornerRadius: [0, 0, 0, 0],
    ...more,
  };
}
