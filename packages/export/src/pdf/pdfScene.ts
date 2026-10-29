/**
 * PDF Scene
 * A posed scene painted onto a PDF page as the canvas paints it, in vector:
 * layer by layer, in the same order, with the same geometry, fills and
 * strokes, gradients, opacity (each paint takes its layer's and its
 * ancestors'), blend modes, masks, artboard clipping, boolean results and
 * symbols. What PDF can't draw is drawn by the editor's renderer as a
 * picture in its place: a layer blur, a bent picture, a picture's
 * adjustments, and each drop shadow (under the layer, which stays vector).
 *
 * Every content stream here draws in the document's world space (Y up, as
 * PDF's is): a page maps it onto the page once, and groups (masked content,
 * blended layers, masks themselves) are painted where that space is current.
 */

import {
  DEFAULT_TESSELLATION_TOLERANCE,
  SelectionManager,
  computeBounds,
  createRectanglePath,
  dashPolyline,
  dashStretches,
  getResolvedRootNodes,
  isDocumentImage,
  mat3,
  nodeToPolygon,
  performBoolean,
  pieceAlign,
  resolveSymbolInstance,
  type SceneGraph,
} from '@quar/core';
import type {
  ArtboardNode,
  BlendMode,
  DropShadowEffect,
  Fill,
  Gradient,
  GroupNode,
  ImageNode,
  Matrix3,
  Node,
  Rect,
  Stroke,
  SymbolDefinition,
  SymbolInstanceNode,
} from '@quar/types';
import { PdfContent, rgb, type Contour } from './pdfContent';
import { pdfNumber as n } from './pdfDocument';
import {
  clockwiseContour,
  editorTextOutlines,
  fillBox,
  flatten,
  shapeGeometry,
  strokeBox,
  strokeOutline,
  unionBox,
  type Box,
  type ShapeGeometry,
  type TextOutlines,
} from './pdfGeometry';
import { gradientPaint, type GradientPaint } from './pdfPaint';
import { transparencyGroup, type DecodedImage, type PdfRaster, type PdfWriter } from './pdfWriter';

/** Draws one layer as the canvas does, over a part of the world, for what PDF can't draw. */
export interface PdfRasterizer {
  /**
   * The layer (and what's in it) over `rect` (world, Y up) at `scale`
   * pixels a unit, its blend mode left out — and its effects too, unless
   * `withEffects` (a drop shadow is worked out from the layer without them).
   */
  render(
    nodeId: string,
    rect: Rect,
    scale: number,
    withEffects: boolean
  ): Promise<PdfRaster | null>;
}

export interface PdfSceneOptions {
  symbols?: SymbolDefinition[];
  textOutlines?: TextOutlines;
  /** A document picture's pixels (or its JPEG); null when it can't be read */
  decodeImage: (src: string) => Promise<DecodedImage | null>;
  /** Without one, layers with effects are drawn without them, bent pictures unbent */
  rasterizer?: PdfRasterizer;
  /** Pixels a unit layers are drawn as pictures at (fewer for big layers) */
  rasterScale?: number;
  /** The page's part of the world: the extent of the groups painted on it */
  pageBox: Box;
}

/** How what's drawn now is painted. */
interface DrawState {
  out: PdfContent;
  /** Its ancestors' opacity, multiplied together (each paint takes it) */
  opacity: number;
  /** Drawing a mask: plain, without effects or blending (as the canvas draws a mask layer) */
  masking: boolean;
  /** Drawing a clip mask: every paint a solid silhouette (as the canvas's mask pass) */
  silhouette: boolean;
}

/** PDF's names for the canvas's blend modes. */
const BLEND_MODES: Partial<Record<BlendMode, string>> = {
  multiply: 'Multiply',
  screen: 'Screen',
  overlay: 'Overlay',
  darken: 'Darken',
  lighten: 'Lighten',
  'color-dodge': 'ColorDodge',
  'color-burn': 'ColorBurn',
  'hard-light': 'HardLight',
  'soft-light': 'SoftLight',
  difference: 'Difference',
  exclusion: 'Exclusion',
  hue: 'Hue',
  saturation: 'Saturation',
  color: 'Color',
  luminosity: 'Luminosity',
};

const CAPS: Record<Stroke['cap'], number> = { butt: 0, round: 1, square: 2 };
const JOINS: Record<Stroke['join'], number> = { miter: 0, round: 1, bevel: 2 };
/** The canvas mitres to 4 half-widths at most */
const MITER_LIMIT = 4;
/** Below this a paint shows nothing (the canvas's mask pass counts nothing fainter) */
const INVISIBLE = 0.004;
/** Most pixels a layer drawn as a picture has */
const MAX_RASTER_PIXELS = 16_000_000;
const MAX_RASTER_SIDE = 8192;
const MAX_BOOLEAN_DEPTH = 10;

/** The layers that bend as meshes, which only the renderer draws (bound shapes are bent paths by now). */
function bends(node: Node): boolean {
  return (
    node.type !== 'bone' &&
    node.type !== 'group' &&
    node.type !== 'text' &&
    !!(node as { skinData?: unknown }).skinData
  );
}

function hasAdjustments(node: ImageNode): boolean {
  const adjustments = node.adjustments;
  return !!adjustments && Object.values(adjustments).some((value) => value !== 0);
}

/** A box's 0–1 space mapped onto the box. */
function boxMatrix(box: Box): Matrix3 {
  const width = box[2] - box[0];
  const height = box[3] - box[1];
  return mat3.create(width > 0 ? width : 1e-6, 0, 0, height > 0 ? height : 1e-6, box[0], box[1]);
}

function padBox(box: Box, by: number): Box {
  return [box[0] - by, box[1] - by, box[2] + by, box[3] + by];
}

const matrixArray = (m: Matrix3) => [m.a, m.b, m.c, m.d, m.tx, m.ty].map(n).join(' ');

/**
 * Three box blurs, as near a Gaussian of `sigma` pixels as their widths
 * allow, over one channel (rows of `width`), in place.
 */
export function gaussianBlur(values: Float32Array, width: number, height: number, sigma: number) {
  if (!(sigma > 0.25)) return;
  // Box widths for three passes (Kovesi's construction)
  const ideal = Math.sqrt((12 * sigma * sigma) / 3 + 1);
  let lower = Math.floor(ideal);
  if (lower % 2 === 0) lower--;
  const upper = lower + 2;
  const m = Math.round(
    (12 * sigma * sigma - 3 * lower * lower - 12 * lower - 9) / (-4 * lower - 4)
  );
  const scratch = new Float32Array(values.length);
  for (let pass = 0; pass < 3; pass++) {
    const radius = ((pass < m ? lower : upper) - 1) / 2;
    boxPass(values, scratch, width, height, radius, true);
    boxPass(scratch, values, width, height, radius, false);
  }
}

function boxPass(
  from: Float32Array,
  to: Float32Array,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean
) {
  const lines = horizontal ? height : width;
  const length = horizontal ? width : height;
  const stride = horizontal ? 1 : width;
  const span = radius * 2 + 1;
  for (let line = 0; line < lines; line++) {
    const start = horizontal ? line * width : line;
    let sum = 0;
    // Outside the picture counts as clear
    for (let k = -radius; k <= radius; k++) {
      if (k >= 0 && k < length) sum += from[start + k * stride] ?? 0;
    }
    for (let i = 0; i < length; i++) {
      to[start + i * stride] = sum / span;
      const enter = i + radius + 1;
      const leave = i - radius;
      if (enter < length) sum += from[start + enter * stride] ?? 0;
      if (leave >= 0) sum -= from[start + leave * stride] ?? 0;
    }
  }
}

export class PdfSceneDrawer {
  private readonly symbols: Map<string, SymbolDefinition>;
  private readonly textOutlines: TextOutlines;
  private readonly gradients = new Map<string, GradientPaint>();
  private readonly bounds = new SelectionManager();

  constructor(
    private readonly writer: PdfWriter,
    private readonly scene: SceneGraph,
    private readonly options: PdfSceneOptions
  ) {
    this.symbols = new Map((options.symbols ?? []).map((symbol) => [symbol.id, symbol]));
    this.textOutlines = options.textOutlines ?? editorTextOutlines;
    this.bounds.setSymbolDefinitions(options.symbols ?? []);
  }

  /** Paint these layers (and everything in them), in order, into `out`. */
  async draw(out: PdfContent, roots: Node[]): Promise<void> {
    for (const root of roots) {
      const parentOpacity = root.parent ? this.scene.getEffectiveOpacity(root.parent) : 1;
      await this.drawSceneNode(root, {
        out,
        opacity: parentOpacity,
        masking: false,
        silhouette: false,
      });
    }
  }

  // --------------------------------------------------------------------------
  // The scene
  // --------------------------------------------------------------------------

  private async drawSceneNode(node: Node, state: DrawState): Promise<void> {
    if (!node.visible) return;
    const world = this.scene.getWorldTransform(node.id);
    const own = { ...state, opacity: state.opacity * node.opacity };
    switch (node.type) {
      case 'artboard':
        this.artboardBackground(node, world, own);
        if (node.clipContent) {
          state.out.save();
          this.clipToArtboard(node, world, state.out);
          await this.drawSceneChildren(node, own);
          state.out.restore();
          return;
        }
        return this.drawSceneChildren(node, own);
      case 'group': {
        if (node.booleanOp) {
          return this.withEffects(node, own, (s) => this.drawBooleanGroup(node, s));
        }
        // Its effects and blend mode apply to the group as a whole, as on the canvas
        const mask = this.maskSource(node, (id) => this.scene.getNode(id));
        const maskMode = node.maskMode;
        return this.withEffects(node, own, (s) =>
          mask && maskMode
            ? this.drawMasked(
                maskMode,
                mask,
                this.scene.getWorldTransform(mask.id),
                (m) => this.drawSceneNode(mask, m),
                (c) => this.drawSceneChildren(node, c, mask.id),
                s
              )
            : this.drawSceneChildren(node, s)
        );
      }
      case 'symbol-instance':
        return this.withEffects(node, own, (s) => this.drawSymbol(node, world, s, new Set()));
      case 'bone':
      case 'ik-target':
      case 'vitruvian':
        // Rig helpers aren't artwork; what hangs from them is
        return this.drawSceneChildren(node, own);
      default:
        await this.withEffects(node, own, (s) => this.drawLeaf(node, world, s));
        return this.drawSceneChildren(node, own);
    }
  }

  private async drawSceneChildren(node: Node, state: DrawState, skip?: string): Promise<void> {
    for (const childId of node.children) {
      if (childId === skip) continue;
      const child = this.scene.getNode(childId);
      if (child) await this.drawSceneNode(child, state);
    }
  }

  /** The direct child a group masks with, as the canvas finds it. */
  private maskSource(group: GroupNode, getNode: (id: string) => Node | undefined): Node | null {
    if (!group.maskNodeId || !group.maskMode || group.booleanOp) return null;
    const mask = getNode(group.maskNodeId);
    if (!mask || mask.parent !== group.id || !mask.visible) return null;
    return mask;
  }

  // --------------------------------------------------------------------------
  // Effects and blending
  // --------------------------------------------------------------------------

  /**
   * A layer with what the canvas does round it: drop shadows under it, a
   * layer blur (or a bent or adjusted picture) as a picture in its place,
   * and its blend mode, which blends it as a whole (an isolated group).
   */
  private async withEffects(
    node: Node,
    state: DrawState,
    draw: (state: DrawState) => Promise<void>
  ): Promise<void> {
    if (state.masking) return draw(state);
    const effects = (node.effects ?? []).filter((effect) => effect.visible);
    const blur = effects.some((effect) => effect.type === 'layer-blur' && effect.radius > 0);
    const shadows = effects.filter(
      (effect): effect is DropShadowEffect => effect.type === 'drop-shadow'
    );
    const blend = BLEND_MODES[node.blendMode];
    const rasterizer = this.options.rasterizer;
    const asPicture = blur || bends(node) || (node.type === 'image' && hasAdjustments(node));

    if (rasterizer && asPicture) {
      await this.drawAsPicture(node, effects, state, blend, rasterizer);
      return;
    }
    if (rasterizer && shadows.length > 0) {
      await this.drawShadows(node, shadows, state, rasterizer);
    }
    if (!blend) return draw(state);

    const group = new PdfContent();
    await draw({ ...state, out: group });
    if (group.empty) return;
    const form = await this.writer.form(group, this.options.pageBox, transparencyGroup(true));
    const name = this.writer.resources.add('XObject', form);
    state.out
      .save()
      .op(`/${this.writer.resources.alpha(1, 1, blend)} gs /${name} Do`)
      .restore();
  }

  /** Where a layer and what it draws reach: its bounds, its strokes and its effects' spread. */
  private reach(node: Node, effects: Node['effects']): Rect | null {
    const rect = this.bounds.getSelectionBounds(new Set([node.id]), this.scene)?.rect;
    if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return null;
    let pad = 2;
    for (const stroke of 'strokes' in node && Array.isArray(node.strokes) ? node.strokes : []) {
      if (stroke.visible) pad = Math.max(pad, stroke.width + 2);
    }
    for (const effect of effects ?? []) {
      if (!effect.visible) continue;
      if (effect.type === 'drop-shadow') {
        pad = Math.max(pad, effect.blur + Math.max(0, effect.spread) + 2);
      } else if (effect.type === 'layer-blur') {
        pad = Math.max(pad, effect.radius + 2);
      }
    }
    return {
      x: rect.x - pad,
      y: rect.y - pad,
      width: rect.width + 2 * pad,
      height: rect.height + 2 * pad,
    };
  }

  /** Pixels a unit for a picture of `rect`: the scale asked for, fewer when it'd be huge. */
  private rasterScale(rect: Rect, wanted = this.options.rasterScale ?? 3): number {
    const side = MAX_RASTER_SIDE / Math.max(rect.width, rect.height);
    const area = Math.sqrt(MAX_RASTER_PIXELS / Math.max(rect.width * rect.height, 1));
    return Math.max(0.05, Math.min(wanted, side, area));
  }

  private async drawAsPicture(
    node: Node,
    effects: Node['effects'],
    state: DrawState,
    blend: string | undefined,
    rasterizer: PdfRasterizer
  ): Promise<void> {
    const rect = this.reach(node, effects);
    if (!rect) return;
    // A picture at its own resolution where the page has it (however it's
    // scaled), unless effects spread it
    let wanted: number | undefined;
    if (node.type === 'image' && !effects?.length) {
      const decoded = await this.options.decodeImage(node.src).catch(() => null);
      const world = this.scene.getWorldTransform(node.id);
      const across = node.width * Math.hypot(world.a, world.b);
      if (decoded && across > 0) wanted = Math.max(1, decoded.width / across);
    }
    const scale = this.rasterScale(rect, wanted);
    const raster = await rasterizer.render(node.id, rect, scale, true);
    if (!raster) return;
    const image = await this.writer.raster(raster);
    this.placePicture(state.out, image, rect, this.writer.resources.alpha(1, 1, blend));
  }

  /**
   * Each drop shadow as the canvas draws it: the layer's alpha blurred
   * (σ = blur / 3), in the shadow's color and opacity, moved by its offset
   * on the page (Y counts up, as in the editor: a negative Y falls below).
   */
  private async drawShadows(
    node: Node,
    shadows: DropShadowEffect[],
    state: DrawState,
    rasterizer: PdfRasterizer
  ): Promise<void> {
    const rect = this.reach(node, shadows);
    if (!rect) return;
    const scale = this.rasterScale(rect, Math.min(this.options.rasterScale ?? 3, 2));
    const coverage = await rasterizer.render(node.id, rect, scale, false);
    if (!coverage) return;
    const { width, height, data } = coverage;
    for (const shadow of shadows) {
      const alpha = new Float32Array(width * height);
      for (let i = 0; i < alpha.length; i++) alpha[i] = (data[i * 4 + 3] ?? 0) / 255;
      gaussianBlur(alpha, width, height, (Math.max(shadow.blur, 0) / 3) * scale);
      const strength = Math.max(0, Math.min(1, (shadow.color.a ?? 1) * shadow.opacity));
      const mask = new Uint8Array(alpha.length);
      for (let i = 0; i < alpha.length; i++) {
        mask[i] = Math.round(Math.max(0, Math.min(1, alpha[i]! * strength)) * 255);
      }
      const image = await this.writer.tinted(width, height, mask, shadow.color);
      const moved = { ...rect, x: rect.x + shadow.offsetX, y: rect.y + shadow.offsetY };
      this.placePicture(state.out, image, moved, this.writer.resources.alpha(1, 1));
    }
  }

  /** An image filling `rect` (world). */
  private placePicture(out: PdfContent, image: number, rect: Rect, gs: string): void {
    const name = this.writer.resources.add('XObject', image);
    out
      .save()
      .op(`/${gs} gs`)
      .transform(mat3.create(rect.width, 0, 0, rect.height, rect.x, rect.y))
      .op(`/${name} Do`)
      .restore();
  }

  // --------------------------------------------------------------------------
  // Masks
  // --------------------------------------------------------------------------

  /**
   * What a group masks, under its mask. A clip by one filled, unstroked
   * shape is a clipping path; any other mask is a soft mask of the mask
   * layer drawn as a group — its alpha (a solid silhouette for a clip) or
   * its luminance — over the masked layers painted together.
   */
  private async drawMasked(
    mode: NonNullable<GroupNode['maskMode']>,
    mask: Node,
    maskWorld: Matrix3,
    drawMask: (state: DrawState) => Promise<void>,
    drawContent: (state: DrawState) => Promise<void>,
    state: DrawState
  ): Promise<void> {
    const out = state.out;
    const clip = mode === 'clip' ? this.clipShape(mask) : null;
    if (clip) {
      out
        .save()
        .path(clip.contours, maskWorld)
        .op(clip.fillRule === 'evenodd' ? 'W* n' : 'W n');
      await drawContent(state);
      out.restore();
      return;
    }

    // The mask's coverage comes from its own opacity, not its group's
    const maskContent = new PdfContent();
    await drawMask({ out: maskContent, opacity: 1, masking: true, silhouette: mode === 'clip' });
    const box = this.options.pageBox;
    const maskForm = await this.writer.form(maskContent, box, transparencyGroup());
    const kind =
      mode === 'luminance'
        ? `/S /Luminosity /G ${maskForm} 0 R /BC [0 0 0]`
        : `/S /Alpha /G ${maskForm} 0 R`;
    const gs = this.writer.resources.add(
      'ExtGState',
      this.writer.doc.add(`<< /Type /ExtGState /SMask << /Type /Mask ${kind} >> >>`)
    );

    const content = new PdfContent();
    await drawContent({ ...state, out: content });
    if (content.empty) return;
    const form = await this.writer.form(content, box, transparencyGroup());
    const name = this.writer.resources.add('XObject', form);
    out.save().op(`/${gs} gs /${name} Do`).restore();
  }

  /** A mask layer's outline as a clipping path, when that's all its clip is. */
  private clipShape(mask: Node): ShapeGeometry | null {
    if (bends(mask)) return null;
    const geometry = shapeGeometry(mask, this.textOutlines);
    if (!geometry) return null;
    const fills = geometry.fills.filter(
      (fill) =>
        fill.visible && fill.type !== 'none' && this.fillAlpha(fill, mask.opacity) > INVISIBLE
    );
    const strokes = geometry.strokes.filter((stroke) => stroke.visible && stroke.width > 0);
    const effects = (mask.effects ?? []).some((effect) => effect.visible);
    return fills.length > 0 && strokes.length === 0 && !effects ? geometry : null;
  }

  // --------------------------------------------------------------------------
  // Artboards
  // --------------------------------------------------------------------------

  private artboardBackground(node: ArtboardNode, world: Matrix3, state: DrawState): void {
    if (!node.fills || node.fills.length === 0) return;
    const { x: ax, y: ay } = node.transform.anchor;
    const geometry: ShapeGeometry = {
      contours: [
        {
          points: createRectanglePath(-node.width * ax, -node.height * ay, node.width, node.height),
          closed: true,
        },
      ],
      fillRule: 'nonzero',
      fills: node.fills,
      strokes: [],
      tolerance: DEFAULT_TESSELLATION_TOLERANCE,
    };
    for (const fill of node.fills) this.fill(geometry, world, fill, state);
  }

  /** An artboard's contents clipped to it: the box round its corners on the page, as the canvas's scissor. */
  private clipToArtboard(node: ArtboardNode, world: Matrix3, out: PdfContent): void {
    const hw = node.width / 2;
    const hh = node.height / 2;
    const corners = [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ].map((corner) => mat3.transformPoint(world, corner));
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    out.rect(x, y, Math.max(...xs) - x, Math.max(...ys) - y).op('W n');
  }

  // --------------------------------------------------------------------------
  // Boolean groups
  // --------------------------------------------------------------------------

  /** A boolean group's result (worked out in the world, as the canvas does), painted with its own fills and strokes. */
  private drawBooleanGroup(group: GroupNode, state: DrawState): Promise<void> {
    const result = this.booleanResult(group, 0);
    if (!result || result.length === 0) return Promise.resolve();
    const contours: Contour[] = [];
    for (const polygon of result) {
      for (const ring of polygon) {
        // polygon-clipping repeats each ring's first point at its end
        const last = ring[ring.length - 1];
        const first = ring[0];
        const points =
          first &&
          last &&
          ring.length > 1 &&
          Math.abs(first[0] - last[0]) < 1e-6 &&
          Math.abs(first[1] - last[1]) < 1e-6
            ? ring.slice(0, -1)
            : ring;
        if (points.length < 3) continue;
        contours.push({
          points: points.map(([x, y]) => ({
            position: { x, y },
            handleIn: null,
            handleOut: null,
            type: 'corner' as const,
          })),
          closed: true,
        });
      }
    }
    if (contours.length === 0) return Promise.resolve();
    // The result's rings never overlap: holes are holes either way round
    this.paintGeometry(
      {
        contours,
        fillRule: 'evenodd',
        fills: group.fills ?? [],
        strokes: group.strokes ?? [],
        tolerance: DEFAULT_TESSELLATION_TOLERANCE,
      },
      mat3.identity(),
      state,
      'stroke'
    );
    return Promise.resolve();
  }

  private booleanResult(group: GroupNode, depth: number): ReturnType<typeof nodeToPolygon> {
    const op = group.booleanOp;
    if (!op || depth > MAX_BOOLEAN_DEPTH) return null;
    const children = this.scene.getChildren(group.id).filter((child) => child.visible);
    if (children.length < 2) return null;
    let result: ReturnType<typeof nodeToPolygon> = null;
    for (const child of children) {
      const polygon =
        child.type === 'group' && child.booleanOp
          ? this.booleanResult(child, depth + 1)
          : nodeToPolygon(child, this.scene.getWorldTransform(child.id));
      if (!polygon) continue;
      result = result ? performBoolean(result, polygon, op) : polygon;
    }
    return result;
  }

  // --------------------------------------------------------------------------
  // Symbols
  // --------------------------------------------------------------------------

  /** A symbol instance as its symbol's artwork (one it's already inside of draws nothing). */
  private async drawSymbol(
    instance: SymbolInstanceNode,
    world: Matrix3,
    state: DrawState,
    within: ReadonlySet<string>
  ): Promise<void> {
    if (within.has(instance.symbolId)) return;
    const definition = this.symbols.get(instance.symbolId);
    if (!definition) return;
    const resolved = resolveSymbolInstance(instance, definition);
    const nodes = new Map(resolved.map((node) => [node.id, node]));
    const inside = new Set(within).add(instance.symbolId);
    for (const root of getResolvedRootNodes(resolved, definition)) {
      await this.drawResolved(root, world, nodes, inside, state);
    }
  }

  /** A layer of a symbol's artwork: placed in its parent, without effects (as the canvas). */
  private async drawResolved(
    node: Node,
    parentWorld: Matrix3,
    nodes: Map<string, Node>,
    within: ReadonlySet<string>,
    state: DrawState
  ): Promise<void> {
    if (!node.visible || node.type === 'ik-target' || node.type === 'vitruvian') return;
    const { position, rotation, scale } = node.transform;
    const world = mat3.multiply(parentWorld, mat3.compose(position, rotation, scale));
    const own = { ...state, opacity: state.opacity * node.opacity };
    switch (node.type) {
      case 'artboard':
        this.artboardBackground(node, world, own);
        break;
      case 'symbol-instance':
        await this.drawSymbol(node, world, own, within);
        break;
      case 'group':
      case 'bone':
        break;
      default:
        await this.drawLeaf(node, world, own);
    }
    if (node.children.length === 0) return;

    const mask = node.type === 'group' ? this.maskSource(node, (id) => nodes.get(id)) : null;
    const drawChildren = async (s: DrawState) => {
      for (const childId of node.children) {
        if (childId === mask?.id) continue;
        const child = nodes.get(childId);
        if (child) await this.drawResolved(child, world, nodes, within, s);
      }
    };
    if (mask && node.type === 'group' && node.maskMode) {
      const { position: p, rotation: r, scale: s } = mask.transform;
      await this.drawMasked(
        node.maskMode,
        mask,
        mat3.multiply(world, mat3.compose(p, r, s)),
        (ms) => this.drawResolved(mask, world, nodes, within, ms),
        drawChildren,
        own
      );
      return;
    }
    await drawChildren(own);
  }

  // --------------------------------------------------------------------------
  // Leaves
  // --------------------------------------------------------------------------

  private async drawLeaf(node: Node, world: Matrix3, state: DrawState): Promise<void> {
    if (node.type === 'image') return this.drawImage(node, world, state);
    const geometry = shapeGeometry(node, this.textOutlines);
    if (geometry) this.paintGeometry(geometry, world, state, 'contour');
  }

  /**
   * Fills, then strokes — a stroke contour by contour, as the canvas draws a
   * compound path's or a text's (or stroke by stroke, a boolean result's).
   */
  private paintGeometry(
    geometry: ShapeGeometry,
    world: Matrix3,
    state: DrawState,
    order: 'contour' | 'stroke'
  ): void {
    for (const fill of geometry.fills) this.fill(geometry, world, fill, state);
    const strokes = geometry.strokes.filter((stroke) => stroke.visible && stroke.width > 0);
    if (order === 'stroke') {
      for (const stroke of strokes) {
        for (const contour of geometry.contours)
          this.stroke(contour, geometry, world, stroke, state);
      }
    } else {
      for (const contour of geometry.contours) {
        for (const stroke of strokes) this.stroke(contour, geometry, world, stroke, state);
      }
    }
  }

  private fillAlpha(fill: Fill, opacity: number): number {
    const color = fill.type === 'solid' ? (fill.color?.a ?? 1) : 1;
    return fill.opacity * color * opacity;
  }

  private fill(geometry: ShapeGeometry, world: Matrix3, fill: Fill, state: DrawState): void {
    if (!fill.visible || fill.type === 'none') return;
    if (fill.type === 'solid' && !fill.color) return;
    if (fill.type === 'gradient' && !fill.gradient) return;
    const alpha = this.fillAlpha(fill, state.opacity);
    if (alpha <= (state.silhouette ? INVISIBLE : 0)) return;
    const box = fill.type === 'gradient' ? fillBox(geometry) : null;
    if (fill.type === 'gradient' && !box) return;
    const out = state.out;
    out.save().transform(world);
    if (state.silhouette) {
      this.solid(out, { r: 255, g: 255, b: 255 }, 1, 'fill');
    } else if (fill.gradient && box) {
      this.gradient(out, fill.gradient, box, world, alpha, 'fill');
    } else if (fill.color) {
      this.solid(out, fill.color, alpha, 'fill');
    }
    out
      .path(geometry.contours)
      .op(geometry.fillRule === 'evenodd' ? 'f*' : 'f')
      .restore();
  }

  /**
   * One contour's stroke: PDF's own where it can (the canvas's alignment by
   * clipping a doubled width to the shape's inside or outside), else — a
   * width profile, an open path stroked to one side — the outline the
   * canvas widens it into, filled.
   */
  private stroke(
    contour: Contour,
    geometry: ShapeGeometry,
    world: Matrix3,
    stroke: Stroke,
    state: DrawState
  ): void {
    const solid = !stroke.gradient;
    const alpha = stroke.opacity * (solid ? (stroke.color.a ?? 1) : 1) * state.opacity;
    if (alpha <= (state.silhouette ? INVISIBLE : 0)) return;
    const vertices = flatten(contour, geometry.tolerance);
    if (vertices.length < 4) return;
    const align = stroke.align ?? 'center';
    const dashes = this.dashPattern(stroke, vertices, contour.closed);
    const profiled = !dashes && !!stroke.widthProfile && stroke.widthProfile.length >= 2;
    const out = state.out;

    const paint = (box: Box | null, side: 'fill' | 'stroke') => {
      if (state.silhouette) this.solid(out, { r: 255, g: 255, b: 255 }, 1, side);
      else if (stroke.gradient && box) this.gradient(out, stroke.gradient, box, world, alpha, side);
      else this.solid(out, stroke.color, alpha, side);
    };

    if (profiled || (align !== 'center' && !contour.closed)) {
      // The canvas's own outline: dash by dash, each to the side the whole would be
      const pieces = dashes
        ? (dashPolyline(
            vertices,
            contour.closed,
            stroke.dashArray ?? [],
            stroke.dashOffset,
            stroke.cap === 'butt' ? 0 : stroke.width / 2
          ) ?? [vertices])
        : [vertices];
      const pieceStroke: Stroke = dashes
        ? { ...stroke, align: pieceAlign(vertices, contour.closed, align), widthProfile: undefined }
        : stroke;
      const pieceClosed = dashes ? false : contour.closed;
      for (const piece of pieces) {
        const outline = strokeOutline(piece, pieceStroke, pieceClosed);
        if (outline.length < 6) continue;
        out.save().transform(world);
        paint(computeBounds(outline), 'fill');
        out.polygon(outline).op('f').restore();
      }
      return;
    }

    const points =
      dashes && contour.closed && geometry.dashStart
        ? clockwiseContour(contour.points, geometry.dashStart)
        : contour.points;
    const path = [{ points, closed: contour.closed }];
    // As the canvas: never thinner than a unit across
    const width = align === 'center' ? Math.max(stroke.width, 1) : 2 * Math.max(stroke.width, 0.5);
    out.save().transform(world);
    if (align === 'inside') {
      out.path(path).op('W n');
    } else if (align === 'outside') {
      const box = this.localPageBox(world, vertices, width);
      out
        .rect(box[0], box[1], box[2] - box[0], box[3] - box[1])
        .path(path)
        .op('W* n');
    }
    paint(strokeBox(vertices, stroke, contour.closed), 'stroke');
    out.op(`${n(width)} w ${CAPS[stroke.cap] ?? 0} J ${JOINS[stroke.join] ?? 0} j`);
    out.op(`${n(Math.max(1, stroke.miterLimit ?? MITER_LIMIT))} M`);
    if (dashes) out.op(`[${dashes.pattern.map(n).join(' ')}] ${n(dashes.phase)} d`);
    out.path(path).op('S').restore();
  }

  /** A box in the layer's own space taking in the page and the contour, for clipping outside it. */
  private localPageBox(world: Matrix3, vertices: Float32Array, width: number): Box {
    let box = padBox(computeBounds(vertices), width * 2);
    const inverse = mat3.invert(world);
    if (inverse) {
      const [x0, y0, x1, y1] = this.options.pageBox;
      const corners = [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ].map((corner) => mat3.transformPoint(inverse, corner));
      box = unionBox(box, computeBounds(new Float32Array(corners.flatMap((c) => [c.x, c.y]))));
    }
    return padBox(box, 1);
  }

  /**
   * A stroke's dash pattern as the canvas reads it (an odd count repeated;
   * none for a pattern SVG would ignore or one too fine to see), or null
   * when it's drawn solid.
   */
  private dashPattern(
    stroke: Stroke,
    vertices: Float32Array,
    closed: boolean
  ): { pattern: number[]; phase: number } | null {
    const dashArray = stroke.dashArray;
    if (!dashArray || dashArray.length === 0) return null;
    let length = 0;
    const count = vertices.length / 2;
    for (let i = 1; i < (closed ? count + 1 : count); i++) {
      const a = (i - 1) % count;
      const b = i % count;
      length += Math.hypot(
        (vertices[b * 2] ?? 0) - (vertices[a * 2] ?? 0),
        (vertices[b * 2 + 1] ?? 0) - (vertices[a * 2 + 1] ?? 0)
      );
    }
    if (!dashStretches(length, dashArray, stroke.dashOffset ?? 0)) return null;
    const pattern = dashArray.length % 2 === 1 ? [...dashArray, ...dashArray] : [...dashArray];
    return { pattern, phase: stroke.dashOffset ?? 0 };
  }

  // --------------------------------------------------------------------------
  // Paint
  // --------------------------------------------------------------------------

  private solid(
    out: PdfContent,
    color: { r: number; g: number; b: number },
    alpha: number,
    side: 'fill' | 'stroke'
  ): void {
    const gs = this.writer.resources.alpha(
      side === 'fill' ? alpha : 1,
      side === 'stroke' ? alpha : 1
    );
    out.op(`/${gs} gs ${rgb(color)} ${side === 'fill' ? 'rg' : 'RG'}`);
  }

  /**
   * A gradient over `box` (in the layer's space, where `out` draws now),
   * as a shading pattern — placed in the stream's base space, as patterns
   * are — with a soft mask of its stops' opacity when that varies.
   */
  private gradient(
    out: PdfContent,
    gradient: Gradient,
    box: Box,
    world: Matrix3,
    alpha: number,
    side: 'fill' | 'stroke'
  ): void {
    const key = JSON.stringify(gradient);
    let paint = this.gradients.get(key);
    if (!paint) {
      paint = gradientPaint(this.writer.doc, gradient);
      this.gradients.set(key, paint);
    }
    if ('solid' in paint) {
      this.solid(out, paint.solid, alpha * (paint.solid.a ?? 1), side);
      return;
    }
    const resources = this.writer.resources;
    const placed = mat3.multiply(mat3.multiply(out.base, world), boxMatrix(box));
    const pattern = resources.add(
      'Pattern',
      this.writer.doc.add(
        `<< /PatternType 2 /Shading ${paint.color} 0 R /Matrix [${matrixArray(placed)}] >>`
      )
    );
    const fillAlpha = side === 'fill' ? alpha : 1;
    const strokeAlpha = side === 'stroke' ? alpha : 1;
    if (paint.alpha !== null) {
      // The opacity as a gray shading over the same box, in the layer's space
      const alphaShading = paint.alpha;
      const shading = resources.shared('Shading', String(alphaShading), () => alphaShading);
      const maskContent = new PdfContent().transform(boxMatrix(box)).op(`/${shading} sh`);
      const maskForm = this.writer.doc.addStream(
        `/Type /XObject /Subtype /Form /BBox [${padBox(box, 1).map(n).join(' ')}] ` +
          `/Group << /Type /Group /S /Transparency /CS /DeviceGray >> /Resources ${resources.id} 0 R`,
        maskContent.toString()
      );
      const gs = resources.add(
        'ExtGState',
        this.writer.doc.add(
          `<< /Type /ExtGState /ca ${n(fillAlpha)} /CA ${n(strokeAlpha)} ` +
            `/SMask << /Type /Mask /S /Luminosity /G ${maskForm} 0 R >> >>`
        )
      );
      out.op(`/${gs} gs`);
    } else {
      out.op(`/${resources.alpha(fillAlpha, strokeAlpha)} gs`);
    }
    out.op(side === 'fill' ? `/Pattern cs /${pattern} scn` : `/Pattern CS /${pattern} SCN`);
  }

  // --------------------------------------------------------------------------
  // Pictures
  // --------------------------------------------------------------------------

  /**
   * A picture over its box, rounded at its corners, or — with its corners
   * moved — as the canvas's two triangles, each its own straight mapping.
   */
  private async drawImage(node: ImageNode, world: Matrix3, state: DrawState): Promise<void> {
    if (!isDocumentImage(node.src)) return;
    const alpha = state.silhouette ? 1 : state.opacity;
    if (alpha <= 0) return;
    const image = await this.writer.image(node.src, this.options.decodeImage);
    if (image === null) return;
    const name = this.writer.resources.add('XObject', image);
    const out = state.out;
    const x0 = -node.width * node.transform.anchor.x;
    const y0 = -node.height * node.transform.anchor.y;
    const x1 = x0 + node.width;
    const y1 = y0 + node.height;
    const gs = this.writer.resources.alpha(alpha, alpha);
    const offsets = node.vertexOffsets;
    if (!offsets || offsets.every((offset) => offset.x === 0 && offset.y === 0)) {
      out.save().transform(world).op(`/${gs} gs`);
      const radii = node.cornerRadius ?? [0, 0, 0, 0];
      if (radii.some((r) => r > 0)) {
        // [TL, TR, BR, BL] on screen; the rectangle path is wound from the bottom left
        const [tl, tr, br, bl] = radii;
        out
          .path([
            {
              points: createRectanglePath(x0, y0, node.width, node.height, [bl, br, tr, tl]),
              closed: true,
            },
          ])
          .op('W n');
      }
      out
        .transform(mat3.create(node.width, 0, 0, node.height, x0, y0))
        .op(`/${name} Do`)
        .restore();
      return;
    }
    const corner = (i: number, x: number, y: number) => ({
      x: x + (offsets[i]?.x ?? 0),
      y: y + (offsets[i]?.y ?? 0),
    });
    const bl = corner(0, x0, y0);
    const br = corner(1, x1, y0);
    const tl = corner(2, x0, y1);
    const tr = corner(3, x1, y1);
    const triangles: Array<[Matrix3, typeof bl, typeof bl, typeof bl]> = [
      // (BL, BR, TL): the picture's bottom-left half
      [mat3.create(br.x - bl.x, br.y - bl.y, tl.x - bl.x, tl.y - bl.y, bl.x, bl.y), bl, br, tl],
      // (BR, TL, TR): its top-right half
      [
        mat3.create(
          tr.x - tl.x,
          tr.y - tl.y,
          tr.x - br.x,
          tr.y - br.y,
          tl.x + br.x - tr.x,
          tl.y + br.y - tr.y
        ),
        br,
        tl,
        tr,
      ],
    ];
    for (const [mapping, a, b, c] of triangles) {
      out
        .save()
        .transform(world)
        .op(`/${gs} gs`)
        .polygon([a.x, a.y, b.x, b.y, c.x, c.y])
        .op('W n')
        .transform(mapping)
        .op(`/${name} Do`)
        .restore();
    }
  }
}
