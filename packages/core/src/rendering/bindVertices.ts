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
