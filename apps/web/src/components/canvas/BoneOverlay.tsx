/**
 * BoneOverlay - SVG overlay showing bone joint markers and tips
 * Visible when bone tool is active or any bone is selected
 */

import { useMemo } from 'react';
import type { BoneNode, Node } from '@quar/types';
import type { Camera } from '@quar/core';
import type { SceneGraph } from '@quar/core';

interface BoneOverlayProps {
  boneNodes: BoneNode[];
  selectedNodeIds: Set<string>;
  camera: Camera | null;
  sceneGraph: SceneGraph;
}

const JOINT_RADIUS = 5;
const TIP_RADIUS = 3;
const ACCENT_COLOR = '#A855F7'; // Violet accent

export function BoneOverlay({ boneNodes, selectedNodeIds, camera, sceneGraph }: BoneOverlayProps) {
  const markers = useMemo(() => {
    if (!camera || boneNodes.length === 0) return [];
    return boneNodes.map((bone) => {
      const worldTransform = sceneGraph.getWorldTransform(bone.id);

      // Root joint position (world space)
      const rootWorld = { x: worldTransform.tx, y: worldTransform.ty };

      // Tip position (bone.length along local +X, transformed to world)
      const tipX = bone.length;
      const tipWorldX = worldTransform.a * tipX + worldTransform.tx;
      const tipWorldY = worldTransform.b * tipX + worldTransform.ty;

      // Convert to screen space
      const rootScreen = camera.worldToScreen(rootWorld.x, rootWorld.y);
      const tipScreen = camera.worldToScreen(tipWorldX, tipWorldY);

      const isSelected = selectedNodeIds.has(bone.id);

      return {
        id: bone.id,
        rootScreen,
        tipScreen,
        isSelected,
        boneColor: bone.boneColor,
      };
    });
  }, [boneNodes, selectedNodeIds, camera, sceneGraph]);

  if (!camera || markers.length === 0) return null;

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
      {markers.map(({ id, rootScreen, tipScreen, isSelected, boneColor }) => (
        <g key={id}>
          {/* Selection highlight ring */}
          {isSelected && (
            <circle
              cx={rootScreen.x}
              cy={rootScreen.y}
              r={JOINT_RADIUS + 3}
              fill="none"
              stroke={ACCENT_COLOR}
              strokeWidth={2}
            />
          )}
          {/* Joint circle (filled) */}
          <circle
            cx={rootScreen.x}
            cy={rootScreen.y}
            r={JOINT_RADIUS}
            fill={isSelected ? ACCENT_COLOR : boneColor}
            stroke={isSelected ? ACCENT_COLOR : '#888'}
            strokeWidth={1}
          />
          {/* Tip circle (open) */}
          <circle
            cx={tipScreen.x}
            cy={tipScreen.y}
            r={TIP_RADIUS}
            fill="none"
            stroke={isSelected ? ACCENT_COLOR : boneColor}
            strokeWidth={1.5}
          />
        </g>
      ))}
    </svg>
  );
}
