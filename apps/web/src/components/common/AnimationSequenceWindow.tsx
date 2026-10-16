import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { GripVertical, Play, Plus, Trash2, X } from 'lucide-react';
import {
  ANIMATION_PRESETS,
  isPresetApplicable,
  scheduleSequence,
  type AnimationPresetCategory,
  type AnimationPresetId,
  type AnimationSequenceStep,
  type ScheduledStep,
} from '@quar/animation';
import type { Node } from '@quar/types';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import type { SequenceStepPatch } from '../../stores/sequenceActions';
import styles from './AnimationSequenceWindow.module.css';

const STORAGE_KEY = 'quar-animator-sequence-window';
const MIN_WIDTH = 340;
const MIN_HEIGHT = 220;
const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 380;
const DEFAULT_DURATION_SECONDS = 0.8;
const CATEGORIES: AnimationPresetCategory[] = ['Entrance', 'Emphasis', 'Loop', 'Exit'];
const REPEAT_OPTIONS = [1, 2, 3, 4, 5, 10] as const;

interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clampRect(rect: WindowRect): WindowRect {
  const width = Math.max(MIN_WIDTH, Math.min(rect.width, window.innerWidth));
  const height = Math.max(MIN_HEIGHT, Math.min(rect.height, window.innerHeight));
  return {
    width,
    height,
    // Keep the title bar reachable
    x: Math.max(0, Math.min(rect.x, window.innerWidth - 120)),
    y: Math.max(0, Math.min(rect.y, window.innerHeight - 40)),
  };
}

function readStoredRect(): WindowRect {
  const fallback = {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    // Beside the properties panel, below the menu bar
    x: window.innerWidth - DEFAULT_WIDTH - 300,
    y: 96,
  };
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as unknown;
    if (stored && typeof stored === 'object') {
      const r = stored as Partial<WindowRect>;
      if ([r.x, r.y, r.width, r.height].every((v) => typeof v === 'number' && isFinite(v))) {
        return clampRect(r as WindowRect);
      }
    }
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
  return clampRect(fallback);
}

function storeRect(rect: WindowRect): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rect));
  } catch {
    // Remembering the position is a convenience only.
  }
}

function presetById(id: AnimationPresetId) {
  return ANIMATION_PRESETS.find((preset) => preset.id === id);
}

function formatSeconds(frames: number, frameRate: number): string {
  return `${(frames / frameRate).toFixed(1)}s`;
}

function triggerValue(step: AnimationSequenceStep): string {
  if ((step.trigger === 'after' || step.trigger === 'with') && step.targetStepId) {
    return `${step.trigger}:${step.targetStepId}`;
  }
  return step.trigger;
}

function triggerPatch(value: string): SequenceStepPatch {
  const [trigger, targetStepId] = value.split(':') as [string, string | undefined];
  if ((trigger === 'after' || trigger === 'with') && targetStepId) {
    return { trigger, targetStepId };
  }
  return {
    trigger: trigger === 'withPrevious' ? 'withPrevious' : 'afterPrevious',
    targetStepId: undefined,
  };
}

/** Seconds field that commits on Enter or blur, so typing doesn't record an undo step per key. */
function SecondsField({
  label,
  frames,
  frameRate,
  minFrames,
  onCommit,
}: {
  label: string;
  frames: number;
  frameRate: number;
  minFrames: number;
  onCommit: (frames: number) => void;
}) {
  const formatted = String(Number((frames / frameRate).toFixed(2)));
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const seconds = Number(draft.replace(',', '.'));
    setDraft(null);
    if (!Number.isFinite(seconds)) return;
    const next = Math.max(minFrames, Math.round(seconds * frameRate));
    if (next !== frames) onCommit(next);
  };

  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={draft ?? formatted}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            e.stopPropagation();
            setDraft(null);
          }
        }}
      />
      <span className={styles.unit}>s</span>
    </label>
  );
}

interface StepRowProps {
  step: AnimationSequenceStep;
  index: number;
  entry: ScheduledStep;
  earlierSteps: AnimationSequenceStep[];
  nodeName: string;
  frameRate: number;
  isActive: boolean;
  isSelected: boolean;
  isDropTarget: boolean;
  onSelect: () => void;
  onUpdate: (patch: SequenceStepPatch) => void;
  onRemove: () => void;
  onMove: (toIndex: number) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function StepRow({
  step,
  index,
  entry,
  earlierSteps,
  nodeName,
  frameRate,
  isActive,
  isSelected,
  isDropTarget,
  onSelect,
  onUpdate,
  onRemove,
  onMove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: StepRowProps) {
  const preset = presetById(step.presetId);
  const isLoop = preset?.category === 'Loop';

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLLIElement>) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    onMove(index + (e.key === 'ArrowUp' ? -1 : 1));
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- drop target for drag-reorder; Alt+↑/↓ from any control in the row reorders it
    <li
      className={[
        styles.step,
        isActive ? styles.active : '',
        isSelected ? styles.selected : '',
        isDropTarget ? styles.dropTarget : '',
      ].join(' ')}
      onKeyDown={handleKeyDown}
      onDragOver={onDragOver}
      onDrop={onDrop}
      data-testid={`sequence-step-${index + 1}`}
    >
      <span
        className={styles.grip}
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        title="Drag to reorder (Alt+↑/↓)"
        aria-hidden="true"
      >
        <GripVertical size={14} />
      </span>
      <span className={styles.number} aria-label={`Step ${index + 1}`}>
        {index + 1}
      </span>
      <div className={styles.stepBody}>
        <div className={styles.stepHeader}>
          <button
            type="button"
            className={styles.objectName}
            onClick={onSelect}
            title="Select the object and jump to this step"
          >
            {nodeName}
          </button>
          <span className={styles.effect} data-category={preset?.category}>
            {preset?.name ?? step.presetId}
            <span className={styles.category}>{preset?.category}</span>
          </span>
          <span className={styles.timing} title="Start – end">
            {formatSeconds(entry.start, frameRate)}–{formatSeconds(entry.end, frameRate)}
          </span>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onRemove}
            aria-label={`Remove step ${index + 1}`}
            title="Remove step"
          >
            <Trash2 size={13} />
          </button>
        </div>
        <div className={styles.stepControls}>
          <select
            className={styles.trigger}
            aria-label={`Start of step ${index + 1}`}
            value={triggerValue(step)}
            onChange={(e) => onUpdate(triggerPatch(e.target.value))}
          >
            <option value="afterPrevious">After previous</option>
            <option value="withPrevious">With previous</option>
            {earlierSteps.map((earlier, earlierIndex) => (
              <option key={`after-${earlier.id}`} value={`after:${earlier.id}`}>
                After #{earlierIndex + 1}
              </option>
            ))}
            {earlierSteps.map((earlier, earlierIndex) => (
              <option key={`with-${earlier.id}`} value={`with:${earlier.id}`}>
                With #{earlierIndex + 1}
              </option>
            ))}
          </select>
          <SecondsField
            label="Delay"
            frames={step.delay}
            frameRate={frameRate}
            minFrames={0}
            onCommit={(delay) => onUpdate({ delay })}
          />
          <SecondsField
            label="Duration"
            frames={step.duration}
            frameRate={frameRate}
            minFrames={1}
            onCommit={(duration) => onUpdate({ duration })}
          />
          {isLoop && (
            <select
              className={styles.repeat}
              aria-label={`Repeat step ${index + 1}`}
              value={String(step.repeat ?? 1)}
              onChange={(e) =>
                onUpdate({
                  repeat: e.target.value === 'untilEnd' ? 'untilEnd' : Number(e.target.value),
                })
              }
            >
              {REPEAT_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  {count}×
                </option>
              ))}
              <option value="untilEnd">Until end</option>
            </select>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Floating, PowerPoint-style Animation Sequence window: a numbered list of
 * preset steps, each starting after or with the previous (or a chosen) step.
 * Every edit re-renders the steps into the timeline.
 */
export function AnimationSequenceWindow() {
  const sceneGraph = useSceneGraph();
  const sequence = useEditorStore((s) => s.animationSequence);
  const timelineDuration = useEditorStore((s) => s.timeline.duration);
  const frameRate = useEditorStore((s) => s.frameRate);
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  const editingSymbol = useEditorStore((s) => s.editingSymbolId !== null);

  const [rect, setRect] = useState(readStoredRect);
  const rectRef = useRef(rect);
  rectRef.current = rect;
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [presetToAdd, setPresetToAdd] = useState<AnimationPresetId>('fade-in');

  // Re-render when sequenced objects are renamed, added or removed — not on
  // every animated property change during playback.
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const read = () => {
      const next = new Map<string, string>();
      for (const step of useEditorStore.getState().animationSequence.steps) {
        const node = sceneGraph.getNode(step.nodeId);
        if (node) next.set(step.nodeId, node.name);
      }
      setNames((prev) => {
        if (prev.size === next.size && [...next].every(([id, name]) => prev.get(id) === name)) {
          return prev;
        }
        return next;
      });
    };
    read();
    const unsubs = [
      sceneGraph.on('nodeAdded', read),
      sceneGraph.on('nodeRemoved', read),
      sceneGraph.on('nodeChanged', read),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [sceneGraph, sequence]);

  const schedule = useMemo(
    () => scheduleSequence(sequence, timelineDuration),
    [sequence, timelineDuration]
  );
  const totalFrames = schedule.reduce((end, entry) => Math.max(end, entry.end), 0);

  const selectedNodes = useMemo(
    () =>
      [...selectedNodeIds]
        .map((id) => sceneGraph.getNode(id))
        .filter((node): node is Node => node !== undefined),
    [sceneGraph, selectedNodeIds]
  );
  const addablePresets = ANIMATION_PRESETS.filter(
    (preset) =>
      selectedNodes.length === 0 ||
      selectedNodes.every((node) => isPresetApplicable(preset.id, node))
  );
  const effectivePreset = addablePresets.some((preset) => preset.id === presetToAdd)
    ? presetToAdd
    : (addablePresets[0]?.id ?? 'fade-in');

  const close = useCallback(() => useEditorStore.getState().setSequenceWindowOpen(false), []);

  // Keep the window on screen when the browser window shrinks
  useEffect(() => {
    const onResize = () => setRect((current) => clampRect(current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const startPointerGesture = (
    e: ReactPointerEvent<HTMLElement>,
    apply: (dx: number, dy: number, start: WindowRect) => WindowRect
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = rectRef.current;
    const originX = e.clientX;
    const originY = e.clientY;
    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      // A release we never saw (lost capture) must not leave hover moving the window
      if (ev.buttons === 0) {
        onUp();
        return;
      }
      setRect(clampRect(apply(ev.clientX - originX, ev.clientY - originY, start)));
    };
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      target.removeEventListener('lostpointercapture', onUp);
      storeRect(rectRef.current);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
    target.addEventListener('lostpointercapture', onUp);
  };

  const handleTitlePointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    startPointerGesture(e, (dx, dy, start) => ({ ...start, x: start.x + dx, y: start.y + dy }));
  };

  const handleResizePointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    startPointerGesture(e, (dx, dy, start) => ({
      ...start,
      width: start.width + dx,
      height: start.height + dy,
    }));
  };

  const updateStep = (stepId: string, patch: SequenceStepPatch) =>
    useEditorStore.getState().updateSequenceStep(sceneGraph, stepId, patch);
  const removeStep = (stepId: string) =>
    useEditorStore.getState().removeSequenceStep(sceneGraph, stepId);
  const moveStep = (from: number, to: number) => {
    if (to < 0 || to >= sequence.steps.length) return;
    useEditorStore.getState().moveSequenceStep(sceneGraph, from, to);
  };
  const selectStep = (step: AnimationSequenceStep, entry: ScheduledStep) => {
    const state = useEditorStore.getState();
    state.setSelection([step.nodeId]);
    state.setCurrentFrame(entry.start);
  };

  const addStep = () => {
    const state = useEditorStore.getState();
    state.addSequenceSteps(sceneGraph, [...state.selectedNodeIds], effectivePreset, {
      duration: Math.max(1, Math.round(DEFAULT_DURATION_SECONDS * state.frameRate)),
    });
  };

  const playFromStart = () => {
    const state = useEditorStore.getState();
    state.setCurrentFrame(0);
    state.setIsPlaying(true);
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape closes the window from any focused control inside it
    <div
      className={styles.window}
      role="dialog"
      aria-label="Animation Sequence"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') close();
      }}
      data-testid="animation-sequence-window"
    >
      <header className={styles.titleBar} onPointerDown={handleTitlePointerDown}>
        <span className={styles.title}>Animation Sequence</span>
        <span className={styles.summary}>
          {sequence.steps.length} {sequence.steps.length === 1 ? 'step' : 'steps'}
          {totalFrames > 0 && ` · ${formatSeconds(totalFrames, frameRate)}`}
        </span>
        <button
          type="button"
          className={styles.iconButton}
          onClick={close}
          aria-label="Close Animation Sequence"
          title="Close (Shift+A)"
        >
          <X size={14} />
        </button>
      </header>

      <div className={styles.body}>
        {editingSymbol ? (
          <p className={styles.empty}>Exit symbol editing to edit this page’s sequence.</p>
        ) : sequence.steps.length === 0 ? (
          <p className={styles.empty}>
            No steps yet. Select one or more objects and add an effect below. While this window is
            open, the effect buttons in Properties → Animation add steps too.
          </p>
        ) : (
          <ol className={styles.steps} aria-label="Sequence steps">
            {sequence.steps.map((step, index) => {
              const entry = schedule[index]!;
              return (
                <StepRow
                  key={step.id}
                  step={step}
                  index={index}
                  entry={entry}
                  earlierSteps={sequence.steps.slice(0, index)}
                  nodeName={names.get(step.nodeId) ?? 'Missing object'}
                  frameRate={frameRate}
                  isActive={currentFrame >= entry.start && currentFrame < entry.end}
                  isSelected={selectedNodeIds.has(step.nodeId)}
                  isDropTarget={dropIndex === index && dragIndex !== index}
                  onSelect={() => selectStep(step, entry)}
                  onUpdate={(patch) => updateStep(step.id, patch)}
                  onRemove={() => removeStep(step.id)}
                  onMove={(to) => moveStep(index, to)}
                  onDragStart={(e) => {
                    setDragIndex(index);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(index));
                    const row = (e.currentTarget as HTMLElement).closest('li');
                    if (row) e.dataTransfer.setDragImage(row, 12, 12);
                  }}
                  onDragOver={(e) => {
                    if (dragIndex === null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDropIndex(index);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null) moveStep(dragIndex, index);
                    setDragIndex(null);
                    setDropIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDropIndex(null);
                  }}
                />
              );
            })}
          </ol>
        )}
      </div>

      <footer className={styles.footer}>
        <select
          className={styles.effectPicker}
          aria-label="Effect to add"
          value={effectivePreset}
          onChange={(e) => setPresetToAdd(e.target.value as AnimationPresetId)}
          disabled={editingSymbol}
        >
          {CATEGORIES.map((category) => (
            <optgroup key={category} label={category}>
              {addablePresets
                .filter((preset) => preset.category === category)
                .map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          className={styles.addButton}
          onClick={addStep}
          disabled={editingSymbol || selectedNodes.length === 0}
          title={selectedNodes.length === 0 ? 'Select objects to animate first' : undefined}
        >
          <Plus size={13} />
          {selectedNodes.length > 1 ? `Add for ${selectedNodes.length} objects` : 'Add step'}
        </button>
        <button
          type="button"
          className={styles.playButton}
          onClick={playFromStart}
          disabled={sequence.steps.length === 0}
          aria-label="Play from start"
          title="Play from start"
        >
          <Play size={13} />
        </button>
      </footer>
      <div
        className={styles.resizeHandle}
        onPointerDown={handleResizePointerDown}
        aria-hidden="true"
      />
    </div>
  );
}
