/**
 * Artwork Bounds for Quar Animator
 * The area a scene's visible artwork covers: what Fit to Window shows, what
 * an export of the whole scene takes, and what a project thumbnail frames.
 */

import type { Rect, SymbolDefinition } from '@quar/types';
import type { SceneGraph } from '../SceneGraph';
import { SelectionManager } from './SelectionManager';

/** Nodes that help rig artwork but aren't drawn in it. */
const RIG_HELPERS = new Set(['bone', 'ik-target', 'vitruvian']);

export interface ArtworkBounds {
  /** The shapes' own bounds. */
  rect: Rect;
  /** Half the widest visible stroke, which reaches past the shapes' bounds. */
  strokePadding: number;
}

/**
 * Bounds of everything visible a scene draws: shapes, text, images, symbol
 * instances and artboards, leaving out rig helpers, hidden layers and layers
 * faded out entirely. Null when nothing is drawn.
 */
export function getArtworkBounds(
  sceneGraph: SceneGraph,
  symbols: SymbolDefinition[] = [],
  /** Layers measured some other way (bound shapes, where their bones have them) */
  exclude: ReadonlySet<string> = new Set()
): ArtworkBounds | null {
  const selection = new SelectionManager();
  selection.setSymbolDefinitions(symbols);

  // Leaves only: a group's bounds would take in the bones inside it
  const artworkIds = new Set<string>();
  let strokePadding = 0;
  sceneGraph.traverseVisible((node) => {
    // Faded out entirely, so nothing below it shows either
    if (node.opacity <= 0) return false;
    if (node.type === 'group' || RIG_HELPERS.has(node.type) || exclude.has(node.id)) return true;
    artworkIds.add(node.id);
    if ('strokes' in node && Array.isArray(node.strokes)) {
      for (const stroke of node.strokes) {
        if (stroke.visible && stroke.width > 0) {
          strokePadding = Math.max(strokePadding, stroke.width / 2);
        }
      }
    }
    return true;
  });

  const rect = selection.getSelectionBounds(artworkIds, sceneGraph)?.rect;
  if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return null;
  return { rect, strokePadding };
}

/** A rectangle grown by `amount` on every side. */
export function padRect(r: Rect, amount: number): Rect {
  return {
    x: r.x - amount,
    y: r.y - amount,
    width: r.width + amount * 2,
    height: r.height + amount * 2,
  };
}

/** Grow the shorter side of a rectangle, about its center, to a width/height ratio. */
export function widenToAspect(r: Rect, aspect: number): Rect {
  if (!(aspect > 0) || !(r.height > 0) || !(r.width > 0)) return r;
  if (r.width / r.height < aspect) {
    const width = r.height * aspect;
    return { x: r.x - (width - r.width) / 2, y: r.y, width, height: r.height };
  }
  const height = r.width / aspect;
  return { x: r.x, y: r.y - (height - r.height) / 2, width: r.width, height };
}
