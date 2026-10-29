/**
 * The presentation's loading screen: shown, full screen, while the slides
 * get ready (their pictures, the sounds they play, the fonts their text is
 * set in, their videos' first pictures), with how far that has got. An
 * outline of the first slide, at its shape, stands in for it until it
 * starts.
 */

import type { CSSProperties } from 'react';
import styles from './PresentationPlayer.module.css';

/** How much of one kind of thing is ready, of how much. */
export interface Part {
  done: number;
  total: number;
}

/** What the slides wait for. */
export interface Preparing {
  slides: Part;
  sounds: Part;
  fonts: Part;
  /** The first picture of each video the slides show */
  videos: Part;
}

const LABELS: Record<keyof Preparing, string> = {
  slides: 'Slides',
  videos: 'Videos',
  sounds: 'Sounds',
  fonts: 'Fonts',
};

/** How much of it all is ready, in whole percent. */
export function percentReady(preparing: Preparing): number {
  const parts: Part[] = [preparing.slides, preparing.videos, preparing.sounds, preparing.fonts];
  const total = parts.reduce((sum, part) => sum + part.total, 0);
  const done = parts.reduce((sum, part) => sum + Math.min(part.done, part.total), 0);
  return total > 0 ? Math.floor((100 * done) / total) : 100;
}

interface LoaderProps {
  preparing: Preparing;
  /** The first slide's name, and its width over its height */
  first: { name: string; aspect: number };
  count: number;
  /** Fading away, the first slide coming up under it */
  leaving: boolean;
}

export function PresentationLoader({ preparing, first, count, leaving }: LoaderProps) {
  const percent = percentReady(preparing);
  const aspect = Math.min(4, Math.max(0.25, first.aspect || 16 / 9));
  const parts = (Object.keys(LABELS) as (keyof Preparing)[]).filter(
    (key) => preparing[key].total > 0
  );
  return (
    <div
      className={styles.loader}
      data-leaving={leaving || undefined}
      data-testid="presentation-loading"
    >
      <div className={styles.loaderBody} style={{ '--aspect': aspect } as CSSProperties}>
        <div className={styles.slate} aria-hidden="true">
          <span className={styles.corner} data-at="top-left" />
          <span className={styles.corner} data-at="top-right" />
          <span className={styles.corner} data-at="bottom-left" />
          <span className={styles.corner} data-at="bottom-right" />
          <span className={styles.slateName}>{first.name}</span>
          <span className={styles.slateCount}>
            {count} {count === 1 ? 'slide' : 'slides'}
          </span>
        </div>
        <div
          className={styles.meter}
          role="progressbar"
          aria-label="Getting the slides ready"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span className={styles.meterFill} style={{ width: `${percent}%` }} />
        </div>
        <div className={styles.status}>
          <span role="status">Getting the slides ready</span>
          <span className={styles.percent}>{percent}%</span>
        </div>
        <ul className={styles.parts}>
          {parts.map((key) => {
            const { done, total } = preparing[key];
            return (
              <li key={key} data-done={done >= total || undefined}>
                {LABELS[key]}
                <span>
                  {Math.min(done, total)}/{total}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <p className={styles.leave}>
        <kbd>Esc</kbd> leaves
      </p>
    </div>
  );
}
