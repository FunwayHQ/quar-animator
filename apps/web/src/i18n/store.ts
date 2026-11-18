import { useSyncExternalStore } from 'react';

/**
 * Locale state for the editor UI.
 *
 * Mirrors the `useUiTheme` pattern: a module-level value persisted to
 * localStorage, exposed through `useSyncExternalStore`. English is the
 * default so the editor keeps its original look until the user opts in.
 */

export type Locale = 'en' | 'zh-CN' | 'zh-TW' | 'ja';

/** Every locale the editor ships a dictionary for, in menu order. */
export const LOCALES: readonly Locale[] = ['en', 'zh-CN', 'zh-TW', 'ja'];

/** `<html lang>` plus the meta description each locale uses. */
const DOCUMENT_LANG: Record<Locale, { description: string }> = {
  en: { description: 'QUAR Animator - Free, open-source 2D animation platform' },
  'zh-CN': { description: 'QUAR Animator - 免费、开源的 2D 动画平台' },
  'zh-TW': { description: 'QUAR Animator - 免費、開源的 2D 動畫平台' },
  ja: { description: 'QUAR Animator - 無料・オープンソースの 2D アニメーションツール' },
};

const STORAGE_KEY = 'quar-animator-locale';
const listeners = new Set<() => void>();

function isLocale(value: string | null): value is Locale {
  return value !== null && (LOCALES as readonly string[]).includes(value);
}

function readSavedLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // Storage may be unavailable; fall back to the default.
  }
  return 'en';
}

let currentLocale: Locale = readSavedLocale();

/** Reflect the locale in the document so screen readers and browsers agree. */
export function applyDocumentLocale(locale: Locale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  const description = document.querySelector('meta[name="description"]');
  if (description) {
    description.setAttribute('content', DOCUMENT_LANG[locale].description);
  }
}

applyDocumentLocale(currentLocale);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Locale {
  return currentLocale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (locale === currentLocale) return;
  currentLocale = locale;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // The locale still changes for this session when storage is unavailable.
  }
  applyDocumentLocale(locale);
  listeners.forEach((listener) => listener());
}

/** Notify subscribers that the active dictionary changed (imported/reset). */
export function notifyCatalogChange(): void {
  listeners.forEach((listener) => listener());
}

/** Subscribe to raw locale changes (used by the DOM translation engine). */
export function subscribeLocale(listener: (locale: Locale) => void): () => void {
  const wrapped = () => listener(currentLocale);
  return subscribe(wrapped);
}

export function toggleLocale(): void {
  const index = LOCALES.indexOf(currentLocale);
  setLocale(LOCALES[(index + 1) % LOCALES.length]!);
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
