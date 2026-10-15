import { useSyncExternalStore } from 'react';

export type UiTheme = 'dark' | 'light';

const STORAGE_KEY = 'quar-animator-ui-theme';
const listeners = new Set<() => void>();

function readSavedTheme(): UiTheme {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

let currentTheme = readSavedTheme();

function applyTheme(theme: UiTheme) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme;
  }
}

// Apply before React paints so a saved light theme does not flash dark on startup.
applyTheme(currentTheme);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return currentTheme;
}

export function setUiTheme(theme: UiTheme) {
  if (theme === currentTheme) return;

  currentTheme = theme;
  applyTheme(theme);
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The UI still changes for this session when persistent storage is unavailable.
  }
  listeners.forEach((listener) => listener());
}

export function useUiTheme() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
