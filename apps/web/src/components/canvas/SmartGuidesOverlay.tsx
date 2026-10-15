import type { Camera, SmartGuide } from '@quar/core';

interface SmartGuidesOverlayProps {
  guides: SmartGuide[];
  camera: Camera | null;
  viewportWidth: number;
  viewportHeight: number;
}

const GUIDE_COLOR = '#ff4d8d';

/** Renders temporary alignment and equal-spacing guides during object drags. */
export function SmartGuidesOverlay({
  guides,
  camera,
  viewportWidth,
  viewportHeight,
}: SmartGuidesOverlayProps) {
  if (!camera || guides.length === 0) return null;

  return (
    <svg
      data-testid="smart-guides-overlay"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: viewportWidth,
        height: viewportHeight,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 12,
      }}
    >
      {guides.map((guide) => {
        if (guide.kind === 'alignment') {
          const start =
            guide.axis === 'x'
              ? camera.worldToScreen({ x: guide.position, y: guide.start })
              : camera.worldToScreen({ x: guide.start, y: guide.position });
          const end =
            guide.axis === 'x'
              ? camera.worldToScreen({ x: guide.position, y: guide.end })
              : camera.worldToScreen({ x: guide.end, y: guide.position });

          return (
            <line
              key={guide.id}
              data-testid="smart-alignment-guide"
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke={GUIDE_COLOR}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          );
        }

        const start = camera.worldToScreen(guide.from);
        const end = camera.worldToScreen(guide.to);
        const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
        const middleX = (start.x + end.x) / 2;
        const middleY = (start.y + end.y) / 2;
        const cap = 3;

        return (
          <g key={guide.id} data-testid="smart-spacing-guide">
            <line
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke={GUIDE_COLOR}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {horizontal ? (
              <>
                <line
                  x1={start.x}
                  y1={start.y - cap}
                  x2={start.x}
                  y2={start.y + cap}
                  stroke={GUIDE_COLOR}
                />
                <line
                  x1={end.x}
                  y1={end.y - cap}
                  x2={end.x}
                  y2={end.y + cap}
                  stroke={GUIDE_COLOR}
                />
              </>
            ) : (
              <>
                <line
                  x1={start.x - cap}
                  y1={start.y}
                  x2={start.x + cap}
                  y2={start.y}
                  stroke={GUIDE_COLOR}
                />
                <line
                  x1={end.x - cap}
                  y1={end.y}
                  x2={end.x + cap}
                  y2={end.y}
                  stroke={GUIDE_COLOR}
                />
              </>
            )}
            <text
              x={middleX}
              y={middleY - 5}
              fill={GUIDE_COLOR}
              fontSize={11}
              fontFamily="sans-serif"
              fontWeight={600}
              textAnchor="middle"
              stroke="#111318"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {guide.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
