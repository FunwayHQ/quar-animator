/**
 * ColorPicker — Dark-themed precision color picker for Quar Animator
 *
 * Features:
 * - 2D saturation/value area with crosshair cursor
 * - Hue slider strip
 * - Optional alpha slider
 * - Hex + RGB/HSL input fields with mode toggle
 * - Portal rendering, click-outside to close
 * - New/old color comparison swatches
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Color } from '@quar/types';
import styles from './ColorPicker.module.css';

// ============================================================================
// Color conversion utilities
// ============================================================================

interface HSV {
  h: number; // 0-360
  s: number; // 0-1
  v: number; // 0-1
}

function rgbToHsv(r: number, g: number, b: number): HSV {
  const r1 = r / 255;
  const g1 = g / 255;
  const b1 = b / 255;
  const max = Math.max(r1, g1, b1);
  const min = Math.min(r1, g1, b1);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r1) h = ((g1 - b1) / d) % 6;
    else if (max === g1) h = (b1 - r1) / d + 2;
    else h = (r1 - g1) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r1 = 0,
    g1 = 0,
    b1 = 0;
  if (h < 60) { r1 = c; g1 = x; }
  else if (h < 120) { r1 = x; g1 = c; }
  else if (h < 180) { g1 = c; b1 = x; }
  else if (h < 240) { g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    r.toString(16).padStart(2, '0') +
    g.toString(16).padStart(2, '0') +
    b.toString(16).padStart(2, '0')
  ).toUpperCase();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  return {
    r: parseInt(cleaned.slice(0, 2), 16),
    g: parseInt(cleaned.slice(2, 4), 16),
    b: parseInt(cleaned.slice(4, 6), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const r1 = r / 255;
  const g1 = g / 255;
  const b1 = b / 255;
  const max = Math.max(r1, g1, b1);
  const min = Math.min(r1, g1, b1);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r1) h = ((g1 - b1) / d + (g1 < b1 ? 6 : 0)) * 60;
    else if (max === g1) h = ((b1 - r1) / d + 2) * 60;
    else h = ((r1 - g1) / d + 4) * 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ============================================================================
// Types
// ============================================================================

export interface ColorPickerProps {
  /** Current color */
  color: Color;
  /** Called on every color change (live preview) */
  onChange: (color: Color) => void;
  /** Anchor position (top-left of popover) */
  anchorX: number;
  anchorY: number;
  /** Close the picker */
  onClose: () => void;
  /** Show alpha slider (default false) */
  showAlpha?: boolean;
}

type InputMode = 'rgb' | 'hsl';

// ============================================================================
// Component
// ============================================================================

export function ColorPicker({
  color,
  onChange,
  anchorX,
  anchorY,
  onClose,
  showAlpha = false,
}: ColorPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const svAreaRef = useRef<HTMLDivElement>(null);
  const hueTrackRef = useRef<HTMLDivElement>(null);
  const alphaTrackRef = useRef<HTMLDivElement>(null);

  // Internal HSV state (avoids hue jumps when s=0 or v=0)
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(color.r, color.g, color.b));
  const [alpha, setAlpha] = useState(color.a);
  const [inputMode, setInputMode] = useState<InputMode>('rgb');
  const [hexInput, setHexInput] = useState(() => rgbToHex(color.r, color.g, color.b));
  const initialColor = useRef(color);

  // Dragging state
  const draggingRef = useRef<'sv' | 'hue' | 'alpha' | null>(null);

  // Emit color from HSV + alpha
  const emitColor = useCallback(
    (h: number, s: number, v: number, a: number) => {
      const rgb = hsvToRgb(h, s, v);
      setHexInput(rgbToHex(rgb.r, rgb.g, rgb.b));
      onChange({ ...rgb, a });
    },
    [onChange]
  );

  // ---- SV Area interaction ----

  const updateSV = useCallback(
    (clientX: number, clientY: number) => {
      const el = svAreaRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const s = clamp((clientX - rect.left) / rect.width, 0, 1);
      const v = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
      setHsv((prev) => {
        const next = { ...prev, s, v };
        emitColor(next.h, next.s, next.v, alpha);
        return next;
      });
    },
    [alpha, emitColor]
  );

  const handleSVPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      draggingRef.current = 'sv';
      const el = e.target as HTMLElement;
      if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
      updateSV(e.clientX, e.clientY);
    },
    [updateSV]
  );

  // ---- Hue slider interaction ----

  const updateHue = useCallback(
    (clientX: number) => {
      const el = hueTrackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const h = clamp((clientX - rect.left) / rect.width, 0, 1) * 360;
      setHsv((prev) => {
        const next = { ...prev, h };
        emitColor(next.h, next.s, next.v, alpha);
        return next;
      });
    },
    [alpha, emitColor]
  );

  const handleHuePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      draggingRef.current = 'hue';
      const el = e.target as HTMLElement;
      if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
      updateHue(e.clientX);
    },
    [updateHue]
  );

  // ---- Alpha slider interaction ----

  const updateAlpha = useCallback(
    (clientX: number) => {
      const el = alphaTrackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const a = clamp((clientX - rect.left) / rect.width, 0, 1);
      setAlpha(a);
      emitColor(hsv.h, hsv.s, hsv.v, a);
    },
    [hsv, emitColor]
  );

  const handleAlphaPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      draggingRef.current = 'alpha';
      const el = e.target as HTMLElement;
      if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
      updateAlpha(e.clientX);
    },
    [updateAlpha]
  );

  // ---- Unified pointer move/up ----

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      if (draggingRef.current === 'sv') updateSV(e.clientX, e.clientY);
      else if (draggingRef.current === 'hue') updateHue(e.clientX);
      else if (draggingRef.current === 'alpha') updateAlpha(e.clientX);
    },
    [updateSV, updateHue, updateAlpha]
  );

  const handlePointerUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  // ---- Hex input ----

  const handleHexChange = useCallback(
    (value: string) => {
      setHexInput(value);
      const rgb = hexToRgb(value);
      if (rgb) {
        const newHsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        setHsv(newHsv);
        onChange({ ...rgb, a: alpha });
      }
    },
    [alpha, onChange]
  );

  // ---- RGB inputs ----

  const handleRgbChange = useCallback(
    (channel: 'r' | 'g' | 'b', value: string) => {
      const num = parseInt(value, 10);
      if (isNaN(num)) return;
      const clamped = clamp(num, 0, 255);
      const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
      rgb[channel] = clamped;
      const newHsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      // Preserve hue when saturation/value hits zero
      if (newHsv.s === 0 || newHsv.v === 0) newHsv.h = hsv.h;
      setHsv(newHsv);
      setHexInput(rgbToHex(rgb.r, rgb.g, rgb.b));
      onChange({ ...rgb, a: alpha });
    },
    [hsv, alpha, onChange]
  );

  // ---- HSL inputs ----

  const handleHslChange = useCallback(
    (channel: 'h' | 's' | 'l', value: string) => {
      const num = parseInt(value, 10);
      if (isNaN(num)) return;
      const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      if (channel === 'h') hsl.h = clamp(num, 0, 360);
      else if (channel === 's') hsl.s = clamp(num, 0, 100);
      else hsl.l = clamp(num, 0, 100);
      // Convert HSL back through hsvToRgb
      const newRgb = hslToRgb(hsl.h, hsl.s, hsl.l);
      const newHsv = rgbToHsv(newRgb.r, newRgb.g, newRgb.b);
      if (newHsv.s === 0 || newHsv.v === 0) newHsv.h = hsl.h;
      setHsv(newHsv);
      setHexInput(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
      onChange({ ...newRgb, a: alpha });
    },
    [hsv, alpha, onChange]
  );

  const handleAlphaInput = useCallback(
    (value: string) => {
      const num = parseInt(value, 10);
      if (isNaN(num)) return;
      const a = clamp(num, 0, 100) / 100;
      setAlpha(a);
      const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
      onChange({ ...rgb, a });
    },
    [hsv, onChange]
  );

  // ---- Position picker with viewport clamping ----

  useEffect(() => {
    const el = pickerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let x = anchorX;
    let y = anchorY;
    if (x + rect.width > window.innerWidth) x = anchorX - rect.width;
    if (y + rect.height > window.innerHeight) y = anchorY - rect.height;
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }, [anchorX, anchorY]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Derived display values
  const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const hueColor = `hsl(${Math.round(hsv.h)}, 100%, 50%)`;
  const currentHex = rgbToHex(rgb.r, rgb.g, rgb.b);
  const initialHex = rgbToHex(
    Math.round(initialColor.current.r),
    Math.round(initialColor.current.g),
    Math.round(initialColor.current.b)
  );

  return createPortal(
    <>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className={styles.overlay} onClick={onClose} data-testid="color-picker-overlay" />
      <div
        ref={pickerRef}
        className={styles.picker}
        style={{ left: anchorX, top: anchorY }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        data-testid="color-picker"
      >
        {/* SV Area */}
        <div
          ref={svAreaRef}
          className={styles.svArea}
          style={{ backgroundColor: hueColor }}
          onPointerDown={handleSVPointerDown}
          data-testid="sv-area"
        >
          <div className={styles.svGradientWhite} />
          <div className={styles.svGradientBlack} />
          <div
            className={styles.svCursor}
            style={{
              left: `${hsv.s * 100}%`,
              top: `${(1 - hsv.v) * 100}%`,
            }}
          />
        </div>

        {/* Sliders Row */}
        <div className={styles.slidersRow}>
          {/* New/Old color preview */}
          <div className={styles.previewStack}>
            <div
              className={styles.previewNew}
              style={{ backgroundColor: currentHex }}
              title="New color"
            />
            <div
              className={styles.previewOld}
              style={{ backgroundColor: initialHex }}
              title="Original color"
            />
          </div>

          <div className={styles.slidersCol}>
            {/* Hue slider */}
            <div
              ref={hueTrackRef}
              className={`${styles.sliderTrack} ${styles.hueTrack}`}
              onPointerDown={handleHuePointerDown}
              data-testid="hue-slider"
            >
              <div
                className={styles.sliderThumb}
                style={{ left: `${(hsv.h / 360) * 100}%` }}
              />
            </div>

            {/* Alpha slider */}
            {showAlpha && (
              <div
                ref={alphaTrackRef}
                className={`${styles.sliderTrack} ${styles.alphaTrack}`}
                onPointerDown={handleAlphaPointerDown}
                data-testid="alpha-slider"
              >
                <div
                  className={styles.alphaGradient}
                  style={{
                    background: `linear-gradient(to right, transparent, ${currentHex})`,
                  }}
                />
                <div
                  className={styles.sliderThumb}
                  style={{ left: `${alpha * 100}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Input Fields */}
        <div className={styles.inputRow}>
          {/* Hex */}
          <div className={`${styles.inputCol} ${styles.inputColHex}`}>
            <input
              className={styles.inputField}
              value={hexInput}
              onChange={(e) => handleHexChange(e.target.value)}
              onBlur={() => setHexInput(currentHex)}
              spellCheck={false}
              data-testid="hex-input"
            />
            <span className={styles.inputFieldLabel}>Hex</span>
          </div>

          {inputMode === 'rgb' ? (
            <>
              <div className={styles.inputCol}>
                <input
                  className={styles.inputField}
                  value={rgb.r}
                  onChange={(e) => handleRgbChange('r', e.target.value)}
                  type="number"
                  min={0}
                  max={255}
                  data-testid="r-input"
                />
                <span className={styles.inputFieldLabel}>R</span>
              </div>
              <div className={styles.inputCol}>
                <input
                  className={styles.inputField}
                  value={rgb.g}
                  onChange={(e) => handleRgbChange('g', e.target.value)}
                  type="number"
                  min={0}
                  max={255}
                  data-testid="g-input"
                />
                <span className={styles.inputFieldLabel}>G</span>
              </div>
              <div className={styles.inputCol}>
                <input
                  className={styles.inputField}
                  value={rgb.b}
                  onChange={(e) => handleRgbChange('b', e.target.value)}
                  type="number"
                  min={0}
                  max={255}
                  data-testid="b-input"
                />
                <span className={styles.inputFieldLabel}>B</span>
              </div>
            </>
          ) : (
            <>
              <div className={styles.inputCol}>
                <input
                  className={styles.inputField}
                  value={hsl.h}
                  onChange={(e) => handleHslChange('h', e.target.value)}
                  type="number"
                  min={0}
                  max={360}
                  data-testid="h-input"
                />
                <span className={styles.inputFieldLabel}>H</span>
              </div>
              <div className={styles.inputCol}>
                <input
                  className={styles.inputField}
                  value={hsl.s}
                  onChange={(e) => handleHslChange('s', e.target.value)}
                  type="number"
                  min={0}
                  max={100}
                  data-testid="s-input"
                />
                <span className={styles.inputFieldLabel}>S</span>
              </div>
              <div className={styles.inputCol}>
                <input
                  className={styles.inputField}
                  value={hsl.l}
                  onChange={(e) => handleHslChange('l', e.target.value)}
                  type="number"
                  min={0}
                  max={100}
                  data-testid="l-input"
                />
                <span className={styles.inputFieldLabel}>L</span>
              </div>
            </>
          )}

          {showAlpha && (
            <div className={styles.inputCol}>
              <input
                className={styles.inputField}
                value={Math.round(alpha * 100)}
                onChange={(e) => handleAlphaInput(e.target.value)}
                type="number"
                min={0}
                max={100}
                data-testid="a-input"
              />
              <span className={styles.inputFieldLabel}>A</span>
            </div>
          )}

          {/* Mode toggle */}
          <button
            className={styles.modeToggle}
            onClick={() => setInputMode((m) => (m === 'rgb' ? 'hsl' : 'rgb'))}
            title={`Switch to ${inputMode === 'rgb' ? 'HSL' : 'RGB'}`}
            data-testid="mode-toggle"
          >
            {inputMode === 'rgb' ? 'HSL' : 'RGB'}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

// ============================================================================
// HSL to RGB helper (needed for HSL input mode)
// ============================================================================

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let r1 = 0,
    g1 = 0,
    b1 = 0;
  if (h < 60) { r1 = c; g1 = x; }
  else if (h < 120) { r1 = x; g1 = c; }
  else if (h < 180) { g1 = c; b1 = x; }
  else if (h < 240) { g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

export default ColorPicker;
