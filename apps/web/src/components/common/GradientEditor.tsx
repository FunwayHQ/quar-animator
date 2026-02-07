/**
 * GradientEditor — Inline gradient editor with preview bar, stop handles, and type selector
 *
 * Features:
 * - Fill type tabs: Solid / Linear / Radial / Conic
 * - Gradient preview bar with CSS gradient
 * - Draggable stop handles (diamond-shaped)
 * - Click on bar to add stop, double-click handle to remove
 * - Selected stop shows color swatch (opens ColorPicker) + offset input
 * - Gradient-type-specific params: angle (linear/conic), center/radius (radial)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { Color, Gradient, GradientStop } from '@quar/types';
import { ColorPicker } from './ColorPicker';
import styles from './GradientEditor.module.css';

// ============================================================================
// Types
// ============================================================================

export type FillType = 'solid' | 'linear' | 'radial' | 'conic';

export interface GradientEditorProps {
  /** Current fill type */
  fillType: FillType;
  /** Called when fill type changes */
  onFillTypeChange: (type: FillType) => void;
  /** Current gradient (used when fillType !== 'solid') */
  gradient: Gradient;
  /** Called on gradient change */
  onChange: (gradient: Gradient) => void;
}

// ============================================================================
// Helpers
// ============================================================================

function colorToHex(c: Color): string {
  return (
    '#' +
    Math.round(c.r).toString(16).padStart(2, '0') +
    Math.round(c.g).toString(16).padStart(2, '0') +
    Math.round(c.b).toString(16).padStart(2, '0')
  ).toUpperCase();
}

function colorToRgba(c: Color): string {
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${c.a})`;
}

/** Always renders a horizontal left-to-right strip for the preview bar. */
function gradientToCSS(gradient: Gradient): string {
  const sortedStops = [...gradient.stops].sort((a, b) => a.offset - b.offset);
  const stopStrings = sortedStops
    .map((s) => `${colorToRgba(s.color)} ${(s.offset * 100).toFixed(1)}%`)
    .join(', ');

  return `linear-gradient(to right, ${stopStrings})`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ============================================================================
// Component
// ============================================================================

export function GradientEditor({
  fillType,
  onFillTypeChange,
  gradient,
  onChange,
}: GradientEditorProps) {
  const [selectedStopIndex, setSelectedStopIndex] = useState(0);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState({ x: 0, y: 0 });
  const barRef = useRef<HTMLDivElement>(null);
  const draggingStopRef = useRef<number | null>(null);
  const stopSwatchRef = useRef<HTMLDivElement>(null);

  // Ensure selectedStopIndex stays in bounds
  useEffect(() => {
    if (selectedStopIndex >= gradient.stops.length) {
      setSelectedStopIndex(Math.max(0, gradient.stops.length - 1));
    }
  }, [gradient.stops.length, selectedStopIndex]);

  const selectedStop = gradient.stops[selectedStopIndex];

  // ---- Stop dragging ----

  const handleStopPointerDown = useCallback(
    (e: React.PointerEvent, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      draggingStopRef.current = index;
      setSelectedStopIndex(index);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const handleStopPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (draggingStopRef.current === null) return;
      const bar = barRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const offset = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const newStops = gradient.stops.map((s, i) =>
        i === draggingStopRef.current ? { ...s, offset } : s
      );
      onChange({ ...gradient, stops: newStops });
    },
    [gradient, onChange]
  );

  const handleStopPointerUp = useCallback(() => {
    draggingStopRef.current = null;
  }, []);

  // ---- Add stop on bar click ----

  const handleBarClick = useCallback(
    (e: React.MouseEvent) => {
      // Only add if clicking the bar itself, not a stop handle
      if ((e.target as HTMLElement).closest(`.${styles.stopHandle}`)) return;
      const bar = barRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const offset = clamp((e.clientX - rect.left) / rect.width, 0, 1);

      // Interpolate color from neighboring stops
      const sorted = [...gradient.stops].sort((a, b) => a.offset - b.offset);
      let color: Color = { r: 128, g: 128, b: 128, a: 1 };
      if (sorted.length >= 2) {
        const before = [...sorted].reverse().find((s) => s.offset <= offset);
        const after = sorted.find((s) => s.offset >= offset);
        if (before && after && before !== after) {
          const t = (offset - before.offset) / (after.offset - before.offset);
          color = {
            r: Math.round(before.color.r + (after.color.r - before.color.r) * t),
            g: Math.round(before.color.g + (after.color.g - before.color.g) * t),
            b: Math.round(before.color.b + (after.color.b - before.color.b) * t),
            a: before.color.a + (after.color.a - before.color.a) * t,
          };
        }
      }

      const newStops = [...gradient.stops, { offset, color }];
      const newIndex = newStops.length - 1;
      onChange({ ...gradient, stops: newStops });
      setSelectedStopIndex(newIndex);
    },
    [gradient, onChange]
  );

  // ---- Remove stop on double-click ----

  const handleStopDoubleClick = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      if (gradient.stops.length <= 2) return; // Need at least 2 stops
      const newStops = gradient.stops.filter((_, i) => i !== index);
      onChange({ ...gradient, stops: newStops });
      setSelectedStopIndex(Math.min(selectedStopIndex, newStops.length - 1));
    },
    [gradient, onChange, selectedStopIndex]
  );

  // ---- Stop color change via picker ----

  const openStopColorPicker = useCallback(() => {
    const el = stopSwatchRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPickerAnchor({ x: rect.left, y: rect.bottom + 4 });
    setColorPickerOpen(true);
  }, []);

  const handleStopColorChange = useCallback(
    (color: Color) => {
      const newStops = gradient.stops.map((s, i) =>
        i === selectedStopIndex ? { ...s, color } : s
      );
      onChange({ ...gradient, stops: newStops });
    },
    [gradient, onChange, selectedStopIndex]
  );

  // ---- Param changes ----

  const handleAngleChange = useCallback(
    (value: string) => {
      const num = parseFloat(value);
      if (isNaN(num)) return;
      onChange({ ...gradient, angle: num });
    },
    [gradient, onChange]
  );

  const handleOffsetChange = useCallback(
    (value: string) => {
      const num = parseFloat(value);
      if (isNaN(num)) return;
      const offset = clamp(num / 100, 0, 1);
      const newStops = gradient.stops.map((s, i) =>
        i === selectedStopIndex ? { ...s, offset } : s
      );
      onChange({ ...gradient, stops: newStops });
    },
    [gradient, onChange, selectedStopIndex]
  );

  const handleRemoveStop = useCallback(() => {
    if (gradient.stops.length <= 2) return;
    const newStops = gradient.stops.filter((_, i) => i !== selectedStopIndex);
    onChange({ ...gradient, stops: newStops });
    setSelectedStopIndex(Math.min(selectedStopIndex, newStops.length - 1));
  }, [gradient, onChange, selectedStopIndex]);

  // Don't render gradient controls if solid fill
  if (fillType === 'solid') {
    return (
      <div className={styles.editor} data-testid="gradient-editor">
        <div className={styles.typeTabs}>
          {(['solid', 'linear', 'radial', 'conic'] as FillType[]).map((type) => (
            <button
              key={type}
              className={`${styles.typeTab} ${fillType === type ? styles.typeTabActive : ''}`}
              onClick={() => onFillTypeChange(type)}
              data-testid={`fill-type-${type}`}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.editor} data-testid="gradient-editor">
      {/* Fill Type Tabs */}
      <div className={styles.typeTabs}>
        {(['solid', 'linear', 'radial', 'conic'] as FillType[]).map((type) => (
          <button
            key={type}
            className={`${styles.typeTab} ${fillType === type ? styles.typeTabActive : ''}`}
            onClick={() => onFillTypeChange(type)}
            data-testid={`fill-type-${type}`}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>

      {/* Gradient Bar */}
      <div
        ref={barRef}
        className={styles.gradientBar}
        onClick={handleBarClick}
        onPointerMove={handleStopPointerMove}
        onPointerUp={handleStopPointerUp}
        data-testid="gradient-bar"
      >
        <div
          className={styles.gradientPreview}
          style={{ background: gradientToCSS(gradient) }}
        />
        {/* Stop handles */}
        {gradient.stops.map((stop, index) => (
          <div
            key={index}
            className={`${styles.stopHandle} ${index === selectedStopIndex ? styles.stopHandleSelected : ''}`}
            style={{
              left: `${stop.offset * 100}%`,
              backgroundColor: colorToHex(stop.color),
            }}
            onPointerDown={(e) => handleStopPointerDown(e, index)}
            onDoubleClick={(e) => handleStopDoubleClick(e, index)}
            data-testid={`stop-handle-${index}`}
          />
        ))}
      </div>

      {/* Selected Stop Controls */}
      {selectedStop && (
        <div className={styles.paramsRow}>
          {/* Stop color swatch */}
          <div className={styles.stopActions}>
            <div
              ref={stopSwatchRef}
              className={styles.stopColorSwatch}
              style={{ '--swatch-color': colorToHex(selectedStop.color) } as React.CSSProperties}
              onClick={openStopColorPicker}
              data-testid="stop-color-swatch"
            />
            <button
              className={styles.removeStopButton}
              onClick={handleRemoveStop}
              disabled={gradient.stops.length <= 2}
              title="Remove stop"
              data-testid="remove-stop"
            >
              &times;
            </button>
          </div>

          {/* Offset */}
          <div className={styles.paramGroup}>
            <input
              className={styles.paramInput}
              value={Math.round(selectedStop.offset * 100)}
              onChange={(e) => handleOffsetChange(e.target.value)}
              type="number"
              min={0}
              max={100}
              data-testid="stop-offset"
            />
            <span className={styles.paramLabel}>Pos %</span>
          </div>

          {/* Angle (linear/conic) */}
          {(gradient.type === 'linear' || gradient.type === 'conic') && (
            <div className={styles.paramGroup}>
              <input
                className={styles.paramInput}
                value={Math.round(gradient.angle ?? 90)}
                onChange={(e) => handleAngleChange(e.target.value)}
                type="number"
                data-testid="gradient-angle"
              />
              <span className={styles.paramLabel}>Angle</span>
            </div>
          )}
        </div>
      )}

      {/* Color Picker for selected stop */}
      {colorPickerOpen && selectedStop && (
        <ColorPicker
          color={selectedStop.color}
          onChange={handleStopColorChange}
          anchorX={pickerAnchor.x}
          anchorY={pickerAnchor.y}
          onClose={() => setColorPickerOpen(false)}
        />
      )}
    </div>
  );
}

export default GradientEditor;
