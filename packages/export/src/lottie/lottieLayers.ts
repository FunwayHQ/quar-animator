/**
 * Scene → Lottie layers, including images.
 *
 * Shapes, text and groups of them become shape layers. Images need layers of
 * their own (image layers), so a group or artboard containing an image becomes
 * a precomposition: a precomp layer carrying the group's transform and opacity,
 * with the group's children as layers inside it. A video layer is an image
 * layer of its still (Lottie plays no video), there while its clip is.
 */

import type { ImageNode, Node, Timeline, VideoNode } from '@quar/types';
import { createRectanglePath } from '@quar/core';
import { videoClipEndFrame } from '@quar/animation';
import { videoStillPicture, type VideoStills } from '../videoStills';
import type { LottieAsset, LottieLayer, LottieShapeVertices } from './lottieTypes';
import {
  artboardRectVertices,
  buildLottieTransform,
  fillsToLottie,
  maskGroupToLottieLayers,
  nodeToLottieLayer,
  pathPointsToLottieVertices,
  type LottieConvertContext,
} from './lottieConverter';

export interface LayerBuildContext {
  timeline: Timeline;
  resolver: (id: string) => Node | undefined;
  convert: LottieConvertContext;
  startFrame: number;
  duration: number;
  /** Side of the square canvas given to precompositions (centered on their origin). */
  precompSize: number;
  assets: LottieAsset[];
  /** Image src and size → asset id, so repeated images are embedded once at each size shown. */
  imageAssets: Map<string, string>;
  /** Video layers' stills, by layer id (one without shows nothing) */
  videoStills?: VideoStills;
}

/** Where Quar's origin lands in the current composition. */
interface Frame {
  originX: number;
  originY: number;
}

function hasImage(node: Node, ctx: LayerBuildContext): boolean {
  if (node.type === 'image') return true;
  if (node.type === 'video') return ctx.videoStills?.has(node.id) ?? false;
  if (node.type !== 'group' && node.type !== 'artboard') return false;
  return node.children.some((id) => {
    const child = ctx.resolver(id);
    return child !== undefined && child.visible && hasImage(child, ctx);
  });
}

/**
 * Layers for `nodes` (in Quar order: last drawn on top), returned top first as
 * Lottie expects. Layer indices start at 1 within each composition.
 */
export function buildLayers(nodes: Node[], frame: Frame, ctx: LayerBuildContext): LottieLayer[] {
  const layers: LottieLayer[] = [];
  const convert = { ...ctx.convert, originX: frame.originX };
  let ind = 1;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]!;
    if (!node.visible) continue;

    if (node.type === 'image') {
      layers.push(imageLayer(node, ind++, frame, ctx));
      continue;
    }
    if (node.type === 'video') {
      const layer = videoLayer(node, ind, frame, ctx);
      if (layer) {
        layers.push(layer);
        ind++;
      }
      continue;
    }
    if ((node.type === 'group' || node.type === 'artboard') && hasImage(node, ctx)) {
      layers.push(precompLayer(node, ind++, frame, ctx));
      continue;
    }

    const args = [
      node,
      ctx.timeline,
      ind,
      frame.originY,
      ctx.duration,
      ctx.resolver,
      ctx.startFrame,
      convert,
    ] as const;
    const maskLayers = maskGroupToLottieLayers(...args);
    if (maskLayers) {
      layers.push(...maskLayers);
      ind += maskLayers.length;
      continue;
    }
    const layer = nodeToLottieLayer(...args);
    if (layer) {
      layers.push(layer);
      ind++;
    }
  }
  return layers;
}

function timing(ctx: LayerBuildContext) {
  return { ip: ctx.startFrame, op: ctx.startFrame + ctx.duration, st: 0 };
}

/** Convert Y-up vertices to an image's own space (top-left origin, Y-down). */
function toImageSpace(vertices: LottieShapeVertices, height: number): LottieShapeVertices {
  return { ...vertices, v: vertices.v.map(([x = 0, y = 0]) => [x, y + height]) };
}

function imageLayer(
  node: ImageNode,
  ind: number,
  frame: Frame,
  ctx: LayerBuildContext
): LottieLayer {
  // Lottie draws an image layer at its asset's size: a picture shown at another size is another asset
  const key = `${node.width}x${node.height} ${node.src}`;
  let assetId = ctx.imageAssets.get(key);
  if (!assetId) {
    assetId = `image_${ctx.imageAssets.size}`;
    ctx.imageAssets.set(key, assetId);
    ctx.assets.push({ id: assetId, w: node.width, h: node.height, u: '', p: node.src, e: 1 });
  }

  const ks = buildLottieTransform(node, ctx.timeline, frame.originY, frame.originX);
  // The image spans [0,w]×[0,h] in its layer; the anchor puts its pivot where
  // the editor's anchor is (Quar's anchor y counts from the bottom)
  const { x: ax, y: ay } = node.transform.anchor;
  ks.a = { a: 0, k: [node.width * ax, node.height * (1 - ay)] };

  const layer: LottieLayer = {
    ind,
    ty: 2,
    nm: node.name || `Image ${ind}`,
    refId: assetId,
    ks,
    ...timing(ctx),
  };

  if (node.cornerRadius.some((radius) => radius > 0)) {
    const rounded = createRectanglePath(0, 0, node.width, node.height, node.cornerRadius);
    layer.hasMask = true;
    layer.masksProperties = [
      {
        nm: 'Corners',
        mode: 'a',
        inv: false,
        pt: { a: 0, k: toImageSpace(pathPointsToLottieVertices(rounded, true, true), node.height) },
        o: { a: 0, k: 100 },
      },
    ];
  }
  return layer;
}

/**
 * A video layer as an image layer of its still, in from the frame its clip
 * starts on and out where it ends — or, holding its last frame, at the
 * export's end. None without a still, or with its clip outside the export.
 */
function videoLayer(
  node: VideoNode,
  ind: number,
  frame: Frame,
  ctx: LayerBuildContext
): LottieLayer | null {
  const src = ctx.videoStills?.get(node.id);
  if (!src) return null;
  const { op: end } = timing(ctx);
  const ip = Math.max(ctx.startFrame, node.clip.start);
  // The last frame it shows is the one before its end (which needn't be whole)
  const clipEnd = Math.ceil(videoClipEndFrame(node.clip, ctx.timeline.frameRate) - 1e-6);
  const op = node.clip.holdLastFrame ? end : Math.min(end, clipEnd);
  if (!(op > ip)) return null;
  const layer = imageLayer(videoStillPicture(node, src), ind, frame, ctx);
  return { ...layer, nm: node.name || `Video ${ind}`, ip, op };
}

function addComp(layers: LottieLayer[], ctx: LayerBuildContext): string {
  const id = `comp_${ctx.assets.filter((asset) => asset.layers).length}`;
  ctx.assets.push({ id, layers });
  return id;
}

/** A group or artboard containing images, as a precomposition. */
function precompLayer(node: Node, ind: number, frame: Frame, ctx: LayerBuildContext): LottieLayer {
  const size = ctx.precompSize;
  const inner: Frame = { originX: size / 2, originY: size / 2 };
  const maskNode =
    node.type === 'group' && node.maskNodeId && node.maskMode
      ? ctx.resolver(node.maskNodeId)
      : undefined;
  const children = node.children
    .map((id) => ctx.resolver(id))
    .filter((child): child is Node => child !== undefined && child.visible && child !== maskNode);

  let layers = buildLayers(children, inner, ctx);

  // An artboard's background sits under its content
  if (node.type === 'artboard') {
    const fills = fillsToLottie(node.fills, node.id, ctx.timeline);
    if (fills.length > 0) {
      layers.push({
        ind: layers.length + 1,
        ty: 4,
        nm: 'Background',
        ks: {
          a: { a: 0, k: [0, 0] },
          p: { a: 0, k: [inner.originX, inner.originY] },
          r: { a: 0, k: 0 },
          s: { a: 0, k: [100, 100] },
          o: { a: 0, k: 100 },
        },
        ...timing(ctx),
        shapes: [
          { ty: 'sh', nm: 'Artboard', ks: { a: 0, k: artboardRectVertices(node) } },
          ...fills,
        ],
      });
    }
  }

  // A masked group: its mask shape as a track matte over the rest
  if (maskNode && node.type === 'group' && node.maskMode) {
    const matte = nodeToLottieLayer(
      maskNode,
      ctx.timeline,
      1,
      inner.originY,
      ctx.duration,
      ctx.resolver,
      ctx.startFrame,
      { ...ctx.convert, originX: inner.originX }
    );
    if (matte) {
      const contentId = addComp(layers, ctx);
      layers = [
        { ...matte, nm: `${matte.nm} (mask)`, td: 1 },
        {
          ind: 2,
          ty: 0,
          nm: 'Content',
          refId: contentId,
          w: size,
          h: size,
          ks: {
            a: { a: 0, k: [0, 0] },
            p: { a: 0, k: [0, 0] },
            r: { a: 0, k: 0 },
            s: { a: 0, k: [100, 100] },
            o: { a: 0, k: 100 },
          },
          ...timing(ctx),
          tt: node.maskMode === 'luminance' ? 3 : 1,
        },
      ];
    }
  }

  const ks = buildLottieTransform(node, ctx.timeline, frame.originY, frame.originX);
  ks.a = { a: 0, k: [inner.originX, inner.originY] };
  const layer: LottieLayer = {
    ind,
    ty: 0,
    nm: node.name || `Group ${ind}`,
    refId: addComp(layers, ctx),
    w: size,
    h: size,
    ks,
    ...timing(ctx),
  };

  if (node.type === 'artboard' && node.clipContent) {
    const rect = artboardRectVertices(node);
    layer.hasMask = true;
    layer.masksProperties = [
      {
        nm: 'Clip',
        mode: 'a',
        inv: false,
        pt: {
          a: 0,
          k: {
            ...rect,
            v: rect.v.map(([x = 0, y = 0]) => [x + inner.originX, y + inner.originY]),
          },
        },
        o: { a: 0, k: 100 },
      },
    ];
  }
  return layer;
}
