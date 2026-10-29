/**
 * Video Clip Bar
 * A video layer's clip on its own row of the timeline: a strip of the
 * video's stills from the frame it starts on to the frame it ends, under the
 * row's keyframes, dragged (or nudged with the arrow keys) to move it, its
 * ends dragged to trim it (a looped clip's right end to make it longer, past
 * the video's end), its linked sound with it. A looped clip shows where each
 * pass starts over, a clip holding its last frame shows it held to the end
 * of the timeline, and one that isn't at 1× its speed. Double-clicked (or
 * Enter, or its row's menu), its settings card sets its speed, loop and
 * hold, and unlinks its sound. It follows the clip through the scene graph
 * on its own, so the timeline's rows aren't rebuilt for it, nor redrawn as
 * the animation plays.
 */

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Film, Repeat, Unlink } from 'lucide-react';
import {
  clipMomentAt,
  clipSeconds,
  clipSpeed,
  MAX_CLIP_SPEED,
  MIN_CLIP_SPEED,
  movedVideoClip,
  trimmedVideoEnd,
  trimmedVideoStart,
  videoClipEndFrame,
  withClipSpeed,
  withHold,
  withLoop,
} from '@quar/animation';
import type { Video, VideoClip } from '@quar/types';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import { isPosingScene } from '../../stores/scenePosing';
import { findLinkedSound } from '../../stores/videoSounds';
import styles from './VideoClipBar.module.css';

/** The bar's picture strip, in pixels high (the bar less its film edges). */
const STILL_HEIGHT = 13;
/** At most this many stills along a bar, however wide it's zoomed. */
const MAX_STILLS = 160;
/** Where a looped clip starts over is marked when the marks are this far apart, in pixels. */
const MIN_LOOP_MARK_GAP = 3;
/** At most this many of those marks along a bar. */
const MAX_LOOP_MARKS = 400;

/** What the bar shows of a video layer: which video, and its clip. */
interface ShownLayer {
  videoId: string;
  name: string;
  clip: VideoClip;
}

/** Whether two clips play alike: the same start, part, speed, loop and hold. */
function sameClip(a: VideoClip, b: VideoClip): boolean {
  return (
    a.start === b.start &&
    a.offset === b.offset &&
    a.duration === b.duration &&
    a.speed === b.speed &&
    a.loop === b.loop &&
    a.loopFor === b.loopFor &&
    a.holdLastFrame === b.holdLastFrame
  );
}

/** The video layer's video and clip, kept as the scene graph changes them. */
function useVideoLayer(nodeId: string): ShownLayer | null {
  const sceneGraph = useSceneGraph();
  const read = useCallback((): ShownLayer | null => {
    const node = sceneGraph.getNode(nodeId);
    return node?.type === 'video'
      ? { videoId: node.videoId, name: node.name, clip: node.clip }
      : null;
  }, [sceneGraph, nodeId]);
  const [layer, setLayer] = useState(read);
  useEffect(() => {
    const update = () =>
      setLayer((shown) => {
        const now = read();
        const same =
          shown !== null &&
          now !== null &&
          shown.videoId === now.videoId &&
          shown.name === now.name &&
          sameClip(shown.clip, now.clip);
        return same || (shown === null && now === null) ? shown : now;
      });
    update();
    // Showing the animation moves the layer, never its clip (see isPosingScene)
    const offChanged = sceneGraph.on('nodeChanged', (event) => {
      if (event.nodeId === nodeId && !isPosingScene()) update();
    });
    // Undo, redo and opening a project replace the whole graph
    const offReplaced = sceneGraph.on('graphReplaced', update);
    return () => {
      offChanged();
      offReplaced();
    };
  }, [sceneGraph, nodeId, read]);
  return layer;
}

/** An element's width in pixels, kept as it's resized (the timeline zoomed). */
function useWidth(ref: React.RefObject<HTMLElement>, deps: unknown[]): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measured again when what sizes it changes
  }, deps);
  return width;
}

/** "2.5 s" */
function seconds(value: number): string {
  return `${(Math.round(value * 10) / 10).toFixed(1)} s`;
}

/** "2×", "0.5×", "1.41×" */
export function speedLabel(speed: number): string {
  return `${Math.round(speed * 100) / 100}×`;
}

/** The strip's still showing the moment `time` of the video (none without a strip). */
function stillAt(video: Video | undefined, time: number): string | undefined {
  const frames = video?.strip.frames ?? [];
  if (!video || frames.length === 0) return undefined;
  const rate = video.strip.rate > 0 ? video.strip.rate : 1;
  return frames[Math.min(frames.length - 1, Math.max(0, Math.floor(time * rate + 1e-6)))];
}

/**
 * The stills along `width` pixels of a clip showing the first `length`
 * seconds of its timeline: each the strip's picture at the moment of the
 * video it starts at (at the clip's speed, each pass of a looped one over).
 */
function stillsAlong(video: Video | undefined, clip: VideoClip, length: number, width: number) {
  if (!video || video.strip.frames.length === 0 || !(width > 0) || !(length > 0)) return [];
  const aspect = Math.min(4, Math.max(0.25, video.width / Math.max(1, video.height) || 16 / 9));
  const tile = STILL_HEIGHT * aspect;
  const count = Math.min(MAX_STILLS, Math.ceil(width / tile));
  return Array.from({ length: count }, (_, i) => {
    const time = clipMomentAt(clip, ((i * tile) / width) * length);
    return { left: i * tile, width: tile, src: stillAt(video, time) ?? '' };
  });
}

/**
 * Where a looped clip starts over, as fractions of the bar drawn from
 * `shownStart` to `shownEnd`: none when they'd be too close together to
 * see apart on a bar `width` pixels wide.
 */
function loopMarks(
  clip: VideoClip,
  frameRate: number,
  shownStart: number,
  shownEnd: number,
  width: number
): number[] {
  if (!clip.loop) return [];
  const pass = (Math.max(0, clip.duration) / clipSpeed(clip)) * Math.max(1, frameRate);
  const span = shownEnd - shownStart;
  if (!(pass > 0) || !(span > 0) || (pass / span) * width < MIN_LOOP_MARK_GAP) return [];
  const end = Math.min(videoClipEndFrame(clip, frameRate), shownEnd);
  const marks: number[] = [];
  for (let at = clip.start + pass; at < end - 1e-6 && marks.length < MAX_LOOP_MARKS; at += pass) {
    marks.push((at - shownStart) / span);
  }
  return marks;
}

// ============================================================================
// Opening a clip's settings from its row's menu
// ============================================================================

/** The bars on the timeline, by their layer: each opens its settings card at a point. */
const settingsOpeners = new Map<string, (x: number, y: number) => void>();

/**
 * Open a video layer's clip settings at a point of the screen (its row's
 * menu does). False when its bar isn't on the timeline.
 */
export function openVideoClipSettings(nodeId: string, x: number, y: number): boolean {
  const open = settingsOpeners.get(nodeId);
  open?.(x, y);
  return open !== undefined;
}

// ============================================================================
// The bar
// ============================================================================

interface Drag {
  mode: 'move' | 'start' | 'end';
  original: VideoClip;
  downFrame: number;
  changed: boolean;
}

/** The ends of the bar a drag can trim (their `data-edge`). */
const EDGES = new Set<string>(['start', 'end']);

/**
 * The clip as a drag `delta` frames on has made it: moved, or trimmed at
 * either end, a frame at a time — no further than the video's end
 * (`videoDuration` seconds) unless it loops.
 */
function dragged(drag: Drag, delta: number, frameRate: number, videoDuration?: number): VideoClip {
  const { original } = drag;
  switch (drag.mode) {
    case 'move':
      return movedVideoClip(original, original.start + delta);
    case 'start':
      return trimmedVideoStart(original, original.start + delta, frameRate);
    case 'end':
      return trimmedVideoEnd(
        original,
        videoClipEndFrame(original, frameRate) + delta,
        frameRate,
        videoDuration ?? original.offset + original.duration
      );
  }
}

export const VideoClipBar = memo(function VideoClipBar({
  nodeId,
  duration,
}: {
  nodeId: string;
  /** The timeline's length in frames: the row's width */
  duration: number;
}) {
  const sceneGraph = useSceneGraph();
  const layer = useVideoLayer(nodeId);
  const video = useEditorStore((s) =>
    layer ? s.videos.find((candidate) => candidate.id === layer.videoId) : undefined
  );
  const frameRate = useEditorStore((s) => s.frameRate);
  const selected = useEditorStore((s) => s.selectedNodeIds.has(nodeId));
  const linked = useEditorStore((s) => findLinkedSound(s.timeline, nodeId) !== null);
  const barRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<Drag['mode'] | null>(null);
  const [settings, setSettings] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const open = (x: number, y: number) => setSettings({ x, y });
    settingsOpeners.set(nodeId, open);
    return () => {
      if (settingsOpeners.get(nodeId) === open) settingsOpeners.delete(nodeId);
    };
  }, [nodeId]);

  const clip = layer?.clip;
  const end = clip ? videoClipEndFrame(clip, frameRate) : 0;
  // Drawn no further than the timeline runs (it lengthens as a drag ends past it)
  const shownStart = clip ? Math.min(clip.start, Math.max(0, duration - 1)) : 0;
  const shownEnd = Math.max(shownStart + 1, Math.min(end, duration));
  const cut = end > duration;
  const width = useWidth(barRef, [shownStart, shownEnd, duration]);
  const shownSeconds = clip ? Math.max(0, (shownEnd - clip.start) / Math.max(1, frameRate)) : 0;
  const stills = clip ? stillsAlong(video, clip, shownSeconds, width) : [];
  const marks = clip ? loopMarks(clip, frameRate, shownStart, shownEnd, width) : [];

  /** The frame under the pointer, on the row (the bar's parent) that spans the timeline. */
  const frameAt = useCallback(
    (clientX: number) => {
      const rect = barRef.current?.parentElement?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return 0;
      return ((clientX - rect.left) / rect.width) * duration;
    },
    [duration]
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !clip) return;
      event.stopPropagation();
      const edge = (event.target as HTMLElement).dataset.edge ?? '';
      const mode = EDGES.has(edge) ? (edge as Drag['mode']) : 'move';
      dragRef.current = { mode, original: clip, downFrame: frameAt(event.clientX), changed: false };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDragging(mode);
      // Its layer selected, as a click on the canvas would (a selection with it in stays)
      const state = useEditorStore.getState();
      if (!state.selectedNodeIds.has(nodeId)) state.setSelection([nodeId]);
    },
    [clip, frameAt, nodeId]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = dragged(
        drag,
        frameAt(event.clientX) - drag.downFrame,
        frameRate,
        video?.duration
      );
      // One undo step for the whole drag, recorded as it first changes the clip;
      // the timeline lengthened as it ends, so the frames under the pointer stay put
      const node = sceneGraph.getNode(nodeId);
      const before = node?.type === 'video' ? node.clip : null;
      useEditorStore
        .getState()
        .updateVideoClip(sceneGraph, nodeId, () => next, !drag.changed, false);
      const after = sceneGraph.getNode(nodeId);
      if (after?.type === 'video' && after.clip !== before) drag.changed = true;
    },
    [frameAt, frameRate, sceneGraph, nodeId, video?.duration]
  );

  const onPointerUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(null);
    if (drag?.changed) useEditorStore.getState().fitTimelineToVideoClip(sceneGraph, nodeId);
  }, [sceneGraph, nodeId]);

  const openSettings = useCallback((element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setSettings({ x: rect.left, y: rect.top - 8 });
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!clip) return;
      if (event.key === 'Enter') {
        openSettings(event.currentTarget);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const step = (event.shiftKey ? 10 : 1) * (event.key === 'ArrowLeft' ? -1 : 1);
        const state = useEditorStore.getState();
        state.moveVideoClip(sceneGraph, nodeId, clip.start + step);
        state.fitTimelineToVideoClip(sceneGraph, nodeId);
      } else {
        return;
      }
      // Not also the timeline's own keys
      event.preventDefault();
      event.stopPropagation();
    },
    [clip, openSettings, sceneGraph, nodeId]
  );

  if (!layer || !clip) return null;
  const name = video?.name ?? (layer.name || 'Video');
  const lastFrame = Math.max(clip.start, Math.ceil(end) - 1);
  const frames = Math.max(1, lastFrame - clip.start + 1);
  const speed = clipSpeed(clip);
  const fast = speed !== 1 ? speedLabel(speed) : '';
  const held = clip.holdLastFrame === true && end < duration;
  const heldStill = held
    ? stillAt(video, clipMomentAt(clip, Math.max(0, clipSeconds(clip) - 1e-6)))
    : undefined;
  return (
    <>
      <div
        ref={barRef}
        role="button"
        tabIndex={0}
        className={[
          styles.bar,
          selected ? styles.selected : '',
          dragging === 'move' ? styles.dragging : '',
          dragging === 'start' || dragging === 'end' ? styles.trimming : '',
          cut ? styles.cut : '',
          clip.loop ? styles.looped : '',
          video ? '' : styles.missing,
        ].join(' ')}
        style={{
          left: `${(shownStart / duration) * 100}%`,
          width: `${((shownEnd - shownStart) / duration) * 100}%`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onDoubleClick={(event) => openSettings(event.currentTarget)}
        aria-label={[
          `Video ${name}, frames ${clip.start} to ${lastFrame}`,
          fast ? `at ${fast}` : '',
          clip.loop ? 'looped' : '',
          clip.holdLastFrame ? 'holds its last frame' : '',
        ]
          .filter(Boolean)
          .join(', ')}
        aria-pressed={selected}
        title={[
          `${name}: from frame ${clip.start}, ${seconds(clip.duration)}`,
          fast ? ` of the video at ${fast}` : '',
          ` (${frames} frames)`,
          clip.loop ? `, loops every ${seconds(clip.duration / speed)}` : '',
          clip.holdLastFrame ? ', holding its last frame after it' : '',
          cut ? ', running past the end of the timeline' : '',
          `. Drag to move it${linked ? ' with its sound' : ''}, its ends to trim it`,
          clip.loop ? ' (its right end to loop it longer)' : '',
          '; double-click for speed, loop and hold; ← and → nudge it.',
        ].join('')}
        data-testid={`video-clip-${nodeId}`}
      >
        <div className={styles.strip} aria-hidden="true">
          {stills.map((still) => (
            <img
              key={still.left}
              className={styles.still}
              src={still.src}
              alt=""
              draggable={false}
              decoding="async"
              style={{ left: still.left, width: still.width }}
            />
          ))}
        </div>
        {marks.map((at) => (
          <span
            key={at}
            className={styles.loopMark}
            style={{ left: `${at * 100}%` }}
            aria-hidden="true"
            data-testid="video-clip-loop-mark"
          />
        ))}
        <span className={styles.name}>
          <Film className={styles.icon} aria-hidden="true" />
          {name}
          {clip.loop && <Repeat className={styles.icon} aria-hidden="true" />}
          {fast && <span className={styles.speed}>{fast}</span>}
        </span>
        <span className={styles.edgeStart} data-edge="start" aria-hidden="true" />
        <span className={styles.edgeEnd} data-edge="end" aria-hidden="true" />
      </div>
      {held && (
        <div
          className={styles.hold}
          style={{
            left: `${(end / duration) * 100}%`,
            width: `${((duration - end) / duration) * 100}%`,
          }}
          aria-hidden="true"
          data-testid={`video-clip-hold-${nodeId}`}
        >
          {heldStill && (
            <img className={styles.holdStill} src={heldStill} alt="" draggable={false} />
          )}
        </div>
      )}
      {settings && (
        <VideoClipSettings
          nodeId={nodeId}
          clip={clip}
          video={video}
          name={name}
          frameRate={frameRate}
          x={settings.x}
          y={settings.y}
          onClose={() => setSettings(null)}
        />
      )}
    </>
  );
});

// ============================================================================
// A clip's settings
// ============================================================================

/** The speeds a click away. */
const SPEED_PRESETS = [0.5, 1, 2];

interface VideoClipSettingsProps {
  nodeId: string;
  clip: VideoClip;
  video: Video | undefined;
  name: string;
  frameRate: number;
  x: number;
  y: number;
  onClose: () => void;
}

function VideoClipSettings({
  nodeId,
  clip,
  video,
  name,
  frameRate,
  x,
  y,
  onClose,
}: VideoClipSettingsProps) {
  const sceneGraph = useSceneGraph();
  const linkedClipId = useEditorStore((s) => findLinkedSound(s.timeline, nodeId)?.clip.id);
  const cardRef = useRef<HTMLDivElement>(null);
  // A slide of the speed is one undo step
  const slidingRef = useRef(false);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    // Above the clip where it fits, kept on screen
    const top =
      y - rect.height < 8
        ? Math.min(window.innerHeight - rect.height - 8, y + 40)
        : y - rect.height;
    card.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    card.style.top = `${Math.max(8, top)}px`;
    card.querySelector<HTMLInputElement>('input')?.focus();
  }, [x, y]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const update = (change: (c: VideoClip) => VideoClip, undoable = true) =>
    useEditorStore.getState().updateVideoClip(sceneGraph, nodeId, change, undoable);
  const endSlide = () => (slidingRef.current = false);

  const speed = clipSpeed(clip);
  const lastFrame = Math.max(clip.start, Math.ceil(videoClipEndFrame(clip, frameRate)) - 1);

  // Its events go no further than it: in React they'd reach the timeline row it's drawn from
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();

  return createPortal(
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- only keeps its clicks to itself
    <div className={styles.settingsLayer} onClick={stop} onContextMenu={stop}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Escape closes it too */}
      <div className={styles.overlay} onPointerDown={onClose} />
      <div
        ref={cardRef}
        className={styles.settings}
        role="dialog"
        aria-label={`Video clip settings: ${name}`}
        data-testid="video-clip-settings"
      >
        <div className={styles.settingsHeader}>
          <Film className={styles.settingsIcon} aria-hidden="true" />
          <div className={styles.settingsTitle}>
            <strong>{name}</strong>
            <span>
              Frames {clip.start}–{lastFrame}
            </span>
            <span>
              Plays {(Math.round(clip.offset * 10) / 10).toFixed(1)}–
              {seconds(clip.offset + clip.duration)}
              {video ? ` of ${seconds(video.duration)}` : ''}
            </span>
          </div>
        </div>

        <div className={styles.speedHeader}>
          <span>Speed</span>
          <output className={styles.speedValue} data-testid="video-clip-speed-value">
            {speedLabel(speed)}
          </output>
        </div>
        <input
          className={styles.speedSlider}
          type="range"
          min={Math.log2(MIN_CLIP_SPEED)}
          max={Math.log2(MAX_CLIP_SPEED)}
          step={0.01}
          value={Math.log2(speed)}
          onChange={(event) => {
            const next = Math.round(2 ** Number(event.target.value) * 100) / 100;
            update((c) => withClipSpeed(c, next), !slidingRef.current);
            slidingRef.current = true;
          }}
          onPointerUp={endSlide}
          onKeyUp={endSlide}
          onBlur={endSlide}
          aria-label="Speed"
          aria-valuetext={speedLabel(speed)}
          data-testid="video-clip-speed"
        />
        <div className={styles.speedScale} aria-hidden="true">
          <span>{speedLabel(MIN_CLIP_SPEED)}</span>
          <span>1×</span>
          <span>{speedLabel(MAX_CLIP_SPEED)}</span>
        </div>
        <div className={styles.speedRow}>
          <div className={styles.speedPresets} role="group" aria-label="Speeds">
            {SPEED_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset}
                className={`${styles.speedPreset} ${speed === preset ? styles.speedPresetOn : ''}`}
                onClick={() => update((c) => withClipSpeed(c, preset))}
                aria-pressed={speed === preset}
                data-testid={`video-clip-speed-${preset}`}
              >
                {speedLabel(preset)}
              </button>
            ))}
          </div>
          <SpeedField value={speed} onCommit={(next) => update((c) => withClipSpeed(c, next))} />
        </div>

        <div className={styles.toggles}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={clip.loop === true}
              onChange={(event) => {
                const on = event.target.checked;
                update((c) => withLoop(c, on));
              }}
              data-testid="video-clip-loop"
            />
            <span>
              Loop
              <small>
                {clip.loop ? 'Drag its right end to play it longer' : 'Start over at its end'}
              </small>
            </span>
          </label>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={clip.holdLastFrame === true}
              onChange={(event) => {
                const on = event.target.checked;
                update((c) => withHold(c, on));
              }}
              data-testid="video-clip-hold"
            />
            <span>
              Hold last frame
              <small>Keep showing it after the clip ends</small>
            </span>
          </label>
        </div>

        {linkedClipId !== undefined && (
          <div className={styles.settingsActions}>
            <span className={styles.settingsNote}>Its sound moves, trims and speeds with it</span>
            <button
              type="button"
              className={styles.unlinkButton}
              onClick={() => useEditorStore.getState().unlinkSoundClip(sceneGraph, linkedClipId)}
              data-testid="video-clip-unlink"
            >
              <Unlink aria-hidden="true" />
              Unlink Sound
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/** A speed typed in (×), set when it's entered (Enter or leaving the field): one undo step. */
function SpeedField({ value, onCommit }: { value: number; onCommit: (speed: number) => void }) {
  const shown = String(Math.round(value * 100) / 100);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const commit = () => {
    const speed = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(speed) && speed > 0) onCommit(speed);
    // What it's set to shows once it is (a speed out of range, as far as it goes)
    setDraft(shown);
  };
  return (
    <label className={styles.speedField}>
      <input
        type="number"
        min={MIN_CLIP_SPEED}
        max={MAX_CLIP_SPEED}
        step={0.05}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
        aria-label="Speed, as a multiple"
        data-testid="video-clip-speed-field"
      />
      <span className={styles.speedUnit}>×</span>
    </label>
  );
}
