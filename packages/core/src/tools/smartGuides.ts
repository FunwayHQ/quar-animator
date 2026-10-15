import type { Rect, Vector2 } from '@quar/types';

export interface SmartGuideTarget {
  id: string;
  bounds: Rect;
}

export type SmartGuide =
  | {
      id: string;
      kind: 'alignment';
      /** x draws a vertical line; y draws a horizontal line. */
      axis: 'x' | 'y';
      position: number;
      start: number;
      end: number;
    }
  | {
      id: string;
      kind: 'spacing';
      from: Vector2;
      to: Vector2;
      label: string;
    };

export interface SmartGuideSnap {
  offset: Vector2;
  guides: SmartGuide[];
}

interface AlignmentCandidate {
  offset: number;
  guide: SmartGuide;
}

const rectRight = (bounds: Rect) => bounds.x + bounds.width;
const rectTop = (bounds: Rect) => bounds.y + bounds.height;
const rectCenterX = (bounds: Rect) => bounds.x + bounds.width / 2;
const rectCenterY = (bounds: Rect) => bounds.y + bounds.height / 2;

/**
 * Find the closest edge/center alignment or equal-spacing correction for a
 * moving selection. Distances and offsets are in world units.
 */
export function calculateSmartGuideSnap(
  moving: Rect,
  targets: SmartGuideTarget[],
  threshold: number
): SmartGuideSnap {
  const xCandidates: AlignmentCandidate[] = [];
  const yCandidates: AlignmentCandidate[] = [];

  const movingX = [
    { name: 'left', value: moving.x },
    { name: 'center', value: rectCenterX(moving) },
    { name: 'right', value: rectRight(moving) },
  ];
  const movingY = [
    { name: 'bottom', value: moving.y },
    { name: 'center', value: rectCenterY(moving) },
    { name: 'top', value: rectTop(moving) },
  ];

  for (const target of targets) {
    const targetX = [
      { name: 'left', value: target.bounds.x },
      { name: 'center', value: rectCenterX(target.bounds) },
      { name: 'right', value: rectRight(target.bounds) },
    ];
    const targetY = [
      { name: 'bottom', value: target.bounds.y },
      { name: 'center', value: rectCenterY(target.bounds) },
      { name: 'top', value: rectTop(target.bounds) },
    ];

    for (const source of movingX) {
      for (const destination of targetX) {
        const offset = destination.value - source.value;
        if (Math.abs(offset) > threshold) continue;
        xCandidates.push({
          offset,
          guide: {
            id: `align-x-${target.id}-${source.name}-${destination.name}`,
            kind: 'alignment',
            axis: 'x',
            position: destination.value,
            start: Math.min(moving.y, target.bounds.y),
            end: Math.max(rectTop(moving), rectTop(target.bounds)),
          },
        });
      }
    }

    for (const source of movingY) {
      for (const destination of targetY) {
        const offset = destination.value - source.value;
        if (Math.abs(offset) > threshold) continue;
        yCandidates.push({
          offset,
          guide: {
            id: `align-y-${target.id}-${source.name}-${destination.name}`,
            kind: 'alignment',
            axis: 'y',
            position: destination.value,
            start: Math.min(moving.x, target.bounds.x),
            end: Math.max(rectRight(moving), rectRight(target.bounds)),
          },
        });
      }
    }
  }

  const bestX = closestAlignment(xCandidates);
  const bestY = closestAlignment(yCandidates);
  const guides = [...(bestX?.guides ?? []), ...(bestY?.guides ?? [])];
  const offset = { x: bestX?.offset ?? 0, y: bestY?.offset ?? 0 };

  if (!bestX) {
    const spacingX = findHorizontalSpacing(moving, targets, threshold);
    if (spacingX) {
      offset.x = spacingX.offset;
      guides.push(...spacingX.guides);
    }
  }

  if (!bestY) {
    const spacingY = findVerticalSpacing(moving, targets, threshold);
    if (spacingY) {
      offset.y = spacingY.offset;
      guides.push(...spacingY.guides);
    }
  }

  return { offset, guides };
}

function closestAlignment(candidates: AlignmentCandidate[]): {
  offset: number;
  guides: SmartGuide[];
} | null {
  if (candidates.length === 0) return null;
  let closest = candidates[0]!;
  for (const candidate of candidates.slice(1)) {
    if (Math.abs(candidate.offset) < Math.abs(closest.offset)) closest = candidate;
  }

  // Keep all lines that share the chosen correction so centered/multi-edge
  // matches are visible together without adding unrelated guides.
  const tolerance = 0.25;
  const matches = candidates
    .filter((candidate) => Math.abs(candidate.offset - closest.offset) <= tolerance)
    .map((candidate) => candidate.guide);
  const uniqueGuides = new Map<string, SmartGuide>();
  for (const guide of matches) {
    if (guide.kind !== 'alignment') continue;
    uniqueGuides.set(`${guide.axis}:${guide.position}:${guide.start}:${guide.end}`, guide);
  }
  return { offset: closest.offset, guides: [...uniqueGuides.values()] };
}

function findHorizontalSpacing(
  moving: Rect,
  targets: SmartGuideTarget[],
  threshold: number
): { offset: number; guides: SmartGuide[] } | null {
  const centerY = rectCenterY(moving);
  let left: SmartGuideTarget | null = null;
  let right: SmartGuideTarget | null = null;

  for (const target of targets) {
    const verticallyOverlaps = centerY >= target.bounds.y && centerY <= rectTop(target.bounds);
    if (!verticallyOverlaps) continue;

    if (rectRight(target.bounds) <= moving.x) {
      if (!left || rectRight(target.bounds) > rectRight(left.bounds)) left = target;
    } else if (target.bounds.x >= rectRight(moving)) {
      if (!right || target.bounds.x < right.bounds.x) right = target;
    }
  }

  if (!left || !right) return null;
  const leftGap = moving.x - rectRight(left.bounds);
  const rightGap = right.bounds.x - rectRight(moving);
  const offset = (rightGap - leftGap) / 2;
  if (Math.abs(offset) > threshold || leftGap + offset < 0 || rightGap - offset < 0) return null;

  const alignedLeft = moving.x + offset;
  const alignedRight = rectRight(moving) + offset;
  const y = centerY;
  const label = `${Math.round((leftGap + rightGap) / 2)} px`;

  return {
    offset,
    guides: [
      {
        id: `spacing-x-${left.id}-${right.id}-left`,
        kind: 'spacing',
        from: { x: rectRight(left.bounds), y },
        to: { x: alignedLeft, y },
        label,
      },
      {
        id: `spacing-x-${left.id}-${right.id}-right`,
        kind: 'spacing',
        from: { x: alignedRight, y },
        to: { x: right.bounds.x, y },
        label,
      },
    ],
  };
}

function findVerticalSpacing(
  moving: Rect,
  targets: SmartGuideTarget[],
  threshold: number
): { offset: number; guides: SmartGuide[] } | null {
  const centerX = rectCenterX(moving);
  let below: SmartGuideTarget | null = null;
  let above: SmartGuideTarget | null = null;

  for (const target of targets) {
    const horizontallyOverlaps = centerX >= target.bounds.x && centerX <= rectRight(target.bounds);
    if (!horizontallyOverlaps) continue;

    if (rectTop(target.bounds) <= moving.y) {
      if (!below || rectTop(target.bounds) > rectTop(below.bounds)) below = target;
    } else if (target.bounds.y >= rectTop(moving)) {
      if (!above || target.bounds.y < above.bounds.y) above = target;
    }
  }

  if (!below || !above) return null;
  const lowerGap = moving.y - rectTop(below.bounds);
  const upperGap = above.bounds.y - rectTop(moving);
  const offset = (upperGap - lowerGap) / 2;
  if (Math.abs(offset) > threshold || lowerGap + offset < 0 || upperGap - offset < 0) return null;

  const alignedBottom = moving.y + offset;
  const alignedTop = rectTop(moving) + offset;
  const x = centerX;
  const label = `${Math.round((lowerGap + upperGap) / 2)} px`;

  return {
    offset,
    guides: [
      {
        id: `spacing-y-${below.id}-${above.id}-bottom`,
        kind: 'spacing',
        from: { x, y: rectTop(below.bounds) },
        to: { x, y: alignedBottom },
        label,
      },
      {
        id: `spacing-y-${below.id}-${above.id}-top`,
        kind: 'spacing',
        from: { x, y: alignedTop },
        to: { x, y: above.bounds.y },
        label,
      },
    ],
  };
}
