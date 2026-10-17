/**
 * Image meshes: an image as a grid of small cells, so bones can bend it.
 *
 * A bound image used to deform as a single quad — four corners — so a bone
 * rotating at a joint could only shear the whole picture. As a grid, every
 * cell vertex gets its own bone weights and the picture bends like a sleeve.
 */

import type { Vector2 } from '@quar/types';

export interface ImageMesh {
  /** Vertex positions (xy pairs) in the image's local space. */
  vertices: Float32Array;
  /** Texture coordinates (uv pairs), image top-left at (0, 0). */
  uvs: Float32Array;
  /** Two triangles per cell. */
  indices: number[];
  cols: number;
  rows: number;
}

/** Cells of about this many units: small enough to bend smoothly at a joint. */
export const IMAGE_MESH_CELL_SIZE = 20;
const MAX_CELLS_PER_AXIS = 40;

/** How many cells an image of this size is divided into along each axis. */
export function imageMeshCells(width: number, height: number): { cols: number; rows: number } {
  const cells = (length: number) =>
    Math.max(1, Math.min(MAX_CELLS_PER_AXIS, Math.round(Math.abs(length) / IMAGE_MESH_CELL_SIZE)));
  return { cols: cells(width), rows: cells(height) };
}

/**
 * A cols × rows grid over the quad with these corners (bottom-left,
 * bottom-right, top-left, top-right — corner offsets included), each point
 * placed bilinearly. Vertices run row by row from the bottom; a 1 × 1 grid is
 * the plain quad [BL, BR, TL, TR].
 */
export function createImageMesh(
  corners: { bl: Vector2; br: Vector2; tl: Vector2; tr: Vector2 },
  cols: number,
  rows: number
): ImageMesh {
  const { bl, br, tl, tr } = corners;
  const vertices = new Float32Array((cols + 1) * (rows + 1) * 2);
  const uvs = new Float32Array(vertices.length);
  let k = 0;
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    for (let i = 0; i <= cols; i++) {
      const s = i / cols;
      const bottomX = bl.x + (br.x - bl.x) * s;
      const bottomY = bl.y + (br.y - bl.y) * s;
      const topX = tl.x + (tr.x - tl.x) * s;
      const topY = tl.y + (tr.y - tl.y) * s;
      vertices[k] = bottomX + (topX - bottomX) * t;
      vertices[k + 1] = bottomY + (topY - bottomY) * t;
      // The texture's first row is the image's top
      uvs[k] = s;
      uvs[k + 1] = 1 - t;
      k += 2;
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      indices.push(a, b, c, c, b, d);
    }
  }
  return { vertices, uvs, indices, cols, rows };
}
