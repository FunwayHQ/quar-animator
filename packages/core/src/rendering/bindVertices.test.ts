import { describe, it, expect } from 'vitest';
import type { ImageNode, Node } from '@quar/types';
import { createDefaultTransform } from '../SceneGraph';
import { bendGeometry, bindVertices, imageBindMesh } from './bindVertices';
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
