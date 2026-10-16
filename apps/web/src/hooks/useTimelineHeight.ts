import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'quar-animator-timeline-height';

export const DEFAULT_TIMELINE_HEIGHT = 200;
export const MIN_TIMELINE_HEIGHT = 120;

function readStoredHeight(): number {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored >= MIN_TIMELINE_HEIGHT
      ? stored
      : DEFAULT_TIMELINE_HEIGHT;
  } catch {
    return DEFAULT_TIMELINE_HEIGHT;
  }
}

/**
 * Height of the expanded timeline panel in CSS pixels, remembered across
 * sessions. Callers clamp the upper bound to the space available.
 */
export function useTimelineHeight(): [number, (height: number) => void] {
  const [height, setHeightState] = useState(readStoredHeight);

  const setHeight = useCallback((next: number) => {
    setHeightState(Math.max(MIN_TIMELINE_HEIGHT, Math.round(next)));
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(height));
    } catch {
      // Storage can be unavailable (private mode, blocked site data).
    }
  }, [height]);

  return [height, setHeight];
}
