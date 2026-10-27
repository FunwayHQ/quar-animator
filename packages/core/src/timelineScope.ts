/**
 * Which timeline a layer plays on: the artboard's at the root of its branch,
 * or (outside every artboard) the page's — and which layers a timeline
 * plays.
 */

import type { SceneGraph } from './SceneGraph';

/** What finding a layer's timeline needs of a scene graph. */
export type ScopeLookup = Pick<SceneGraph, 'getRootNodes' | 'getDescendants'>;

/** The artboard (its id) whose timeline a layer plays on; null: the page's. */
export function timelineScopeOf(sceneGraph: SceneGraph, nodeId: string): string | null {
  const node = sceneGraph.getNode(nodeId);
  if (!node) return null;
  const root = sceneGraph.getAncestors(nodeId).at(-1) ?? node;
  return root.type === 'artboard' ? root.id : null;
}

/** The layers a timeline plays: an artboard and everything in it, or (null) everything outside every artboard. */
export function scopeNodeIds(sceneGraph: ScopeLookup, scope: string | null): Set<string> {
  const ids = new Set<string>();
  for (const root of sceneGraph.getRootNodes()) {
    const inScope = scope === null ? root.type !== 'artboard' : root.id === scope;
    if (!inScope) continue;
    ids.add(root.id);
    for (const node of sceneGraph.getDescendants(root.id)) ids.add(node.id);
  }
  return ids;
}

/**
 * Whether a layer plays on this timeline: an artboard's (in it), or the
 * page's (in no artboard; one no longer on the page too, as a track left
 * for it always was).
 */
export function inTimelineScope(
  sceneGraph: ScopeLookup,
  scope: string | null
): (nodeId: string) => boolean {
  if (scope !== null) {
    const ids = scopeNodeIds(sceneGraph, scope);
    return (nodeId) => ids.has(nodeId);
  }
  const inArtboards = new Set<string>();
  for (const root of sceneGraph.getRootNodes()) {
    if (root.type !== 'artboard') continue;
    inArtboards.add(root.id);
    for (const node of sceneGraph.getDescendants(root.id)) inArtboards.add(node.id);
  }
  return (nodeId) => !inArtboards.has(nodeId);
}

/** The page's artboards, in the Layers panel's order: the topmost first (the slides' order). */
export function artboardsInOrder(sceneGraph: Pick<SceneGraph, 'getRootNodes'>) {
  return sceneGraph
    .getRootNodes()
    .filter((node) => node.type === 'artboard')
    .reverse();
}
