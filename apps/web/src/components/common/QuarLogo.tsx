/**
 * QuarLogo
 *
 * The QUAR suite's wordmark: block letters, the U cut out of a violet tile,
 * framed by four corner marks in the theme's ink (light on dark, dark on
 * light). Drawn inline, so a browser never shows an old one and the marks can
 * follow the theme. The shapes are the design file's own, in its Y-up space.
 */
import { useId } from 'react';

interface QuarLogoProps {
  className?: string;
}

const LETTERS = '#9a4fd8';
/** The corner marks are half see-through, so the letters lead. */
const FRAME_OPACITY = 0.5;

/** Each bar: its centre, size and turn (degrees, counter-clockwise). */
const BARS: ReadonlyArray<{
  x: number;
  y: number;
  w: number;
  h: number;
  turn?: number;
  fill?: string;
}> = [
  // Q
  { x: -318, y: 0, w: 32, h: 150 },
  { x: -246, y: 0, w: 32, h: 150 },
  { x: -282, y: 59, w: 104, h: 32 },
  { x: -282, y: -59, w: 104, h: 32 },
  { x: -240, y: -73, w: 74, h: 32, turn: -45 },
  // U, cut out of the tile
  { x: -108, y: 0, w: 32, h: 150, fill: '#ffffff' },
  { x: -36, y: 0, w: 32, h: 150, fill: '#ffffff' },
  { x: -72, y: -59, w: 104, h: 32, fill: '#ffffff' },
  // A
  { x: 88, y: 0, w: 32, h: 150 },
  { x: 160, y: 0, w: 32, h: 150 },
  { x: 124, y: 59, w: 104, h: 32 },
  { x: 124, y: -4, w: 104, h: 32 },
  // R
  { x: 230, y: 0, w: 32, h: 150 },
  { x: 266, y: 59, w: 104, h: 32 },
  { x: 302, y: 35.5, w: 32, h: 79 },
  { x: 266, y: -4, w: 104, h: 32 },
  { x: 284, y: -39, w: 32, h: 96, turn: 28 },
];

/** The corner marks, each an L. */
const CORNERS = [
  'M-366,150L-430,150L-430,86',
  'M366,150L430,150L430,86',
  'M-366,-150L-430,-150L-430,-86',
  'M366,-150L430,-150L430,-86',
];

export function QuarLogo({ className }: QuarLogoProps) {
  // An id of its own: the menu bar and a page can both show the logo
  const tile = `quar-logo-tile-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      className={className}
      viewBox="-440 -160 880 320"
      role="img"
      aria-label="Quar Animator"
      data-testid="quar-logo"
    >
      <defs>
        <linearGradient id={tile} x1="85.355%" y1="14.645%" x2="14.645%" y2="85.355%">
          <stop offset="0" stopColor="#a855e0" />
          <stop offset="1" stopColor="#7b3fe4" />
        </linearGradient>
      </defs>
      <g transform="scale(1,-1)">
        <rect x={-174} y={-102} width={204} height={204} rx={10} fill={`url(#${tile})`} />
        {BARS.map((bar, i) => (
          <rect
            key={i}
            x={-bar.w / 2}
            y={-bar.h / 2}
            width={bar.w}
            height={bar.h}
            fill={bar.fill ?? LETTERS}
            transform={`translate(${bar.x},${bar.y})${bar.turn ? ` rotate(${bar.turn})` : ''}`}
          />
        ))}
        <g
          fill="none"
          strokeWidth={18}
          strokeLinecap="square"
          strokeOpacity={FRAME_OPACITY}
          style={{ stroke: 'var(--color-logo-frame, #eef0ff)' }}
        >
          {CORNERS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </g>
    </svg>
  );
}
