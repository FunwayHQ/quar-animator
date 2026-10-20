/**
 * Binding layers to bones — one way for the Rigging menu and the canvas
 * context menu, so both bind with the mesh the renderer bends.
 */

import type { Node } from '@quar/types';

const BINDABLE_TYPES = new Set<string>(['rectangle', 'ellipse', 'polygon', 'path', 'image']);

export interface BindGraph {
  getNode(id: string): Node | undefined;
  getChildren(id: string): Node[];
  traverse(callback: (node: Node) => void): void;
}

/** The vertices a layer binds with, and whether they form its bending mesh. */
export type GetBindVertices = (
  node: Node
) => { vertices: Float32Array; bendMesh: boolean } | null | undefined;

export type BindMesh<G> = (
  graph: G,
  nodeId: string,
  boneIds: string[],
  vertices?: Float32Array,
  options?: { bendMesh?: boolean }
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
      bind(graph, layer.id, boneIds, mesh?.vertices, { bendMesh: mesh?.bendMesh });
    }
  }
}
