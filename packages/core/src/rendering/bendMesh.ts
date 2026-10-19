/**
 * Bending meshes: a shape bound to bones, triangulated so that it can bend.
 *
 * A shape's tessellation is only its outline, filled with long triangles from
 * one side to the other: a rectangle has four vertices, so a bone could only
 * shear it, and once bent its fill spilled outside its outline. Bound to
 * bones, a shape's outline is subdivided, points are added inside about a
 * cell apart, and the whole is triangulated into small, well-shaped triangles
 * that each follow the bones near them.
 */

import earcut from 'earcut';

export interface BendMesh {
  /** Vertex positions (xy pairs): the outline first, in order, then the points inside */
  vertices: Float32Array;
  /** How many of the vertices are the outline (what strokes follow) */
  outlineVertexCount: number;
  /** Fill triangles */
  indices: number[];
}

/** Cells of about this many units: small enough to bend smoothly at a joint. */
export const BEND_MESH_CELL_SIZE = 20;
const MAX_CELLS_PER_AXIS = 30;

/** The cell size for a shape of this size (larger cells for very large shapes). */
export function bendMeshCellSize(width: number, height: number): number {
  return Math.max(
    BEND_MESH_CELL_SIZE,
    Math.max(Math.abs(width), Math.abs(height)) / MAX_CELLS_PER_AXIS
  );
}

/** An outline (xy pairs) with no segment longer than `maxLength`. */
export function subdivideOutline(
  outline: ArrayLike<number>,
  closed: boolean,
  maxLength: number
): Float32Array {
  let count = Math.floor(outline.length / 2);
  // A closing point repeating the first adds nothing
  if (
    closed &&
    count > 1 &&
    Math.abs(outline[0]! - outline[(count - 1) * 2]!) < 1e-9 &&
    Math.abs(outline[1]! - outline[(count - 1) * 2 + 1]!) < 1e-9
  ) {
    count--;
  }
  const result: number[] = [];
  const segments = closed ? count : count - 1;
  for (let i = 0; i < count; i++) {
    const x0 = outline[i * 2]!;
    const y0 = outline[i * 2 + 1]!;
    result.push(x0, y0);
    if (i >= segments) continue;
    const j = (i + 1) % count;
    const x1 = outline[j * 2]!;
    const y1 = outline[j * 2 + 1]!;
    const pieces = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / maxLength);
    for (let k = 1; k < pieces; k++) {
      const t = k / pieces;
      result.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    }
  }
  return new Float32Array(result);
}

/**
 * The bending mesh of a closed outline (xy pairs, one contour): the outline
 * subdivided into pieces no longer than a cell, points inside on a grid a
 * cell apart, and a triangulation of both whose triangles are as close to
 * equilateral as the outline allows.
 */
export function createBendMesh(outline: ArrayLike<number>, cellSize?: number): BendMesh {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < outline.length; i += 2) {
    minX = Math.min(minX, outline[i]!);
    maxX = Math.max(maxX, outline[i]!);
    minY = Math.min(minY, outline[i + 1]!);
    maxY = Math.max(maxY, outline[i + 1]!);
  }
  const cell = cellSize ?? bendMeshCellSize(maxX - minX, maxY - minY);
  const ring = subdivideOutline(outline, true, cell);
  const outlineVertexCount = ring.length / 2;
  if (outlineVertexCount < 3) {
    return { vertices: ring, outlineVertexCount, indices: [] };
  }

  // Points inside, on a grid centred in the shape's bounds, clear of the outline
  const inside: number[] = [];
  const cols = Math.floor((maxX - minX) / cell);
  const rows = Math.floor((maxY - minY) / cell);
  const startX = minX + (maxX - minX - cols * cell) / 2;
  const startY = minY + (maxY - minY - rows * cell) / 2;
  const clearance = 0.45 * cell;
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const x = startX + c * cell;
      const y = startY + r * cell;
      if (!insideRing(ring, x, y)) continue;
      if (distanceToRing(ring, x, y) < clearance) continue;
      inside.push(x, y);
    }
  }

  const vertices = new Float32Array(ring.length + inside.length);
  vertices.set(ring);
  vertices.set(inside, ring.length);

  // The outline triangulated, then each point inside dropped into the
  // triangle it falls in (earcut's own Steiner points fail on grid rows)
  const tris = toCounterClockwise(vertices, Array.from(earcut(ring)));
  for (let k = outlineVertexCount; k < vertices.length / 2; k++) insertPoint(vertices, tris, k);
  return {
    vertices,
    outlineVertexCount,
    indices: improveTriangles(vertices, tris, outlineVertexCount),
  };
}

type Triangle = [number, number, number];

function toCounterClockwise(vertices: Float32Array, indices: number[]): Triangle[] {
  const tris: Triangle[] = [];
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i]!;
    const b = indices[i + 1]!;
    const c = indices[i + 2]!;
    tris.push(orient(vertices, a, b, c) >= 0 ? [a, b, c] : [a, c, b]);
  }
  return tris;
}

/**
 * Split the triangle containing point `p` into three (or, when the point
 * lies on an edge, the two triangles either side of it into two each).
 */
function insertPoint(vertices: Float32Array, tris: Triangle[], p: number): void {
  // Newest triangles first: grid points come in rows, next to the last one
  for (let t = tris.length - 1; t >= 0; t--) {
    const [a, b, c] = tris[t]!;
    const scale = Math.abs(orient(vertices, a, b, c));
    const eps = 1e-7 * scale;
    const ab = orient(vertices, a, b, p);
    const bc = orient(vertices, b, c, p);
    const ca = orient(vertices, c, a, p);
    if (ab < -eps || bc < -eps || ca < -eps) continue;
    const onEdge: [number, number, number] | null =
      ab <= eps ? [a, b, c] : bc <= eps ? [b, c, a] : ca <= eps ? [c, a, b] : null;
    if (!onEdge) {
      tris[t] = [a, b, p];
      tris.push([b, c, p], [c, a, p]);
      return;
    }
    const [u, v, w] = onEdge;
    tris[t] = [u, p, w];
    tris.push([p, v, w]);
    // The triangle on the other side of edge u–v
    const other = tris.findIndex(
      (tri, i) => i !== t && tri.includes(u) && tri.includes(v) && !tri.includes(p)
    );
    if (other >= 0) {
      const x = tris[other]!.find((vertex) => vertex !== u && vertex !== v)!;
      tris[other] = [v, p, x];
      tris.push([p, u, x]);
    }
    return;
  }
}

/** Even-odd point-in-polygon test. */
function insideRing(ring: Float32Array, x: number, y: number): boolean {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2]!;
    const yi = ring[i * 2 + 1]!;
    const xj = ring[j * 2]!;
    const yj = ring[j * 2 + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToRing(ring: Float32Array, x: number, y: number): number {
  let best = Infinity;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = ring[j * 2]!;
    const ay = ring[j * 2 + 1]!;
    const dx = ring[i * 2]! - ax;
    const dy = ring[i * 2 + 1]! - ay;
    const lengthSq = dx * dx + dy * dy;
    const t =
      lengthSq > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSq)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

/**
 * Delaunay edge flips (Lawson): replaces long, thin triangles with better
 * shaped ones over the same points, keeping the outline's edges. Earcut
 * leaves fans of slivers, which bend badly.
 */
function improveTriangles(
  vertices: Float32Array,
  tris: Triangle[],
  outlineCount: number
): number[] {
  const key = (a: number, b: number) => (a < b ? a * 1048576 + b : b * 1048576 + a);
  const isOutlineEdge = (a: number, b: number) =>
    a < outlineCount &&
    b < outlineCount &&
    (Math.abs(a - b) === 1 || Math.abs(a - b) === outlineCount - 1);
  const edges = new Map<number, number[]>();
  const addEdge = (a: number, b: number, t: number) => {
    const k = key(a, b);
    const list = edges.get(k);
    if (list) list.push(t);
    else edges.set(k, [t]);
  };
  const removeEdge = (a: number, b: number, t: number) => {
    const list = edges.get(key(a, b));
    if (!list) return;
    const at = list.indexOf(t);
    if (at >= 0) list.splice(at, 1);
  };
  tris.forEach(([a, b, c], t) => {
    addEdge(a, b, t);
    addEdge(b, c, t);
    addEdge(c, a, t);
  });

  const queue: [number, number][] = [];
  for (const [a, b, c] of tris) queue.push([a, b], [b, c], [c, a]);
  let budget = 20 * tris.length + 100;
  while (queue.length > 0 && budget-- > 0) {
    const [a, b] = queue.pop()!;
    if (isOutlineEdge(a, b)) continue;
    const list = edges.get(key(a, b));
    if (!list || list.length !== 2) continue;
    const [t1, t2] = list as [number, number];
    const c = tris[t1]!.find((v) => v !== a && v !== b)!;
    const d = tris[t2]!.find((v) => v !== a && v !== b)!;
    // Orient so that a → b runs counter-clockwise in t1 (c on its left)
    const [p, q] = orient(vertices, a, b, c) > 0 ? [a, b] : [b, a];
    if (!inCircle(vertices, p, q, c, d)) continue;
    // The flipped triangles must both be proper (the quad is convex)
    if (orient(vertices, p, d, c) <= 1e-9 || orient(vertices, d, q, c) <= 1e-9) continue;

    for (const [x, y] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      removeEdge(x, y, t1);
    }
    const [e0, e1, e2] = tris[t2]!;
    removeEdge(e0, e1, t2);
    removeEdge(e1, e2, t2);
    removeEdge(e2, e0, t2);
    tris[t1] = [p, d, c];
    tris[t2] = [d, q, c];
    addEdge(p, d, t1);
    addEdge(d, c, t1);
    addEdge(c, p, t1);
    addEdge(d, q, t2);
    addEdge(q, c, t2);
    addEdge(c, d, t2);
    queue.push([p, d], [d, q], [q, c], [c, p]);
  }
  return tris.flat();
}

function orient(v: Float32Array, a: number, b: number, c: number): number {
  return (
    (v[b * 2]! - v[a * 2]!) * (v[c * 2 + 1]! - v[a * 2 + 1]!) -
    (v[b * 2 + 1]! - v[a * 2 + 1]!) * (v[c * 2]! - v[a * 2]!)
  );
}

/** Whether d lies inside the circle through the counter-clockwise triangle a, b, c. */
function inCircle(v: Float32Array, a: number, b: number, c: number, d: number): boolean {
  const dx = v[d * 2]!;
  const dy = v[d * 2 + 1]!;
  const ax = v[a * 2]! - dx;
  const ay = v[a * 2 + 1]! - dy;
  const bx = v[b * 2]! - dx;
  const by = v[b * 2 + 1]! - dy;
  const cx = v[c * 2]! - dx;
  const cy = v[c * 2 + 1]! - dy;
  const det =
    (ax * ax + ay * ay) * (bx * cy - cx * by) -
    (bx * bx + by * by) * (ax * cy - cx * ay) +
    (cx * cx + cy * cy) * (ax * by - bx * ay);
  // A little slack, so cocircular points (a regular grid) don't flip back and forth
  const scale = (ax * ax + ay * ay + bx * bx + by * by + cx * cx + cy * cy) ** 2;
  return det > 1e-9 * scale;
}
