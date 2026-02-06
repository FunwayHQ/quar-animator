/**
 * OnionSkinPanel - Settings popover for onion skinning
 */

import { useRef } from 'react';
import { useEditorStore, useOnionSkin } from '../../stores/editorStore';
import styles from './OnionSkinPanel.module.css';

export function OnionSkinPanel() {
  const onionSkin = useOnionSkin();
  const setOnionSkinEnabled = useEditorStore((s) => s.setOnionSkinEnabled);
  const setOnionSkinBeforeCount = useEditorStore((s) => s.setOnionSkinBeforeCount);
  const setOnionSkinAfterCount = useEditorStore((s) => s.setOnionSkinAfterCount);
  const setOnionSkinBeforeColor = useEditorStore((s) => s.setOnionSkinBeforeColor);
  const setOnionSkinAfterColor = useEditorStore((s) => s.setOnionSkinAfterColor);
  const setOnionSkinOpacity = useEditorStore((s) => s.setOnionSkinOpacity);
  const setOnionSkinFalloff = useEditorStore((s) => s.setOnionSkinFalloff);
  const setOnionSkinShowDuringPlayback = useEditorStore((s) => s.setOnionSkinShowDuringPlayback);

  const beforeColorRef = useRef<HTMLInputElement>(null);
  const afterColorRef = useRef<HTMLInputElement>(null);

  return (
    <div className={styles.panel} data-testid="onion-skin-panel">
      <div className={styles.header}>
        <span className={styles.title}>Onion Skinning</span>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={onionSkin.enabled}
            onChange={(e) => setOnionSkinEnabled(e.target.checked)}
            data-testid="onion-skin-toggle"
          />
          <span>Enable</span>
        </label>
      </div>

      {/* Before Frames */}
      <div className={styles.row}>
        <span className={styles.label}>Before</span>
        <div className={styles.stepper}>
          <button
            className={styles.stepperButton}
            onClick={() => setOnionSkinBeforeCount(onionSkin.beforeCount - 1)}
            data-testid="before-count-dec"
          >
            -
          </button>
          <span className={styles.stepperValue} data-testid="before-count-value">
            {onionSkin.beforeCount}
          </span>
          <button
            className={styles.stepperButton}
            onClick={() => setOnionSkinBeforeCount(onionSkin.beforeCount + 1)}
            data-testid="before-count-inc"
          >
            +
          </button>
        </div>
        <button
          className={styles.colorSwatch}
          style={{ background: onionSkin.beforeColor }}
          onClick={() => beforeColorRef.current?.click()}
          aria-label="Before color"
        >
          <input
            ref={beforeColorRef}
            type="color"
            className={styles.colorInput}
            value={onionSkin.beforeColor}
            onChange={(e) => setOnionSkinBeforeColor(e.target.value)}
          />
        </button>
      </div>

      {/* After Frames */}
      <div className={styles.row}>
        <span className={styles.label}>After</span>
        <div className={styles.stepper}>
          <button
            className={styles.stepperButton}
            onClick={() => setOnionSkinAfterCount(onionSkin.afterCount - 1)}
          >
            -
          </button>
          <span className={styles.stepperValue}>{onionSkin.afterCount}</span>
          <button
            className={styles.stepperButton}
            onClick={() => setOnionSkinAfterCount(onionSkin.afterCount + 1)}
          >
            +
          </button>
        </div>
        <button
          className={styles.colorSwatch}
          style={{ background: onionSkin.afterColor }}
          onClick={() => afterColorRef.current?.click()}
          aria-label="After color"
        >
          <input
            ref={afterColorRef}
            type="color"
            className={styles.colorInput}
            value={onionSkin.afterColor}
            onChange={(e) => setOnionSkinAfterColor(e.target.value)}
          />
        </button>
      </div>

      {/* Opacity */}
      <div className={styles.row}>
        <span className={styles.label}>Opacity</span>
        <input
          type="range"
          className={styles.slider}
          min="0"
          max="100"
          value={Math.round(onionSkin.opacity * 100)}
          onChange={(e) => setOnionSkinOpacity(Number(e.target.value) / 100)}
          data-testid="onion-skin-opacity"
        />
        <span className={styles.sliderValue}>{Math.round(onionSkin.opacity * 100)}%</span>
      </div>

      {/* Falloff */}
      <div className={styles.row}>
        <span className={styles.label}>Falloff</span>
        <input
          type="range"
          className={styles.slider}
          min="0"
          max="100"
          value={Math.round(onionSkin.opacityFalloff * 100)}
          onChange={(e) => setOnionSkinFalloff(Number(e.target.value) / 100)}
        />
        <span className={styles.sliderValue}>{Math.round(onionSkin.opacityFalloff * 100)}%</span>
      </div>

      {/* Show during playback */}
      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={onionSkin.showDuringPlayback}
          onChange={(e) => setOnionSkinShowDuringPlayback(e.target.checked)}
        />
        <span>Show during playback</span>
      </label>
    </div>
  );
}
