/**
 * Sound Lane
 * The timeline's row of sound clips, kept in view below the layers: each
 * clip a bar with its waveform as long as it plays (at its speed, a pass at
 * a time when it's looped, where it starts over marked), dragged to move
 * it, its ends dragged to trim it (a looped clip's right end to make it
 * longer, past the sound's end), its top corners dragged to fade it in and
 * out, its speed, loop, volume, fades and mute in a small settings card. A
 * video's sound is moved, trimmed, sped up and looped with its video until
 * it's unlinked. Sound files dropped on the timeline land where they're
 * dropped.
 */

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  HeadphoneOff,
  Headphones,
  Link2,
  Music,
  Plus,
  Repeat,
  Trash2,
  VolumeX,
} from 'lucide-react';
import {
  clipEndFrame,
  clipFades,
  clipLevel,
  clipSeconds,
  clipSpeed,
  fadedClip,
  movedClip,
  scopeSounds,
  soundRows,
  trimmedEnd,
  trimmedStart,
  withClipSpeed,
  withLoop,
} from '@quar/animation';
import type { ClipShape } from '@quar/animation';
import type { Sound, SoundClip } from '@quar/types';
import { useEditorStore } from '../../stores/editorStore';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { decodedSound, isSoundFile, soundPeaks, waveformPath } from '../../services/soundFiles';
import { chooseSoundFiles, importSoundFiles } from '../../services/soundImport';
import { importVideoFiles, isVideoFile } from '../../services/videoImport';
import { ContextMenu } from '../common/ContextMenu';
import type { ContextMenuEntry } from '../common/ContextMenu';
import styles from './SoundLane.module.css';

/** A row of the lane, in pixels (clips playing together take a row each). */
export const SOUND_ROW_HEIGHT = 32;

/** The clips on the timeline in view, and the row each shows in. */
function useLaneClips() {
  const timeline = useEditorStore((s) => s.timeline);
  const scope = useEditorStore((s) => s.timelineScope);
  const clips = useMemo(() => scopeSounds(timeline, scope), [timeline, scope]);
  const layout = useMemo(() => soundRows(clips, timeline.frameRate), [clips, timeline.frameRate]);
  return { clips, frameRate: timeline.frameRate, ...layout };
}

/** "2.5 s" */
function seconds(value: number): string {
  return `${(Math.round(value * 10) / 10).toFixed(1)} s`;
}

/** "2×", "0.5×", "1.41×" */
function speedLabel(speed: number): string {
  return `${Math.round(speed * 100) / 100}×`;
}

/** The speeds a clip's settings offer at a click. */
const SPEED_PRESETS = [0.5, 1, 2] as const;

// ============================================================================
// The label beside the lane
// ============================================================================

export function SoundLaneLabel() {
  const sceneGraph = useSceneGraph();
  const { count } = useLaneClips();
  const scrubSounds = useEditorStore((s) => s.scrubSounds);
  const setScrubSounds = useEditorStore((s) => s.setScrubSounds);
  return (
    <div
      className={styles.label}
      style={{ height: count * SOUND_ROW_HEIGHT }}
      data-testid="sound-lane-label"
    >
      <Music className={styles.labelIcon} aria-hidden="true" />
      <span className={styles.labelText}>Sound</span>
      <button
        type="button"
        className={`${styles.addButton} ${scrubSounds ? styles.scrubOn : ''}`}
        onClick={() => setScrubSounds(!scrubSounds)}
        aria-label="Hear sounds while scrubbing"
        aria-pressed={scrubSounds}
        title={
          scrubSounds
            ? 'Sounds are heard as you drag or step the playhead. Click to turn this off.'
            : 'Hear the sounds at the playhead as you drag or step it'
        }
        data-testid="sound-lane-scrub"
      >
        {scrubSounds ? <Headphones aria-hidden="true" /> : <HeadphoneOff aria-hidden="true" />}
      </button>
      <button
        type="button"
        className={styles.addButton}
        onClick={() => chooseSoundFiles((files) => void importSoundFiles(sceneGraph, files))}
        aria-label="Import sound"
        title="Import sound files onto the timeline, at the playhead"
        data-testid="sound-lane-import"
      >
        <Plus aria-hidden="true" />
      </button>
    </div>
  );
}

// ============================================================================
// Dropping sound (and video) files on the timeline
// ============================================================================

/** Whether a drag carries files (their kinds aren't known until they're dropped). */
function carriesFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files');
}

/**
 * Handlers for an element of the timeline that takes sound files: each
 * dropped lands at the frame under the pointer (`frameAt`). Video files
 * dropped there go on the canvas, their clips (and sounds) from that frame.
 */
export function useSoundDrop(frameAt: (clientX: number) => number) {
  const sceneGraph = useSceneGraph();
  const [dropFrame, setDropFrame] = useState<number | null>(null);
  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setDropFrame(Math.max(0, Math.round(frameAt(event.clientX))));
    },
    [frameAt]
  );
  const onDragLeave = useCallback((event: React.DragEvent) => {
    // Still over the element when moving onto one of its children
    if (event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) return;
    setDropFrame(null);
  }, []);
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      setDropFrame(null);
      const files = Array.from(event.dataTransfer.files);
      const frame = Math.max(0, Math.round(frameAt(event.clientX)));
      const sounds = files.filter(isSoundFile);
      if (sounds.length > 0) void importSoundFiles(sceneGraph, sounds, frame);
      const videos = files.filter(isVideoFile);
      if (videos.length > 0) void importVideoFiles(sceneGraph, videos, frame);
    },
    [frameAt, sceneGraph]
  );
  return { dropFrame, handlers: { onDragOver, onDragLeave, onDrop } };
}

// ============================================================================
// The lane
// ============================================================================

interface Drag {
  clipId: string;
  mode: 'move' | 'start' | 'end' | 'fade-in' | 'fade-out';
  original: SoundClip;
  downFrame: number;
  changed: boolean;
}

const DRAG_MODES = new Set<string>(['start', 'end', 'fade-in', 'fade-out']);

/** The clip as a drag `delta` frames on has made it: moved, trimmed or faded, a frame at a time. */
function dragged(drag: Drag, delta: number, frameRate: number, soundDuration?: number): SoundClip {
  const { original } = drag;
  const rate = Math.max(1, frameRate);
  const fades = clipFades(original);
  switch (drag.mode) {
    case 'move':
      return movedClip(original, original.start + delta);
    case 'start':
      return trimmedStart(original, original.start + delta, rate);
    case 'end':
      return trimmedEnd(
        original,
        clipEndFrame(original, rate) + delta,
        rate,
        soundDuration ?? original.offset + original.duration
      );
    case 'fade-in':
      return fadedClip(original, { fadeIn: Math.round(fades.fadeIn * rate + delta) / rate });
    case 'fade-out':
      return fadedClip(original, { fadeOut: Math.round(fades.fadeOut * rate - delta) / rate });
  }
}

export function SoundLaneTrack({
  duration,
  dropFrame,
}: {
  duration: number;
  dropFrame: number | null;
}) {
  const sceneGraph = useSceneGraph();
  const { clips, rows, count, frameRate } = useLaneClips();
  const sounds = useEditorStore((s) => s.sounds);
  const selectedId = useEditorStore((s) => s.selectedSoundClipId);
  const laneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    clipId: string | null;
    frame: number;
  } | null>(null);
  const [settings, setSettings] = useState<{ clipId: string; x: number; y: number } | null>(null);

  const library = useMemo(() => new Map(sounds.map((sound) => [sound.id, sound])), [sounds]);

  const frameAt = useCallback(
    (clientX: number) => {
      const rect = laneRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return 0;
      return ((clientX - rect.left) / rect.width) * duration;
    },
    [duration]
  );

  // How wide a frame is, to tell when a looped clip's passes are too close to mark
  const [laneWidth, setLaneWidth] = useState(0);
  useLayoutEffect(() => {
    const lane = laneRef.current;
    if (!lane) return;
    const measure = () => setLaneWidth(lane.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(lane);
    return () => observer.disconnect();
  }, []);
  const frameWidth = duration > 0 ? laneWidth / duration : 0;

  const store = useEditorStore.getState;
  const change = useCallback(
    (clipId: string, edit: (clip: SoundClip) => SoundClip) =>
      store().updateSoundClip(sceneGraph, clipId, edit),
    [sceneGraph, store]
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent, clip: SoundClip) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      const edge = (event.target as HTMLElement).dataset.edge ?? '';
      dragRef.current = {
        clipId: clip.id,
        mode: DRAG_MODES.has(edge) ? (edge as Drag['mode']) : 'move',
        original: clip,
        downFrame: frameAt(event.clientX),
        changed: false,
      };
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
      store().selectSoundClip(clip.id);
    },
    [frameAt, store]
  );

  /** How far into its sound a clip's end can go: the sound's end, and its video's when it's a video's sound. */
  const soundLength = useCallback(
    (clip: SoundClip): number | undefined => {
      let longest = library.get(clip.soundId)?.duration;
      const layer = clip.linkedTo !== undefined ? sceneGraph.getNode(clip.linkedTo) : undefined;
      if (layer?.type === 'video') {
        const video = store().videos.find((candidate) => candidate.id === layer.videoId);
        if (video) longest = Math.min(longest ?? video.duration, video.duration);
      }
      return longest;
    },
    [library, sceneGraph, store]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = frameAt(event.clientX) - drag.downFrame;
      const next = dragged(drag, delta, frameRate, soundLength(drag.original));
      // One undo step for the whole drag, recorded as it first changes something;
      // the timeline lengthened as it ends (now, the frame under the pointer would move)
      const before = useEditorStore.getState().timeline;
      store().updateSoundClip(sceneGraph, drag.clipId, () => next, !drag.changed, false);
      if (useEditorStore.getState().timeline !== before) drag.changed = true;
    },
    [frameAt, frameRate, sceneGraph, soundLength, store]
  );

  const onPointerUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.changed) store().fitTimelineToSoundClip(drag.clipId);
  }, [store]);

  const openSettings = useCallback((clipId: string, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setSettings({ clipId, x: rect.left, y: rect.top - 8 });
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent, clip: SoundClip) => {
      const step = event.shiftKey ? 10 : 1;
      let handled = true;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        store().removeSoundClip(sceneGraph, clip.id);
      } else if (event.key === 'ArrowLeft') {
        change(clip.id, (c) => movedClip(c, c.start - step));
      } else if (event.key === 'ArrowRight') {
        change(clip.id, (c) => movedClip(c, c.start + step));
      } else if (event.key === 'm' || event.key === 'M') {
        change(clip.id, (c) => ({ ...c, muted: !c.muted }));
      } else if (event.key === 'Enter') {
        openSettings(clip.id, event.currentTarget as HTMLElement);
      } else {
        handled = false;
      }
      // Not also the layers' shortcuts (Delete would delete the selected layers)
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [change, openSettings, sceneGraph, store]
  );

  const menuItems = (): ContextMenuEntry[] => {
    if (!menu) return [];
    const clip = menu.clipId ? clips.find((candidate) => candidate.id === menu.clipId) : undefined;
    if (!clip) {
      return [
        {
          id: 'import-here',
          label: `Import Sound at Frame ${menu.frame}...`,
          onClick: () =>
            chooseSoundFiles((files) => void importSoundFiles(sceneGraph, files, menu.frame)),
        },
      ];
    }
    return [
      {
        id: 'settings',
        label: 'Sound Settings...',
        shortcut: 'Enter',
        onClick: () => setSettings({ clipId: clip.id, x: menu.x, y: menu.y }),
      },
      {
        id: 'mute',
        label: clip.muted ? 'Unmute' : 'Mute',
        shortcut: 'M',
        onClick: () => change(clip.id, (c) => ({ ...c, muted: !c.muted })),
      },
      ...(clip.linkedTo !== undefined
        ? [
            {
              id: 'unlink',
              label: 'Unlink from Video',
              onClick: () => store().unlinkSoundClip(sceneGraph, clip.id),
            },
          ]
        : []),
      { type: 'separator' },
      {
        id: 'delete',
        label: 'Delete',
        shortcut: 'Del',
        danger: true,
        onClick: () => store().removeSoundClip(sceneGraph, clip.id),
      },
    ];
  };

  const settingsClip = settings ? clips.find((clip) => clip.id === settings.clipId) : undefined;

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- clicking the lane deselects; clips take the keys
    <div
      ref={laneRef}
      className={`${styles.lane} ${dropFrame !== null ? styles.dropping : ''}`}
      style={{ height: count * SOUND_ROW_HEIGHT }}
      onClick={(event) => {
        if (event.target === event.currentTarget) store().selectSoundClip(null);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setMenu({
          x: event.clientX,
          y: event.clientY,
          clipId: null,
          frame: Math.max(0, Math.min(duration - 1, Math.round(frameAt(event.clientX)))),
        });
      }}
      data-testid="sound-lane"
    >
      {clips.length === 0 && dropFrame === null && (
        <span className={styles.hint} aria-hidden="true">
          Drop sound files here, or File › Import Sound
        </span>
      )}
      {clips.map((clip) => (
        <SoundClipBar
          key={clip.id}
          clip={clip}
          sound={library.get(clip.soundId)}
          row={rows.get(clip.id) ?? 0}
          duration={duration}
          frameRate={frameRate}
          frameWidth={frameWidth}
          selected={clip.id === selectedId}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={onKeyDown}
          onOpenSettings={openSettings}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            store().selectSoundClip(clip.id);
            setMenu({ x: event.clientX, y: event.clientY, clipId: clip.id, frame: clip.start });
          }}
        />
      ))}
      {dropFrame !== null && (
        <div
          className={styles.dropMarker}
          style={{ left: `${(dropFrame / duration) * 100}%` }}
          data-testid="sound-drop-marker"
        >
          <span>Frame {dropFrame}</span>
        </div>
      )}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems()} onClose={() => setMenu(null)} />
      )}
      {settings && settingsClip && (
        <SoundClipSettings
          clip={settingsClip}
          sound={library.get(settingsClip.soundId)}
          frameRate={frameRate}
          x={settings.x}
          y={settings.y}
          onClose={() => setSettings(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// A clip
// ============================================================================

/** A sound decoded, once it is (null until then, or if it can't be). */
function useDecodedSound(sound: Sound | undefined): AudioBuffer | null {
  const [audio, setAudio] = useState<{ id: string; buffer: AudioBuffer } | null>(null);
  useEffect(() => {
    if (!sound) return;
    let live = true;
    decodedSound(sound).then(
      (buffer) => {
        if (live) setAudio({ id: sound.id, buffer });
      },
      () => undefined
    );
    return () => {
      live = false;
    };
  }, [sound]);
  return audio && audio.id === sound?.id ? audio.buffer : null;
}

/** How many columns a clip's waveform is drawn in (stretched to the clip). */
const WAVE_COLUMNS = 600;
/** A looped clip's waveform is drawn for this many passes at most. */
const MAX_WAVE_PASSES = 64;
/** Where a looped clip starts over is marked when the marks are this far apart, in pixels. */
const MIN_LOOP_MARK_GAP = 3;
/** At most this many of those marks along a clip. */
const MAX_LOOP_MARKS = 400;

/** A pass of a clip's waveform: where it's drawn along the clip (in columns), and its path. */
interface PassWave {
  x: number;
  d: string;
}

/**
 * A clip's waveform as it plays on the timeline, in `columns` columns
 * across it: its part of the sound at its speed, a pass at a time when it's
 * looped (the last cut where it ends), each as loud as it plays there — its
 * volume, through fades over the whole clip.
 */
function clipWaves(
  peaks: Float32Array,
  clip: ClipShape & Pick<SoundClip, 'offset' | 'gain'>,
  columns: number
): PassWave[] {
  const length = clipSeconds(clip);
  const speed = clipSpeed(clip);
  const pass = clip.duration / speed;
  if (!(length > 0) || !(pass > 0)) return [];
  const count = Math.min(MAX_WAVE_PASSES, Math.ceil(length / pass - 1e-9));
  const waves: PassWave[] = [];
  for (let k = 0; k < count; k++) {
    const from = k * pass;
    const span = Math.min(pass, length - from);
    // Seconds of the sound into the pass, as seconds of the clip on the timeline
    const level = (s: number) => clip.gain * clipLevel(clip, from + s / speed);
    const d = waveformPath(peaks, clip.offset, span * speed, (span / length) * columns, level);
    if (d) waves.push({ x: (from / length) * columns, d });
  }
  return waves;
}

/**
 * Where a looped clip starts over, as fractions of its length: none
 * unlooped, nor when they'd be closer than the eye can tell apart on a
 * timeline `frameWidth` pixels a frame.
 */
function loopMarks(clip: SoundClip, frameRate: number, frameWidth: number): number[] {
  if (!clip.loop) return [];
  const length = clipSeconds(clip);
  const pass = clip.duration / clipSpeed(clip);
  if (
    !(pass > 0) ||
    !(length > 0) ||
    pass * Math.max(1, frameRate) * frameWidth < MIN_LOOP_MARK_GAP
  ) {
    return [];
  }
  const marks: number[] = [];
  for (let at = pass; at < length - 1e-6 && marks.length < MAX_LOOP_MARKS; at += pass) {
    marks.push(at / length);
  }
  return marks;
}

interface SoundClipBarProps {
  clip: SoundClip;
  sound: Sound | undefined;
  row: number;
  duration: number;
  frameRate: number;
  /** How wide a frame of the timeline is, in pixels (0 before it's measured) */
  frameWidth: number;
  selected: boolean;
  onPointerDown: (event: React.PointerEvent, clip: SoundClip) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerUp: () => void;
  onKeyDown: (event: React.KeyboardEvent, clip: SoundClip) => void;
  onOpenSettings: (clipId: string, element: HTMLElement) => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

const SoundClipBar = memo(function SoundClipBar({
  clip,
  sound,
  row,
  duration,
  frameRate,
  frameWidth,
  selected,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
  onOpenSettings,
  onContextMenu,
}: SoundClipBarProps) {
  const audio = useDecodedSound(sound);
  const length = clipSeconds(clip);
  const columns = Math.max(1, Math.min(WAVE_COLUMNS, Math.ceil(length * 100)));
  const { offset, duration: part, gain, fadeIn: fadeInSet, fadeOut: fadeOutSet } = clip;
  const { speed: speedSet, loop, loopFor } = clip;
  // Drawn again as it changes how it sounds, not as it's moved
  const waves = useMemo(() => {
    if (!audio) return [];
    const shape = { offset, duration: part, gain, fadeIn: fadeInSet, fadeOut: fadeOutSet };
    return clipWaves(soundPeaks(audio), { ...shape, speed: speedSet, loop, loopFor }, columns);
  }, [audio, offset, part, gain, fadeInSet, fadeOutSet, speedSet, loop, loopFor, columns]);
  const marks = loopMarks(clip, frameRate, frameWidth);
  const end = clipEndFrame(clip, frameRate);
  const name = sound?.name ?? 'Missing sound';
  // A video's sound: moved, trimmed, sped up and looped with its video until unlinked
  const linked = clip.linkedTo !== undefined;
  const speed = clipSpeed(clip);
  const lastFrame = Math.max(clip.start, Math.ceil(end) - 1);
  const { fadeIn, fadeOut } = clipFades(clip);
  const inAt = length > 0 ? (fadeIn / length) * 100 : 0;
  const outAt = length > 0 ? 100 - (fadeOut / length) * 100 : 100;
  const described = [
    linked ? 'the sound of a video' : '',
    speed !== 1 ? `at ${speedLabel(speed)} speed` : '',
    clip.loop ? 'looped' : '',
    clip.muted ? 'muted' : '',
    clip.gain !== 1 ? `volume ${Math.round(clip.gain * 100)}%` : '',
    fadeIn > 0 ? `fades in over ${seconds(fadeIn)}` : '',
    fadeOut > 0 ? `fades out over ${seconds(fadeOut)}` : '',
  ].filter(Boolean);
  return (
    <div
      role="button"
      tabIndex={0}
      className={`${styles.clip} ${selected ? styles.selected : ''} ${clip.muted ? styles.muted : ''} ${sound ? '' : styles.missing}`}
      style={{
        left: `${(clip.start / duration) * 100}%`,
        width: `${((end - clip.start) / duration) * 100}%`,
        top: row * SOUND_ROW_HEIGHT + 3,
        height: SOUND_ROW_HEIGHT - 6,
      }}
      onPointerDown={(event) => onPointerDown(event, clip)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={(event) => onKeyDown(event, clip)}
      onDoubleClick={(event) => onOpenSettings(clip.id, event.currentTarget)}
      onContextMenu={onContextMenu}
      aria-label={[`Sound ${name}, frames ${clip.start} to ${lastFrame}`, ...described].join(', ')}
      aria-pressed={selected}
      title={
        linked
          ? `${name}: frames ${clip.start}–${lastFrame} (${seconds(length)}), the sound of a video. Drag to move it with its video, its ends to trim both, its top corners to fade; double-click for speed, loop, volume and fades; unlink it (right-click) to change it on its own.`
          : `${name}: frames ${clip.start}–${lastFrame} (${seconds(length)}). Drag to move, its ends to trim${clip.loop ? ' (its right end loops it longer)' : ''}, its top corners to fade; double-click for speed, loop, volume and fades.`
      }
      data-testid={`sound-clip-${clip.id}`}
    >
      {waves.length > 0 && (
        <svg
          className={styles.wave}
          viewBox={`0 0 ${columns} 1`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {waves.map((wave) => (
            <path key={wave.x} d={wave.d} transform={`translate(${wave.x.toFixed(2)} 0)`} />
          ))}
        </svg>
      )}
      {marks.map((at) => (
        <span
          key={at}
          className={styles.loopMark}
          style={{ left: `${at * 100}%` }}
          aria-hidden="true"
          data-testid="sound-clip-loop-mark"
        />
      ))}
      <span className={styles.clipName}>
        {linked && (
          <Link2
            className={styles.linkedIcon}
            aria-hidden="true"
            data-testid={`sound-clip-linked-${clip.id}`}
          />
        )}
        {clip.muted && <VolumeX className={styles.mutedIcon} aria-hidden="true" />}
        {name}
        {clip.loop && <Repeat className={styles.mutedIcon} aria-hidden="true" />}
        {speed !== 1 && (
          <span className={styles.speed} data-testid={`sound-clip-speed-${clip.id}`}>
            {speedLabel(speed)}
          </span>
        )}
      </span>
      {(fadeIn > 0 || fadeOut > 0) && (
        <svg
          className={styles.fades}
          viewBox="0 0 100 1"
          preserveAspectRatio="none"
          aria-hidden="true"
          data-testid={`sound-clip-fades-${clip.id}`}
        >
          {fadeIn > 0 && (
            <>
              <path className={styles.fadeShade} d={`M0 0L${inAt} 0L0 1Z`} />
              <path className={styles.fadeLine} d={`M0 1L${inAt} 0`} />
            </>
          )}
          {fadeOut > 0 && (
            <>
              <path className={styles.fadeShade} d={`M${outAt} 0L100 0L100 1Z`} />
              <path className={styles.fadeLine} d={`M${outAt} 0L100 1`} />
            </>
          )}
        </svg>
      )}
      <span className={styles.edgeStart} data-edge="start" aria-hidden="true" />
      <span className={styles.edgeEnd} data-edge="end" aria-hidden="true" />
      {/* Grabbed to fade: where each fade ends, in the top corners when there's none */}
      <span
        className={`${styles.fadeHandle} ${fadeIn > 0 ? styles.fadeSet : ''}`}
        style={{ left: `${inAt}%` }}
        data-edge="fade-in"
        title="Drag to fade in"
        aria-hidden="true"
        data-testid={`sound-clip-fade-in-${clip.id}`}
      />
      <span
        className={`${styles.fadeHandle} ${styles.fadeOutHandle} ${fadeOut > 0 ? styles.fadeSet : ''}`}
        style={{ left: `${outAt}%` }}
        data-edge="fade-out"
        title="Drag to fade out"
        aria-hidden="true"
        data-testid={`sound-clip-fade-out-${clip.id}`}
      />
    </div>
  );
});

// ============================================================================
// A clip's settings
// ============================================================================

interface SoundClipSettingsProps {
  clip: SoundClip;
  sound: Sound | undefined;
  frameRate: number;
  x: number;
  y: number;
  onClose: () => void;
}

function SoundClipSettings({ clip, sound, frameRate, x, y, onClose }: SoundClipSettingsProps) {
  const sceneGraph = useSceneGraph();
  const cardRef = useRef<HTMLDivElement>(null);
  // A slide of the volume is one undo step
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

  const update = (edit: (c: SoundClip) => SoundClip, undoable = true) =>
    useEditorStore.getState().updateSoundClip(sceneGraph, clip.id, edit, undoable);

  const volume = Math.round(clip.gain * 100);
  const lastFrame = Math.max(clip.start, Math.ceil(clipEndFrame(clip, frameRate)) - 1);
  const speed = clipSpeed(clip);

  return createPortal(
    <>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Escape closes it too */}
      <div className={styles.overlay} onPointerDown={onClose} />
      <div
        ref={cardRef}
        className={styles.settings}
        role="dialog"
        aria-label={`Sound settings: ${sound?.name ?? 'Missing sound'}`}
        data-testid="sound-clip-settings"
      >
        <div className={styles.settingsHeader}>
          <Music className={styles.settingsIcon} aria-hidden="true" />
          <div className={styles.settingsTitle}>
            <strong>{sound?.name ?? 'Missing sound'}</strong>
            <span>
              Frames {clip.start}–{lastFrame} · plays {seconds(clip.offset)}–
              {seconds(clip.offset + clip.duration)}
              {sound ? ` of ${seconds(sound.duration)}` : ''}
            </span>
            {(clip.loop || speed !== 1) && (
              <span>
                {[
                  clip.loop ? `Looped for ${seconds(clipSeconds(clip))}` : '',
                  speed !== 1 ? `at ${speedLabel(speed)}, keeping its pitch` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </div>
        </div>
        <div className={styles.speedRow}>
          <span>Speed</span>
          <div className={styles.speedPresets} role="group" aria-label="Speeds">
            {SPEED_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset}
                className={`${styles.speedPreset} ${speed === preset ? styles.speedPresetOn : ''}`}
                onClick={() => update((c) => withClipSpeed(c, preset))}
                aria-pressed={speed === preset}
                data-testid={`sound-clip-speed-${preset}`}
              >
                {speedLabel(preset)}
              </button>
            ))}
          </div>
          <SpeedField value={speed} onCommit={(value) => update((c) => withClipSpeed(c, value))} />
        </div>
        <label className={styles.volumeRow}>
          <span>Volume</span>
          <input
            type="range"
            min={0}
            max={200}
            step={1}
            value={volume}
            onChange={(event) => {
              const gain = Number(event.target.value) / 100;
              update((c) => ({ ...c, gain }), !slidingRef.current);
              slidingRef.current = true;
            }}
            onPointerUp={() => (slidingRef.current = false)}
            onKeyUp={() => (slidingRef.current = false)}
            onBlur={() => (slidingRef.current = false)}
            aria-valuetext={`${volume}%`}
            data-testid="sound-clip-volume"
          />
          <output className={styles.volumeValue}>{volume}%</output>
        </label>
        <div className={styles.fadeRow}>
          <FadeField
            label="Fade in"
            value={clipFades(clip).fadeIn}
            onCommit={(fadeIn) => update((c) => fadedClip(c, { fadeIn }))}
            testId="sound-clip-fade-in"
          />
          <FadeField
            label="Fade out"
            value={clipFades(clip).fadeOut}
            onCommit={(fadeOut) => update((c) => fadedClip(c, { fadeOut }))}
            testId="sound-clip-fade-out"
          />
        </div>
        <div className={styles.settingsActions}>
          <label className={styles.muteToggle}>
            <input
              type="checkbox"
              checked={clip.muted === true}
              onChange={(event) => {
                const muted = event.target.checked;
                update((c) => ({ ...c, muted }));
              }}
              data-testid="sound-clip-mute"
            />
            Mute
          </label>
          <label className={styles.muteToggle}>
            <input
              type="checkbox"
              checked={clip.loop === true}
              onChange={(event) => {
                const on = event.target.checked;
                update((c) => withLoop(c, on));
              }}
              data-testid="sound-clip-loop"
            />
            Loop
          </label>
          <button
            type="button"
            className={styles.removeButton}
            onClick={() => {
              useEditorStore.getState().removeSoundClip(sceneGraph, clip.id);
              onClose();
            }}
            data-testid="sound-clip-remove"
          >
            <Trash2 aria-hidden="true" />
            Remove
          </button>
        </div>
        {clip.linkedTo !== undefined && (
          <p className={styles.settingsNote}>
            The sound of a video: its speed, loop and trims change with its video, its volume and
            fades are its own.
          </p>
        )}
      </div>
    </>,
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
        min={0.25}
        max={4}
        step={0.05}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
        aria-label="Speed, from 0.25× to 4×"
        data-testid="sound-clip-speed-field"
      />
      <span className={styles.fadeUnit}>×</span>
    </label>
  );
}

/** A fade's length in seconds, set when it's entered (Enter or leaving the field): one undo step. */
function FadeField({
  label,
  value,
  onCommit,
  testId,
}: {
  label: string;
  value: number;
  onCommit: (seconds: number) => void;
  testId: string;
}) {
  const shown = String(Math.round(value * 100) / 100);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const commit = () => {
    const seconds = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(seconds)) onCommit(Math.max(0, seconds));
    else setDraft(shown);
  };
  return (
    <label className={styles.fadeField}>
      <span>{label}</span>
      <input
        type="number"
        min={0}
        step={0.1}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
        aria-label={`${label}, in seconds`}
        data-testid={testId}
      />
      <span className={styles.fadeUnit}>s</span>
    </label>
  );
}
