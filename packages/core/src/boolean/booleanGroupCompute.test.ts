/**
 * Tests for computeBooleanGroupResult (non-destructive boolean group computation).
 */

import { describe, it, expect } from 'vitest';
import { computeBooleanGroupResult } from './booleanOps';
import type { Node, RectangleNode, PolygonNode, EllipseNode, Matrix3 } from '@quar/types';
import { mat3 } from '../math';

// ============================================================================
// Helpers
// ============================================================================

function makeRect(id: string, x: number, y: number, w: number, h: number): Node {
  return {
    id,
    name: id,
    type: 'rectangle',
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
    width: w,
    height: h,
    cornerRadius: [0, 0, 0, 0],
    fills: [{ type: 'solid', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  } as unknown as Node;
}

function makePolygonNode(id: string, cx: number, cy: number, radius: number, sides: number): Node {
  return {
    id,
    name: id,
    type: 'polygon',
    parent: null,
    children: [],
    transform: {
      position: { x: cx, y: cy },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    sides,
    radius,
    fills: [{ type: 'solid', color: { r: 0, g: 0, b: 1, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  } as unknown as Node;
}

function makeEllipseNode(id: string, cx: number, cy: number, rx: number, ry: number): Node {
  return {
    id,
    name: id,
    type: 'ellipse',
    parent: null,
    children: [],
    transform: {
      position: { x: cx, y: cy },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    radiusX: rx,
    radiusY: ry,
    fills: [{ type: 'solid', color: { r: 0, g: 1, b: 0, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  } as unknown as Node;
}

/** Build the world transform from a node's own transform fields */
function nodeTransform(node: Node): Matrix3 {
  return mat3.compose(
    node.transform.position,
    node.transform.rotation,
    node.transform.scale,
    node.transform.anchor
  );
}

function identityTransform(): Matrix3 {
  return mat3.identity();
}

function translatedTransform(tx: number, ty: number): Matrix3 {
  return mat3.compose({ x: tx, y: ty }, 0, { x: 1, y: 1 });
}

// ============================================================================
// computeBooleanGroupResult
// ============================================================================

describe('computeBooleanGroupResult', () => {
  it('returns null for fewer than 2 children', () => {
    const rect = makeRect('r1', 0, 0, 100, 100);
    const result = computeBooleanGroupResult([rect], [identityTransform()], 'union');
    expect(result).toBeNull();
  });

  it('returns null for empty children array', () => {
    const result = computeBooleanGroupResult([], [], 'union');
    expect(result).toBeNull();
  });

  it('returns null when op is not provided (pass undefined)', () => {
    const r1 = makeRect('r1', 0, 0, 100, 100);
    const r2 = makeRect('r2', 50, 0, 100, 100);
    // undefined coerced: computeBooleanGroupResult uses BooleanOp which is a string,
    // passing undefined should cause performBoolean to fail or return undefined.
    // Either it throws or returns null -- both are acceptable.
    let result: ReturnType<typeof computeBooleanGroupResult> = null;
    let threw = false;
    try {
      result = computeBooleanGroupResult(
        [r1, r2],
        [nodeTransform(r1), nodeTransform(r2)],
        undefined as unknown as import('./booleanOps').BooleanOp
      );
    } catch {
      threw = true;
    }
    // Either it threw or returned null (not valid contours)
    expect(threw || result === null).toBe(true);
  });

  it('computes union of two overlapping rectangles', () => {
    // Two 100x100 rects overlapping by 50px horizontally
    const r1 = makeRect('r1', 0, 0, 100, 100);
    const r2 = makeRect('r2', 50, 0, 100, 100);
    const transforms = [nodeTransform(r1), nodeTransform(r2)];
    const result = computeBooleanGroupResult([r1, r2], transforms, 'union');

    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(0);
    // Should have at least one contour with points
    expect(result![0].length).toBeGreaterThanOrEqual(3);
  });

  it('computes subtract of two rectangles', () => {
    const r1 = makeRect('r1', 0, 0, 100, 100);
    const r2 = makeRect('r2', 50, 0, 100, 100);
    const transforms = [nodeTransform(r1), nodeTransform(r2)];
    const result = computeBooleanGroupResult([r1, r2], transforms, 'subtract');

    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(0);
  });

  it('computes intersect of two overlapping rectangles', () => {
    const r1 = makeRect('r1', 0, 0, 100, 100);
    const r2 = makeRect('r2', 50, 0, 100, 100);
    const transforms = [nodeTransform(r1), nodeTransform(r2)];
    const result = computeBooleanGroupResult([r1, r2], transforms, 'intersect');

    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(0);
  });

  it('computes exclude of two overlapping rectangles', () => {
    const r1 = makeRect('r1', 0, 0, 100, 100);
    const r2 = makeRect('r2', 50, 0, 100, 100);
    const transforms = [nodeTransform(r1), nodeTransform(r2)];
    const result = computeBooleanGroupResult([r1, r2], transforms, 'exclude');

    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(0);
  });

  it('returns null when shapes do not overlap (for intersect)', () => {
    // Two rects far apart
    const r1 = makeRect('r1', 0, 0, 10, 10);
    const r2 = makeRect('r2', 1000, 1000, 10, 10);
    const transforms = [nodeTransform(r1), nodeTransform(r2)];
    const result = computeBooleanGroupResult([r1, r2], transforms, 'intersect');

    expect(result).toBeNull();
  });

  it('works with 3+ shapes', () => {
    const r1 = makeRect('r1', 0, 0, 100, 100);
    const r2 = makeRect('r2', 50, 0, 100, 100);
    const r3 = makeRect('r3', 100, 0, 100, 100);
    const transforms = [nodeTransform(r1), nodeTransform(r2), nodeTransform(r3)];
    const result = computeBooleanGroupResult([r1, r2, r3], transforms, 'union');

    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(0);
    // Union of 3 overlapping rects should produce a single large contour
    expect(result![0].length).toBeGreaterThanOrEqual(4);
  });

  it('works with polygon nodes', () => {
    // Two overlapping hexagons
    const p1 = makePolygonNode('p1', 50, 50, 60, 6);
    const p2 = makePolygonNode('p2', 80, 50, 60, 6);
    const transforms = [nodeTransform(p1), nodeTransform(p2)];
    const result = computeBooleanGroupResult([p1, p2], transforms, 'union');

    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(0);
  });

  it('works with ellipse nodes (does not crash)', () => {
    const e1 = makeEllipseNode('e1', 50, 50, 40, 40);
    const e2 = makeEllipseNode('e2', 80, 50, 40, 40);
    const transforms = [nodeTransform(e1), nodeTransform(e2)];
    // Ellipses should be converted via nodeToPolygon; this tests it doesn't crash
    const result = computeBooleanGroupResult([e1, e2], transforms, 'union');

    // Ellipses are supported via tessellation, so result should be valid
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(0);
  });

  it('handles children with transforms (translated positions)', () => {
    const r1 = makeRect('r1', 0, 0, 100, 100);
    const r2 = makeRect('r2', 0, 0, 100, 100);
    // Apply different transforms: translate r2 by (50, 0) so they overlap
    const t1 = translatedTransform(0, 0);
    const t2 = translatedTransform(50, 0);
    const result = computeBooleanGroupResult([r1, r2], [t1, t2], 'union');

    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(0);
  });

  it('returns PathPoint[][] with correct structure', () => {
    const r1 = makeRect('r1', 0, 0, 100, 100);
    const r2 = makeRect('r2', 50, 0, 100, 100);
    const transforms = [nodeTransform(r1), nodeTransform(r2)];
    const result = computeBooleanGroupResult([r1, r2], transforms, 'union');

    expect(result).not.toBeNull();
    // Each element of the outer array is a contour (PathPoint[])
    for (const contour of result!) {
      expect(Array.isArray(contour)).toBe(true);
      for (const point of contour) {
        expect(point).toHaveProperty('position');
        expect(point.position).toHaveProperty('x');
        expect(point.position).toHaveProperty('y');
        expect(typeof point.position.x).toBe('number');
        expect(typeof point.position.y).toBe('number');
      }
    }
  });
});
