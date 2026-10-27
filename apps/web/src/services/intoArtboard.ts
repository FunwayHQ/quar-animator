/**
 * A layer put on the canvas — dropped, pasted, imported — goes into the
 * topmost artboard it lands on (its middle on the artboard), keeping its
 * place on screen, as one drawn there does. Else it stays on the page.
 */

import { SelectionManager, artboardAt } from '@quar/core';
import type { SceneGraph } from '@quar/core';

import { useEditorStore } from '../stores/editorStore';

export function intoArtboardBeneath(sceneGraph: SceneGraph, nodeId: string): void {
  const node = sceneGraph.getNode(nodeId);
  if (!node || node.parent || node.type === 'artboard') return;
  const rect = new SelectionManager().getSelectionBounds(new Set([nodeId]), sceneGraph)?.rect;
  const middle = rect
    ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    : node.transform.position;
  const artboard = artboardAt(sceneGraph, middle);
  if (artboard) {
    useEditorStore.getState().moveNodeKeepingPlacement(sceneGraph, nodeId, artboard.id);
  }
}
