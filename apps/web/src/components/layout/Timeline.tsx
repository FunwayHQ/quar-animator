import { useRef, useCallback, useState, useEffect } from 'react';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import { formatTimecode } from '@quar/animation';
import type { Node } from '@quar/types';
import styles from './Timeline.module.css';

export function Timeline() {
  const sceneGraph = useSceneGraph();
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const isLooping = useEditorStore((s) => s.isLooping);
  const duration = useEditorStore((s) => s.timelineDuration);
  const frameRate = useEditorStore((s) => s.frameRate);
  const expanded = useEditorStore((s) => s.timelineExpanded);
  const setCurrentFrame = useEditorStore((s) => s.setCurrentFrame);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const setIsLooping = useEditorStore((s) => s.setIsLooping);
  const toggleTimelineExpanded = useEditorStore((s) => s.toggleTimelineExpanded);

  const rulerRef = useRef<HTMLDivElement>(null);

  // Track scene graph changes for layer labels
  const [nodes, setNodes] = useState<Node[]>([]);
  useEffect(() => {
    const update = () => setNodes(sceneGraph.getRootNodes());
    update();
    const unsub = sceneGraph.on('nodeAdded', update);
    const unsub2 = sceneGraph.on('nodeRemoved', update);
    return () => {
      unsub();
      unsub2();
    };
  }, [sceneGraph]);

  const handleRulerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const ruler = rulerRef.current;
      if (!ruler) return;
      const rect = ruler.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const frame = Math.round((x / rect.width) * duration);
      setCurrentFrame(frame);
    },
    [duration, setCurrentFrame]
  );

  const togglePlay = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying, setIsPlaying]);

  const goToStart = useCallback(() => {
    setCurrentFrame(0);
    setIsPlaying(false);
  }, [setCurrentFrame, setIsPlaying]);

  const goToEnd = useCallback(() => {
    setCurrentFrame(duration - 1);
    setIsPlaying(false);
  }, [duration, setCurrentFrame, setIsPlaying]);

  const stepFrame = useCallback(
    (delta: number) => {
      setCurrentFrame(currentFrame + delta);
    },
    [currentFrame, setCurrentFrame]
  );

  const toggleLoop = useCallback(() => {
    setIsLooping(!isLooping);
  }, [isLooping, setIsLooping]);

  // Ruler marks: 11 marks across the timeline
  const rulerMarks = Array.from({ length: 11 }, (_, i) => {
    const frame = Math.round((i / 10) * duration);
    return { index: i, frame };
  });

  // ============================================================
  // Collapsed mode: thin bar
  // ============================================================

  if (!expanded) {
    return (
      <div className={`${styles.timeline} ${styles.timelineCollapsed}`}>
        <div className={styles.collapsedControls}>
          <button
            className={styles.expandButton}
            onClick={toggleTimelineExpanded}
            title="Expand timeline"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>

          <button
            className={`${styles.controlButton} ${styles.playButton}`}
            onClick={togglePlay}
            title="Play/Pause (Space)"
          >
            {isPlaying ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polygon points="5 3 19 12 5 21" />
              </svg>
            )}
          </button>

          <div className={styles.timeDisplay}>
            <span className={styles.currentTime}>{formatTimecode(currentFrame, frameRate)}</span>
            <span className={styles.separator}>/</span>
            <span className={styles.totalTime}>{formatTimecode(duration, frameRate)}</span>
          </div>

          <button
            className={`${styles.optionButton} ${isLooping ? styles.active : ''}`}
            onClick={toggleLoop}
            title="Toggle loop (L)"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // Expanded mode: full timeline
  // ============================================================

  return (
    <div className={styles.timeline}>
      {/* Controls Bar */}
      <div className={styles.controls}>
        <button
          className={styles.collapseButton}
          onClick={toggleTimelineExpanded}
          title="Collapse timeline"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <div className={styles.transportControls}>
          <button className={styles.controlButton} onClick={goToStart} title="Go to start (Home)">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="19 20 9 12 19 4" />
              <line x1="5" y1="19" x2="5" y2="5" />
            </svg>
          </button>
          <button
            className={styles.controlButton}
            onClick={() => stepFrame(-1)}
            title="Previous frame (,)"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="19 20 9 12 19 4" />
            </svg>
          </button>
          <button
            className={`${styles.controlButton} ${styles.playButton}`}
            onClick={togglePlay}
            title="Play/Pause (Space)"
          >
            {isPlaying ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polygon points="5 3 19 12 5 21" />
              </svg>
            )}
          </button>
          <button
            className={styles.controlButton}
            onClick={() => stepFrame(1)}
            title="Next frame (.)"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="5 4 15 12 5 20" />
            </svg>
          </button>
          <button className={styles.controlButton} onClick={goToEnd} title="Go to end (End)">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="5 4 15 12 5 20" />
              <line x1="19" y1="5" x2="19" y2="19" />
            </svg>
          </button>
        </div>

        <div className={styles.timeDisplay}>
          <span className={styles.currentTime}>{formatTimecode(currentFrame, frameRate)}</span>
          <span className={styles.separator}>/</span>
          <span className={styles.totalTime}>{formatTimecode(duration, frameRate)}</span>
        </div>

        <div className={styles.options}>
          <button
            className={`${styles.optionButton} ${isLooping ? styles.active : ''}`}
            onClick={toggleLoop}
            title="Toggle loop (L)"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
          <button className={styles.optionButton} title="Toggle onion skinning (O)">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Timeline Area */}
      <div className={styles.timelineArea}>
        {/* Layer Labels */}
        <div className={styles.layerLabels}>
          {nodes.length > 0 ? (
            nodes.map((node) => (
              <div key={node.id} className={styles.layerLabel}>
                {node.name ?? node.id}
              </div>
            ))
          ) : (
            <div className={styles.layerLabel}>No layers</div>
          )}
        </div>

        {/* Tracks Area */}
        <div className={styles.tracksArea}>
          {/* Ruler */}
          <div
            className={styles.ruler}
            ref={rulerRef}
            onClick={handleRulerClick}
            role="slider"
            aria-valuenow={currentFrame}
            aria-valuemin={0}
            aria-valuemax={duration - 1}
            aria-label="Timeline scrubber"
            tabIndex={0}
            data-testid="timeline-ruler"
          >
            {rulerMarks.map(({ index, frame }) => (
              <div key={index} className={styles.rulerMark} style={{ left: `${index * 10}%` }}>
                <span className={styles.rulerLabel}>{frame}</span>
              </div>
            ))}
            {/* Playhead */}
            <div
              className={styles.playhead}
              style={{ left: `${(currentFrame / duration) * 100}%` }}
            />
          </div>

          {/* Tracks */}
          <div className={styles.tracks}>
            {nodes.map((node) => (
              <div key={node.id} className={styles.track} />
            ))}
            {nodes.length === 0 && <div className={styles.track} />}

            {/* Playhead line */}
            <div
              className={styles.playheadLine}
              style={{ left: `${(currentFrame / duration) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Timeline;
