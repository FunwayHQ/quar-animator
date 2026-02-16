/**
 * ArtboardOverlay - SVG overlay showing artboard names and dimensions
 * Renders labels above the top-left corner of each artboard
 */

import { useMemo } from 'react';
import type { ArtboardNode } from '@quar/types';
import type { Camera } from '@quar/core';
import type { SceneGraph } from '@quar/core';

interface ArtboardOverlayProps {
  artboardNodes: ArtboardNode[];
  selectedNodeIds: Set<string>;
  camera: Camera | null;
  sceneGraph: SceneGraph;
  cameraVersion: number;
}

const LABEL_FONT_SIZE = 11;
const LABEL_OFFSET_Y = 8; // pixels above artboard top edge
const LABEL_COLOR = '#999';
const LABEL_COLOR_SELECTED = '#A855F7'; // Violet accent

export function ArtboardOverlay({
  artboardNodes,
  selectedNodeIds,
  camera,
  sceneGraph,
  cameraVersion,
}: ArtboardOverlayProps) {
  const labels = useMemo(() => {
    if (!camera || artboardNodes.length === 0) return [];

    return artboardNodes.map((artboard) => {
      const worldTransform = sceneGraph.getWorldTransform(artboard.id);
      const hw = artboard.width / 2;
      const hh = artboard.height / 2;

      // Top-left corner in world space (anchor 0.5, 0.5)
      const topLeftWorld = {
        x: worldTransform.a * -hw + worldTransform.c * hh + worldTransform.tx,
        y: worldTransform.b * -hw + worldTransform.d * hh + worldTransform.ty,
      };

      // Convert to screen space
      const screenPos = camera.worldToScreen(topLeftWorld);
      const isSelected = selectedNodeIds.has(artboard.id);

      return {
        id: artboard.id,
        x: screenPos.x,
        y: screenPos.y - LABEL_OFFSET_Y,
        name: artboard.name,
        width: Math.round(artboard.width),
        height: Math.round(artboard.height),
        isSelected,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artboardNodes, camera, sceneGraph, selectedNodeIds, cameraVersion]);

  if (labels.length === 0) return null;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {labels.map((label) => (
        <text
          key={label.id}
          x={label.x}
          y={label.y}
          fill={label.isSelected ? LABEL_COLOR_SELECTED : LABEL_COLOR}
          fontSize={LABEL_FONT_SIZE}
          fontFamily="DM Sans, sans-serif"
          fontWeight={label.isSelected ? 600 : 400}
          dominantBaseline="auto"
          textAnchor="start"
        >
          {label.name}
          <tspan dx="6" fill={label.isSelected ? LABEL_COLOR_SELECTED : '#666'} fontSize={10}>
            {label.width} x {label.height}
          </tspan>
        </text>
      ))}
    </svg>
  );
}

export default ArtboardOverlay;
