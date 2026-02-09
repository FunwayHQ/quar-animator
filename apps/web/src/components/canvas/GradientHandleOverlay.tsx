/**
 * GradientHandleOverlay — Figma-style gradient placement handles on the canvas.
 *
 * Linear gradients: dashed line with start (white) and end (violet) circle handles.
 * Radial gradients: center handle + radius handle connected by a line.
 *
 * Drag handling is self-contained: pointerdown on handle → document pointermove/up listeners.
 */

import { useRef, useCallback, useEffect } from 'react';
import type { Node, Vector2, Gradient } from '@quar/types';
import type { Camera } from '@quar/core';
import {
  getNodeLocalBounds,
  gradientNormalizedToWorld,
  worldToGradientNormalized,
  linearGradientFromAngle,
  angleFromLinearGradient,
} from '@quar/core';
import { mat3 } from '@quar/core';
import type { SceneGraph } from '@quar/core';
import { useEditorStore } from '../../stores/editorStore';
import styles from './GradientHandleOverlay.module.css';

// ============================================================================
// Types
// ============================================================================

interface GradientHandleOverlayProps {
  node: Node;
  fillIndex: number;
  source: 'fill' | 'stroke';
  camera: Camera | null;
  sceneGraph: SceneGraph;
}

type DraggingHandle = 'start' | 'end' | 'center' | 'radius' | null;

// ============================================================================
// Helpers
// ============================================================================

const HANDLE_RADIUS = 6;

function getGradient(node: Node, fillIndex: number, source: 'fill' | 'stroke'): Gradient | null {
  const shaped = node as { fills?: Array<{ gradient?: Gradient }>; strokes?: Array<{ gradient?: Gradient }> };
  if (source === 'fill') {
    return shaped.fills?.[fillIndex]?.gradient ?? null;
  }
  return shaped.strokes?.[fillIndex]?.gradient ?? null;
}

function getWorldMatrix(node: Node, sceneGraph: SceneGraph): import('@quar/types').Matrix3 {
  return sceneGraph.getWorldTransform(node.id);
}

// ============================================================================
// Component
// ============================================================================

export function GradientHandleOverlay({
  node,
  fillIndex,
  source,
  camera,
  sceneGraph,
}: GradientHandleOverlayProps) {
  const draggingRef = useRef<DraggingHandle>(null);
  const canvasRectRef = useRef<DOMRect | null>(null);

  const gradient = getGradient(node, fillIndex, source);

  // Compute values needed by hooks (safe even if gradient/camera is null)
  const localBounds = getNodeLocalBounds(node);
  const worldMatrix = getWorldMatrix(node, sceneGraph);

  // ---- Drag handling (hook must be called unconditionally) ----

  const handlePointerDown = useCallback(
    (handle: DraggingHandle, e: React.PointerEvent) => {
      if (!camera) return;
      e.stopPropagation();
      e.preventDefault();
      draggingRef.current = handle;

      // Cache canvas rect for pointer move
      const canvasEl = document.querySelector('canvas');
      canvasRectRef.current = canvasEl?.getBoundingClientRect() ?? null;

      const onPointerMove = (moveEvent: PointerEvent) => {
        if (!draggingRef.current || !camera || !canvasRectRef.current) return;
        const rect = canvasRectRef.current;
        const screenPos: Vector2 = {
          x: moveEvent.clientX - rect.left,
          y: moveEvent.clientY - rect.top,
        };
        const worldPos = camera.screenToWorld(screenPos);
        const invMatrix = mat3.invert(worldMatrix);
        if (!invMatrix) return;

        const normalizedPos = worldToGradientNormalized(worldPos, localBounds, invMatrix);

        // Read current node (might have changed during drag)
        const currentNode = sceneGraph.getNode(node.id);
        if (!currentNode) return;
        const currentGradient = getGradient(currentNode, fillIndex, source);
        if (!currentGradient) return;

        let updatedGradient: Gradient;

        if (draggingRef.current === 'start' || draggingRef.current === 'end') {
          const currentStart = currentGradient.start ?? linearGradientFromAngle(currentGradient.angle ?? 0).start;
          const currentEnd = currentGradient.end ?? linearGradientFromAngle(currentGradient.angle ?? 0).end;
          const newStart = draggingRef.current === 'start' ? normalizedPos : currentStart;
          const newEnd = draggingRef.current === 'end' ? normalizedPos : currentEnd;
          const newAngle = angleFromLinearGradient(newStart, newEnd);
          updatedGradient = {
            ...currentGradient,
            start: newStart,
            end: newEnd,
            angle: newAngle,
          };
        } else if (draggingRef.current === 'center') {
          // Move center and keep relative radius position
          const oldCenter = currentGradient.center ?? { x: 0.5, y: 0.5 };
          const oldEnd = currentGradient.end ?? { x: oldCenter.x + (currentGradient.radius ?? 0.5), y: oldCenter.y };
          const dx = normalizedPos.x - oldCenter.x;
          const dy = normalizedPos.y - oldCenter.y;
          updatedGradient = {
            ...currentGradient,
            center: normalizedPos,
            end: { x: oldEnd.x + dx, y: oldEnd.y + dy },
          };
        } else if (draggingRef.current === 'radius') {
          const center = currentGradient.center ?? { x: 0.5, y: 0.5 };
          const dx = normalizedPos.x - center.x;
          const dy = normalizedPos.y - center.y;
          const newRadius = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
          updatedGradient = {
            ...currentGradient,
            radius: newRadius,
            end: normalizedPos,
          };
        } else {
          return;
        }

        // Update the node
        type FillEntry = { gradient?: Gradient; [key: string]: unknown };
        if (source === 'fill') {
          const fills = [...((currentNode as { fills?: FillEntry[] }).fills ?? [])];
          fills[fillIndex] = { ...fills[fillIndex], gradient: updatedGradient };
          sceneGraph.updateNode(node.id, { fills } as Partial<Node>);
        } else {
          const strokes = [...((currentNode as { strokes?: FillEntry[] }).strokes ?? [])];
          strokes[fillIndex] = { ...strokes[fillIndex], gradient: updatedGradient };
          sceneGraph.updateNode(node.id, { strokes } as Partial<Node>);
        }
        useEditorStore.getState().markDirty();
      };

      const onPointerUp = () => {
        draggingRef.current = null;
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
      };

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    },
    [camera, worldMatrix, localBounds, sceneGraph, node.id, fillIndex, source]
  );

  // ---- Escape key to dismiss ----

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        useEditorStore.getState().clearEditingGradient();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ---- Early return after all hooks ----

  if (!gradient || !camera) return null;

  // ---- Compute handle screen positions ----

  let screenPositions: { start?: Vector2; end?: Vector2; center?: Vector2; radius?: Vector2 } = {};

  if (gradient.type === 'linear') {
    const start = gradient.start ?? linearGradientFromAngle(gradient.angle ?? 0).start;
    const end = gradient.end ?? linearGradientFromAngle(gradient.angle ?? 0).end;
    const worldStart = gradientNormalizedToWorld(start, localBounds, worldMatrix);
    const worldEnd = gradientNormalizedToWorld(end, localBounds, worldMatrix);
    screenPositions = {
      start: camera.worldToScreen(worldStart),
      end: camera.worldToScreen(worldEnd),
    };
  } else if (gradient.type === 'radial') {
    const center = gradient.center ?? { x: 0.5, y: 0.5 };
    const r = gradient.radius ?? 0.5;
    const radiusPoint = gradient.end ?? { x: center.x + r, y: center.y };
    const worldCenter = gradientNormalizedToWorld(center, localBounds, worldMatrix);
    const worldRadius = gradientNormalizedToWorld(radiusPoint, localBounds, worldMatrix);
    screenPositions = {
      center: camera.worldToScreen(worldCenter),
      radius: camera.worldToScreen(worldRadius),
    };
  }

  // ---- Render ----

  if (gradient.type === 'linear' && screenPositions.start && screenPositions.end) {
    const { start, end } = screenPositions;
    return (
      <svg className={styles.overlay} data-testid="gradient-handle-overlay">
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          className={styles.gradientLine}
        />
        <circle
          cx={start.x}
          cy={start.y}
          r={HANDLE_RADIUS}
          className={styles.handleStart}
          onPointerDown={(e) => handlePointerDown('start', e)}
          data-testid="gradient-handle-start"
        />
        <circle
          cx={end.x}
          cy={end.y}
          r={HANDLE_RADIUS}
          className={styles.handleEnd}
          onPointerDown={(e) => handlePointerDown('end', e)}
          data-testid="gradient-handle-end"
        />
      </svg>
    );
  }

  if (gradient.type === 'radial' && screenPositions.center && screenPositions.radius) {
    const { center, radius } = screenPositions;
    return (
      <svg className={styles.overlay} data-testid="gradient-handle-overlay">
        <line
          x1={center.x}
          y1={center.y}
          x2={radius.x}
          y2={radius.y}
          className={styles.gradientLine}
        />
        <circle
          cx={center.x}
          cy={center.y}
          r={HANDLE_RADIUS}
          className={styles.handleCenter}
          onPointerDown={(e) => handlePointerDown('center', e)}
          data-testid="gradient-handle-center"
        />
        <circle
          cx={radius.x}
          cy={radius.y}
          r={HANDLE_RADIUS}
          className={styles.handleRadius}
          onPointerDown={(e) => handlePointerDown('radius', e)}
          data-testid="gradient-handle-radius"
        />
      </svg>
    );
  }

  return null;
}

export default GradientHandleOverlay;
