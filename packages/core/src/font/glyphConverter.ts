/**
 * Glyph Converter for Quar Animator
 * Converts opentype.js glyph path commands to QUAR PathPoint arrays.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import type opentype from 'opentype.js';
import type { PathPoint, Vector2, Rect } from '@quar/types';

/**
 * Convert opentype.js path commands to QUAR PathPoint subpaths.
 * Each closed contour becomes a separate subpath.
 *
 * Font coordinates use Y-down; we flip Y to match QUAR's Y-up system.
 */
export function glyphPathToSubpaths(opPath: opentype.Path): PathPoint[][] {
  const subpaths: PathPoint[][] = [];
  let current: PathPoint[] = [];
  let currentPos: Vector2 = { x: 0, y: 0 };

  for (const cmd of opPath.commands) {
    switch (cmd.type) {
      case 'M': {
        // Start new subpath
        if (current.length > 0) {
          subpaths.push(current);
        }
        current = [];
        currentPos = { x: cmd.x, y: -cmd.y }; // Y-flip
        current.push({
          position: { ...currentPos },
          handleIn: null,
          handleOut: null,
          type: 'corner',
        });
        break;
      }
      case 'L': {
        const pos = { x: cmd.x, y: -cmd.y };
        currentPos = pos;
        current.push({
          position: { ...pos },
          handleIn: null,
          handleOut: null,
          type: 'corner',
        });
        break;
      }
      case 'C': {
        // Cubic bezier: set handleOut on previous, handleIn on new point
        const prevPoint = current[current.length - 1];
        const cp1 = { x: cmd.x1, y: -cmd.y1 };
        const cp2 = { x: cmd.x2, y: -cmd.y2 };
        const end = { x: cmd.x, y: -cmd.y };

        if (prevPoint) {
          // handleOut = cp1 - prevPoint.position (relative offset)
          prevPoint.handleOut = {
            x: cp1.x - prevPoint.position.x,
            y: cp1.y - prevPoint.position.y,
          };
          if (prevPoint.type === 'corner' && prevPoint.handleOut) {
            prevPoint.type = 'smooth';
          }
        }

        currentPos = end;
        current.push({
          position: { ...end },
          // handleIn = cp2 - end (relative offset)
          handleIn: {
            x: cp2.x - end.x,
            y: cp2.y - end.y,
          },
          handleOut: null,
          type: 'smooth',
        });
        break;
      }
      case 'Q': {
        // Quadratic bezier: convert to cubic
        // cp1 = prev + 2/3*(ctrl - prev), cp2 = end + 2/3*(ctrl - end)
        const prevPt = current[current.length - 1];
        const ctrl = { x: cmd.x1, y: -cmd.y1 };
        const endPt = { x: cmd.x, y: -cmd.y };

        if (prevPt) {
          const cubicCp1 = {
            x: prevPt.position.x + (2 / 3) * (ctrl.x - prevPt.position.x),
            y: prevPt.position.y + (2 / 3) * (ctrl.y - prevPt.position.y),
          };
          const cubicCp2 = {
            x: endPt.x + (2 / 3) * (ctrl.x - endPt.x),
            y: endPt.y + (2 / 3) * (ctrl.y - endPt.y),
          };

          prevPt.handleOut = {
            x: cubicCp1.x - prevPt.position.x,
            y: cubicCp1.y - prevPt.position.y,
          };
          if (prevPt.type === 'corner' && prevPt.handleOut) {
            prevPt.type = 'smooth';
          }

          currentPos = endPt;
          current.push({
            position: { ...endPt },
            handleIn: {
              x: cubicCp2.x - endPt.x,
              y: cubicCp2.y - endPt.y,
            },
            handleOut: null,
            type: 'smooth',
          });
        }
        break;
      }
      case 'Z': {
        // Close subpath — remove closing point if it duplicates the start
        if (current.length >= 2) {
          const first = current[0]!;
          const last = current[current.length - 1]!;
          const dx = Math.abs(last.position.x - first.position.x);
          const dy = Math.abs(last.position.y - first.position.y);
          if (dx < 0.01 && dy < 0.01) {
            // Transfer handleIn from duplicate closing point to first point
            if (last.handleIn) {
              first.handleIn = last.handleIn;
              if (first.type === 'corner') first.type = 'smooth';
            }
            current.pop();
          }
        }
        if (current.length > 0) {
          subpaths.push(current);
        }
        current = [];
        break;
      }
    }
  }

  // Push any remaining open subpath
  if (current.length > 0) {
    subpaths.push(current);
  }

  return subpaths;
}

export interface TextLayoutOptions {
  textAlign?: 'left' | 'center' | 'right';
  lineHeight?: number;
  letterSpacing?: number;
}

export interface TextToSubpathsResult {
  subpaths: PathPoint[][];
  bounds: Rect;
}

/**
 * Convert a text string to PathPoint subpaths using an opentype.js font.
 * Handles multi-line text with alignment and spacing.
 */
export function textToSubpaths(
  text: string,
  font: opentype.Font,
  fontSize: number,
  options: TextLayoutOptions = {}
): TextToSubpathsResult {
  const { textAlign = 'left', lineHeight: lineHeightMultiplier = 1.2, letterSpacing = 0 } = options;

  const lines = text.split('\n');
  const scale = fontSize / font.unitsPerEm;
  const lineHeightPx = fontSize * lineHeightMultiplier;
  const allSubpaths: PathPoint[][] = [];

  // Measure all line widths for alignment
  const lineWidths: number[] = [];
  for (const line of lines) {
    let width = 0;
    const glyphs = font.stringToGlyphs(line);
    for (let i = 0; i < glyphs.length; i++) {
      const glyph = glyphs[i]!;
      width += (glyph.advanceWidth ?? 0) * scale;
      if (i < glyphs.length - 1) {
        width += letterSpacing;
        // Add kerning if available
        const nextGlyph = glyphs[i + 1];
        if (nextGlyph) {
          width += font.getKerningValue(glyph, nextGlyph) * scale;
        }
      }
    }
    lineWidths.push(width);
  }

  const maxWidth = Math.max(...lineWidths, 1);

  // Layout each line
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]!;
    const lineWidth = lineWidths[lineIdx]!;

    // Y offset: font Y is down, but we've flipped in glyphPathToSubpaths.
    // Position each line top-down from 0.
    const yOffset = -lineIdx * lineHeightPx;

    // X offset for alignment
    let xOffset = 0;
    if (textAlign === 'center') {
      xOffset = (maxWidth - lineWidth) / 2;
    } else if (textAlign === 'right') {
      xOffset = maxWidth - lineWidth;
    }

    const glyphs = font.stringToGlyphs(line);
    let advanceX = xOffset;

    for (let i = 0; i < glyphs.length; i++) {
      const glyph = glyphs[i]!;
      const path = glyph.getPath(advanceX / scale, 0, font.unitsPerEm);
      const subpaths = glyphPathToSubpaths(path);

      // Scale subpath points
      for (const sp of subpaths) {
        for (const pt of sp) {
          pt.position.x *= scale;
          pt.position.y = pt.position.y * scale + yOffset;
          if (pt.handleIn) {
            pt.handleIn.x *= scale;
            pt.handleIn.y *= scale;
          }
          if (pt.handleOut) {
            pt.handleOut.x *= scale;
            pt.handleOut.y *= scale;
          }
        }
        allSubpaths.push(sp);
      }

      advanceX += (glyph.advanceWidth ?? 0) * scale;
      if (i < glyphs.length - 1) {
        advanceX += letterSpacing;
        const nextGlyph = glyphs[i + 1];
        if (nextGlyph) {
          advanceX += font.getKerningValue(glyph, nextGlyph) * scale;
        }
      }
    }
  }

  // Compute bounds
  const bounds = computeSubpathsBounds(allSubpaths);

  return { subpaths: allSubpaths, bounds };
}

/**
 * Compute the AABB of all subpaths.
 */
export function computeSubpathsBounds(subpaths: PathPoint[][]): Rect {
  if (subpaths.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const sp of subpaths) {
    for (const pt of sp) {
      const px = pt.position.x;
      const py = pt.position.y;
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;

      // Include handle endpoints for tighter bounds
      if (pt.handleIn) {
        const hx = px + pt.handleIn.x;
        const hy = py + pt.handleIn.y;
        if (hx < minX) minX = hx;
        if (hy < minY) minY = hy;
        if (hx > maxX) maxX = hx;
        if (hy > maxY) maxY = hy;
      }
      if (pt.handleOut) {
        const hx = px + pt.handleOut.x;
        const hy = py + pt.handleOut.y;
        if (hx < minX) minX = hx;
        if (hy < minY) minY = hy;
        if (hx > maxX) maxX = hx;
        if (hy > maxY) maxY = hy;
      }
    }
  }

  if (!isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };

  return {
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
}
