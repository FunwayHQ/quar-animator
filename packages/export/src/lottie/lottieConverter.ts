/**
 * Lottie Converter
 *
 * Pure functions converting Quar scene graph nodes → Lottie layers/shapes.
 *
 * Rectangle, Ellipse, Path, Polygon and Text (as glyph outlines) → shape
 * layers; groups → shape groups. Solid fills/strokes, transform animation,
 * text reveals and stroke draw-on.
 * NOT covered: Gradients, Images, Effects, Blend modes, Rigging, Symbols, Boolean ops.
 */

import type {
  ArtboardNode,
  Node,
  RectangleNode,
  EllipseNode,
  PathNode,
  PolygonNode,
  PathPoint,
  Fill,
  Stroke,
  TextNode,
  Timeline,
} from '@quar/types';
import { applyAnimatedValues, evaluateNodeAtFrame, findTrack } from '@quar/animation';
import {
  applyCornerRadius,
  createPolygonPath,
  createRectanglePath,
  createStarPath,
  getNodeLocalBounds,
} from '@quar/core';
import type {
  LottieLayer,
  LottieShapeItem,
  LottieShapePath,
  LottieShapeRect,
  LottieShapeEllipse,
  LottieShapeFill,
  LottieShapeGradientFill,
  LottieShapeStroke,
  LottieShapeTransform,
  LottieShapeTrim,
  LottieTransform,
  LottieShapeVertices,
  LottieAnimatedValue,
  LottieMask,
  LottieShapeKeyframe,
} from './lottieTypes';
import {
  trackToLottieAnimated,
  positionTracksToLottie,
  steppedTrackToLottie,
  VALUE_TRANSFORMS,
} from './lottieKeyframes';
import { textToLottieShapes, type TextOutlineProvider } from './lottieText';
import { colorTrackToLottie, gradientFillToLottie, type LocalBounds } from './lottiePaint';

/** Optional inputs that some node types need. */
export interface LottieConvertContext {
  /** Glyph outlines for text nodes; text is skipped without them. */
  textOutlines?: TextOutlineProvider;
}

// ============================================================================
// Line Cap / Join Conversion
// ============================================================================

const CAP_MAP: Record<string, 1 | 2 | 3> = { butt: 1, round: 2, square: 3 };
const JOIN_MAP: Record<string, 1 | 2 | 3> = { miter: 1, round: 2, bevel: 3 };

// ============================================================================
// Node → Lottie Layer
// ============================================================================

/**
 * Convert a Quar scene graph node to a Lottie shape layer.
 * Returns null for unsupported node types.
 */
export function nodeToLottieLayer(
  node: Node,
  timeline: Timeline,
  layerIndex: number,
  canvasH: number,
  duration: number,
  nodeResolver?: (id: string) => Node | undefined,
  startFrame: number = 0,
  context: LottieConvertContext = {}
): LottieLayer | null {
  const shapes = nodeToLottieShapes(node, timeline, canvasH, nodeResolver, context);
  if (!shapes || shapes.length === 0) return null;

  // An artboard clipping its content: a layer mask over the artboard rectangle
  const clip = node.type === 'artboard' && node.clipContent ? [artboardClipMask(node)] : null;

  return {
    ind: layerIndex,
    ty: 4, // Shape layer
    nm: node.name || `Layer ${layerIndex}`,
    ...(clip ? { hasMask: true, masksProperties: clip } : {}),
    ks: buildLottieTransform(node, timeline, canvasH),
    // Match the composition window [startFrame, endFrameInclusive + 1). Keyframe times are
    // absolute so st stays 0; using a raw duration made startFrame>0 layers
    // disappear for the final `startFrame` frames.
    ip: startFrame,
    op: startFrame + duration,
    st: 0,
    shapes,
  };
}

/**
 * Convert a mask group to a Lottie track-matte pair: the mask source as a
 * matte layer (`td`) directly above a layer with the group's other children
 * (`tt`). Clip masks use an alpha matte. Returns null when the group has no
 * usable mask, so the caller exports it as a plain layer.
 */
export function maskGroupToLottieLayers(
  node: Node,
  timeline: Timeline,
  layerIndex: number,
  canvasH: number,
  duration: number,
  nodeResolver?: (id: string) => Node | undefined,
  startFrame: number = 0,
  context: LottieConvertContext = {}
): LottieLayer[] | null {
  if (node.type !== 'group' || !node.maskNodeId || !node.maskMode || !nodeResolver) return null;
  const maskNode = nodeResolver(node.maskNodeId);
  if (!maskNode || maskNode.parent !== node.id || !maskNode.visible) return null;

  const matte = nodeToLottieLayer(
    { ...node, children: [maskNode.id], maskNodeId: undefined, maskMode: undefined },
    timeline,
    layerIndex,
    canvasH,
    duration,
    nodeResolver,
    startFrame,
    context
  );
  // Mask shapes Lottie can't express (images): keep the content unclipped.
  if (!matte) return null;

  const content = nodeToLottieLayer(
    node,
    timeline,
    layerIndex + 1,
    canvasH,
    duration,
    nodeResolver,
    startFrame,
    context
  );
  if (!content) return [];

  return [
    {
      ...matte,
      nm: `${matte.nm} (mask)`,
      // The group's opacity already applies to the content layer.
      ks: { ...matte.ks, o: { a: 0, k: 100 } },
      td: 1,
    },
    { ...content, tt: node.maskMode === 'luminance' ? 3 : 1 },
  ];
}

/**
 * Route a node to the appropriate shape converter based on type.
 */
export function nodeToLottieShapes(
  node: Node,
  timeline: Timeline,
  canvasH: number,
  nodeResolver?: (id: string) => Node | undefined,
  context: LottieConvertContext = {}
): LottieShapeItem[] | null {
  switch (node.type) {
    case 'rectangle':
      return rectangleToLottieShapes(node, timeline);
    case 'ellipse':
      return ellipseToLottieShapes(node, timeline);
    case 'path':
      return pathToLottieShapes(node, timeline);
    case 'polygon':
      return polygonToLottieShapes(node, timeline);
    case 'group':
      return groupToLottieShapes(node, timeline, canvasH, nodeResolver, context);
    case 'text':
      return textNodeToLottieShapes(node, timeline, context);
    case 'artboard':
      return artboardToLottieShapes(node, timeline, canvasH, nodeResolver, context);
    default:
      return null; // Image, Bone, etc. not supported
  }
}

// ============================================================================
// Rectangle → Lottie
// ============================================================================

export function rectangleToLottieShapes(
  node: RectangleNode,
  timeline: Timeline,
  _canvasH?: number
): LottieShapeItem[] {
  const items: LottieShapeItem[] = [];

  // Lottie rectangles have one corner radius; differing corners become a path
  const [tl, tr, br, bl] = node.cornerRadius;
  const cornerTracks = [1, 2, 3].some((i) => findTrack(timeline, node.id, `cornerRadius.${i}`));
  if (cornerTracks || tl !== tr || tl !== br || tl !== bl) {
    items.push(
      ...geometryPaths(node, timeline, ['width', 'height', 'cornerRadius.'], (n) => {
        const rect = n as RectangleNode;
        return [
          {
            points: createRectanglePath(
              -rect.width * rect.transform.anchor.x,
              -rect.height * rect.transform.anchor.y,
              rect.width,
              rect.height,
              rect.cornerRadius
            ),
            closed: true,
          },
        ];
      })
    );
    items.push(...strokesToLottie(node.strokes, node.id, timeline));
    items.push(
      ...fillsToLottie(node.fills, node.id, timeline, undefined, getNodeLocalBounds(node))
    );
    items.push(createShapeTransform());
    return items;
  }

  // Shape: rectangle
  const widthTrack = findTrack<number>(timeline, node.id, 'width');
  const heightTrack = findTrack<number>(timeline, node.id, 'height');
  const crTrack = findTrack<number>(timeline, node.id, 'cornerRadius.0');

  // Rect center relative to the pivot (local origin, = the Lottie position),
  // Y-negated. [0,0] for the default centered anchor.
  const rectAnchor = node.transform.anchor ?? { x: 0.5, y: 0.5 };
  const rect: LottieShapeRect = {
    ty: 'rc',
    nm: 'Rectangle',
    p: { a: 0, k: [node.width * (0.5 - rectAnchor.x), -node.height * (0.5 - rectAnchor.y)] },
    s: positionTracksToLottie(widthTrack, heightTrack, node.width, node.height),
    r: trackToLottieAnimated(crTrack, node.cornerRadius[0]),
  };
  items.push(rect);

  // Stroke(s) before fill(s): Lottie draws the first style on top, and Quar
  // draws strokes over fills
  items.push(...strokesToLottie(node.strokes, node.id, timeline));
  items.push(...fillsToLottie(node.fills, node.id, timeline, undefined, getNodeLocalBounds(node)));

  // Shape transform (identity — actual transform is on the layer)
  items.push(createShapeTransform());

  return items;
}

// ============================================================================
// Ellipse → Lottie
// ============================================================================

export function ellipseToLottieShapes(
  node: EllipseNode,
  timeline: Timeline,
  _canvasH?: number
): LottieShapeItem[] {
  const items: LottieShapeItem[] = [];

  const rxTrack = findTrack<number>(timeline, node.id, 'radiusX');
  const ryTrack = findTrack<number>(timeline, node.id, 'radiusY');

  const ellipse: LottieShapeEllipse = {
    ty: 'el',
    nm: 'Ellipse',
    p: { a: 0, k: [0, 0] },
    // Lottie ellipse size is full diameter, Quar stores radius — multiply by 2
    s: positionTracksToLottie(
      rxTrack,
      ryTrack,
      node.radiusX,
      node.radiusY,
      (v) => v * 2,
      (v) => v * 2
    ),
  };
  items.push(ellipse);

  items.push(...strokesToLottie(node.strokes, node.id, timeline)); // stroke on top
  items.push(...fillsToLottie(node.fills, node.id, timeline, undefined, getNodeLocalBounds(node)));
  items.push(createShapeTransform());

  return items;
}

// ============================================================================
// Path → Lottie
// ============================================================================

export function pathToLottieShapes(
  node: PathNode,
  timeline: Timeline,
  _canvasH?: number
): LottieShapeItem[] {
  // Every contour, rounded corners applied as the editor draws them; shape
  // tweens and vertex edits animate them
  const items: LottieShapeItem[] = geometryPaths(
    node,
    timeline,
    ['points', 'points.', 'subpaths.'],
    (n) => {
      const path = n as PathNode;
      return [
        { points: applyCornerRadius(path.points, path.closed), closed: path.closed },
        ...(path.subpaths ?? []).map((points) => ({
          points: applyCornerRadius(points, true),
          closed: true,
        })),
      ];
    }
  );

  const strokes = strokesToLottie(node.strokes, node.id, timeline);
  const fills = fillsToLottie(
    node.fills,
    node.id,
    timeline,
    node.fillRule,
    getNodeLocalBounds(node)
  );

  // Draw On: the stroke is trimmed to strokeProgress and, as in the editor,
  // the fill only shows once the stroke is complete
  const progressTrack = findTrack<number>(timeline, node.id, 'strokeProgress');
  const drawsOn =
    (progressTrack !== undefined && progressTrack.keyframes.length > 0) ||
    (node.strokeProgress !== undefined && node.strokeProgress < 1);
  if (drawsOn) {
    const toPercent = (v: number) => Math.max(0, Math.min(1, v)) * 100;
    const trim: LottieShapeTrim = {
      ty: 'tm',
      nm: 'Draw On',
      s: { a: 0, k: 0 },
      e: trackToLottieAnimated(progressTrack, node.strokeProgress ?? 1, toPercent),
      o: { a: 0, k: 0 },
      m: 1, // every contour trimmed to the same progress
    };
    const complete = (v: number) => (v >= 1 ? 1 : 0);
    const fillShown: LottieAnimatedValue = progressTrack?.keyframes.length
      ? steppedTrackToLottie(progressTrack, complete)
      : { a: 0, k: complete(node.strokeProgress ?? 1) };
    const gatedFills = fills.map((fill) => ({
      ...fill,
      o: scaleOpacity(fillShown, staticValue(fill.o)),
    }));
    return [
      { ty: 'gr', nm: 'Stroke', it: [...items, trim, ...strokes, createShapeTransform()] },
      { ty: 'gr', nm: 'Fill', it: [...items, ...gatedFills, createShapeTransform()] },
    ];
  }

  items.push(...strokes); // stroke on top
  items.push(...fills);
  items.push(createShapeTransform());

  return items;
}

/** A value's static (or first keyframe) value. */
function staticValue(value: LottieAnimatedValue): number {
  return typeof value.k === 'number' ? value.k : (value.k[0]?.s[0] ?? 0);
}

/** A 0/1 switch scaled to a fill's opacity (0-100). */
function scaleOpacity(shown: LottieAnimatedValue, opacity: number): LottieAnimatedValue {
  if (shown.a === 0) return { a: 0, k: (shown.k as number) * opacity };
  return {
    a: 1,
    k: (shown.k as Exclude<LottieAnimatedValue['k'], number>).map((kf) => ({
      ...kf,
      s: [kf.s[0] * opacity] as [number],
    })),
  };
}

// ============================================================================
// Text → Lottie (glyph outlines)
// ============================================================================

function pointsBounds(points: PathPoint[]): LocalBounds {
  if (points.length === 0) return [0, 0, 0, 0];
  const xs = points.map((point) => point.position.x);
  const ys = points.map((point) => point.position.y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function textNodeToLottieShapes(
  node: TextNode,
  timeline: Timeline,
  context: LottieConvertContext
): LottieShapeItem[] | null {
  return textToLottieShapes(node, timeline, {
    outlines: context.textOutlines,
    identityTransform: createShapeTransform,
    contourShapes: (subpaths) => [
      ...subpaths.map(
        (points, index): LottieShapePath => ({
          ty: 'sh',
          nm: `Contour ${index + 1}`,
          ks: { a: 0, k: pathPointsToLottieVertices(points, true, true) },
        })
      ),
      ...strokesToLottie(node.strokes, node.id, timeline),
      // The editor fills glyph contours even-odd
      ...fillsToLottie(node.fills, node.id, timeline, 'evenodd', pointsBounds(subpaths.flat())),
    ],
  });
}

// ============================================================================
// Polygon → Lottie (converted to path vertices)
// ============================================================================

export function polygonToLottieShapes(
  node: PolygonNode,
  timeline: Timeline,
  _canvasH?: number
): LottieShapeItem[] {
  // The editor's own polygon/star geometry (incl. rounded corners); animated
  // radius, inner radius, sides and corner radius are baked
  const items: LottieShapeItem[] = geometryPaths(
    node,
    timeline,
    ['radius', 'innerRadius', 'sides', 'cornerRadius'],
    (n) => {
      const polygon = n as PolygonNode;
      const sides = Math.max(3, Math.round(polygon.sides));
      return [
        {
          points:
            polygon.innerRadius !== undefined
              ? createStarPath(
                  0,
                  0,
                  polygon.radius,
                  polygon.innerRadius,
                  sides,
                  undefined,
                  polygon.cornerRadius
                )
              : createPolygonPath(0, 0, polygon.radius, sides, undefined, polygon.cornerRadius),
          closed: true,
        },
      ];
    },
    'Polygon'
  );

  items.push(...strokesToLottie(node.strokes, node.id, timeline)); // stroke on top
  items.push(...fillsToLottie(node.fills, node.id, timeline, undefined, getNodeLocalBounds(node)));
  items.push(createShapeTransform());

  return items;
}

// ============================================================================
// Geometry (static or baked per frame)
// ============================================================================

interface Contour {
  points: PathPoint[];
  closed: boolean;
}

/**
 * One Lottie path per contour of `contoursOf(node)`. When tracks matching
 * `properties` (exact names, or prefixes ending in '.') animate the geometry,
 * it is evaluated every frame between their first and last keyframe — exact
 * for shape tweens whose vertex count changes, which Lottie can't interpolate:
 * consecutive frames with the same vertex count interpolate linearly, others
 * hold.
 */
function geometryPaths(
  node: Node,
  timeline: Timeline,
  properties: string[],
  contoursOf: (node: Node) => Contour[],
  name = 'Path'
): LottieShapePath[] {
  const matches = (property: string) =>
    properties.some((p) => (p.endsWith('.') ? property.startsWith(p) : property === p));
  const tracks = timeline.tracks.filter(
    (track) => track.nodeId === node.id && track.keyframes.length > 0 && matches(track.property)
  );
  const pathName = (index: number) => (index === 0 ? name : `Subpath ${index}`);

  if (tracks.length === 0) {
    return contoursOf(node).map((contour, index) => ({
      ty: 'sh',
      nm: pathName(index),
      ks: { a: 0, k: pathPointsToLottieVertices(contour.points, contour.closed, true) },
    }));
  }

  const first = Math.floor(Math.min(...tracks.map((track) => track.keyframes[0]!.time)));
  const last = Math.ceil(
    Math.max(...tracks.map((track) => track.keyframes[track.keyframes.length - 1]!.time))
  );
  const geometry = { ...timeline, tracks };
  const frames: LottieShapeVertices[][] = [];
  for (let frame = first; frame <= last; frame++) {
    const posed = applyAnimatedValues(node, evaluateNodeAtFrame(geometry, node.id, frame));
    frames.push(
      contoursOf(posed).map((contour) =>
        pathPointsToLottieVertices(contour.points, contour.closed, true)
      )
    );
  }

  const contourCount = Math.min(...frames.map((contours) => contours.length));
  return Array.from({ length: contourCount }, (_, index): LottieShapePath => {
    const series = frames.map((contours) => contours[index]!);
    if (series.every((vertices) => JSON.stringify(vertices) === JSON.stringify(series[0]))) {
      return { ty: 'sh', nm: pathName(index), ks: { a: 0, k: series[0]! } };
    }
    const keyframes = series.map((vertices, frameIndex): LottieShapeKeyframe => {
      const t = first + frameIndex;
      const next = series[frameIndex + 1];
      if (!next) return { t, s: [vertices] };
      if (next.v.length !== vertices.v.length) return { t, s: [vertices], h: 1 };
      return { t, s: [vertices], e: [next], i: { x: [1], y: [1] }, o: { x: [0], y: [0] } };
    });
    return { ty: 'sh', nm: pathName(index), ks: { a: 1, k: keyframes } };
  });
}

// ============================================================================
// Group → Lottie Shape Group
// ============================================================================

export function groupToLottieShapes(
  node: Node,
  timeline: Timeline,
  canvasH: number,
  nodeResolver?: (id: string) => Node | undefined,
  context: LottieConvertContext = {}
): LottieShapeItem[] {
  if (!nodeResolver || !node.children || node.children.length === 0) return [];

  // A mask source only defines coverage and is never drawn itself. Shape groups
  // can't carry track mattes, so nested masks export their content unclipped;
  // root-level masks become matte layers (see maskGroupToLottieLayers).
  const maskNodeId = node.type === 'group' ? node.maskNodeId : undefined;

  // Recursively convert each child into Lottie shape items. Quar draws
  // children in array order (last on top); Lottie draws the first item on top.
  const childItems: LottieShapeItem[] = [];
  for (const childId of [...node.children].reverse()) {
    if (childId === maskNodeId) continue;
    const childNode = nodeResolver(childId);
    if (!childNode || !childNode.visible) continue;
    const shapes = nodeToLottieShapes(childNode, timeline, canvasH, nodeResolver, context);
    if (shapes && shapes.length > 0) {
      // Wrap each child's shapes in a group ('gr') item with its transform
      const grItem: LottieShapeItem = {
        ty: 'gr',
        nm: childNode.name || 'Group Child',
        it: [...shapes, childShapeTransform(childNode, timeline)],
      } as LottieShapeItem;
      childItems.push(grItem);
    }
  }

  return childItems;
}

/**
 * A grouped child's transform, animated like a layer's. The child's position is
 * in the parent's local space, so Y is only negated — no canvas flip.
 */
export function childShapeTransform(node: Node, timeline: Timeline): LottieShapeTransform {
  const { transform } = node;
  const track = (property: string) => findTrack<number>(timeline, node.id, property);
  return {
    ty: 'tr',
    p: positionTracksToLottie(
      track('transform.position.x'),
      track('transform.position.y'),
      transform.position.x,
      transform.position.y,
      VALUE_TRANSFORMS.identity,
      (v) => -v
    ),
    r: trackToLottieAnimated(track('transform.rotation'), transform.rotation, (v) => -v),
    s: positionTracksToLottie(
      track('transform.scale.x'),
      track('transform.scale.y'),
      transform.scale.x,
      transform.scale.y,
      VALUE_TRANSFORMS.scaleTo100,
      VALUE_TRANSFORMS.scaleTo100
    ),
    o: trackToLottieAnimated(
      track('opacity'),
      ((node as unknown as Record<string, unknown>).opacity as number) ?? 1,
      VALUE_TRANSFORMS.opacityTo100
    ),
  };
}

// ============================================================================
// Artboard → Lottie
// ============================================================================

/** The artboard rectangle in Lottie local space (Y-down), from its anchor. */
function artboardRectVertices(node: ArtboardNode): LottieShapeVertices {
  const anchor = node.transform.anchor ?? { x: 0.5, y: 0.5 };
  const left = -node.width * anchor.x;
  const top = -node.height * (1 - anchor.y);
  const corners = [
    [left, top],
    [left + node.width, top],
    [left + node.width, top + node.height],
    [left, top + node.height],
  ];
  const zero = corners.map(() => [0, 0]);
  return { v: corners, i: zero, o: zero, c: true };
}

function artboardClipMask(node: ArtboardNode): LottieMask {
  return {
    nm: 'Clip',
    mode: 'a',
    inv: false,
    pt: { a: 0, k: artboardRectVertices(node) },
    o: { a: 0, k: 100 },
  };
}

/** An artboard: its children over its background fill. */
export function artboardToLottieShapes(
  node: ArtboardNode,
  timeline: Timeline,
  canvasH: number,
  nodeResolver?: (id: string) => Node | undefined,
  context: LottieConvertContext = {}
): LottieShapeItem[] {
  const items = groupToLottieShapes(node, timeline, canvasH, nodeResolver, context);
  const anchor = node.transform.anchor ?? { x: 0.5, y: 0.5 };
  const left = -node.width * anchor.x;
  const bottom = -node.height * anchor.y;
  const fills = fillsToLottie(node.fills, node.id, timeline, undefined, [
    left,
    bottom,
    left + node.width,
    bottom + node.height,
  ]);
  if (fills.length > 0) {
    items.push({
      ty: 'gr',
      nm: 'Background',
      it: [
        { ty: 'sh', nm: 'Artboard', ks: { a: 0, k: artboardRectVertices(node) } },
        ...fills,
        createShapeTransform(),
      ],
    });
  }
  return items;
}

// ============================================================================
// Path Points → Lottie Vertices
// ============================================================================

/**
 * Convert Quar PathPoints to Lottie shape vertex format.
 *
 * Lottie uses:
 * - v: absolute vertex positions [[x, y], ...]
 * - i: in-tangent handles RELATIVE to vertex
 * - o: out-tangent handles RELATIVE to vertex
 * - c: whether the path is closed
 *
 * Quar handles are also relative to their point (control point = position +
 * handle), so they carry over as-is.
 */
export function pathPointsToLottieVertices(
  points: PathPoint[],
  closed: boolean,
  negateY: boolean = false
): LottieShapeVertices {
  const v: number[][] = [];
  const i: number[][] = [];
  const o: number[][] = [];
  // The layer uses positive scale (no Y reflection), so to reproduce the Quar
  // Y-up -> Lottie Y-down flip the LOCAL path geometry must be Y-negated. Only
  // real paths need this; generatePolygonPoints already emits Lottie-space Y.
  const sy = negateY ? -1 : 1;

  for (const pt of points) {
    v.push([pt.position.x, sy * pt.position.y]);

    i.push(pt.handleIn ? [pt.handleIn.x, sy * pt.handleIn.y] : [0, 0]);
    o.push(pt.handleOut ? [pt.handleOut.x, sy * pt.handleOut.y] : [0, 0]);
  }

  return { v, i, o, c: closed };
}

// ============================================================================
// Fills → Lottie
// ============================================================================

/**
 * Convert Quar fills to Lottie fill items: solid fills (with animated color
 * and opacity) and linear/radial gradients positioned within `bounds`.
 */
export function fillsToLottie(
  fills: Fill[] | undefined,
  nodeId: string,
  timeline: Timeline,
  fillRule?: 'nonzero' | 'evenodd',
  bounds: LocalBounds = [0, 0, 0, 0]
): Array<LottieShapeFill | LottieShapeGradientFill> {
  if (!fills) return [];

  const result: Array<LottieShapeFill | LottieShapeGradientFill> = [];
  for (let idx = 0; idx < fills.length; idx++) {
    const fill = fills[idx]!;
    if (!fill.visible) continue;
    const opacity = trackToLottieAnimated(
      findTrack<number>(timeline, nodeId, `fills.${idx}.opacity`),
      fill.opacity,
      VALUE_TRANSFORMS.opacityTo100
    );

    if (fill.type === 'gradient' && fill.gradient) {
      result.push(
        gradientFillToLottie(
          fill as Fill & { gradient: NonNullable<Fill['gradient']> },
          idx,
          nodeId,
          timeline,
          bounds,
          opacity,
          fillRule
        )
      );
      continue;
    }
    if (fill.type !== 'solid' || !fill.color) continue;

    const lottieFill: LottieShapeFill = {
      ty: 'fl',
      nm: `Fill ${idx + 1}`,
      c: colorTrackToLottie(findTrack(timeline, nodeId, `fills.${idx}.color`), fill.color),
      o: opacity,
    };
    if (fillRule === 'evenodd') {
      lottieFill.r = 2;
    }
    result.push(lottieFill);
  }

  return result;
}

// ============================================================================
// Strokes → Lottie
// ============================================================================

/**
 * Convert Quar strokes to Lottie stroke shape items.
 */
export function strokesToLottie(
  strokes: Stroke[] | undefined,
  nodeId: string,
  timeline: Timeline
): LottieShapeStroke[] {
  if (!strokes) return [];

  const result: LottieShapeStroke[] = [];
  for (let idx = 0; idx < strokes.length; idx++) {
    const stroke = strokes[idx]!;
    if (!stroke.visible) continue;

    const widthTrack = findTrack<number>(timeline, nodeId, `strokes.${idx}.width`);

    const lottieStroke: LottieShapeStroke = {
      ty: 'st',
      nm: `Stroke ${idx + 1}`,
      c: colorTrackToLottie(findTrack(timeline, nodeId, `strokes.${idx}.color`), stroke.color),
      o: trackToLottieAnimated(
        findTrack<number>(timeline, nodeId, `strokes.${idx}.opacity`),
        stroke.opacity,
        VALUE_TRANSFORMS.opacityTo100
      ),
      w: trackToLottieAnimated(widthTrack, stroke.width),
      lc: CAP_MAP[stroke.cap] ?? 2,
      lj: JOIN_MAP[stroke.join] ?? 1,
    };

    if (stroke.miterLimit) {
      lottieStroke.ml = stroke.miterLimit;
    }

    result.push(lottieStroke);
  }

  return result;
}

// ============================================================================
// Transform → Lottie
// ============================================================================

/**
 * Build a Lottie layer transform from a Quar node transform.
 *
 * Key conversions:
 * - Anchor: Quar normalized (0-1) → Lottie pixels. Y-flip for anchor.
 * - Position: Y-flip (canvasH - y)
 * - Scale: Quar 0-1 → Lottie 0-100
 * - Rotation: Quar stores degrees (same as Lottie), but Y-flip negates rotation
 * - Opacity: Quar 0-1 → Lottie 0-100
 */
export function buildLottieTransform(
  node: Node,
  timeline: Timeline,
  canvasH: number
): LottieTransform {
  const { transform } = node;
  const nodeId = node.id;

  // Tracks
  const posXTrack = findTrack<number>(timeline, nodeId, 'transform.position.x');
  const posYTrack = findTrack<number>(timeline, nodeId, 'transform.position.y');
  const rotTrack = findTrack<number>(timeline, nodeId, 'transform.rotation');
  const scaleXTrack = findTrack<number>(timeline, nodeId, 'transform.scale.x');
  const scaleYTrack = findTrack<number>(timeline, nodeId, 'transform.scale.y');
  const opacityTrack = findTrack<number>(timeline, nodeId, 'opacity');

  const flipY = VALUE_TRANSFORMS.yFlip(canvasH);

  return {
    // The Quar pivot IS the local origin, which maps directly to the Lottie
    // position, so the layer anchor is [0,0]. Any anchor-dependent geometry
    // offset lives in the shape's local p (see rectangleToLottieShapes) — the
    // old width/height-based anchor mis-placed the shape and orbited rotation
    // about a corner.
    a: { a: 0, k: [0, 0] },
    p: positionTracksToLottie(
      posXTrack,
      posYTrack,
      transform.position.x,
      transform.position.y,
      VALUE_TRANSFORMS.identity,
      flipY
    ),
    // Negate rotation for the Y-flip. Pass the negation as the value transform so
    // KEYFRAMED rotation is negated too (the default-value arg only applies when
    // there is no track).
    r: trackToLottieAnimated(rotTrack, transform.rotation, (v) => -v),
    s: positionTracksToLottie(
      scaleXTrack,
      scaleYTrack,
      transform.scale.x,
      transform.scale.y,
      VALUE_TRANSFORMS.scaleTo100,
      VALUE_TRANSFORMS.scaleTo100
    ),
    o: trackToLottieAnimated(
      opacityTrack,
      ((node as unknown as Record<string, unknown>).opacity as number) ?? 1,
      VALUE_TRANSFORMS.opacityTo100
    ),
  };
}

// ============================================================================
// Helpers
// ============================================================================

function createShapeTransform(): LottieShapeTransform {
  return {
    ty: 'tr',
    p: { a: 0, k: [0, 0] },
    r: { a: 0, k: 0 },
    s: { a: 0, k: [100, 100] },
    o: { a: 0, k: 100 },
  };
}

/**
 * Generate polygon/star vertex points from a PolygonNode.
 * Returns corner PathPoints (no bezier handles).
 */
export function generatePolygonPoints(node: PolygonNode): PathPoint[] {
  const { sides, radius, innerRadius } = node;
  const points: PathPoint[] = [];
  const isStar = innerRadius != null && innerRadius > 0;
  const count = isStar ? sides * 2 : sides;

  for (let k = 0; k < count; k++) {
    const angle = (k / count) * Math.PI * 2 - Math.PI / 2; // Start from top
    // innerRadius is guaranteed non-null and > 0 when isStar is true
    const r = isStar && k % 2 === 1 ? (innerRadius ?? 0) : radius;
    points.push({
      position: { x: Math.cos(angle) * r, y: Math.sin(angle) * r },
      handleIn: null,
      handleOut: null,
      type: 'corner',
    });
  }

  return points;
}
