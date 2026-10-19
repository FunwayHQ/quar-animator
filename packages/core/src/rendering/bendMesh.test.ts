import { describe, it, expect } from 'vitest';
import { createBendMesh, subdivideOutline } from './bendMesh';

const rectangle = (w: number, h: number) =>
  new Float32Array([-w / 2, -h / 2, w / 2, -h / 2, w / 2, h / 2, -w / 2, h / 2]);

function triangleAreas(vertices: Float32Array, indices: number[]): number[] {
  const areas: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i]!, indices[i + 1]!, indices[i + 2]!];
    areas.push(
      ((vertices[b * 2]! - vertices[a * 2]!) * (vertices[c * 2 + 1]! - vertices[a * 2 + 1]!) -
        (vertices[b * 2 + 1]! - vertices[a * 2 + 1]!) * (vertices[c * 2]! - vertices[a * 2]!)) /
        2
    );
  }
  return areas;
}

function longestEdge(vertices: Float32Array, indices: number[]): number {
  let longest = 0;
  for (let i = 0; i < indices.length; i += 3) {
    for (const [p, q] of [
      [indices[i]!, indices[i + 1]!],
      [indices[i + 1]!, indices[i + 2]!],
      [indices[i + 2]!, indices[i]!],
    ]) {
      longest = Math.max(
        longest,
        Math.hypot(vertices[p * 2]! - vertices[q * 2]!, vertices[p * 2 + 1]! - vertices[q * 2 + 1]!)
      );
    }
  }
  return longest;
}

describe('bending meshes', () => {
  it('subdivides an outline into pieces no longer than asked', () => {
    const open = Array.from(subdivideOutline([0, 0, 50, 0], false, 20));
    [0, 0, 50 / 3, 0, 100 / 3, 0, 50, 0].forEach((v, i) => expect(open[i]).toBeCloseTo(v, 4));
    // Closed: the closing edge too, and a repeated closing point is dropped
    const closed = subdivideOutline([0, 0, 40, 0, 40, 40, 0, 0], true, 20);
    expect(closed.length / 2).toBe(2 + 2 + 3);
  });

  it('fills a long rectangle with small triangles, outline first', () => {
    const mesh = createBendMesh(rectangle(200, 40));
    // 480 units of outline in 20-unit pieces
    expect(mesh.outlineVertexCount).toBe(24);
    expect(Array.from(mesh.vertices.subarray(0, 2))).toEqual([-100, -20]);
    // Points inside along the middle
    const inside = mesh.vertices.length / 2 - mesh.outlineVertexCount;
    expect(inside).toBe(9);
    // Every point used: n + 2m − 2 triangles, all proper, covering the shape exactly
    const areas = triangleAreas(mesh.vertices, mesh.indices);
    expect(areas).toHaveLength(24 + 2 * 9 - 2);
    expect(Math.min(...areas)).toBeGreaterThan(0);
    expect(areas.reduce((sum, area) => sum + area, 0)).toBeCloseTo(8000);
    // No slivers across the shape
    expect(longestEdge(mesh.vertices, mesh.indices)).toBeLessThan(40);
  });

  it('meshes a concave shape inside its outline', () => {
    // An L
    const mesh = createBendMesh(new Float32Array([0, 0, 200, 0, 200, 60, 60, 60, 60, 200, 0, 200]));
    const areas = triangleAreas(mesh.vertices, mesh.indices);
    expect(Math.min(...areas)).toBeGreaterThan(0);
    expect(areas.reduce((sum, area) => sum + area, 0)).toBeCloseTo(200 * 60 + 60 * 140);
    expect(longestEdge(mesh.vertices, mesh.indices)).toBeLessThan(45);
  });
});
