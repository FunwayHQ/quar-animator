/**
 * GraphEditorKeyframes — Keyframe dots and tangent handles for the graph editor.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call -- @quar/animation types resolve to any without built dist */
import type { Keyframe, PropertyTrack } from '@quar/types';
import type { GraphViewTransform } from '@quar/animation';
import { graphToScreen, getTrackColor, isEasingEditable, easingToTangents } from '@quar/animation';
import styles from './GraphEditor.module.css';

interface GraphEditorKeyframesProps {
  tracks: Array<{ track: PropertyTrack<number>; globalIndex: number }>;
  transform: GraphViewTransform;
  selectedKeyframeIds: Set<string>;
  onKeyframeMouseDown: (
    e: React.MouseEvent,
    kfId: string,
    nodeId: string,
    property: string,
    time: number,
    value: number
  ) => void;
  onTangentMouseDown: (
    e: React.MouseEvent,
    kfId: string,
    nodeId: string,
    property: string,
    side: 'in' | 'out',
    time: number,
    value: number
  ) => void;
}

export function GraphEditorKeyframes({
  tracks,
  transform,
  selectedKeyframeIds,
  onKeyframeMouseDown,
  onTangentMouseDown,
}: GraphEditorKeyframesProps) {
  const elements: JSX.Element[] = [];

  for (const { track, globalIndex } of tracks) {
    const color = getTrackColor(globalIndex);
    const kfs = track.keyframes;

    for (let i = 0; i < kfs.length; i++) {
      const kf = kfs[i] as Keyframe<number>;
      const pos = graphToScreen(kf.time, kf.value, transform);
      const isSelected = selectedKeyframeIds.has(kf.id);

      // Tangent handles for selected keyframes with editable easing
      if (isSelected) {
        // Show tangent handles for the segment BEFORE this keyframe (incoming)
        if (i > 0) {
          const prevKf = kfs[i - 1] as Keyframe<number>;
          const easing = kf.easing; // after.easing convention
          if (isEasingEditable(easing)) {
            const tangents = easingToTangents(easing, prevKf.time, prevKf.value, kf.time, kf.value);
            if (tangents) {
              // tangentIn is relative to this kf (negative direction)
              const handleInPos = graphToScreen(
                kf.time + tangents.tangentIn.x,
                kf.value + tangents.tangentIn.y,
                transform
              );
              elements.push(
                <line
                  key={`tin-line-${kf.id}`}
                  x1={pos.x}
                  y1={pos.y}
                  x2={handleInPos.x}
                  y2={handleInPos.y}
                  className={styles.tangentLine}
                  stroke={color}
                />
              );
              elements.push(
                <circle
                  key={`tin-${kf.id}`}
                  cx={handleInPos.x}
                  cy={handleInPos.y}
                  r={4}
                  className={styles.tangentHandle}
                  stroke={color}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onTangentMouseDown(
                      e,
                      kf.id,
                      track.nodeId,
                      track.property,
                      'in',
                      kf.time,
                      kf.value
                    );
                  }}
                />
              );
            }
          }
        }

        // Show tangent handles for the segment AFTER this keyframe (outgoing)
        if (i < kfs.length - 1) {
          const nextKf = kfs[i + 1] as Keyframe<number>;
          const easing = nextKf.easing; // after.easing convention
          if (isEasingEditable(easing)) {
            const tangents = easingToTangents(easing, kf.time, kf.value, nextKf.time, nextKf.value);
            if (tangents) {
              // tangentOut is relative to this kf (positive direction)
              const handleOutPos = graphToScreen(
                kf.time + tangents.tangentOut.x,
                kf.value + tangents.tangentOut.y,
                transform
              );
              elements.push(
                <line
                  key={`tout-line-${kf.id}`}
                  x1={pos.x}
                  y1={pos.y}
                  x2={handleOutPos.x}
                  y2={handleOutPos.y}
                  className={styles.tangentLine}
                  stroke={color}
                />
              );
              elements.push(
                <circle
                  key={`tout-${kf.id}`}
                  cx={handleOutPos.x}
                  cy={handleOutPos.y}
                  r={4}
                  className={styles.tangentHandle}
                  stroke={color}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onTangentMouseDown(
                      e,
                      kf.id,
                      track.nodeId,
                      track.property,
                      'out',
                      kf.time,
                      kf.value
                    );
                  }}
                />
              );
            }
          }
        }
      }

      // Keyframe dot (rendered after tangent lines so it's on top)
      elements.push(
        <circle
          key={`kf-${kf.id}`}
          cx={pos.x}
          cy={pos.y}
          r={isSelected ? 5 : 4}
          fill={color}
          className={`${styles.keyframeDot} ${isSelected ? styles.keyframeDotSelected : ''}`}
          onMouseDown={(e) => {
            e.stopPropagation();
            onKeyframeMouseDown(e, kf.id, track.nodeId, track.property, kf.time, kf.value);
          }}
        />
      );
    }
  }

  return (
    <svg
      className={`${styles.svgOverlay} ${styles.interactive}`}
      data-testid="graph-editor-keyframes"
    >
      {elements}
    </svg>
  );
}
