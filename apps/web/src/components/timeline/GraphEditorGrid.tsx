/**
 * GraphEditorGrid — Background grid lines and labels for the graph editor.
 * Renders vertical (frame) and horizontal (value) grid lines with labels.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- @quar/animation types resolve to any without built dist */
import type { GraphViewTransform } from '@quar/animation';
import { graphToScreen, screenToGraph } from '@quar/animation';
import styles from './GraphEditor.module.css';

interface GraphEditorGridProps {
  transform: GraphViewTransform;
  currentFrame: number;
}

/**
 * Compute a "nice" step size for grid lines based on pixel density.
 * Aims for grid lines every ~50-100 pixels.
 */
function niceStep(pixelsPerUnit: number, targetSpacing: number = 60): number {
  if (pixelsPerUnit <= 0) return 1;
  const rawStep = targetSpacing / pixelsPerUnit;
  // Round to a "nice" number: 1, 2, 5, 10, 20, 50, 100, ...
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  let nice: number;
  if (norm <= 1.5) nice = 1;
  else if (norm <= 3.5) nice = 2;
  else if (norm <= 7.5) nice = 5;
  else nice = 10;
  return nice * mag;
}

export function GraphEditorGrid({ transform, currentFrame }: GraphEditorGridProps) {
  const { viewWidth, viewHeight } = transform;

  // Compute visible range in graph space
  const topLeft = screenToGraph(0, 0, transform);
  const bottomRight = screenToGraph(viewWidth, viewHeight, transform);
  const minFrame = Math.floor(topLeft.frame);
  const maxFrame = Math.ceil(bottomRight.frame);
  const minValue = Math.floor(bottomRight.value); // Y is flipped
  const maxValue = Math.ceil(topLeft.value);

  // Grid step sizes
  const frameStep = niceStep(transform.scaleX, 80);
  const valueStep = niceStep(transform.scaleY, 60);

  // Generate vertical (frame) grid lines
  const vLines: JSX.Element[] = [];
  const startFrame = Math.floor(minFrame / frameStep) * frameStep;
  for (let f = startFrame; f <= maxFrame; f += frameStep) {
    const pos = graphToScreen(f, 0, transform);
    const isZero = Math.abs(f) < 0.001;
    vLines.push(
      <line
        key={`vf-${f}`}
        x1={pos.x}
        y1={0}
        x2={pos.x}
        y2={viewHeight}
        className={isZero ? styles.gridLineZero : styles.gridLine}
      />
    );
    // Frame label at top
    if (frameStep >= 1 || f % 1 === 0) {
      vLines.push(
        <text key={`vfl-${f}`} x={pos.x + 3} y={12} className={styles.gridLabel}>
          {Math.round(f)}
        </text>
      );
    }
  }

  // Generate horizontal (value) grid lines
  const hLines: JSX.Element[] = [];
  const startValue = Math.floor(minValue / valueStep) * valueStep;
  for (let v = startValue; v <= maxValue; v += valueStep) {
    const pos = graphToScreen(0, v, transform);
    const isZero = Math.abs(v) < 0.001;
    hLines.push(
      <line
        key={`hv-${v}`}
        x1={0}
        y1={pos.y}
        x2={viewWidth}
        y2={pos.y}
        className={isZero ? styles.gridLineZero : styles.gridLine}
      />
    );
    // Value label on left
    hLines.push(
      <text key={`hvl-${v}`} x={3} y={pos.y - 3} className={styles.gridLabel}>
        {Number.isInteger(v) ? v : v.toFixed(1)}
      </text>
    );
  }

  // Playhead line
  const playheadPos = graphToScreen(currentFrame, 0, transform);

  return (
    <svg className={styles.svgOverlay} data-testid="graph-editor-grid">
      {vLines}
      {hLines}
      <line
        x1={playheadPos.x}
        y1={0}
        x2={playheadPos.x}
        y2={viewHeight}
        className={styles.playheadLine}
      />
    </svg>
  );
}
