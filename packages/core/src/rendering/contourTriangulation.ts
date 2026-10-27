/**
 * Fill triangulation for multi-contour (compound) paths.
 *
 * Well-formed contours — disjoint or cleanly nested — are grouped into outers
 * and holes by containment and triangulated with earcut. Contours that cross
 * or touch (font outlines exported as paths overlap their strokes, and their
 * counters often self-intersect) cannot be described as outer + holes, so for
 * the nonzero rule they are first resolved into simple polygons.
 */

import earcut from 'earcut';
import polygonClipping from 'polygon-clipping';
import type { Ring } from 'polygon-clipping';

export type FillRule = 'nonzero' | 'evenodd';

export interface ContourTriangulation {
  /**
   * All contour vertices concatenated in contour order, followed by any
   * vertices the fill-rule resolution introduced (e.g. intersection points).
   */
  vertices: Float32Array;
  /** Triangle indices into `vertices`. */
  indices: number[];
}

/**
 * Triangulate the fill of a set of closed contours under the given fill rule.
 * Each contour is a flat [x, y, x, y, ...] array without a closing duplicate.
 */
export function triangulateContours(
  contourArrays: Float32Array[],
  fillRule: FillRule
): ContourTriangulation {
  let totalFloats = 0;
  for (const arr of contourArrays) totalFloats += arr.length;
  const combined = new Float32Array(totalFloats);
  let writeOffset = 0;
  for (const arr of contourArrays) {
    combined.set(arr, writeOffset);
    writeOffset += arr.length;
  }

  if (fillRule === 'nonzero' && contoursInteract(contourArrays)) {
    const resolved = triangulateNonzeroResolved(contourArrays, combined);
    if (resolved) return resolved;
  }

  return { vertices: combined, indices: triangulateByContainment(contourArrays, fillRule) };
}

/**
 * Triangulate text: each glyph's contours by the nonzero rule fonts are drawn
 * with, one glyph at a time. A glyph's own contours may overlap (a w drawn as
 * one self-crossing contour, an A's crossbar laid over its legs); resolving
 * them glyph by glyph keeps the rest of a paragraph on the fast path. The
 * vertices are each glyph's in turn, as triangulateContours lays them out.
 */
export function triangulateGlyphContours(glyphs: Float32Array[][]): ContourTriangulation {
  const parts = glyphs
    .filter((contours) => contours.length > 0)
    .map((contours) => triangulateContours(contours, 'nonzero'));
  let total = 0;
  for (const part of parts) total += part.vertices.length;
  const vertices = new Float32Array(total);
  const indices: number[] = [];
  let offset = 0;
  for (const part of parts) {
    vertices.set(part.vertices, offset);
    const first = offset / 2;
    for (const index of part.indices) indices.push(index + first);
    offset += part.vertices.length;
  }
  return { vertices, indices };
}

// ============================================================================
// Containment Grouping (non-interacting contours)
// ============================================================================

/** Earcut each outer contour with its holes; indices refer to the concatenated contours. */
function triangulateByContainment(contourArrays: Float32Array[], fillRule: FillRule): number[] {
  const globalVertStarts: number[] = [];
  let vertCount = 0;
  for (const arr of contourArrays) {
    globalVertStarts.push(vertCount);
    vertCount += arr.length / 2;
  }

  const groups = groupContoursByContainment(contourArrays, fillRule);
  const allIndices: number[] = [];
  for (const group of groups) {
    const contourIndices = [group.outer, ...group.holes];

    let groupFloats = 0;
    for (const ci of contourIndices) groupFloats += contourArrays[ci]!.length;
    const groupVerts = new Float32Array(groupFloats);
    const groupHoles: number[] = [];
    // Where each contour starts within the group-local array (vertex index)
    const localStarts: number[] = [];
    let localOffset = 0;
    for (let gi = 0; gi < contourIndices.length; gi++) {
      const ci = contourIndices[gi]!;
      localStarts.push(localOffset / 2);
      if (gi > 0) groupHoles.push(localOffset / 2);
      groupVerts.set(contourArrays[ci]!, localOffset);
      localOffset += contourArrays[ci]!.length;
    }
    if (groupVerts.length / 2 < 3) continue;

    const indices = earcut(groupVerts, groupHoles.length > 0 ? groupHoles : undefined);
    for (const localIdx of indices) {
      let slot = 0;
      for (let gi = contourIndices.length - 1; gi >= 0; gi--) {
        if (localIdx >= localStarts[gi]!) {
          slot = gi;
          break;
        }
      }
      allIndices.push(globalVertStarts[contourIndices[slot]!]! + localIdx - localStarts[slot]!);
    }
  }
  return allIndices;
}

interface ContourGroup {
  outer: number; // index into contourArrays
  holes: number[]; // indices into contourArrays
}

/** Compute AABB for a tessellated vertex array (flat x,y pairs). */
function contourAABB(verts: Float32Array): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < verts.length; i += 2) {
    const x = verts[i]!;
    const y = verts[i + 1]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Point-in-polygon test (ray casting) for tessellated vertices. */
function pointInContour(px: number, py: number, verts: Float32Array): boolean {
  let inside = false;
  const n = verts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = verts[i * 2]!;
    const yi = verts[i * 2 + 1]!;
    const xj = verts[j * 2]!;
    const yj = verts[j * 2 + 1]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Compute signed area of a contour (positive = CCW, negative = CW). */
function contourSignedArea(verts: Float32Array): number {
  let area = 0;
  const n = verts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    area += verts[j * 2]! * verts[i * 2 + 1]! - verts[i * 2]! * verts[j * 2 + 1]!;
  }
  return area / 2;
}

/**
 * Group contours by containment: each outer contour with its holes.
 * Disjoint contours become separate groups (each is its own outer).
 * Uses AABB pre-check + point-in-polygon for containment, then signed area
 * to disambiguate outer vs hole.
 */
function groupContoursByContainment(
  contourArrays: Float32Array[],
  fillRule: 'nonzero' | 'evenodd' = 'evenodd'
): ContourGroup[] {
  const n = contourArrays.length;
  if (n <= 1) {
    return n === 1 ? [{ outer: 0, holes: [] }] : [];
  }

  // Precompute AABBs and areas
  const aabbs = contourArrays.map(contourAABB);
  const areas = contourArrays.map(contourSignedArea);

  // For each contour, find which contours contain it (AABB + point-in-polygon)
  const containedBy: number[][] = Array.from({ length: n }, () => []);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const ai = aabbs[i]!;
      const aj = aabbs[j]!;
      // Quick AABB check: is i's AABB inside j's AABB?
      if (ai.minX >= aj.minX && ai.maxX <= aj.maxX && ai.minY >= aj.minY && ai.maxY <= aj.maxY) {
        // Use first vertex of contour i as test point
        const px = contourArrays[i]![0]!;
        const py = contourArrays[i]![1]!;
        if (pointInContour(px, py, contourArrays[j]!)) {
          containedBy[i]!.push(j);
        }
      }
    }
  }

  const depth = containedBy.map((parents) => parents.length);
  const isHole = new Array<boolean>(n).fill(false);

  if (fillRule === 'evenodd') {
    // Evenodd: a contour with odd nesting depth is a hole.
    for (let i = 0; i < n; i++) {
      isHole[i] = depth[i]! % 2 === 1;
    }
  } else {
    // Nonzero: a contained contour is a hole only if its winding direction
    // differs from its immediate parent. Same winding = filled, not a hole.
    for (let i = 0; i < n; i++) {
      if (depth[i] === 0) continue; // Top-level contour, not a hole
      // Find immediate parent (tightest container)
      let parentIdx = -1;
      let parentArea = Infinity;
      for (const p of containedBy[i]!) {
        const absA = Math.abs(areas[p]!);
        if (absA < parentArea) {
          parentArea = absA;
          parentIdx = p;
        }
      }
      if (parentIdx >= 0) {
        // Same sign = same winding direction = NOT a hole (for nonzero)
        const sameWinding = areas[i]! > 0 === areas[parentIdx]! > 0;
        isHole[i] = !sameWinding;
      }
    }
  }

  // Build groups: each non-hole contour is an outer
  const groups: ContourGroup[] = [];
  const outerIndices = contourArrays.map((_, i) => i).filter((i) => !isHole[i]!);
  const holeIndices = contourArrays.map((_, i) => i).filter((i) => isHole[i]!);

  for (const outerIdx of outerIndices) {
    groups.push({ outer: outerIdx, holes: [] });
  }

  // Assign each hole to its immediate parent (the outer that directly contains it)
  for (const holeIdx of holeIndices) {
    // Find the tightest (smallest area) outer contour that contains this hole
    let bestOuter = -1;
    let bestArea = Infinity;
    for (const parentIdx of containedBy[holeIdx]!) {
      if (!isHole[parentIdx]!) {
        const absArea = Math.abs(areas[parentIdx]!);
        if (absArea < bestArea) {
          bestArea = absArea;
          bestOuter = parentIdx;
        }
      }
    }
    if (bestOuter >= 0) {
      const group = groups.find((g) => g.outer === bestOuter);
      if (group) group.holes.push(holeIdx);
    } else {
      // Orphan hole (no containing outer) — treat as its own outer
      groups.push({ outer: holeIdx, holes: [] });
    }
  }

  return groups;
}

// ============================================================================
// Contour Interaction Detection
// ============================================================================

/** Distance (local units) within which a vertex counts as touching another edge. */
const TOUCH_EPSILON = 1e-3;

interface Segment {
  contour: number;
  /** Edge index within its contour (after dropping zero-length edges). */
  index: number;
  /** Number of edges in its contour. */
  count: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * True when any two contour edges cross or touch — between contours or within
 * one (self-intersection). Containment grouping is only valid when this is false.
 * Sort-and-sweep on X keeps the common case near O(n log n).
 */
export function contoursInteract(contourArrays: Float32Array[]): boolean {
  const segments: Segment[] = [];
  for (let c = 0; c < contourArrays.length; c++) {
    const verts = contourArrays[c]!;
    // Drop repeated vertices so adjacent edges always share an endpoint.
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < verts.length; i += 2) {
      const x = verts[i]!;
      const y = verts[i + 1]!;
      const n = xs.length;
      if (n > 0 && xs[n - 1] === x && ys[n - 1] === y) continue;
      xs.push(x);
      ys.push(y);
    }
    while (xs.length > 1 && xs[0] === xs[xs.length - 1] && ys[0] === ys[ys.length - 1]) {
      xs.pop();
      ys.pop();
    }
    const count = xs.length;
    if (count < 3) continue;
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      const ax = xs[i]!;
      const ay = ys[i]!;
      const bx = xs[j]!;
      const by = ys[j]!;
      segments.push({
        contour: c,
        index: i,
        count,
        ax,
        ay,
        bx,
        by,
        minX: Math.min(ax, bx),
        maxX: Math.max(ax, bx),
        minY: Math.min(ay, by),
        maxY: Math.max(ay, by),
      });
    }
  }

  segments.sort((a, b) => a.minX - b.minX);
  const active: Segment[] = [];
  for (const s of segments) {
    let kept = 0;
    for (let k = 0; k < active.length; k++) {
      const t = active[k]!;
      if (t.maxX + TOUCH_EPSILON < s.minX) continue; // left behind by the sweep
      active[kept++] = t;
      if (t.maxY + TOUCH_EPSILON < s.minY || s.maxY + TOUCH_EPSILON < t.minY) continue;
      if (t.contour === s.contour && areAdjacent(t, s)) continue;
      if (segmentsTouch(t, s)) return true;
    }
    active.length = kept;
    active.push(s);
  }
  return false;
}

function areAdjacent(a: Segment, b: Segment): boolean {
  const d = Math.abs(a.index - b.index);
  return d === 1 || d === a.count - 1;
}

/** Signed area of the triangle (a, b, p) ×2 — positive when p is left of a→b. */
function orient(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}

/** Whether point p lies within TOUCH_EPSILON of segment a–b. */
function pointNearSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const ex = ax + t * dx - px;
  const ey = ay + t * dy - py;
  return ex * ex + ey * ey <= TOUCH_EPSILON * TOUCH_EPSILON;
}

function segmentsTouch(s: Segment, t: Segment): boolean {
  const d1 = orient(t.ax, t.ay, t.bx, t.by, s.ax, s.ay);
  const d2 = orient(t.ax, t.ay, t.bx, t.by, s.bx, s.by);
  const d3 = orient(s.ax, s.ay, s.bx, s.by, t.ax, t.ay);
  const d4 = orient(s.ax, s.ay, s.bx, s.by, t.bx, t.by);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true; // proper crossing
  }
  return (
    pointNearSegment(s.ax, s.ay, t.ax, t.ay, t.bx, t.by) ||
    pointNearSegment(s.bx, s.by, t.ax, t.ay, t.bx, t.by) ||
    pointNearSegment(t.ax, t.ay, s.ax, s.ay, s.bx, s.by) ||
    pointNearSegment(t.bx, t.by, s.ax, s.ay, s.bx, s.by)
  );
}

// ============================================================================
// Nonzero Resolution (interacting contours)
// ============================================================================

/**
 * Resolve interacting contours into simple polygons with holes under the
 * nonzero rule, then earcut those. Returns null if resolution fails so the
 * caller can fall back to containment grouping.
 *
 * polygon-clipping applies the nonzero rule *within* a ring but ignores winding
 * *across* rings, so all contours are chained into one ring. The connecting
 * bridges are each walked once in both directions, so they cancel and every
 * point keeps the winding number the separate contours give it.
 */
function triangulateNonzeroResolved(
  contourArrays: Float32Array[],
  combined: Float32Array
): ContourTriangulation | null {
  const contours = contourArrays.filter((arr) => arr.length >= 6);
  if (contours.length === 0) return null;

  const first = contours[0]!;
  const hubX = first[0]!;
  const hubY = first[1]!;
  const ring: Ring = [];
  for (const verts of contours) {
    const startX = verts[0]!;
    const startY = verts[1]!;
    for (let i = 0; i < verts.length; i += 2) ring.push([verts[i]!, verts[i + 1]!]);
    ring.push([startX, startY]); // close this contour
    ring.push([hubX, hubY]); // bridge back to the hub
  }

  let multiPolygon;
  try {
    multiPolygon = polygonClipping.union([ring]);
  } catch {
    return null;
  }

  // Reuse the original vertex for every output coordinate that matches one, so
  // skinning weights and morph offsets keep lining up with the contour vertices.
  const vertexIndex = new Map<string, number>();
  for (let i = combined.length / 2 - 1; i >= 0; i--) {
    vertexIndex.set(`${combined[i * 2]!},${combined[i * 2 + 1]!}`, i);
  }
  const extra: number[] = [];
  const baseCount = combined.length / 2;
  const indexOf = (x: number, y: number): number => {
    const key = `${x},${y}`;
    let idx = vertexIndex.get(key);
    if (idx === undefined) {
      idx = baseCount + extra.length / 2;
      extra.push(x, y);
      vertexIndex.set(key, idx);
    }
    return idx;
  };

  const indices: number[] = [];
  for (const polygon of multiPolygon) {
    const flat: number[] = [];
    const holes: number[] = [];
    for (let r = 0; r < polygon.length; r++) {
      const pts = polygon[r]!;
      if (r > 0) holes.push(flat.length / 2);
      // Output rings repeat their first point at the end.
      for (let i = 0; i < pts.length - 1; i++) flat.push(pts[i]![0], pts[i]![1]);
    }
    if (flat.length < 6) continue;
    const local = earcut(flat, holes.length > 0 ? holes : undefined);
    for (const li of local) indices.push(indexOf(flat[li * 2]!, flat[li * 2 + 1]!));
  }

  if (extra.length === 0) return { vertices: combined, indices };
  const vertices = new Float32Array(combined.length + extra.length);
  vertices.set(combined);
  vertices.set(extra, combined.length);
  return { vertices, indices };
}
