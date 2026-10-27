import { describe, it, expect } from 'vitest';
import type { ImageNode, Node } from '@quar/types';
import { createDefaultTransform } from '../SceneGraph';
import { bendGeometry, bindVertices, imageBindMesh, layerShape } from './bindVertices';
import { imageMeshCells } from './imageMesh';

const base = {
  parent: null,
  children: [],
  transform: createDefaultTransform(),
  visible: true,
  locked: false,
  opacity: 1,
  blendMode: 'normal' as const,
};

const corner = (x: number, y: number) => ({
  position: { x, y },
  handleIn: null,
  handleOut: null,
  type: 'corner' as const,
});

const rectangle = (width: number, height: number) =>
  ({
    ...base,
    id: 'sleeve',
    name: 'Sleeve',
    type: 'rectangle',
    width,
    height,
    cornerRadius: [0, 0, 0, 0],
    fills: [],
    strokes: [],
  }) as unknown as Node;

const image = (skinData?: unknown) =>
  ({
    ...base,
    id: 'photo',
    name: 'Photo',
    type: 'image',
    src: 'data:,',
    width: 200,
    height: 100,
    naturalWidth: 200,
    naturalHeight: 100,
    ...(skinData ? { skinData } : {}),
  }) as unknown as ImageNode;

describe('bindVertices', () => {
  it('binds a shape by its bending mesh, as the renderer does', () => {
    const bind = bindVertices(rectangle(200, 40));
    expect(bind?.bendMesh).toBe(true);
    // The outline in 20-unit pieces, plus points inside
    expect(bind!.vertices.length / 2).toBe(24 + 9);
    const mesh = bendGeometry(rectangle(200, 40))!;
    expect(mesh.outlineVertexCount).toBe(24);
    expect(mesh.indices.length % 3).toBe(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
  });

  it('bends an open path along its length: all outline, no triangles', () => {
    const line = {
      ...base,
      id: 'tail',
      name: 'Tail',
      type: 'path',
      points: [corner(0, 0), corner(100, 0)],
      closed: false,
      fills: [],
      strokes: [],
    } as unknown as Node;
    const mesh = bendGeometry(line)!;
    expect(mesh.indices).toEqual([]);
    expect(mesh.outlineVertexCount).toBe(mesh.vertices.length / 2);
    expect(mesh.vertices.length / 2).toBeGreaterThan(2);
  });

  it('binds an unbound image by its cell mesh', () => {
    const bind = bindVertices(image());
    const { cols, rows } = imageMeshCells(200, 100);
    expect(bind?.bendMesh).toBe(false);
    expect(bind!.vertices.length / 2).toBe((cols + 1) * (rows + 1));
  });

  it('keeps the plain quad of an image bound before image meshes', () => {
    expect(imageBindMesh(image({ vertexCount: 4 })).vertices.length / 2).toBe(4);
    // Bound already: nothing new to bind
    expect(bindVertices(image({ vertexCount: 4 }))).toBeNull();
  });

  it('leaves what only a renderer can tessellate to the renderer', () => {
    const group = { ...base, id: 'g', name: 'Group', type: 'group' } as unknown as Node;
    expect(bindVertices(group)).toBeNull();
  });
});

describe('layerShape', () => {
  it('is a closed shape’s inside', () => {
    const inside = layerShape(rectangle(200, 40))!;
    expect(inside(0, 0)).toBe(true);
    expect(inside(99, 19)).toBe(true);
    expect(inside(101, 0)).toBe(false);
    expect(inside(0, -21)).toBe(false);
  });

  it('is an image’s opaque pixels, its mask’s first row at the top', () => {
    // 4 × 2 samples over a 200 × 100 image: only the top-left quarter is opaque
    const data = new Uint8Array([255, 255, 0, 0, 0, 0, 0, 0]);
    const inside = layerShape(image(), { width: 4, height: 2, data })!;
    // The image spans x −100…100, y −50…50 (centred, Y up)
    expect(inside(-75, 25)).toBe(true);
    expect(inside(-25, 25)).toBe(true);
    expect(inside(25, 25)).toBe(false);
    expect(inside(-75, -25)).toBe(false); // the bottom row
    expect(inside(-150, 25)).toBe(false); // off the image
  });

  it('follows the image’s anchor', () => {
    const anchored = {
      ...image(),
      transform: { ...createDefaultTransform(), anchor: { x: 0, y: 0 } },
    } as ImageNode;
    // Opaque on its right half
    const inside = layerShape(anchored, { width: 2, height: 1, data: new Uint8Array([0, 255]) })!;
    // Anchored at its bottom-left corner: the image spans 0…200, 0…100
    expect(inside(150, 80)).toBe(true);
    expect(inside(50, 80)).toBe(false);
    expect(inside(-10, 50)).toBe(false);
  });

  it('doesn’t know an image without its mask, an opaque one, nor an open path', () => {
    expect(layerShape(image())).toBeNull();
    expect(
      layerShape(image(), { width: 2, height: 1, data: new Uint8Array([255, 200]) })
    ).toBeNull();
    const line = {
      ...base,
      id: 'l',
      name: 'L',
      type: 'path',
      points: [corner(0, 0), corner(100, 0)],
      closed: false,
    } as unknown as Node;
    expect(layerShape(line)).toBeNull();
  });
});
