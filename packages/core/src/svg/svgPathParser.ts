/**
 * SVG Path `d` Attribute Parser
 * Converts SVG path data to Quar PathPoint[] arrays.
 */

import type { PathPoint, Vector2 } from '@quar/types';

// ============================================================================
// Types
// ============================================================================

export interface ParsedSubpath {
  points: PathPoint[];
  closed: boolean;
}

interface PathToken {
  command: string;
  args: number[];
}

// ============================================================================
// Tokenizer
// ============================================================================

/**
 * Tokenize an SVG path `d` attribute string into command + args pairs.
 */
function tokenizePath(d: string): PathToken[] {
  const tokens: PathToken[] = [];
  if (!d) return tokens;

  // Split into command segments: letter followed by numbers/separators until next letter
  // Regex matches: optional command letter, then sequence of numbers
  const commandRegex = /([MmZzLlHhVvCcSsQqTtAa])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let match: RegExpExecArray | null;
  let currentCommand = '';
  let currentArgs: number[] = [];

  const flush = () => {
    if (currentCommand) {
      // Only push tokens that have args (or Z which has 0 args)
      if (currentArgs.length > 0 || currentCommand === 'Z' || currentCommand === 'z') {
        tokens.push({ command: currentCommand, args: currentArgs });
      }
      currentArgs = [];
    }
  };

  const argCounts: Record<string, number> = {
    M: 2,
    m: 2,
    L: 2,
    l: 2,
    H: 1,
    h: 1,
    V: 1,
    v: 1,
    C: 6,
    c: 6,
    S: 4,
    s: 4,
    Q: 4,
    q: 4,
    T: 2,
    t: 2,
    A: 7,
    a: 7,
    Z: 0,
    z: 0,
  };

  while ((match = commandRegex.exec(d)) !== null) {
    if (match[1]) {
      // It's a command letter
      flush();
      currentCommand = match[1];

      if (currentCommand === 'Z' || currentCommand === 'z') {
        flush();
        currentCommand = '';
      }
    } else if (match[2] !== undefined) {
      // It's a number
      currentArgs.push(parseFloat(match[2]));

      // Check if we have enough args for the current command
      const expected = argCounts[currentCommand] || 0;
      if (expected > 0 && currentArgs.length >= expected) {
        flush();
        // Implicit repeat: after M→L, after m→l, others repeat themselves
        if (currentCommand === 'M') currentCommand = 'L';
        else if (currentCommand === 'm') currentCommand = 'l';
        // Other commands repeat as themselves
      }
    }
  }

  flush();
  return tokens;
}

// ============================================================================
// Arc to Cubic Bezier Conversion
// ============================================================================

/**
 * Convert an SVG arc to a series of cubic bezier path points.
 * Uses center parameterization and splits into ≤90° segments.
 */
function arcToCubicBeziers(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  xAxisRotation: number,
  largeArcFlag: number,
  sweepFlag: number,
  x2: number,
  y2: number
): { handleOut: Vector2; point: Vector2; handleIn: Vector2 }[] {
  // Handle degenerate cases
  if (rx === 0 || ry === 0) {
    return [{ handleOut: { x: 0, y: 0 }, point: { x: x2, y: y2 }, handleIn: { x: 0, y: 0 } }];
  }

  rx = Math.abs(rx);
  ry = Math.abs(ry);

  const phi = (xAxisRotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  // Step 1: Compute (x1', y1') — transformed midpoint
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  // Step 2: Correct out-of-range radii
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;
  let rxSq = rx * rx;
  let rySq = ry * ry;
  const lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda);
    rx *= sqrtLambda;
    ry *= sqrtLambda;
    rxSq = rx * rx;
    rySq = ry * ry;
  }

  // Step 3: Compute center point (cx', cy')
  const num = Math.max(0, rxSq * rySq - rxSq * y1pSq - rySq * x1pSq);
  const den = rxSq * y1pSq + rySq * x1pSq;
  const sq = den === 0 ? 0 : Math.sqrt(num / den);
  const sign = largeArcFlag === sweepFlag ? -1 : 1;
  const cxp = sign * sq * ((rx * y1p) / ry);
  const cyp = sign * sq * ((-ry * x1p) / rx);

  // Step 4: Compute center point in original coords
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  // Step 5: Compute angles
  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    let a = len === 0 ? 0 : Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };

  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);

  if (sweepFlag === 0 && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweepFlag === 1 && dTheta < 0) dTheta += 2 * Math.PI;

  // Step 6: Split into ≤90° segments and approximate with cubic bezier
  const segments = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const segAngle = dTheta / segments;
  const results: { handleOut: Vector2; point: Vector2; handleIn: Vector2 }[] = [];

  const alpha = (4 / 3) * Math.tan(segAngle / 4);

  for (let i = 0; i < segments; i++) {
    const startAngle = theta1 + i * segAngle;
    const endAngle = theta1 + (i + 1) * segAngle;

    const cosStart = Math.cos(startAngle);
    const sinStart = Math.sin(startAngle);
    const cosEnd = Math.cos(endAngle);
    const sinEnd = Math.sin(endAngle);

    // Control point 1 (relative to start of segment)
    const cp1x = rx * (cosStart - alpha * sinStart);
    const cp1y = ry * (sinStart + alpha * cosStart);

    // Control point 2 (relative to end of segment)
    const cp2x = rx * (cosEnd + alpha * sinEnd);
    const cp2y = ry * (sinEnd - alpha * cosEnd);

    // End point of segment
    const ex = rx * cosEnd;
    const ey = ry * sinEnd;

    // Transform back to original coordinate system
    const transformX = (px: number, py: number) => cosPhi * px - sinPhi * py + cx;
    const transformY = (px: number, py: number) => sinPhi * px + cosPhi * py + cy;

    // Start point of this segment
    const sx = rx * cosStart;
    const sy = ry * sinStart;
    const startX = transformX(sx, sy);
    const startY = transformY(sx, sy);

    const endX = transformX(ex, ey);
    const endY = transformY(ex, ey);

    const cp1AbsX = transformX(cp1x, cp1y);
    const cp1AbsY = transformY(cp1x, cp1y);
    const cp2AbsX = transformX(cp2x, cp2y);
    const cp2AbsY = transformY(cp2x, cp2y);

    results.push({
      // handleOut for the previous point (relative to start of this segment)
      handleOut: { x: cp1AbsX - startX, y: cp1AbsY - startY },
      point: { x: endX, y: endY },
      handleIn: { x: cp2AbsX - endX, y: cp2AbsY - endY },
    });
  }

  return results;
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse an SVG path `d` attribute string into an array of subpaths.
 * Each subpath contains PathPoint[] and a closed flag.
 * Multiple M commands create separate subpaths.
 */
export function parseSvgPath(d: string): ParsedSubpath[] {
  const tokens = tokenizePath(d);
  const subpaths: ParsedSubpath[] = [];

  let currentPoints: PathPoint[] = [];
  let currentX = 0;
  let currentY = 0;
  let subpathStartX = 0;
  let subpathStartY = 0;
  let lastControlX = 0;
  let lastControlY = 0;
  let lastCommand = '';

  const startNewSubpath = () => {
    if (currentPoints.length > 0) {
      subpaths.push({ points: currentPoints, closed: false });
    }
    currentPoints = [];
  };

  const addCornerPoint = (x: number, y: number) => {
    // Set handleOut on previous point if needed
    currentPoints.push({
      position: { x, y },
      handleIn: null,
      handleOut: null,
      type: 'corner',
    });
  };

  for (const token of tokens) {
    const { command, args } = token;
    const isRelative = command === command.toLowerCase() && command !== 'Z' && command !== 'z';
    const cmd = command.toUpperCase();

    switch (cmd) {
      case 'M': {
        const x = isRelative ? currentX + args[0]! : args[0]!;
        const y = isRelative ? currentY + args[1]! : args[1]!;
        startNewSubpath();
        addCornerPoint(x, y);
        currentX = x;
        currentY = y;
        subpathStartX = x;
        subpathStartY = y;
        break;
      }

      case 'L': {
        const x = isRelative ? currentX + args[0]! : args[0]!;
        const y = isRelative ? currentY + args[1]! : args[1]!;
        addCornerPoint(x, y);
        currentX = x;
        currentY = y;
        break;
      }

      case 'H': {
        const x = isRelative ? currentX + args[0]! : args[0]!;
        addCornerPoint(x, currentY);
        currentX = x;
        break;
      }

      case 'V': {
        const y = isRelative ? currentY + args[0]! : args[0]!;
        addCornerPoint(currentX, y);
        currentY = y;
        break;
      }

      case 'C': {
        const x1 = isRelative ? currentX + args[0]! : args[0]!;
        const y1 = isRelative ? currentY + args[1]! : args[1]!;
        const x2 = isRelative ? currentX + args[2]! : args[2]!;
        const y2 = isRelative ? currentY + args[3]! : args[3]!;
        const x = isRelative ? currentX + args[4]! : args[4]!;
        const y = isRelative ? currentY + args[5]! : args[5]!;

        // Set handleOut on previous point
        if (currentPoints.length > 0) {
          const prev = currentPoints[currentPoints.length - 1]!;
          prev.handleOut = { x: x1 - currentX, y: y1 - currentY };
          if (prev.type === 'corner' && (prev.handleOut.x !== 0 || prev.handleOut.y !== 0)) {
            prev.type = 'smooth';
          }
        }

        currentPoints.push({
          position: { x, y },
          handleIn: { x: x2 - x, y: y2 - y },
          handleOut: null,
          type: 'smooth',
        });

        lastControlX = x2;
        lastControlY = y2;
        currentX = x;
        currentY = y;
        break;
      }

      case 'S': {
        // Smooth cubic: reflect previous control point
        let x1: number, y1: number;
        if (
          lastCommand === 'C' ||
          lastCommand === 'S' ||
          lastCommand === 'c' ||
          lastCommand === 's'
        ) {
          x1 = 2 * currentX - lastControlX;
          y1 = 2 * currentY - lastControlY;
        } else {
          x1 = currentX;
          y1 = currentY;
        }

        const x2 = isRelative ? currentX + args[0]! : args[0]!;
        const y2 = isRelative ? currentY + args[1]! : args[1]!;
        const x = isRelative ? currentX + args[2]! : args[2]!;
        const y = isRelative ? currentY + args[3]! : args[3]!;

        if (currentPoints.length > 0) {
          const prev = currentPoints[currentPoints.length - 1]!;
          prev.handleOut = { x: x1 - currentX, y: y1 - currentY };
          if (prev.type === 'corner') prev.type = 'smooth';
        }

        currentPoints.push({
          position: { x, y },
          handleIn: { x: x2 - x, y: y2 - y },
          handleOut: null,
          type: 'smooth',
        });

        lastControlX = x2;
        lastControlY = y2;
        currentX = x;
        currentY = y;
        break;
      }

      case 'Q': {
        // Quadratic bezier → convert to cubic
        const qx = isRelative ? currentX + args[0]! : args[0]!;
        const qy = isRelative ? currentY + args[1]! : args[1]!;
        const x = isRelative ? currentX + args[2]! : args[2]!;
        const y = isRelative ? currentY + args[3]! : args[3]!;

        // Convert Q to C: cp1 = start + 2/3*(ctrl - start), cp2 = end + 2/3*(ctrl - end)
        const cp1x = currentX + (2 / 3) * (qx - currentX);
        const cp1y = currentY + (2 / 3) * (qy - currentY);
        const cp2x = x + (2 / 3) * (qx - x);
        const cp2y = y + (2 / 3) * (qy - y);

        if (currentPoints.length > 0) {
          const prev = currentPoints[currentPoints.length - 1]!;
          prev.handleOut = { x: cp1x - currentX, y: cp1y - currentY };
          if (prev.type === 'corner') prev.type = 'smooth';
        }

        currentPoints.push({
          position: { x, y },
          handleIn: { x: cp2x - x, y: cp2y - y },
          handleOut: null,
          type: 'smooth',
        });

        lastControlX = qx;
        lastControlY = qy;
        currentX = x;
        currentY = y;
        break;
      }

      case 'T': {
        // Smooth quadratic: reflect previous quadratic control
        let qx: number, qy: number;
        if (
          lastCommand === 'Q' ||
          lastCommand === 'T' ||
          lastCommand === 'q' ||
          lastCommand === 't'
        ) {
          qx = 2 * currentX - lastControlX;
          qy = 2 * currentY - lastControlY;
        } else {
          qx = currentX;
          qy = currentY;
        }

        const x = isRelative ? currentX + args[0]! : args[0]!;
        const y = isRelative ? currentY + args[1]! : args[1]!;

        const cp1x = currentX + (2 / 3) * (qx - currentX);
        const cp1y = currentY + (2 / 3) * (qy - currentY);
        const cp2x = x + (2 / 3) * (qx - x);
        const cp2y = y + (2 / 3) * (qy - y);

        if (currentPoints.length > 0) {
          const prev = currentPoints[currentPoints.length - 1]!;
          prev.handleOut = { x: cp1x - currentX, y: cp1y - currentY };
          if (prev.type === 'corner') prev.type = 'smooth';
        }

        currentPoints.push({
          position: { x, y },
          handleIn: { x: cp2x - x, y: cp2y - y },
          handleOut: null,
          type: 'smooth',
        });

        lastControlX = qx;
        lastControlY = qy;
        currentX = x;
        currentY = y;
        break;
      }

      case 'A': {
        const rx = args[0]!;
        const ry = args[1]!;
        const xRotation = args[2]!;
        const largeArc = args[3]!;
        const sweep = args[4]!;
        const x = isRelative ? currentX + args[5]! : args[5]!;
        const y = isRelative ? currentY + args[6]! : args[6]!;

        if (currentX === x && currentY === y) break;

        const beziers = arcToCubicBeziers(
          currentX,
          currentY,
          rx,
          ry,
          xRotation,
          largeArc,
          sweep,
          x,
          y
        );

        for (const seg of beziers) {
          if (currentPoints.length > 0) {
            const prev = currentPoints[currentPoints.length - 1]!;
            prev.handleOut = seg.handleOut;
            if (prev.type === 'corner') prev.type = 'smooth';
          }

          currentPoints.push({
            position: seg.point,
            handleIn: seg.handleIn,
            handleOut: null,
            type: 'smooth',
          });
        }

        currentX = x;
        currentY = y;
        break;
      }

      case 'Z': {
        if (currentPoints.length > 0) {
          // If last point is at subpath start, merge into closed path
          const last = currentPoints[currentPoints.length - 1]!;
          const first = currentPoints[0]!;
          const dist = Math.hypot(
            last.position.x - first.position.x,
            last.position.y - first.position.y
          );
          if (dist < 0.01 && currentPoints.length > 1) {
            // Merge last point's handleIn into first point
            if (last.handleIn) {
              first.handleIn = last.handleIn;
              if (first.type === 'corner') first.type = 'smooth';
            }
            currentPoints.pop();
          }
          subpaths.push({ points: currentPoints, closed: true });
          currentPoints = [];
        }
        currentX = subpathStartX;
        currentY = subpathStartY;
        break;
      }
    }

    lastCommand = command;
  }

  // Flush remaining open subpath
  if (currentPoints.length > 0) {
    subpaths.push({ points: currentPoints, closed: false });
  }

  return subpaths;
}
