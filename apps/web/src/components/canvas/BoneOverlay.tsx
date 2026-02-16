/**
 * BoneOverlay - SVG overlay showing bone joint markers, tips, and IK targets
 * Visible when bone tool is active or any bone/IK target is selected
 */

import { useMemo } from 'react';
import type { BoneNode, IKTargetNode, IKChain } from '@quar/types';
import type { Camera } from '@quar/core';
import type { SceneGraph } from '@quar/core';

interface BoneOverlayProps {
  boneNodes: BoneNode[];
  ikTargetNodes?: IKTargetNode[];
  ikChains?: IKChain[];
  selectedNodeIds: Set<string>;
  camera: Camera | null;
  sceneGraph: SceneGraph;
  hiddenBoneIds?: Set<string>;
  dynamicChainBoneIds?: Set<string>;
}

const JOINT_RADIUS = 5;
const TIP_RADIUS = 3;
const ACCENT_COLOR = '#A855F7'; // Violet accent
const IK_TARGET_SIZE = 8; // Crosshair size
const IK_POLE_SIZE = 6; // Diamond size

const DYNAMIC_COLOR = '#FF9800'; // Orange for dynamic chain bones

export function BoneOverlay({
  boneNodes,
  ikTargetNodes = [],
  ikChains = [],
  selectedNodeIds,
  camera,
  sceneGraph,
  hiddenBoneIds,
  dynamicChainBoneIds,
}: BoneOverlayProps) {
  const markers = useMemo(() => {
    if (!camera || boneNodes.length === 0) return [];
    // Filter out hidden Vitruvian bones
    const visibleBones = hiddenBoneIds
      ? boneNodes.filter((b) => !hiddenBoneIds.has(b.id))
      : boneNodes;
    return visibleBones.map((bone) => {
      const worldTransform = sceneGraph.getWorldTransform(bone.id);

      // Root joint position (world space)
      const rootWorld = { x: worldTransform.tx, y: worldTransform.ty };

      // Tip position (bone.length along local +X, transformed to world)
      const tipX = bone.length;
      const tipWorldX = worldTransform.a * tipX + worldTransform.tx;
      const tipWorldY = worldTransform.b * tipX + worldTransform.ty;

      // Convert to screen space
      const rootScreen = camera.worldToScreen(rootWorld);
      const tipScreen = camera.worldToScreen({ x: tipWorldX, y: tipWorldY });

      const isSelected = selectedNodeIds.has(bone.id);

      const isDynamic = dynamicChainBoneIds ? dynamicChainBoneIds.has(bone.id) : false;

      return {
        id: bone.id,
        rootScreen,
        tipScreen,
        isSelected,
        boneColor: bone.boneColor,
        isDynamic,
      };
    });
  }, [boneNodes, selectedNodeIds, camera, sceneGraph, hiddenBoneIds, dynamicChainBoneIds]);

  // IK target markers
  const ikMarkers = useMemo(() => {
    if (!camera || ikTargetNodes.length === 0) return [];
    return ikTargetNodes.map((target) => {
      const wt = sceneGraph.getWorldTransform(target.id);
      const screen = camera.worldToScreen({ x: wt.tx, y: wt.ty });
      const isSelected = selectedNodeIds.has(target.id);
      return {
        id: target.id,
        screen,
        isSelected,
        targetType: target.targetType,
        ikChainId: target.ikChainId,
      };
    });
  }, [ikTargetNodes, selectedNodeIds, camera, sceneGraph]);

  // Dashed lines from end effector tip to IK target
  const chainLines = useMemo(() => {
    if (!camera || ikChains.length === 0) return [];
    const lines: Array<{
      id: string;
      fromScreen: { x: number; y: number };
      toScreen: { x: number; y: number };
    }> = [];

    for (const chain of ikChains) {
      if (!chain.enabled) continue;
      const endBone = sceneGraph.getNode(chain.endEffectorBoneId);
      const targetNode = sceneGraph.getNode(chain.targetNodeId);
      if (!endBone || !targetNode || endBone.type !== 'bone') continue;

      const bone = endBone as BoneNode;
      const boneWT = sceneGraph.getWorldTransform(bone.id);
      const tipX = boneWT.a * bone.length + boneWT.tx;
      const tipY = boneWT.b * bone.length + boneWT.ty;
      const fromScreen = camera.worldToScreen({ x: tipX, y: tipY });

      const targetWT = sceneGraph.getWorldTransform(targetNode.id);
      const toScreen = camera.worldToScreen({ x: targetWT.tx, y: targetWT.ty });

      lines.push({ id: chain.id, fromScreen, toScreen });
    }

    return lines;
  }, [ikChains, camera, sceneGraph]);

  if (!camera || (markers.length === 0 && ikMarkers.length === 0)) return null;

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
      {/* Dashed lines from end effector tip to IK target */}
      {chainLines.map(({ id, fromScreen, toScreen }) => (
        <line
          key={`ikline-${id}`}
          x1={fromScreen.x}
          y1={fromScreen.y}
          x2={toScreen.x}
          y2={toScreen.y}
          stroke={ACCENT_COLOR}
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.6}
        />
      ))}

      {/* Bone markers */}
      {markers.map(({ id, rootScreen, tipScreen, isSelected, boneColor, isDynamic }) => (
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
          {/* Dynamic chain indicator ring */}
          {isDynamic && !isSelected && (
            <circle
              cx={rootScreen.x}
              cy={rootScreen.y}
              r={JOINT_RADIUS + 2}
              fill="none"
              stroke={DYNAMIC_COLOR}
              strokeWidth={1.5}
              strokeDasharray="3 2"
            />
          )}
          {/* Joint circle (filled) */}
          <circle
            cx={rootScreen.x}
            cy={rootScreen.y}
            r={JOINT_RADIUS}
            fill={isSelected ? ACCENT_COLOR : isDynamic ? DYNAMIC_COLOR : boneColor}
            stroke={isSelected ? ACCENT_COLOR : isDynamic ? DYNAMIC_COLOR : '#888'}
            strokeWidth={1}
          />
          {/* Tip circle (open) */}
          <circle
            cx={tipScreen.x}
            cy={tipScreen.y}
            r={TIP_RADIUS}
            fill="none"
            stroke={isSelected ? ACCENT_COLOR : isDynamic ? DYNAMIC_COLOR : boneColor}
            strokeWidth={1.5}
          />
        </g>
      ))}

      {/* IK target markers */}
      {ikMarkers.map(({ id, screen, isSelected, targetType }) => (
        <g key={id}>
          {targetType === 'effector' ? (
            // Crosshair icon for effector targets
            <>
              {/* Outer circle */}
              <circle
                cx={screen.x}
                cy={screen.y}
                r={IK_TARGET_SIZE}
                fill="none"
                stroke={isSelected ? ACCENT_COLOR : '#FF6B6B'}
                strokeWidth={isSelected ? 2 : 1.5}
              />
              {/* Selection highlight */}
              {isSelected && (
                <circle
                  cx={screen.x}
                  cy={screen.y}
                  r={IK_TARGET_SIZE + 3}
                  fill="none"
                  stroke={ACCENT_COLOR}
                  strokeWidth={2}
                />
              )}
              {/* Crosshair lines */}
              <line
                x1={screen.x - IK_TARGET_SIZE}
                y1={screen.y}
                x2={screen.x + IK_TARGET_SIZE}
                y2={screen.y}
                stroke={isSelected ? ACCENT_COLOR : '#FF6B6B'}
                strokeWidth={1.5}
              />
              <line
                x1={screen.x}
                y1={screen.y - IK_TARGET_SIZE}
                x2={screen.x}
                y2={screen.y + IK_TARGET_SIZE}
                stroke={isSelected ? ACCENT_COLOR : '#FF6B6B'}
                strokeWidth={1.5}
              />
            </>
          ) : (
            // Diamond icon for pole targets
            <>
              <polygon
                points={`${screen.x},${screen.y - IK_POLE_SIZE} ${screen.x + IK_POLE_SIZE},${screen.y} ${screen.x},${screen.y + IK_POLE_SIZE} ${screen.x - IK_POLE_SIZE},${screen.y}`}
                fill={isSelected ? ACCENT_COLOR : 'none'}
                stroke={isSelected ? ACCENT_COLOR : '#4ECDC4'}
                strokeWidth={1.5}
              />
              {isSelected && (
                <polygon
                  points={`${screen.x},${screen.y - IK_POLE_SIZE - 3} ${screen.x + IK_POLE_SIZE + 3},${screen.y} ${screen.x},${screen.y + IK_POLE_SIZE + 3} ${screen.x - IK_POLE_SIZE - 3},${screen.y}`}
                  fill="none"
                  stroke={ACCENT_COLOR}
                  strokeWidth={2}
                />
              )}
            </>
          )}
        </g>
      ))}
    </svg>
  );
}
