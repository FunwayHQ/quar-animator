/**
 * WindPanel — UI for global wind settings that affect all dynamic chains.
 * Rendered in PropertiesPanel when any dynamic chain exists.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

import { useEditorStore } from '../../stores/editorStore';
import type { WindSettings } from '@quar/types';
import styles from './SmartBonePanel.module.css';

export function WindPanel() {
  const globalWind: WindSettings = useEditorStore((state) => state.globalWind);
  const setGlobalWind = useEditorStore((state) => state.setGlobalWind);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Global Wind</span>
        <label className={styles.toggle} title="Enable/disable wind">
          <input
            type="checkbox"
            checked={globalWind.enabled}
            onChange={(e) => setGlobalWind({ enabled: e.target.checked })}
            aria-label="Enable wind"
          />
          <span className={styles.toggleTrack} />
        </label>
      </div>

      <div className={styles.actionCard} data-testid="wind-settings">
        {/* Strength */}
        <SliderRow
          label="Strength"
          value={globalWind.strength}
          min={0}
          max={500}
          step={1}
          onChange={(v) => setGlobalWind({ strength: v })}
          testId="wind-strength"
        />

        {/* Direction */}
        <SliderRow
          label="Direction"
          value={globalWind.direction}
          min={-180}
          max={180}
          step={1}
          suffix="°"
          onChange={(v) => setGlobalWind({ direction: v })}
          testId="wind-direction"
        />

        {/* Turbulence */}
        <SliderRow
          label="Turbulence"
          value={globalWind.turbulence}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setGlobalWind({ turbulence: v })}
          testId="wind-turbulence"
        />

        {/* Frequency */}
        <SliderRow
          label="Frequency"
          value={globalWind.frequency}
          min={0}
          max={10}
          step={0.1}
          onChange={(v) => setGlobalWind({ frequency: v })}
          testId="wind-frequency"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SliderRow helper (same pattern as DynamicChainPanel)
// ---------------------------------------------------------------------------

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
  testId: string;
}) {
  return (
    <div className={styles.driverRow}>
      <span className={styles.driverLabel} style={{ width: 'auto', minWidth: 52 }}>
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, height: 14, cursor: 'pointer' }}
        data-testid={`${testId}-slider`}
      />
      <div className={styles.driverInputGroup} style={{ width: 52, flex: 'none' }}>
        <input
          type="number"
          className={styles.driverInput}
          value={Math.round(value * 100) / 100}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
          data-testid={`${testId}-input`}
        />
        {suffix && <span className={styles.driverSuffix}>{suffix}</span>}
      </div>
    </div>
  );
}
