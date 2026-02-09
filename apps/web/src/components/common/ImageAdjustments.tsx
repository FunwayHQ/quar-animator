/**
 * ImageAdjustments — Adjustment sliders for image node properties
 * (brightness, contrast, saturation, hue, exposure, temperature)
 */

import { useCallback, useMemo } from 'react';
import { RotateCcw } from 'lucide-react';
import type { ImageAdjustments as ImageAdjustmentsType } from '@quar/types';
import styles from './ImageAdjustments.module.css';

// ============================================================================
// Types
// ============================================================================

export interface ImageAdjustmentsProps {
  adjustments: ImageAdjustmentsType;
  onChange: (key: keyof ImageAdjustmentsType, value: number) => void;
  onReset: (key: keyof ImageAdjustmentsType) => void;
  onResetAll: () => void;
}

interface AdjustmentDef {
  key: keyof ImageAdjustmentsType;
  label: string;
  min: number;
  max: number;
  default: number;
  /** True when slider is bipolar (center = default) */
  bipolar: boolean;
  suffix?: string;
}

// ============================================================================
// Adjustment definitions
// ============================================================================

const LIGHT_ADJUSTMENTS: AdjustmentDef[] = [
  { key: 'brightness', label: 'Brightness', min: -100, max: 100, default: 0, bipolar: true },
  { key: 'exposure', label: 'Exposure', min: -100, max: 100, default: 0, bipolar: true },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100, default: 0, bipolar: true },
];

const COLOR_ADJUSTMENTS: AdjustmentDef[] = [
  { key: 'saturation', label: 'Saturation', min: -100, max: 100, default: 0, bipolar: true },
  { key: 'hue', label: 'Hue', min: -180, max: 180, default: 0, bipolar: true, suffix: '°' },
  { key: 'temperature', label: 'Temperature', min: -100, max: 100, default: 0, bipolar: true },
];

const ALL_ADJUSTMENTS = [...LIGHT_ADJUSTMENTS, ...COLOR_ADJUSTMENTS];

const DEFAULT_ADJUSTMENTS: ImageAdjustmentsType = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  exposure: 0,
  temperature: 0,
  tint: 0,
  blur: 0,
};

// ============================================================================
// Component
// ============================================================================

export function ImageAdjustments({
  adjustments,
  onChange,
  onReset,
  onResetAll,
}: ImageAdjustmentsProps) {
  const hasModifications = useMemo(
    () => ALL_ADJUSTMENTS.some((def) => adjustments[def.key] !== def.default),
    [adjustments]
  );

  return (
    <div className={styles.container} data-testid="image-adjustments">
      <div className={styles.header}>
        <span className={styles.title}>Adjustments</span>
        {hasModifications && (
          <button
            className={styles.resetAll}
            onClick={onResetAll}
            title="Reset all adjustments"
            aria-label="Reset all adjustments"
            data-testid="image-adjustments-reset-all"
          >
            <RotateCcw size={9} />
            Reset
          </button>
        )}
      </div>

      {LIGHT_ADJUSTMENTS.map((def) => (
        <AdjustmentSlider
          key={def.key}
          def={def}
          value={adjustments[def.key]}
          onChange={onChange}
          onReset={onReset}
        />
      ))}

      <div className={styles.divider} />

      {COLOR_ADJUSTMENTS.map((def) => (
        <AdjustmentSlider
          key={def.key}
          def={def}
          value={adjustments[def.key]}
          onChange={onChange}
          onReset={onReset}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Individual slider row
// ============================================================================

interface AdjustmentSliderProps {
  def: AdjustmentDef;
  value: number;
  onChange: (key: keyof ImageAdjustmentsType, value: number) => void;
  onReset: (key: keyof ImageAdjustmentsType) => void;
}

function AdjustmentSlider({ def, value, onChange, onReset }: AdjustmentSliderProps) {
  const isModified = value !== def.default;

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(def.key, Number(e.target.value));
    },
    [def.key, onChange]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const cleaned = e.target.value.replace(/[^-\d.]/g, '');
      const num = parseFloat(cleaned);
      if (!isNaN(num)) {
        const clamped = Math.max(def.min, Math.min(def.max, num));
        onChange(def.key, clamped);
      }
    },
    [def.key, def.min, def.max, onChange]
  );

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const delta = e.key === 'ArrowUp' ? step : -step;
        const next = Math.max(def.min, Math.min(def.max, value + delta));
        onChange(def.key, next);
      }
    },
    [def.key, def.min, def.max, value, onChange]
  );

  // Compute fill bar position/width for bipolar sliders
  const fillStyle = useMemo(() => {
    const range = def.max - def.min;
    if (def.bipolar) {
      const centerPct = ((def.default - def.min) / range) * 100;
      const valuePct = ((value - def.min) / range) * 100;
      const left = Math.min(centerPct, valuePct);
      const width = Math.abs(valuePct - centerPct);
      return { left: `${left}%`, width: `${width}%` };
    }
    const pct = ((value - def.min) / range) * 100;
    return { left: '0%', width: `${pct}%` };
  }, [def, value]);

  const displayValue = def.suffix ? `${Math.round(value)}${def.suffix}` : String(Math.round(value));

  return (
    <div
      className={`${styles.adjustmentRow} ${isModified ? styles.modified : ''}`}
      data-testid={`adjustment-${def.key}`}
    >
      <span className={styles.adjustmentLabel}>{def.label}</span>
      <div className={styles.sliderContainer}>
        <div className={styles.sliderTrack}>
          <div className={styles.sliderFill} style={fillStyle} />
        </div>
        {def.bipolar && <div className={styles.centerTick} />}
        <input
          type="range"
          className={styles.adjustmentSlider}
          min={def.min}
          max={def.max}
          value={value}
          onChange={handleSliderChange}
          aria-label={def.label}
          data-testid={`adjustment-slider-${def.key}`}
        />
      </div>
      <input
        type="text"
        className={styles.adjustmentValue}
        value={displayValue}
        onChange={handleInputChange}
        onKeyDown={handleInputKeyDown}
        aria-label={`${def.label} value`}
        data-testid={`adjustment-value-${def.key}`}
      />
      <button
        className={styles.resetButton}
        onClick={() => onReset(def.key)}
        title={`Reset ${def.label.toLowerCase()}`}
        aria-label={`Reset ${def.label.toLowerCase()}`}
        disabled={!isModified}
        data-testid={`adjustment-reset-${def.key}`}
      >
        <RotateCcw size={10} />
      </button>
    </div>
  );
}

export { DEFAULT_ADJUSTMENTS };
export default ImageAdjustments;
