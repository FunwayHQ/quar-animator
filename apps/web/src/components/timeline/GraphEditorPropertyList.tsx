/**
 * GraphEditorPropertyList — Left sidebar showing animated properties with visibility toggles.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-non-null-assertion, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- @quar/animation types resolve to any without built dist */
import type { Timeline } from '@quar/types';
import { getTrackColor } from '@quar/animation';
import styles from './GraphEditor.module.css';

interface GraphEditorPropertyListProps {
  timeline: Timeline;
  selectedNodeIds: Set<string>;
  visibleTracks: string[];
  nodeNames: Map<string, string>;
  onToggleTrack: (trackId: string) => void;
}

/** Short display name from a dot-notation property path */
function shortPropertyName(property: string): string {
  const parts = property.split('.');
  const last = parts[parts.length - 1];
  // Capitalize first letter
  return last.charAt(0).toUpperCase() + last.slice(1);
}

export function GraphEditorPropertyList({
  timeline,
  selectedNodeIds,
  visibleTracks,
  nodeNames,
  onToggleTrack,
}: GraphEditorPropertyListProps) {
  // Group tracks by node
  const tracksByNode = new Map<
    string,
    Array<{ trackId: string; property: string; globalIndex: number }>
  >();
  let globalIndex = 0;

  for (const track of timeline.tracks) {
    if (track.keyframes.length === 0) continue;
    // Only show tracks for selected nodes (or all if none selected)
    if (selectedNodeIds.size > 0 && !selectedNodeIds.has(track.nodeId)) continue;

    if (!tracksByNode.has(track.nodeId)) {
      tracksByNode.set(track.nodeId, []);
    }
    tracksByNode.get(track.nodeId)!.push({
      trackId: `${track.nodeId}:${track.property}`,
      property: track.property,
      globalIndex,
    });
    globalIndex++;
  }

  if (tracksByNode.size === 0) {
    return (
      <div className={styles.propertyList} data-testid="graph-property-list">
        <div className={styles.propertyListHeader}>Properties</div>
        <div style={{ padding: '8px', fontSize: '10px', color: 'var(--color-text-disabled)' }}>
          No animated properties
        </div>
      </div>
    );
  }

  return (
    <div className={styles.propertyList} data-testid="graph-property-list">
      <div className={styles.propertyListHeader}>Properties</div>
      {Array.from(tracksByNode.entries()).map(([nodeId, tracks]) => (
        <div key={nodeId}>
          <div className={styles.propertyNode}>{nodeNames.get(nodeId) ?? nodeId}</div>
          {tracks.map(({ trackId, property, globalIndex: idx }) => {
            const isVisible = visibleTracks.length === 0 || visibleTracks.includes(trackId);
            const color = getTrackColor(idx);
            return (
              <div
                key={trackId}
                className={styles.propertyItem}
                onClick={() => onToggleTrack(trackId)}
              >
                <div className={styles.propertyDot} style={{ backgroundColor: color }} />
                <span className={styles.propertyName}>{shortPropertyName(property)}</span>
                <svg
                  className={`${styles.propertyToggle} ${isVisible ? styles.visible : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  {isVisible ? (
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 100 6 3 3 0 000-6z" />
                  ) : (
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24 M1 1l22 22" />
                  )}
                </svg>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
