/**
 * EraserCursorOverlay — the Eraser's reach as a ring round the pointer, so
 * its size (the panel's, or [ and ]) shows before it touches anything. The
 * Eraser is the same size on screen at any zoom, so the ring is too. A dark
 * halo under a light line keeps it seen on light and dark artwork alike.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';

interface EraserCursorOverlayProps {
  canvasWidth: number;
  canvasHeight: number;
}

export const EraserCursorOverlay: React.FC<EraserCursorOverlayProps> = ({
  canvasWidth,
  canvasHeight,
}) => {
  const radius = useEditorStore((s) => s.eraserSize);
  const svgRef = useRef<SVGSVGElement>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // Off the canvas, no ring
      const over = x >= 0 && y >= 0 && x <= canvasWidth && y <= canvasHeight;
      setPointer(over ? { x, y } : null);
    };
    window.addEventListener('pointermove', handleMove);
    return () => window.removeEventListener('pointermove', handleMove);
  }, [canvasWidth, canvasHeight]);

  return (
    <svg
      ref={svgRef}
      data-testid="eraser-cursor"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: canvasWidth,
        height: canvasHeight,
        pointerEvents: 'none',
        zIndex: 999,
      }}
    >
      {pointer && (
        <g data-testid="eraser-ring">
          <circle
            cx={pointer.x}
            cy={pointer.y}
            r={radius}
            fill="none"
            stroke="rgba(0, 0, 0, 0.5)"
            strokeWidth={3}
          />
          <circle
            cx={pointer.x}
            cy={pointer.y}
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.95)"
            strokeWidth={1}
          />
        </g>
      )}
    </svg>
  );
};
