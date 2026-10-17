import { describe, it, expect } from 'vitest';
import { createImageMesh, imageMeshCells } from './imageMesh';

const corners = {
  bl: { x: -50, y: -20 },
  br: { x: 50, y: -20 },
  tl: { x: -50, y: 20 },
  tr: { x: 50, y: 20 },
};

describe('image meshes', () => {
  it('divides an image into cells of about 20 units', () => {
    expect(imageMeshCells(480, 120)).toEqual({ cols: 24, rows: 6 });
    // At least one cell, at most 40 per axis
    expect(imageMeshCells(5, 5)).toEqual({ cols: 1, rows: 1 });
    expect(imageMeshCells(4000, 30)).toEqual({ cols: 40, rows: 2 });
  });

  it('is the plain quad [BL, BR, TL, TR] at 1 × 1', () => {
    const mesh = createImageMesh(corners, 1, 1);
    expect(Array.from(mesh.vertices)).toEqual([-50, -20, 50, -20, -50, 20, 50, 20]);
    expect(Array.from(mesh.uvs)).toEqual([0, 1, 1, 1, 0, 0, 1, 0]);
    expect(mesh.indices).toEqual([0, 1, 2, 2, 1, 3]);
  });

  it('places grid points evenly, with the texture’s top at the image’s top', () => {
    const mesh = createImageMesh(corners, 4, 2);
    expect(mesh.vertices).toHaveLength(5 * 3 * 2);
    expect(mesh.indices).toHaveLength(4 * 2 * 6);
    // The middle of the grid (column 2, row 1)
    const middle = 1 * 5 + 2;
    expect([mesh.vertices[middle * 2], mesh.vertices[middle * 2 + 1]]).toEqual([0, 0]);
    expect([mesh.uvs[middle * 2], mesh.uvs[middle * 2 + 1]]).toEqual([0.5, 0.5]);
    // Top-left vertex samples the texture's top-left
    const topLeft = 2 * 5;
    expect([mesh.uvs[topLeft * 2], mesh.uvs[topLeft * 2 + 1]]).toEqual([0, 0]);
  });

  it('follows distorted corners bilinearly', () => {
    const mesh = createImageMesh({ ...corners, tr: { x: 70, y: 40 } }, 2, 2);
    // The centre moves a quarter of the corner's offset
    const centre = 1 * 3 + 1;
    expect(mesh.vertices[centre * 2]).toBeCloseTo(5);
    expect(mesh.vertices[centre * 2 + 1]).toBeCloseTo(5);
  });
});
