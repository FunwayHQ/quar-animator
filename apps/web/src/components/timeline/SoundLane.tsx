/**
 * Sound Lane
 * The timeline's row of sound clips, kept in view below the layers: each
 * clip a bar with its waveform, dragged to move it, its ends dragged to
 * trim it, its top corners dragged to fade it in and out, its volume, fades
 * and mute in a small settings card. Sound files dropped on the timeline
 * land where they're dropped.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Music, Plus, Trash2, VolumeX } from 'lucide-react';
import {
  clipEndFrame,
  clipFades,
  clipLevel,
  fadedClip,
  movedClip,
  scopeSounds,
  soundRows,
  trimmedEnd,
  trimmedStart,
} from '@quar/animation';
import type { Sound, SoundClip } from '@quar/types';
import { useEditorStore } from '../../stores/editorStore';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { decodedSound, isSoundFile, soundPeaks, waveformPath } from '../../services/soundFiles';
import { chooseSoundFiles, importSoundFiles } from '../../services/soundImport';
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

// ============================================================================
// The label beside the lane
// ============================================================================

export function SoundLaneLabel() {
  const sceneGraph = useSceneGraph();
  const { count } = useLaneClips();
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
// Dropping sound files on the timeline
// ============================================================================

/** Whether a drag carries files (their kinds aren't known until they're dropped). */
function carriesFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files');
}

/**
 * Handlers for an element of the timeline that takes sound files: each
 * dropped lands at the frame under the pointer (`frameAt`).
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
      const sounds = Array.from(event.dataTransfer.files).filter(isSoundFile);
      if (sounds.length === 0) return;
      void importSoundFiles(sceneGraph, sounds, Math.max(0, Math.round(frameAt(event.clientX))));
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

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = frameAt(event.clientX) - drag.downFrame;
      const sound = library.get(drag.original.soundId);
      const next = dragged(drag, delta, frameRate, sound?.duration);
      // One undo step for the whole drag, recorded as it first changes something
      const before = useEditorStore.getState().timeline;
      store().updateSoundClip(sceneGraph, drag.clipId, () => next, !drag.changed);
      if (useEditorStore.getState().timeline !== before) drag.changed = true;
    },
    [frameAt, frameRate, library, sceneGraph, store]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

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

interface SoundClipBarProps {
  clip: SoundClip;
  sound: Sound | undefined;
  row: number;
  duration: number;
  frameRate: number;
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
  selected,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
  onOpenSettings,
  onContextMenu,
}: SoundClipBarProps) {
  const audio = useDecodedSound(sound);
  const columns = Math.max(1, Math.min(WAVE_COLUMNS, Math.ceil(clip.duration * 100)));
  const { offset, duration: length, gain, fadeIn: fadeInSet, fadeOut: fadeOutSet } = clip;
  const wave = useMemo(() => {
    if (!audio) return '';
    // As loud as it plays: its volume, through its fades
    const shape = { duration: length, fadeIn: fadeInSet, fadeOut: fadeOutSet };
    const level = (t: number) => gain * clipLevel(shape, t);
    return waveformPath(soundPeaks(audio), offset, length, columns, level);
  }, [audio, offset, length, gain, fadeInSet, fadeOutSet, columns]);
  const end = clipEndFrame(clip, frameRate);
  const name = sound?.name ?? 'Missing sound';
  const lastFrame = Math.max(clip.start, Math.ceil(end) - 1);
  const { fadeIn, fadeOut } = clipFades(clip);
  const inAt = clip.duration > 0 ? (fadeIn / clip.duration) * 100 : 0;
  const outAt = clip.duration > 0 ? 100 - (fadeOut / clip.duration) * 100 : 100;
  const described = [
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
      title={`${name}: frames ${clip.start}–${lastFrame} (${seconds(clip.duration)}). Drag to move, its ends to trim, its top corners to fade; double-click for volume and fades.`}
      data-testid={`sound-clip-${clip.id}`}
    >
      {wave && (
        <svg
          className={styles.wave}
          viewBox={`0 0 ${columns} 1`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d={wave} />
        </svg>
      )}
      <span className={styles.clipName}>
        {clip.muted && <VolumeX className={styles.mutedIcon} aria-hidden="true" />}
        {name}
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
          </div>
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
      </div>
    </>,
    document.body
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
