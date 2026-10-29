/**
 * CanvasUnavailable — said over the canvas when it can't be drawn: the
 * browser has no WebGL 2 (turned off, or missing), or its graphics stopped
 * (the WebGL context was lost) and didn't come back. What's wrong, what to
 * do about it, and the guide's page on it. The rest of the editor works
 * either way, so the work in it can still be saved.
 */

import { BookOpen, MonitorX } from 'lucide-react';
import { openHelp } from '../help/helpPanel';
import styles from './CanvasUnavailable.module.css';

export type CanvasProblem = 'no-webgl2' | 'context-lost';

const MESSAGES: Record<
  CanvasProblem,
  { readout: string; title: string; lead: string; steps: string[]; note: string }
> = {
  'no-webgl2': {
    readout: 'WebGL 2 · unavailable',
    title: 'This browser can’t draw the canvas',
    lead: 'The canvas is drawn with WebGL 2, the graphics part of your browser, and here it’s turned off or missing.',
    steps: [
      'Turn on hardware acceleration in your browser’s settings (in Chrome and Edge, “Use graphics acceleration when available”), then restart the browser.',
      'Update the browser, and if you can, your computer’s graphics drivers.',
      'Try another up-to-date browser: Chrome, Edge, Firefox and Safari all have WebGL 2.',
    ],
    note: 'Your layers, the panels and the menus still work: File › Download as .quar keeps a copy of the project.',
  },
  'context-lost': {
    readout: 'WebGL 2 · context lost',
    title: 'The canvas stopped drawing',
    lead: 'Your browser’s graphics (WebGL 2) stopped working and didn’t come back. Your work is still in the editor.',
    steps: [
      'Save the project (File › Save), or keep a copy with File › Download as .quar.',
      'Reload the page.',
      'If it happens again, turn on hardware acceleration in your browser’s settings and update the browser.',
    ],
    note: 'Exports that make pictures or videos need WebGL 2 too.',
  },
};

export function CanvasUnavailable({ problem }: { problem: CanvasProblem }) {
  const { readout, title, lead, steps, note } = MESSAGES[problem];
  return (
    <div
      className={styles.backdrop}
      role="alert"
      data-testid="canvas-unavailable"
      data-problem={problem}
      data-help="troubleshooting#webgl"
    >
      <section className={styles.card} aria-labelledby="canvas-unavailable-title">
        <div className={styles.readout}>
          <span className={styles.signal} aria-hidden="true" />
          {readout}
        </div>
        <div className={styles.heading}>
          <MonitorX className={styles.icon} size={22} strokeWidth={1.6} aria-hidden="true" />
          <h2 id="canvas-unavailable-title" className={styles.title}>
            {title}
          </h2>
        </div>
        <p className={styles.lead}>{lead}</p>
        <ol className={styles.steps}>
          {steps.map((step) => (
            <li key={step} className={styles.step}>
              {step}
            </li>
          ))}
        </ol>
        <p className={styles.note}>{note}</p>
        <button
          type="button"
          className={styles.guideButton}
          onClick={() => openHelp('troubleshooting', 'webgl')}
        >
          <BookOpen size={13} aria-hidden="true" />
          More in the user guide
        </button>
      </section>
    </div>
  );
}
