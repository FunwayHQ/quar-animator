/**
 * WeightPaintOverlay — shows brush circle and mode indicator during weight painting.
 */

import React, { useEffect, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import type { Camera } from '@quar/core';

interface WeightPaintOverlayProps {
  camera: Camera;
  canvasWidth: number;
  canvasHeight: number;
}

export const WeightPaintOverlay: React.FC<WeightPaintOverlayProps> = ({
  camera,
  canvasWidth,
  canvasHeight,
}) => {
  const activeTool = useEditorStore((s) => s.activeTool);
  const weightPaintBoneId = useEditorStore((s) => s.weightPaintBoneId);
  const brushSize = useEditorStore((s) => s.weightPaintBrushSize);

  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (activeTool !== 'weight-paint') return;

    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [activeTool]);

  if (activeTool !== 'weight-paint') return null;

  // Convert brush world radius to screen pixels
  const screenRadius = brushSize * camera.zoom;

  return (
    <svg
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
      {mousePos && (
        <circle
          cx={mousePos.x}
          cy={mousePos.y}
          r={screenRadius}
          fill="none"
          stroke="rgba(168, 85, 247, 0.6)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}
      {/* Mode indicator */}
      {weightPaintBoneId && (
        <text
          x={8}
          y={canvasHeight - 8}
          fill="rgba(168, 85, 247, 0.8)"
          fontSize={11}
          fontFamily="var(--font-family-ui)"
        >
          Weight Paint: {weightPaintBoneId}
        </text>
      )}
    </svg>
  );
};
