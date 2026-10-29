/**
 * The Video section of the Properties panel, for a video layer: the video
 * it shows (a still of it, its file's name, its length and size) and its
 * clip on the timeline — the frame it starts on and how long it plays, at
 * the document's frame rate. Read only here: the clip bar on the layer's
 * timeline row moves it.
 */

import type { CSSProperties } from 'react';
import { videoClipEndFrame } from '@quar/animation';
import type { VideoNode } from '@quar/types';
import { useEditorStore } from '../../stores/editorStore';
import styles from './PropertiesPanel.module.css';

/** Seconds as a length: m:ss.s, and h:mm:ss.s from an hour. */
export function formatVideoLength(seconds: number): string {
  const tenths = Math.round(Math.max(0, seconds) * 10);
  const minutes = Math.floor(tenths / 600);
  const secs = ((tenths % 600) / 10).toFixed(1).padStart(4, '0');
  if (minutes < 60) return `${minutes}:${secs}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${secs}`;
}

export function VideoSection({ node }: { node: VideoNode }) {
  const video = useEditorStore((state) => state.videos.find((v) => v.id === node.videoId));
  const frameRate = useEditorStore((state) => state.frameRate);

  const { clip } = node;
  const clipFrames = Math.round(videoClipEndFrame(clip, frameRate) - clip.start);
  const still = video?.strip.frames[0];
  const aspect = video && video.height > 0 ? video.width / video.height : 16 / 9;

  return (
    <div className={styles.section} data-testid="video-section">
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Video</span>
      </div>
      <div className={styles.sectionContent}>
        {still && (
          <div
            className={`${styles.videoStill} ${video.hasAlpha ? styles.videoStillAlpha : ''}`}
            style={{ '--still-aspect': aspect } as CSSProperties}
          >
            <img src={still} alt="" data-testid="video-still" />
          </div>
        )}

        {!video && (
          <p className={styles.slideNote} data-testid="video-missing">
            Its video isn’t in this document.
          </p>
        )}

        <dl className={styles.videoFacts}>
          {video && (
            <>
              <div className={styles.videoFact}>
                <dt>File</dt>
                <dd className={styles.videoFileName} title={video.name} data-testid="video-name">
                  {video.name}
                </dd>
              </div>
              <div className={styles.videoFact}>
                <dt>Length</dt>
                <dd data-testid="video-length">{formatVideoLength(video.duration)}</dd>
              </div>
              <div className={styles.videoFact}>
                <dt>Size</dt>
                <dd data-testid="video-size">
                  {video.width} × {video.height}
                  <span className={styles.videoFactUnit}> px</span>
                </dd>
              </div>
            </>
          )}
          <div className={`${styles.videoFact} ${video ? styles.videoFactClip : ''}`}>
            <dt>Starts</dt>
            <dd data-testid="video-clip-start">Frame {clip.start}</dd>
          </div>
          <div className={styles.videoFact}>
            <dt>Plays</dt>
            <dd data-testid="video-clip-length">
              {formatVideoLength(clip.duration)}
              <span className={styles.videoFactUnit}>
                {' · '}
                {clipFrames} {clipFrames === 1 ? 'frame' : 'frames'}
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
