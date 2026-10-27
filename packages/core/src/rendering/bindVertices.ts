/**
 * The vertices a layer binds to bones with — the mesh the renderer bends —
 * so everything that binds (the renderer's Bind to Bones, and code that
 * binds without a renderer) binds the same vertices.
 */

import type { ImageNode, Node } from '@quar/types';
import { BEND_MESH_CELL_SIZE, createBendMesh, subdivideOutline } from './bendMesh';
import { createImageMesh, imageMeshCells, type ImageMesh } from './imageMesh';
import { shapeOutline } from './shapeOutline';

/** A shape's bending mesh: its outline subdivided, with points inside. */
export interface BendGeometry {
  vertices: Float32Array;
  indices: number[];
  /** How many of the vertices, from the start, are the outline */
  outlineVertexCount: number;
}

/**
 * A shape's bending mesh, or — for an open path, which is all outline — its
 * outline subdivided so it bends along its length. Null when the shape has
 * too little outline to bend.
 */
export function bendGeometry(node: Node): BendGeometry | null {
  const outline = shapeOutline(node);
  if (!outline || outline.vertices.length < 4) return null;
  if (outline.closed) {
    const mesh = createBendMesh(outline.vertices);
    return {
      vertices: mesh.vertices,
      indices: mesh.indices,
      outlineVertexCount: mesh.outlineVertexCount,
    };
  }
  const vertices = subdivideOutline(outline.vertices, false, BEND_MESH_CELL_SIZE);
  return { vertices, indices: [], outlineVertexCount: vertices.length / 2 };
}

/**
 * An image's geometry as a mesh of small cells, so bones can bend it.
 * Bindings made before image meshes (4 weighted vertices) keep the plain
 * quad they were bound with — a 1 × 1 mesh.
 */
export function imageBindMesh(node: ImageNode): ImageMesh {
  const legacyQuad = node.skinData?.vertexCount === 4;
  const ax = node.transform.anchor.x;
  const ay = node.transform.anchor.y;
  const x0 = -node.width * ax;
  const y0 = -node.height * ay;
  const x1 = x0 + node.width;
  const y1 = y0 + node.height;
  const vo = node.vertexOffsets;
  const corner = (x: number, y: number, offset?: { x: number; y: number }) => ({
    x: x + (offset?.x ?? 0),
    y: y + (offset?.y ?? 0),
  });
  const { cols, rows } = legacyQuad
    ? { cols: 1, rows: 1 }
    : imageMeshCells(node.width, node.height);
  return createImageMesh(
    {
      bl: corner(x0, y0, vo?.[0]),
      br: corner(x1, y0, vo?.[1]),
      tl: corner(x0, y1, vo?.[2]),
      tr: corner(x1, y1, vo?.[3]),
    },
    cols,
    rows
  );
}

/**
 * An image's opacity, sampled on a grid: `data` row by row from the image's
 * top, one byte (0–255) per sample.
 */
export interface AlphaMask {
  width: number;
  height: number;
  data: Uint8Array;
}

/** The longest side, in samples, of an image's opacity mask */
const ALPHA_MASK_SIZE = 256;

/**
 * An image's opacity, read by drawing it small: null where there's no 2D
 * canvas to draw it on (tests, the server).
 */
export function readAlphaMask(image: HTMLImageElement): AlphaMask | null {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  if (!(w > 0 && h > 0) || typeof document === 'undefined') return null;
  const k = Math.min(1, ALPHA_MASK_SIZE / Math.max(w, h));
  const width = Math.max(1, Math.round(w * k));
  const height = Math.max(1, Math.round(h * k));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  try {
    context.drawImage(image, 0, 0, width, height);
    const rgba = context.getImageData(0, 0, width, height).data;
    const data = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4 + 3]!;
    return { width, height, data };
  } catch {
    return null; // a cross-origin image that won't be read
  }
}

/** A place (the layer's own space) the layer shows something at. */
export type LayerShape = (x: number, y: number) => boolean;

/** Even-odd point in polygon (xy pairs). */
function insidePolygon(x: number, y: number, vertices: ArrayLike<number>): boolean {
  let inside = false;
  const n = vertices.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i * 2]!;
    const yi = vertices[i * 2 + 1]!;
    const xj = vertices[j * 2]!;
    const yj = vertices[j * 2 + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Where a layer shows something, in its own space: inside a closed shape's
 * outline, or on an image's opaque pixels (given their mask). Bindings weigh
 * bones against it (each bone's reach is as wide as the shape around it).
 * Null when there's no telling: an open path, an image without a mask.
 */
export function layerShape(node: Node, alpha?: AlphaMask | null): LayerShape | null {
  if (node.type === 'image') {
    if (!alpha || alpha.width < 1 || alpha.height < 1) return null;
    // Opaque all over (a photo): its rectangle says nothing about what's in it
    if (alpha.data.every((value) => value >= 128)) return null;
    const x0 = -node.width * node.transform.anchor.x;
    const y0 = -node.height * node.transform.anchor.y;
    const { width, height, data } = alpha;
    return (x, y) => {
      const u = (x - x0) / node.width;
      // The mask's first row is the image's top (Y up)
      const v = 1 - (y - y0) / node.height;
      if (!(u >= 0 && u < 1 && v >= 0 && v < 1)) return false;
      return data[Math.floor(v * height) * width + Math.floor(u * width)]! >= 128;
    };
  }
  const outline = shapeOutline(node);
  if (!outline?.closed || outline.vertices.length < 6) return null;
  const vertices = outline.vertices;
  return (x, y) => insidePolygon(x, y, vertices);
}

/**
 * The vertices to bind a layer with: a shape's bending mesh (`bendMesh`:
 * true) or an unbound image's cell mesh. Null for anything else (a layer the
 * renderer binds by its tessellation, which only a renderer has).
 */
export function bindVertices(node: Node): { vertices: Float32Array; bendMesh: boolean } | null {
  const bend = bendGeometry(node);
  if (bend) return { vertices: bend.vertices, bendMesh: true };
  if (node.type === 'image' && !node.skinData) {
    return { vertices: imageBindMesh(node).vertices, bendMesh: false };
  }
  return null;
}
