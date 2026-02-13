/**
 * PointMagnetOverlay — shows brush circle during Smart Bone morph recording.
 * Follows the same pattern as WeightPaintOverlay.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import type { Camera } from '@quar/core';
import type { PointMagnetTool } from '@quar/core';
import type { ToolManager } from '@quar/core';

interface PointMagnetOverlayProps {
  camera: Camera;
  canvasWidth: number;
  canvasHeight: number;
  toolManager: ToolManager | null;
}

export const PointMagnetOverlay: React.FC<PointMagnetOverlayProps> = ({
  camera,
  canvasWidth,
  canvasHeight,
  toolManager,
}) => {
  const activeTool = useEditorStore((s) => s.activeTool);
  const recordingActionId = useEditorStore((s) => s.smartBoneRecordingActionId);
  const svgRef = useRef<SVGSVGElement>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [brushRadius, setBrushRadius] = useState(30);

  useEffect(() => {
    if (activeTool !== 'point-magnet') return;

    const handleMouseMove = (e: MouseEvent) => {
      const svg = svgRef.current;
      if (svg) {
        const rect = svg.getBoundingClientRect();
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      } else {
        setMousePos({ x: e.clientX, y: e.clientY });
      }

      // Read current brush radius from tool
      if (toolManager) {
        const pmTool = toolManager.getTool<PointMagnetTool>('point-magnet');
        if (pmTool) {
          setBrushRadius(pmTool.getBrushRadius());
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [activeTool, toolManager]);

  if (activeTool !== 'point-magnet') return null;

  const screenRadius = brushRadius * camera.zoom;

  return (
    <svg
      ref={svgRef}
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
          stroke="rgba(239, 68, 68, 0.6)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}
      {recordingActionId && (
        <text
          x={8}
          y={canvasHeight - 8}
          fill="rgba(239, 68, 68, 0.8)"
          fontSize={11}
          fontFamily="var(--font-family-ui)"
        >
          Smart Bone Recording
        </text>
      )}
    </svg>
  );
};
