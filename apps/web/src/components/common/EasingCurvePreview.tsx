/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
/**
 * EasingCurvePreview — Pure SVG mini thumbnail showing easing curve shape.
 *
 * Used in preset grids, context menus, and PropertiesPanel easing section.
 */

import { useMemo } from 'react';
import type { EasingFunction } from '@quar/types';
import { easingToSvgPath } from '@quar/animation';
import styles from './EasingCurvePreview.module.css';

export interface EasingCurvePreviewProps {
  easing: EasingFunction;
  width?: number;
  height?: number;
  active?: boolean;
  className?: string;
}

// Padding ratio for curves that overshoot (Back, Elastic, Bounce)
const PAD = 0.15;

export function EasingCurvePreview({
  easing,
  width = 32,
  height = 20,
  active = false,
  className,
}: EasingCurvePreviewProps) {
  // Inner drawing area is padded to accommodate overshoot
  const padY = height * PAD;
  const innerH = height - padY * 2;
  const innerW = width - 4; // 2px padding each side

  const pathD: string = useMemo(
    () => easingToSvgPath(easing, innerW, innerH, 48) as string,
    [easing, innerW, innerH]
  );

  const cls = [styles.preview, active ? styles.active : '', className].filter(Boolean).join(' ');

  return (
    <svg
      className={cls}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      data-testid="easing-curve-preview"
    >
      {/* Dashed diagonal baseline (linear reference) */}
      <line
        className={styles.baseline}
        x1={2}
        y1={height - padY}
        x2={width - 2}
        y2={padY}
        strokeWidth={0.5}
      />
      {/* Easing curve */}
      <g transform={`translate(2, ${padY})`}>
        <path className={styles.curve} d={pathD} strokeWidth={1.5} />
      </g>
    </svg>
  );
}

export default EasingCurvePreview;
