/**
 * Flip Selected for Quar Animator
 * Flip Horizontal / Flip Vertical on the selected layers, as one: mirrored
 * across the middle of the selection, so it stays in place on the canvas.
 */

import { SelectionManager, type SceneGraph } from '@quar/core';
import { useEditorStore } from '../../stores/editorStore';
import { flippableLayers, type FlipAxis } from '../../stores/flip';

export function flipSelected(sceneGraph: SceneGraph, axis: FlipAxis): void {
  const state = useEditorStore.getState();
  const ids = flippableLayers(sceneGraph, state.selectedNodeIds);
  if (ids.length === 0) return;
  const selection = new SelectionManager();
  selection.setSymbolDefinitions(state.symbols);
  const center = selection.getSelectionBounds(new Set(ids), sceneGraph)?.center;
  if (!center) return;
  state.flipLayers(sceneGraph, ids, axis, center);
}
