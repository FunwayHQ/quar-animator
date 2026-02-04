import { useState, useRef, useCallback } from 'react';
import styles from './Timeline.module.css';

export function Timeline() {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration] = useState(300); // 10 seconds at 30fps
  const [frameRate] = useState(30);
  const rulerRef = useRef<HTMLDivElement>(null);

  const formatTimecode = useCallback((frame: number) => {
    const totalSeconds = frame / frameRate;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames = frame % frameRate;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  }, [frameRate]);

  const handleRulerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const ruler = rulerRef.current;
    if (!ruler) return;

    const rect = ruler.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frame = Math.round((x / rect.width) * duration);
    setCurrentFrame(Math.max(0, Math.min(duration, frame)));
  }, [duration]);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const goToStart = useCallback(() => {
    setCurrentFrame(0);
    setIsPlaying(false);
  }, []);

  const goToEnd = useCallback(() => {
    setCurrentFrame(duration);
    setIsPlaying(false);
  }, [duration]);

  const stepFrame = useCallback((delta: number) => {
    setCurrentFrame((prev) => Math.max(0, Math.min(duration, prev + delta)));
  }, [duration]);

  return (
    <div className={styles.timeline}>
      {/* Controls Bar */}
      <div className={styles.controls}>
        <div className={styles.transportControls}>
          <button className={styles.controlButton} onClick={goToStart} title="Go to start (Home)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="19 20 9 12 19 4" />
              <line x1="5" y1="19" x2="5" y2="5" />
            </svg>
          </button>
          <button className={styles.controlButton} onClick={() => stepFrame(-1)} title="Previous frame (,)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="19 20 9 12 19 4" />
            </svg>
          </button>
          <button className={`${styles.controlButton} ${styles.playButton}`} onClick={togglePlay} title="Play/Pause (Space)">
            {isPlaying ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21" />
              </svg>
            )}
          </button>
          <button className={styles.controlButton} onClick={() => stepFrame(1)} title="Next frame (.)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 4 15 12 5 20" />
            </svg>
          </button>
          <button className={styles.controlButton} onClick={goToEnd} title="Go to end (End)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 4 15 12 5 20" />
              <line x1="19" y1="5" x2="19" y2="19" />
            </svg>
          </button>
        </div>

        <div className={styles.timeDisplay}>
          <span className={styles.currentTime}>{formatTimecode(currentFrame)}</span>
          <span className={styles.separator}>/</span>
          <span className={styles.totalTime}>{formatTimecode(duration)}</span>
        </div>

        <div className={styles.options}>
          <button className={styles.optionButton} title="Toggle loop (L)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
          <button className={styles.optionButton} title="Toggle onion skinning (O)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          <div className={styles.layerLabel}>Character</div>
          <div className={styles.layerLabel}>├ Position</div>
          <div className={styles.layerLabel}>├ Scale</div>
          <div className={styles.layerLabel}>└ Rotation</div>
          <div className={styles.layerLabel}>Background</div>
        </div>

        {/* Tracks Area */}
        <div className={styles.tracksArea}>
          {/* Ruler */}
          <div className={styles.ruler} ref={rulerRef} onClick={handleRulerClick}>
            {Array.from({ length: 11 }, (_, i) => (
              <div key={i} className={styles.rulerMark} style={{ left: `${i * 10}%` }}>
                <span className={styles.rulerLabel}>{i * 30}</span>
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
            <div className={styles.track}>
              <div className={styles.keyframe} style={{ left: '0%' }} />
              <div className={styles.keyframe} style={{ left: '30%' }} />
              <div className={styles.keyframe} style={{ left: '60%' }} />
            </div>
            <div className={styles.track}>
              <div className={styles.keyframe} style={{ left: '0%' }} />
              <div className={styles.keyframe} style={{ left: '50%' }} />
            </div>
            <div className={styles.track}>
              <div className={styles.keyframe} style={{ left: '10%' }} />
              <div className={styles.keyframe} style={{ left: '40%' }} />
              <div className={styles.keyframe} style={{ left: '80%' }} />
            </div>
            <div className={styles.track}>
              <div className={styles.keyframe} style={{ left: '0%' }} />
              <div className={styles.keyframe} style={{ left: '100%' }} />
            </div>
            <div className={styles.track} />

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
