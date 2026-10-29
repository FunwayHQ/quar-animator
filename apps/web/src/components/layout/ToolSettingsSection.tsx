/**
 * The Brush's and the Eraser's settings, at the top of the Properties panel
 * while either tool is chosen (as the Weight Paint brush's are while it
 * paints). Brush: its size and how much it smooths the hand, with a stroke
 * drawn as they'd make it. Eraser: whether it cuts shapes or deletes path
 * points, and its size, which [ and ] change too (the ring round the
 * pointer on the canvas shows it).
 */

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Scissors, Spline } from 'lucide-react';
import { useEditorStore, type EraserMode } from '../../stores/editorStore';
import styles from './PropertiesPanel.module.css';
import own from './ToolSettingsSection.module.css';

export function ToolSettingsSection() {
  const activeTool = useEditorStore((state) => state.activeTool);
  if (activeTool === 'brush') return <BrushSettings />;
  if (activeTool === 'eraser') return <EraserSettings />;
  return null;
}

// ============================================================================
// Brush
// ============================================================================

function BrushSettings() {
  const size = useEditorStore((state) => state.brushSize);
  const smoothing = useEditorStore((state) => state.brushSmoothing);
  const setSize = useEditorStore((state) => state.setBrushSize);
  const setSmoothing = useEditorStore((state) => state.setBrushSmoothing);

  return (
    <div className={styles.section} data-testid="brush-settings">
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Brush</span>
      </div>
      <div className={styles.sectionContent}>
        <StrokePreview size={size} smoothing={smoothing} />
        <SliderRow
          id="brush-size"
          label="Size"
          value={size}
          min={1}
          max={100}
          onChange={setSize}
          title="The stroke’s width where a pen presses hardest"
        />
        <SliderRow
          id="brush-smoothing"
          label="Smoothing"
          value={smoothing}
          min={0}
          max={100}
          onChange={setSmoothing}
          title="How much a shaky hand is smoothed: 0 follows the pointer exactly"
        />
        <p className={styles.slideNote}>
          Size is the width where a pen presses hardest. A mouse paints about half as wide.
        </p>
      </div>
    </div>
  );
}

/**
 * A stroke as the brush would draw it: the same wobbly line each time, as
 * thick as the size makes it and as smooth as the smoothing does. A sketch
 * of the feel, not to scale.
 */
function StrokePreview({ size, smoothing }: { size: number; smoothing: number }) {
  const d = useMemo(() => previewLine(smoothing), [smoothing]);
  // 1 → a hairline, 100 → as thick as the preview allows
  const width = 1.25 + 14 * Math.sqrt((size - 1) / 99);
  return (
    <div className={own.preview} aria-hidden="true" data-testid="brush-preview">
      <svg viewBox="0 0 200 40" preserveAspectRatio="none" className={own.previewSvg}>
        <path
          d={d}
          className={own.previewStroke}
          style={{ strokeWidth: width }}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

const PREVIEW_SAMPLES = 48;
/** The hand's wobble at each sample: the same every time (a fixed sequence). */
const WOBBLE = Array.from({ length: PREVIEW_SAMPLES }, (_, i) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
});

/** The preview's line: a gentle wave, with less of the wobble the more it's smoothed. */
function previewLine(smoothing: number): string {
  const wobble = 5 * Math.pow(1 - smoothing / 100, 1.4);
  const points: string[] = [];
  for (let i = 0; i < PREVIEW_SAMPLES; i++) {
    const t = i / (PREVIEW_SAMPLES - 1);
    const x = 14 + t * 172;
    const y = 20 - Math.sin(t * Math.PI * 2) * 8 + (WOBBLE[i] ?? 0) * wobble;
    points.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `M ${points.join(' L ')}`;
}

// ============================================================================
// Eraser
// ============================================================================

const ERASER_MODES: Array<{
  mode: EraserMode;
  label: string;
  Icon: typeof Scissors;
  note: string;
}> = [
  {
    mode: 'stroke',
    label: 'Cut shapes',
    Icon: Scissors,
    note: 'Cuts the trail out of every shape it crosses.',
  },
  {
    mode: 'point',
    label: 'Delete points',
    Icon: Spline,
    note: 'Deletes the points of the paths it touches, leaving a closed path open.',
  },
];

function EraserSettings() {
  const size = useEditorStore((state) => state.eraserSize);
  const mode = useEditorStore((state) => state.eraserMode);
  const setSize = useEditorStore((state) => state.setEraserSize);
  const setMode = useEditorStore((state) => state.setEraserMode);
  const current = ERASER_MODES.find((option) => option.mode === mode) ?? ERASER_MODES[0];

  return (
    <div className={styles.section} data-testid="eraser-settings">
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Eraser</span>
      </div>
      <div className={styles.sectionContent}>
        <div className={styles.propertyRow}>
          <span className={styles.propertyLabel}>Mode</span>
          <div
            className={`${styles.alignToggle} ${own.modes}`}
            role="group"
            aria-label="Eraser mode"
          >
            {ERASER_MODES.map(({ mode: option, label, Icon }) => (
              <button
                key={option}
                type="button"
                className={`${styles.alignOption} ${own.mode} ${mode === option ? styles.alignOptionActive : ''}`}
                aria-pressed={mode === option}
                onClick={() => setMode(option)}
                data-testid={`eraser-mode-${option}`}
              >
                <Icon size={12} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          {current && (
            <p className={styles.slideNote} data-testid="eraser-mode-note">
              {current.note}
            </p>
          )}
        </div>
        <SliderRow
          id="eraser-size"
          label="Size"
          value={size}
          min={1}
          max={100}
          onChange={setSize}
          title="How far round the pointer it reaches, the same on screen at any zoom ([ and ])"
          keys
        />
      </div>
    </div>
  );
}

// ============================================================================
// Shared
// ============================================================================

/** A labelled slider and its value, typed or stepped with ↑/↓ (Shift: by 10). */
function SliderRow({
  id,
  label,
  value,
  min,
  max,
  onChange,
  title,
  keys = false,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  title: string;
  /** Show that [ and ] change it */
  keys?: boolean;
}) {
  return (
    <div className={styles.propertyRow}>
      <div className={own.labelRow}>
        <label className={styles.propertyLabel} htmlFor={id}>
          {label}
        </label>
        {keys && (
          <span className={own.keys} title="[ and ] make it smaller and bigger">
            <kbd className={own.key}>[</kbd>
            <kbd className={own.key}>]</kbd>
          </span>
        )}
      </div>
      <div className={styles.propertyInputs}>
        <input
          type="range"
          className={styles.slider}
          aria-label={label}
          title={title}
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          data-testid={`${id}-slider`}
        />
        <NumberField id={id} label={label} value={value} min={min} max={max} onChange={onChange} />
      </div>
    </div>
  );
}

/** A whole number, kept on Enter or leaving the field (Escape puts it back). */
function NumberField({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const keep = (text: string) => {
    const typed = Math.round(Number(text));
    if (text.trim() === '' || !Number.isFinite(typed)) {
      setDraft(String(value));
      return;
    }
    const next = Math.min(max, Math.max(min, typed));
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      keep(e.currentTarget.value);
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setDraft(String(value));
      e.currentTarget.blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1);
      keep(String(value + step));
    }
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      className={styles.inputSmall}
      aria-label={`${label} value`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => keep(e.target.value)}
      onKeyDown={key}
      data-testid={id}
    />
  );
}
