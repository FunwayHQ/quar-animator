/**
 * GraphEditorCurves — SVG curve paths per visible track.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- @quar/animation types resolve to any without built dist */
import type { PropertyTrack } from '@quar/types';
import type { GraphViewTransform } from '@quar/animation';
import { buildTrackCurvePath, getTrackColor } from '@quar/animation';
import styles from './GraphEditor.module.css';

interface GraphEditorCurvesProps {
  tracks: Array<{ track: PropertyTrack<number>; globalIndex: number }>;
  transform: GraphViewTransform;
}

export function GraphEditorCurves({ tracks, transform }: GraphEditorCurvesProps) {
  return (
    <svg className={styles.svgOverlay} data-testid="graph-editor-curves">
      {tracks.map(({ track, globalIndex }) => {
        const pathD = buildTrackCurvePath(track, transform);
        if (!pathD) return null;
        const color = getTrackColor(globalIndex);
        return <path key={track.id} d={pathD} className={styles.curvePath} stroke={color} />;
      })}
    </svg>
  );
}
