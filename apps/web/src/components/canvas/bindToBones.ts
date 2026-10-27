/**
 * Binding layers to bones — one way for the Rigging menu and the canvas
 * context menu, so both bind with the mesh the renderer bends.
 */

import type { Node, SkinData } from '@quar/types';
import type { LayerShape } from '@quar/core';
import {
  bindVertexPositions,
  computeAutoWeights,
  computeFKChain,
  createSkinBinding,
  type FKBoneState,
} from '@quar/rigging';

const BINDABLE_TYPES = new Set<string>(['rectangle', 'ellipse', 'polygon', 'path', 'image']);

export interface BindGraph {
  getNode(id: string): Node | undefined;
  getChildren(id: string): Node[];
  traverse(callback: (node: Node) => void): void;
}

/**
 * The vertices a layer binds with, whether they form its bending mesh, and
 * where the layer shows something (its own space), when that's known.
 */
export type GetBindVertices = (
  node: Node
) => { vertices: Float32Array; bendMesh: boolean; shape?: LayerShape | null } | null | undefined;

/** How a layer is bound: `shape` (its own space) widens each bone's reach to the shape around it */
export interface BindOptions {
  bendMesh?: boolean;
  shape?: LayerShape | null;
}

export type BindMesh<G> = (
  graph: G,
  nodeId: string,
  boneIds: string[],
  vertices?: Float32Array,
  options?: BindOptions
) => void;

/** The layers binding `node` binds: a shape or image itself, or a group's shapes and images. */
export function bindableLayers(graph: BindGraph, node: Node): Node[] {
  if (BINDABLE_TYPES.has(node.type)) return [node];
  if (node.type !== 'group') return [];
  return graph.getChildren(node.id).filter((child) => BINDABLE_TYPES.has(child.type));
}

/** Bind each layer (or each group's shapes and images) to every bone in the scene. */
export function bindLayersToBones<G extends BindGraph>(
  graph: G,
  nodeIds: Iterable<string>,
  getBindVertices: GetBindVertices,
  bind: BindMesh<G>
): void {
  const boneIds: string[] = [];
  graph.traverse((node) => {
    if (node.type === 'bone') boneIds.push(node.id);
  });
  if (boneIds.length === 0) return;

  for (const nodeId of nodeIds) {
    const node = graph.getNode(nodeId);
    if (!node) continue;
    for (const layer of bindableLayers(graph, node)) {
      const mesh = getBindVertices(layer);
      bind(graph, layer.id, boneIds, mesh?.vertices, {
        bendMesh: mesh?.bendMesh,
        shape: mesh?.shape,
      });
    }
  }
}

/** What binding needs of a scene graph: nodes and their world transforms. */
export type SkinGraph = Parameters<typeof createSkinBinding>[3] &
  Parameters<typeof computeFKChain>[1];

/**
 * A layer's binding to bones, weighted from where the bones are now — what
 * Bind to Bones gives a layer (the editor's, and the cloud server's).
 * `vertices` are the layer's bind mesh in its own space (`bendMesh`: its
 * bending mesh); without them the vertices are guessed from the node's type.
 * With the layer's `shape`, each bone reaches as far as the shape around it,
 * so a body keeps what's under a limb. Null when there's nothing to bind.
 */
export function skinBinding(
  graph: SkinGraph,
  nodeId: string,
  boneIds: string[],
  vertices?: Float32Array,
  options?: BindOptions
): SkinData | null {
  const node = graph.getNode(nodeId);
  if (!node || boneIds.length === 0) return null;

  // The bind mesh's vertex count; without one, roughly the node's outline
  let vertexCount: number;
  if (vertices) {
    vertexCount = vertices.length / 2;
  } else {
    vertexCount = 4; // default for rectangles
    if (node.type === 'ellipse') vertexCount = 64;
    else if (node.type === 'polygon')
      vertexCount = node.sides * ((node.innerRadius ?? 0) > 0 ? 2 : 1);
    else if (node.type === 'path') vertexCount = node.points.length || 4;
  }

  const skin = createSkinBinding(nodeId, boneIds, vertexCount, graph);
  if (!skin) return null;

  // Every bone's rest state, chain by chain from each root bone
  const states: FKBoneState[] = [];
  const roots = new Set<string>();
  for (const boneId of boneIds) {
    let rootId = boneId;
    let boneNode = graph.getNode(rootId);
    while (boneNode?.parent) {
      const parent = graph.getNode(boneNode.parent);
      if (!parent || parent.type !== 'bone') break;
      rootId = boneNode.parent;
      boneNode = parent;
    }
    if (!roots.has(rootId)) {
      roots.add(rootId);
      states.push(...computeFKChain(rootId, graph));
    }
  }

  // The vertices in world space, where the bones are, to weight them by
  const meshWorld = graph.getWorldTransform(nodeId);
  const positions = new Float32Array(vertexCount * 2);
  for (let i = 0; i < vertexCount; i++) {
    if (vertices) {
      const lx = vertices[i * 2] ?? 0;
      const ly = vertices[i * 2 + 1] ?? 0;
      positions[i * 2] = meshWorld.a * lx + meshWorld.c * ly + meshWorld.tx;
      positions[i * 2 + 1] = meshWorld.b * lx + meshWorld.d * ly + meshWorld.ty;
    } else {
      const t = vertexCount > 1 ? i / (vertexCount - 1) : 0.5;
      positions[i * 2] = meshWorld.tx + (t - 0.5) * 100;
      positions[i * 2 + 1] = meshWorld.ty;
    }
  }

  const weighted = computeAutoWeights(
    skin,
    positions,
    states,
    worldShape(meshWorld, options?.shape)
  );
  // The geometry the weights belong to, so they can follow later shape edits
  if (vertices) weighted.bindVertices = bindVertexPositions(vertices);
  if (options?.bendMesh) weighted.bendMesh = true;
  return weighted;
}

/** A layer's shape (its own space) tested at world places: the world matrix undone. */
function worldShape(
  world: ReturnType<SkinGraph['getWorldTransform']>,
  shape: LayerShape | null | undefined
): ((x: number, y: number) => boolean) | undefined {
  if (!shape) return undefined;
  const det = world.a * world.d - world.b * world.c;
  if (Math.abs(det) < 1e-12) return undefined;
  return (x, y) => {
    const dx = x - world.tx;
    const dy = y - world.ty;
    return shape((world.d * dx - world.c * dy) / det, (world.a * dy - world.b * dx) / det);
  };
}
