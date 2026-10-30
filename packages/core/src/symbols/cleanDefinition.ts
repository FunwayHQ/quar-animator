import type { SymbolDefinition } from '@quar/types';
import { SceneGraph } from '../SceneGraph';

/**
 * A symbol's nodes made a clean tree, as a page's are when it's read
 * (SceneGraph.fromJSON): each node under one parent, none its own ancestor,
 * no child listed twice, every root listed. Definitions come from files and
 * the clipboard, and drawing a symbol follows its nodes' children.
 */
export function cleanSymbolDefinition(definition: SymbolDefinition): SymbolDefinition {
  const graph = new SceneGraph();
  graph.fromJSON(structuredClone(definition.sceneGraphJSON));
  return { ...definition, sceneGraphJSON: graph.toJSON() };
}
