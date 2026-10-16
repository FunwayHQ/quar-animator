/**
 * SequenceBadgesOverlay — PowerPoint-style step numbers beside each object that
 * has Animation Sequence steps, shown while the sequence window is open.
 * Clicking a badge opens that object's first step in the window.
 */

import type { AnimationSequenceStep } from '@quar/animation';
import type { Camera } from '@quar/core';

export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SequenceBadgesOverlayProps {
  steps: AnimationSequenceStep[];
  camera: Camera | null;
  /** World-space bounds of a node, or null when it has none (empty group, missing). */
  getNodeBounds: (nodeId: string) => WorldRect | null;
  onBadgeClick: (stepId: string) => void;
}

const BADGE_HEIGHT = 16;
const CHAR_WIDTH = 6.5;
const GAP = 4;

export function SequenceBadgesOverlay({
  steps,
  camera,
  getNodeBounds,
  onBadgeClick,
}: SequenceBadgesOverlayProps) {
  if (!camera || steps.length === 0) return null;

  // Step numbers per object, in sequence order
  const byNode = new Map<string, { numbers: number[]; firstStepId: string }>();
  steps.forEach((step, index) => {
    const entry = byNode.get(step.nodeId);
    if (entry) entry.numbers.push(index + 1);
    else byNode.set(step.nodeId, { numbers: [index + 1], firstStepId: step.id });
  });

  const badges: Array<{ nodeId: string; x: number; y: number; label: string; stepId: string }> = [];
  for (const [nodeId, { numbers, firstStepId }] of byNode) {
    const rect = getNodeBounds(nodeId);
    if (!rect) continue;
    // World is Y-up and the screen Y-down, so take the min of both corners
    const a = camera.worldToScreen({ x: rect.x, y: rect.y });
    const b = camera.worldToScreen({ x: rect.x + rect.width, y: rect.y + rect.height });
    badges.push({
      nodeId,
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      label: numbers.join(', '),
      stepId: firstStepId,
    });
  }
  if (badges.length === 0) return null;

  return (
    <svg
      data-testid="sequence-badges"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 11,
      }}
    >
      {badges.map((badge) => {
        const width = Math.max(BADGE_HEIGHT, badge.label.length * CHAR_WIDTH + 8);
        // Sits just left of the object's top-left corner
        const left = badge.x - width - GAP;
        return (
          <g
            key={badge.nodeId}
            transform={`translate(${left}, ${badge.y})`}
            style={{ pointerEvents: 'auto', cursor: 'pointer' }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onBadgeClick(badge.stepId)}
            data-testid={`sequence-badge-${badge.nodeId}`}
          >
            <title>{`Animation Sequence step ${badge.label} — click to edit`}</title>
            <rect
              width={width}
              height={BADGE_HEIGHT}
              rx={BADGE_HEIGHT / 2}
              fill="var(--color-accent-primary)"
              stroke="var(--color-bg-primary)"
              strokeWidth={1}
            />
            <text
              x={width / 2}
              y={BADGE_HEIGHT / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--color-text-inverse)"
              fontFamily="var(--font-family-mono)"
              fontSize={10}
              fontWeight={600}
            >
              {badge.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
