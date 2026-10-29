/**
 * The Video section of the Properties panel, for a video layer: the video
 * it shows (a still of it, its file's name, its length and size, whether
 * it's transparent) and its clip on the timeline — the frame it starts on,
 * how fast it plays, whether it loops and holds its last frame, set here,
 * and how long it plays and which part of the video, at the document's
 * frame rate. Its ends are trimmed on its bar on the timeline. Each change
 * is one undo step, its linked sound and the timeline following (the
 * store's updateVideoClip).
 */

import { useEffect, useState, type CSSProperties, type KeyboardEvent } from 'react';
import {
  clipSeconds,
  clipSpeed,
  MAX_CLIP_SPEED,
  MIN_CLIP_SPEED,
  movedVideoClip,
  videoClipEndFrame,
  withClipSpeed,
  withHold,
} from '@quar/animation';
import type { VideoClip, VideoNode } from '@quar/types';
import type { SceneGraphLike } from '../../stores/editorStore';
import { useEditorStore } from '../../stores/editorStore';
import { withClipLoop } from '../../stores/videoClipActions';
import styles from './PropertiesPanel.module.css';

/** Seconds as a length: m:ss.s, and h:mm:ss.s from an hour. */
export function formatVideoLength(seconds: number): string {
  const tenths = Math.round(Math.max(0, seconds) * 10);
  const minutes = Math.floor(tenths / 600);
  const secs = ((tenths % 600) / 10).toFixed(1).padStart(4, '0');
  if (minutes < 60) return `${minutes}:${secs}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${secs}`;
}

/** The speeds a click away. */
const SPEED_PRESETS = [0.5, 1, 2];

/** "2", "0.5", "1.25" */
const shownSpeed = (speed: number) => String(Math.round(speed * 100) / 100);

export function VideoSection({
  node,
  sceneGraph,
}: {
  node: VideoNode;
  /** The panel's scene graph, its edits undo steps */
  sceneGraph: SceneGraphLike;
}) {
  const video = useEditorStore((state) => state.videos.find((v) => v.id === node.videoId));
  const frameRate = useEditorStore((state) => state.frameRate);

  const { clip } = node;
  const clipFrames = Math.round(videoClipEndFrame(clip, frameRate) - clip.start);
  const speed = clipSpeed(clip);
  const still = video?.strip.frames[0];
  const aspect = video && video.height > 0 ? video.width / video.height : 16 / 9;
  const change = (edit: (c: VideoClip) => VideoClip) =>
    useEditorStore.getState().updateVideoClip(sceneGraph, node.id, edit);

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

        {video && (
          <dl className={styles.videoFacts}>
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
            {video.hasAlpha && (
              <div className={styles.videoFact}>
                <dt>Alpha</dt>
                <dd className={styles.videoTransparent} data-testid="video-transparent">
                  <span className={styles.videoAlphaChip} aria-hidden="true" />
                  Transparent
                </dd>
              </div>
            )}
          </dl>
        )}

        <div className={`${styles.videoClip} ${video ? styles.videoFactClip : ''}`}>
          <div className={styles.videoClipRow}>
            <label className={styles.videoClipLabel} htmlFor="video-clip-start-field">
              Starts
            </label>
            <ClipField
              id="video-clip-start-field"
              value={clip.start}
              shown={String}
              fit={(frame) => Math.max(0, Math.round(frame))}
              step={1}
              bigStep={10}
              unit="frame"
              label="The frame it starts on"
              onCommit={(frame) => change((c) => movedVideoClip(c, frame))}
              testId="video-clip-start"
            />
          </div>

          <div className={styles.videoClipRow}>
            <label className={styles.videoClipLabel} htmlFor="video-clip-speed-field">
              Speed
            </label>
            <div className={styles.videoSpeed}>
              <div className={styles.alignToggle} role="group" aria-label="Speeds">
                {SPEED_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`${styles.alignOption} ${styles.videoSpeedOption} ${speed === preset ? styles.alignOptionActive : ''}`}
                    onClick={() => change((c) => withClipSpeed(c, preset))}
                    aria-pressed={speed === preset}
                    data-testid={`video-section-speed-${preset}`}
                  >
                    {shownSpeed(preset)}×
                  </button>
                ))}
              </div>
              <ClipField
                id="video-clip-speed-field"
                value={speed}
                shown={shownSpeed}
                fit={(next) => Math.min(MAX_CLIP_SPEED, Math.max(MIN_CLIP_SPEED, next))}
                step={0.05}
                bigStep={0.25}
                unit="×"
                label="How fast it plays: 2 is twice as fast, 0.5 half"
                onCommit={(next) => change((c) => withClipSpeed(c, next))}
                testId="video-section-speed"
              />
            </div>
          </div>

          <div className={styles.videoClipToggles}>
            <label className={styles.videoClipToggle}>
              <input
                type="checkbox"
                checked={clip.loop === true}
                onChange={(e) => {
                  const on = e.target.checked;
                  change((c) => withClipLoop(c, on, video));
                }}
                data-testid="video-section-loop"
              />
              Loop
            </label>
            <label className={styles.videoClipToggle}>
              <input
                type="checkbox"
                checked={clip.holdLastFrame === true}
                onChange={(e) => {
                  const on = e.target.checked;
                  change((c) => withHold(c, on));
                }}
                data-testid="video-section-hold"
              />
              Hold last frame
            </label>
          </div>

          <dl className={styles.videoFacts}>
            <div className={styles.videoFact}>
              <dt>Plays</dt>
              <dd data-testid="video-clip-length">
                {formatVideoLength(clipSeconds(clip))}
                <span className={styles.videoFactUnit}>
                  {' · '}
                  {clipFrames} {clipFrames === 1 ? 'frame' : 'frames'}
                </span>
              </dd>
            </div>
            <div className={styles.videoFact}>
              <dt>Part</dt>
              <dd
                data-testid="video-clip-part"
                title="The part of the video it plays: drag the ends of its bar on the timeline to trim it"
              >
                {formatVideoLength(clip.offset)} – {formatVideoLength(clip.offset + clip.duration)}
                <span className={styles.videoFactUnit}>
                  {clip.loop ? ', looped' : video ? ` of ${formatVideoLength(video.duration)}` : ''}
                </span>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

/**
 * A number of the clip's, typed and set on Enter or leaving the field (kept
 * to what it can be by `fit`; nonsense goes back to what it was), or
 * stepped by the arrow keys (Shift: `bigStep`).
 */
function ClipField({
  id,
  value,
  shown,
  fit,
  step,
  bigStep,
  unit,
  label,
  onCommit,
  testId,
}: {
  id: string;
  value: number;
  shown: (value: number) => string;
  fit: (value: number) => number;
  step: number;
  bigStep: number;
  unit: string;
  label: string;
  onCommit: (value: number) => void;
  testId: string;
}) {
  const [draft, setDraft] = useState(shown(value));
  useEffect(() => setDraft(shown(value)), [shown, value]);

  const keep = (next: number) => {
    if (!Number.isFinite(next)) {
      setDraft(shown(value));
      return;
    }
    const fitted = fit(next);
    setDraft(shown(fitted));
    if (fitted !== value) onCommit(fitted);
  };

  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      keep(parseFloat(e.currentTarget.value));
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setDraft(shown(value));
      e.currentTarget.blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const by = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? bigStep : step);
      keep(Math.round((value + by) * 100) / 100);
    }
  };

  return (
    <div className={styles.inputGroup}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        className={styles.input}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => keep(parseFloat(e.target.value))}
        onKeyDown={key}
        title={label}
        data-testid={testId}
      />
      <span className={styles.inputUnit} aria-hidden="true">
        {unit}
      </span>
    </div>
  );
}
