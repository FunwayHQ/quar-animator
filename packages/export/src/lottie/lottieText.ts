/**
 * Text → Lottie, as glyph outlines in a shape layer.
 *
 * Outlines play the same in every Lottie player with no font installed or
 * embedded. Text reveals (Typewriter, By Word, By Line) switch each glyph on at
 * the frame the editor's visible-character count passes it.
 */

import type { PathPoint, TextNode, Timeline } from '@quar/types';
import { findTrack } from '@quar/animation';
import { getFontManager, getTextBox, getTextNodeBounds, textToSubpaths } from '@quar/core';
import type { LottieShapeGroup, LottieShapeItem } from './lottieTypes';
import { steppedTrackToLottie } from './lottieKeyframes';

export interface TextOutlineGlyph {
  /** Index of the glyph's character in the text (code points, newlines included). */
  charIndex: number;
  /** Contours in the text node's local space (Y-up), already offset for its anchor. */
  subpaths: PathPoint[][];
}

/** Glyph outlines of a text node's full content, or null when they're unavailable. */
export type TextOutlineProvider = (node: TextNode) => TextOutlineGlyph[] | null;

/**
 * Outlines laid out exactly like the editor draws them, using the fonts it has
 * loaded. Null when the font isn't available (e.g. outside the editor).
 */
export const editorTextOutlines: TextOutlineProvider = (node) => {
  if (!node.content) return null;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- opentype.js font
  const font = getFontManager().getFontOrFallback(node.fontFamily, node.fontWeight);
  if (!font) return null;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- opentype.js font
  const { glyphs } = textToSubpaths(node.content, font, node.fontSize, {
    textAlign: node.textAlign,
    lineHeight: node.lineHeight,
    letterSpacing: node.letterSpacing,
    width: getTextBox(node)?.width,
  });

  // Same anchor offset as the renderer
  let dx = 0;
  let dy = 0;
  const { x: ax, y: ay } = node.transform.anchor;
  if (ax !== 0 || ay !== 0) {
    const bounds = getTextNodeBounds(node);
    dx = -(bounds.x + bounds.width * ax);
    dy = -(bounds.y + bounds.height * ay);
  }

  return glyphs.map((glyph) => ({
    charIndex: glyph.charIndex,
    subpaths: glyph.subpaths.map((subpath) =>
      subpath.map((point) => ({
        ...point,
        position: { x: point.position.x + dx, y: point.position.y + dy },
      }))
    ),
  }));
};

export interface TextShapeDeps {
  outlines?: TextOutlineProvider;
  /** Build the shape items (paths, stroke, fill) for some contours. */
  contourShapes: (subpaths: PathPoint[][]) => LottieShapeItem[];
  identityTransform: () => LottieShapeItem;
}

/** Visible-character count from the editor's value (undefined = all). */
function visibleCount(value: number | undefined, length: number): number {
  if (value === undefined) return length;
  return Math.max(0, Math.min(length, Math.floor(value)));
}

/**
 * Shape items for a text node: one group of glyph contours, or one group per
 * glyph when a reveal animates which characters are visible. Null without
 * outlines.
 */
export function textToLottieShapes(
  node: TextNode,
  timeline: Timeline,
  deps: TextShapeDeps
): LottieShapeItem[] | null {
  const glyphs = deps.outlines?.(node);
  if (!glyphs || glyphs.length === 0) return null;
  const length = Array.from(node.content).length;
  const revealTrack = findTrack<number>(timeline, node.id, 'visibleCharacters');
  const animatedReveal = revealTrack !== undefined && revealTrack.keyframes.length > 0;

  if (!animatedReveal) {
    const count = visibleCount(node.visibleCharacters, length);
    const visible = glyphs.filter((glyph) => glyph.charIndex < count);
    if (visible.length === 0) return null;
    const group: LottieShapeGroup = {
      ty: 'gr',
      nm: 'Text',
      it: [
        ...deps.contourShapes(visible.flatMap((glyph) => glyph.subpaths)),
        deps.identityTransform(),
      ],
    };
    return [group];
  }

  const items: LottieShapeItem[] = [];
  for (const glyph of glyphs) {
    const opacity = steppedTrackToLottie(revealTrack, (value) =>
      glyph.charIndex < visibleCount(value, length) ? 100 : 0
    );
    if (opacity.a === 0 && opacity.k === 0) continue; // never revealed
    const transform = deps.identityTransform();
    items.push({
      ty: 'gr',
      nm: `Glyph ${glyph.charIndex + 1}`,
      it: [...deps.contourShapes(glyph.subpaths), { ...transform, o: opacity } as LottieShapeItem],
    });
  }
  return items.length > 0 ? items : null;
}
