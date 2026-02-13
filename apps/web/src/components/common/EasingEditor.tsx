/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
/**
 * EasingEditor — Full visual cubic bezier curve editor with presets.
 *
 * Portal-based overlay (follows ColorPicker pattern).
 * Features: draggable P1/P2 handles, live preview animation,
 * numeric inputs, categorized presets grid.
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { EasingFunction } from '@quar/types';
import {
  easingToSvgPath,
  easingToBezierPoints,
  getEasingDisplayName,
  getEasingFunction,
  createCubicBezier,
  EASING_CATEGORIES,
} from '@quar/animation';
import { EasingCurvePreview } from './EasingCurvePreview';
import styles from './EasingEditor.module.css';

export interface EasingEditorProps {
  easing: EasingFunction;
  onChange: (easing: EasingFunction) => void;
  anchorX: number;
  anchorY: number;
  onClose: () => void;
}

// Curve drawing area dimensions (inside SVG)
const CURVE_SIZE = 240;
const PAD = 20; // Padding for overshoot

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function easingEqual(a: EasingFunction, b: EasingFunction): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  if (typeof a === 'string' || typeof b === 'string') return false;
  return (
    a.type === 'cubicBezier' &&
    b.type === 'cubicBezier' &&
    a.points[0] === b.points[0] &&
    a.points[1] === b.points[1] &&
    a.points[2] === b.points[2] &&
    a.points[3] === b.points[3]
  );
}

export function EasingEditor({ easing, onChange, anchorX, anchorY, onClose }: EasingEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Local editing state: either cubic bezier points or a named easing
  const [currentEasing, setCurrentEasing] = useState<EasingFunction>(easing);
  const bezierPoints: [number, number, number, number] | null = easingToBezierPoints(
    currentEasing
  ) as [number, number, number, number] | null;
  const isCubicBezier = bezierPoints !== null && typeof currentEasing !== 'string';

  // P1 and P2 for the cubic bezier (local state)
  const [p1, setP1] = useState<[number, number]>(() => {
    const pts = easingToBezierPoints(easing) as [number, number, number, number] | null;
    return pts ? [pts[0], pts[1]] : [0.25, 0.1];
  });
  const [p2, setP2] = useState<[number, number]>(() => {
    const pts = easingToBezierPoints(easing) as [number, number, number, number] | null;
    return pts ? [pts[2], pts[3]] : [0.25, 1];
  });

  // Dragging state
  const dragRef = useRef<'p1' | 'p2' | null>(null);

  // Live preview animation
  const previewRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  // Sync from currentEasing when changing presets
  const syncPointsFromEasing = useCallback((e: EasingFunction) => {
    const pts = easingToBezierPoints(e) as [number, number, number, number] | null;
    if (pts) {
      setP1([pts[0], pts[1]]);
      setP2([pts[2], pts[3]]);
    }
  }, []);

  // ---- Viewport clamping ----

  useEffect(() => {
    const el = editorRef.current;
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

  // Auto-scroll to active preset on open
  useEffect(() => {
    requestAnimationFrame(() => {
      const el = editorRef.current;
      if (!el) return;
      const active = el.querySelector(`.${styles.presetCellActive}`);
      if (active) active.scrollIntoView({ block: 'nearest' });
    });
    // Only run on mount (easing identity won't change after open)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // ---- Live preview animation loop ----

  useEffect(() => {
    startTimeRef.current = performance.now();
    const DURATION = 1500; // ms per direction
    const fn = getEasingFunction(currentEasing) as (t: number) => number;

    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const cycle = elapsed / DURATION;
      // Ping-pong: even cycles go forward, odd go backward
      const isForward = Math.floor(cycle) % 2 === 0;
      const t = cycle % 1;
      const progress = isForward ? t : 1 - t;
      const eased: number = fn(clamp(progress, 0, 1));

      if (previewRef.current) {
        previewRef.current.style.left = `${clamp(eased, -0.1, 1.1) * 100}%`;
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [currentEasing]);

  // ---- Handle drag ----

  const svgToPoint = useCallback((clientX: number, clientY: number): [number, number] => {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const rect = svg.getBoundingClientRect();
    const x = (clientX - rect.left - PAD) / CURVE_SIZE;
    // Y is inverted (SVG Y-down, curve Y-up)
    const y = 1 - (clientY - rect.top - PAD) / CURVE_SIZE;
    return [clamp(x, 0, 1), y]; // X clamped [0,1], Y unclamped for overshoot
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent, handle: 'p1' | 'p2') => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = handle;
    const el = e.target as SVGElement;
    if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const [x, y] = svgToPoint(e.clientX, e.clientY);
      if (dragRef.current === 'p1') {
        setP1([x, y]);
        const newEasing = createCubicBezier(x, y, p2[0], p2[1]);
        setCurrentEasing(newEasing);
      } else {
        setP2([x, y]);
        const newEasing = createCubicBezier(p1[0], p1[1], x, y);
        setCurrentEasing(newEasing);
      }
    },
    [svgToPoint, p1, p2]
  );

  const handlePointerUp = useCallback(() => {
    if (dragRef.current) {
      dragRef.current = null;
      // Commit the current bezier on drag end
      const newEasing = createCubicBezier(p1[0], p1[1], p2[0], p2[1]);
      onChange(newEasing);
    }
  }, [p1, p2, onChange]);

  // ---- Preset click ----

  const handlePresetClick = useCallback(
    (value: EasingFunction) => {
      setCurrentEasing(value);
      syncPointsFromEasing(value);
      onChange(value);
    },
    [onChange, syncPointsFromEasing]
  );

  // ---- Numeric inputs ----

  const handleNumericChange = useCallback(
    (field: 'x1' | 'y1' | 'x2' | 'y2', value: string) => {
      const num = parseFloat(value);
      if (isNaN(num)) return;
      let [x1, y1] = p1;
      let [x2, y2] = p2;
      switch (field) {
        case 'x1':
          x1 = clamp(num, 0, 1);
          break;
        case 'y1':
          y1 = num;
          break;
        case 'x2':
          x2 = clamp(num, 0, 1);
          break;
        case 'y2':
          y2 = num;
          break;
      }
      setP1([x1, y1]);
      setP2([x2, y2]);
      const newEasing = createCubicBezier(x1, y1, x2, y2);
      setCurrentEasing(newEasing);
      onChange(newEasing);
    },
    [p1, p2, onChange]
  );

  // ---- SVG Curve rendering ----

  const svgW = CURVE_SIZE + PAD * 2;
  const svgH = CURVE_SIZE + PAD * 2;

  // Curve path for non-cubic (sampled) or cubic (true SVG C command)
  const curvePath = useMemo(() => {
    if (isCubicBezier) {
      // True SVG cubic bezier
      const sx = PAD;
      const sy = PAD + CURVE_SIZE;
      const c1x = PAD + p1[0] * CURVE_SIZE;
      const c1y = PAD + (1 - p1[1]) * CURVE_SIZE;
      const c2x = PAD + p2[0] * CURVE_SIZE;
      const c2y = PAD + (1 - p2[1]) * CURVE_SIZE;
      const ex = PAD + CURVE_SIZE;
      const ey = PAD;
      return `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${ex},${ey}`;
    }
    // Sampled path for non-bezier easings
    return (easingToSvgPath(currentEasing, CURVE_SIZE, CURVE_SIZE, 96) as string)
      .replace(/M/, `M`)
      .replace(/(\d)/g, (_, d) => d) // just re-offset
      .split(' ')
      .map((seg, i) => {
        if (i === 0) {
          const coords = seg.slice(1).split(',');
          return `M${parseFloat(coords[0]!) + PAD},${parseFloat(coords[1]!) + PAD}`;
        }
        const coords = seg.slice(1).split(',');
        return `L${parseFloat(coords[0]!) + PAD},${parseFloat(coords[1]!) + PAD}`;
      })
      .join(' ');
  }, [currentEasing, isCubicBezier, p1, p2]);

  // Handle positions in SVG coords
  const p1Svg = { x: PAD + p1[0] * CURVE_SIZE, y: PAD + (1 - p1[1]) * CURVE_SIZE };
  const p2Svg = { x: PAD + p2[0] * CURVE_SIZE, y: PAD + (1 - p2[1]) * CURVE_SIZE };
  const startPt = { x: PAD, y: PAD + CURVE_SIZE };
  const endPt = { x: PAD + CURVE_SIZE, y: PAD };

  // Grid lines
  const gridLines = useMemo(() => {
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    for (let i = 0; i <= 4; i++) {
      const pos = PAD + (i / 4) * CURVE_SIZE;
      lines.push({ x1: PAD, y1: pos, x2: PAD + CURVE_SIZE, y2: pos }); // horizontal
      lines.push({ x1: pos, y1: PAD, x2: pos, y2: PAD + CURVE_SIZE }); // vertical
    }
    return lines;
  }, []);

  return createPortal(
    <>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className={styles.overlay} onClick={onClose} data-testid="easing-editor-overlay" />
      <div
        ref={editorRef}
        className={styles.editor}
        style={{ left: anchorX, top: anchorY }}
        data-testid="easing-editor"
      >
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.headerTitle}>Easing Editor</span>
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close easing editor"
            data-testid="easing-editor-close"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* SVG Curve Area */}
        <div className={styles.curveArea}>
          <svg
            ref={svgRef}
            className={styles.curveSvg}
            width={svgW}
            height={svgH}
            viewBox={`0 0 ${svgW} ${svgH}`}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            data-testid="easing-curve-svg"
          >
            {/* Grid */}
            {gridLines.map((l, i) => (
              <line key={i} className={styles.gridLine} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
            ))}

            {/* Dashed diagonal baseline (linear) */}
            <line
              className={styles.baseline}
              x1={startPt.x}
              y1={startPt.y}
              x2={endPt.x}
              y2={endPt.y}
            />

            {/* Curve */}
            <path className={styles.curvePath} d={curvePath} />

            {/* Control lines and handles (only for cubic bezier) */}
            {isCubicBezier && (
              <>
                <line
                  className={styles.controlLine}
                  x1={startPt.x}
                  y1={startPt.y}
                  x2={p1Svg.x}
                  y2={p1Svg.y}
                />
                <line
                  className={styles.controlLine}
                  x1={endPt.x}
                  y1={endPt.y}
                  x2={p2Svg.x}
                  y2={p2Svg.y}
                />
                <circle
                  className={`${styles.handle} ${dragRef.current === 'p1' ? styles.handleActive : ''}`}
                  cx={p1Svg.x}
                  cy={p1Svg.y}
                  r={5}
                  onPointerDown={(e) => handlePointerDown(e, 'p1')}
                  data-testid="easing-handle-p1"
                />
                <circle
                  className={`${styles.handle} ${dragRef.current === 'p2' ? styles.handleActive : ''}`}
                  cx={p2Svg.x}
                  cy={p2Svg.y}
                  r={5}
                  onPointerDown={(e) => handlePointerDown(e, 'p2')}
                  data-testid="easing-handle-p2"
                />
              </>
            )}
          </svg>
        </div>

        {/* Live Preview Strip */}
        <div className={styles.previewStrip} data-testid="easing-preview-strip">
          <div ref={previewRef} className={styles.previewDot} style={{ left: '0%' }} />
        </div>

        {/* Numeric Inputs (only meaningful for cubic bezier, but always show) */}
        <div className={styles.inputsRow}>
          <div className={styles.inputCol}>
            <span className={styles.inputLabel}>X1</span>
            <input
              type="number"
              className={styles.inputField}
              value={Number(p1[0].toFixed(2))}
              step={0.01}
              min={0}
              max={1}
              onChange={(e) => handleNumericChange('x1', e.target.value)}
              data-testid="easing-input-x1"
            />
          </div>
          <div className={styles.inputCol}>
            <span className={styles.inputLabel}>Y1</span>
            <input
              type="number"
              className={styles.inputField}
              value={Number(p1[1].toFixed(2))}
              step={0.01}
              onChange={(e) => handleNumericChange('y1', e.target.value)}
              data-testid="easing-input-y1"
            />
          </div>
          <div className={styles.inputCol}>
            <span className={styles.inputLabel}>X2</span>
            <input
              type="number"
              className={styles.inputField}
              value={Number(p2[0].toFixed(2))}
              step={0.01}
              min={0}
              max={1}
              onChange={(e) => handleNumericChange('x2', e.target.value)}
              data-testid="easing-input-x2"
            />
          </div>
          <div className={styles.inputCol}>
            <span className={styles.inputLabel}>Y2</span>
            <input
              type="number"
              className={styles.inputField}
              value={Number(p2[1].toFixed(2))}
              step={0.01}
              onChange={(e) => handleNumericChange('y2', e.target.value)}
              data-testid="easing-input-y2"
            />
          </div>
        </div>

        {/* Preset Grid */}
        <div className={styles.presetArea} data-testid="easing-preset-area">
          {EASING_CATEGORIES.map((cat) => (
            <div key={cat.name}>
              <div className={styles.categoryName}>{cat.name}</div>
              <div className={styles.presetGrid}>
                {cat.items.map((item) => {
                  const isActive = easingEqual(currentEasing, item.value);
                  return (
                    <button
                      key={item.label}
                      className={`${styles.presetCell} ${isActive ? styles.presetCellActive : ''}`}
                      onClick={() => handlePresetClick(item.value)}
                      title={getEasingDisplayName(item.value) as string}
                      data-testid={`easing-preset-${item.label.replace(/\s+/g, '-').toLowerCase()}`}
                    >
                      <EasingCurvePreview
                        easing={item.value}
                        width={32}
                        height={20}
                        active={isActive}
                      />
                      <span className={styles.presetLabel}>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>,
    document.body
  );
}

export default EasingEditor;
