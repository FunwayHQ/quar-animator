/**
 * Text-to-Shape conversion for Quar Animator
 * Converts a TextNode to a PathNode (irreversible flattening).
 */

import type { TextNode, PathNode, PathPoint } from '@quar/types';
import { textToSubpaths, computeSubpathsBounds } from './glyphConverter';
import { getFontManager } from './FontManager';

/**
 * Convert a TextNode to a PathNode by converting text glyphs to path points.
 * The text is rendered using the font, then converted to vector paths.
 *
 * @param textNode The text node to convert
 * @param generateId Function to generate unique IDs
 * @returns PathNode with the text glyphs as vector paths, or null if font not available
 */
export function convertTextToPath(textNode: TextNode, generateId: () => string): PathNode | null {
  const fm = getFontManager();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const font = fm.getFontOrFallback(textNode.fontFamily);
  if (!font) return null;

  const result = textToSubpaths(textNode.content, font, textNode.fontSize, {
    textAlign: textNode.textAlign,
    lineHeight: textNode.lineHeight,
    letterSpacing: textNode.letterSpacing,
  });

  if (result.subpaths.length === 0) return null;

  // Center all subpaths at AABB center (same pattern as SVG converter)
  const bounds = computeSubpathsBounds(result.subpaths);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  const centeredSubpaths: PathPoint[][] = [];
  for (const sp of result.subpaths) {
    centeredSubpaths.push(
      sp.map((pt) => ({
        ...pt,
        position: {
          x: pt.position.x - centerX,
          y: pt.position.y - centerY,
        },
        handleIn: pt.handleIn ? { ...pt.handleIn } : null,
        handleOut: pt.handleOut ? { ...pt.handleOut } : null,
      }))
    );
  }

  // First subpath is the primary, rest are additional subpaths
  const primaryPoints = centeredSubpaths[0] ?? [];
  const additionalSubpaths = centeredSubpaths.slice(1);

  // Position the PathNode at the text's center in world space
  const worldCenterX = textNode.transform.position.x + centerX * textNode.transform.scale.x;
  const worldCenterY = textNode.transform.position.y + centerY * textNode.transform.scale.y;

  const pathNode: PathNode = {
    id: generateId(),
    name: `${textNode.name} (Path)`,
    type: 'path',
    parent: textNode.parent,
    children: [],
    transform: {
      position: { x: worldCenterX, y: worldCenterY },
      rotation: textNode.transform.rotation,
      scale: { ...textNode.transform.scale },
      anchor: { x: 0.5, y: 0.5 },
      skew: { ...textNode.transform.skew },
    },
    visible: textNode.visible,
    locked: textNode.locked,
    opacity: textNode.opacity,
    blendMode: textNode.blendMode,
    effects: textNode.effects ? [...textNode.effects] : undefined,
    points: primaryPoints,
    subpaths: additionalSubpaths.length > 0 ? additionalSubpaths : undefined,
    closed: true,
    fillRule: 'evenodd',
    fills: textNode.fills.map((f) => ({ ...f })),
    strokes: textNode.strokes.map((s) => ({ ...s })),
  };

  return pathNode;
}
