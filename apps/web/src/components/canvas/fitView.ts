/**
 * Fit to Window: frame everything a page draws.
 */

import type { SymbolDefinition } from '@quar/types';
import type { Camera, SceneGraph } from '@quar/core';
import { getArtworkBounds, padRect } from '@quar/core';

/** Screen pixels left around the artwork. */
const FIT_MARGIN = 48;

/**
 * Zoom and pan so all the visible artwork (strokes included) fills the view;
 * an empty page goes back to 100% at the origin.
 */
export function fitViewToArtwork(
  camera: Camera,
  sceneGraph: SceneGraph,
  symbols: SymbolDefinition[]
): void {
  const artwork = getArtworkBounds(sceneGraph, symbols);
  if (!artwork || !(artwork.rect.width > 0) || !(artwork.rect.height > 0)) {
    camera.reset();
    return;
  }
  camera.fitBounds(padRect(artwork.rect, artwork.strokePadding), FIT_MARGIN);
}
