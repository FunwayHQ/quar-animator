/**
 * Text-to-Shape conversion for Quar Animator
 * Converts a TextNode to a PathNode or a GroupNode of per-letter PathNodes.
 */

import type { TextNode, PathNode, PathPoint, GroupNode } from '@quar/types';
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

/**
 * Helper: center subpaths relative to a given center point.
 */
function centerSubpaths(subpaths: PathPoint[][], cx: number, cy: number): PathPoint[][] {
  return subpaths.map((sp) =>
    sp.map((pt) => ({
      ...pt,
      position: { x: pt.position.x - cx, y: pt.position.y - cy },
      handleIn: pt.handleIn ? { ...pt.handleIn } : null,
      handleOut: pt.handleOut ? { ...pt.handleOut } : null,
    }))
  );
}

/**
 * Result of converting text to a group of per-letter PathNodes.
 */
export interface TextToPathGroupResult {
  group: GroupNode;
  children: PathNode[];
}

/**
 * Convert a TextNode to a GroupNode containing one PathNode per glyph.
 * Each letter is individually selectable. Characters that produce no contours
 * (e.g. spaces) are skipped.
 *
 * @param textNode The text node to convert
 * @param generateId Function to generate unique IDs
 * @returns GroupNode with per-letter PathNode children, or null if font not available
 */
export function convertTextToPathGroup(
  textNode: TextNode,
  generateId: () => string
): TextToPathGroupResult | null {
  const fm = getFontManager();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const font = fm.getFontOrFallback(textNode.fontFamily);
  if (!font) return null;

  const result = textToSubpaths(textNode.content, font, textNode.fontSize, {
    textAlign: textNode.textAlign,
    lineHeight: textNode.lineHeight,
    letterSpacing: textNode.letterSpacing,
  });

  if (result.glyphs.length === 0) return null;

  // Compute overall bounds for the group position
  const overallBounds = computeSubpathsBounds(result.subpaths);
  const overallCX = overallBounds.x + overallBounds.width / 2;
  const overallCY = overallBounds.y + overallBounds.height / 2;

  // Group position in world space
  const groupWorldX = textNode.transform.position.x + overallCX * textNode.transform.scale.x;
  const groupWorldY = textNode.transform.position.y + overallCY * textNode.transform.scale.y;

  const groupId = generateId();
  const group: GroupNode = {
    id: groupId,
    name: textNode.name,
    type: 'group',
    parent: textNode.parent,
    children: [],
    transform: {
      position: { x: groupWorldX, y: groupWorldY },
      rotation: textNode.transform.rotation,
      scale: { ...textNode.transform.scale },
      anchor: { x: 0, y: 0 },
      skew: { ...textNode.transform.skew },
    },
    visible: textNode.visible,
    locked: textNode.locked,
    opacity: textNode.opacity,
    blendMode: textNode.blendMode,
    effects: textNode.effects ? [...textNode.effects] : undefined,
  };

  // Create one PathNode per glyph, positioned relative to the group center
  const children: PathNode[] = [];
  for (const glyphGroup of result.glyphs) {
    const glyphBounds = computeSubpathsBounds(glyphGroup.subpaths);
    const glyphCX = glyphBounds.x + glyphBounds.width / 2;
    const glyphCY = glyphBounds.y + glyphBounds.height / 2;

    // Center glyph subpaths at glyph's own center
    const centeredSps = centerSubpaths(glyphGroup.subpaths, glyphCX, glyphCY);

    const primaryPoints = centeredSps[0] ?? [];
    const additionalSubpaths = centeredSps.slice(1);

    // Glyph PathNode position is relative to the group
    // (glyph center minus overall center, since group is at overall center)
    const child: PathNode = {
      id: generateId(),
      name: glyphGroup.char,
      type: 'path',
      parent: groupId,
      children: [],
      transform: {
        position: { x: glyphCX - overallCX, y: glyphCY - overallCY },
        rotation: 0,
        scale: { x: 1, y: 1 },
        anchor: { x: 0.5, y: 0.5 },
        skew: { x: 0, y: 0 },
      },
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      points: primaryPoints,
      subpaths: additionalSubpaths.length > 0 ? additionalSubpaths : undefined,
      closed: true,
      fillRule: 'evenodd',
      fills: textNode.fills.map((f) => ({ ...f })),
      strokes: textNode.strokes.map((s) => ({ ...s })),
    };

    children.push(child);
  }

  return { group, children };
}
