/**
 * Mutable translation catalogs.
 *
 * Dictionary keys are namespaced `domain.control.purpose` strings (for
 * example `menu.file.save-as`) — see docs/I18N.md. Components and the DOM
 * engine still pass the English source text (e.g. via `t('Save As...')`);
 * `keys.json` maps that source to its namespaced key so callers never need to
 * hard-code the keys themselves.
 *
 * A user can import a JSON dictionary from Preferences to replace a locale's
 * catalog at runtime; the imported copy is persisted in localStorage. A
 * missing key always falls back to the English source string, so a partial
 * import never blanks out the interface.
 */

import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';
import ja from './locales/ja.json';
import keyMapJson from './locales/keys.json';
import { LOCALES, type Locale } from './store';

export type Dictionary = Record<string, string>;

const STORAGE_KEY = 'quar-animator-i18n-catalogs';

const BUILTIN: Record<Locale, Dictionary> = {
  en: en as Dictionary,
  'zh-CN': zhCN as Dictionary,
  'zh-TW': zhTW as Dictionary,
  ja: ja as Dictionary,
};

/** English source text → namespaced dictionary key. */
const KEY_MAP = keyMapJson as Record<string, string>;

/** Imported dictionaries, keyed by locale. Undefined means "use built-in". */
const imported: Partial<Record<Locale, Dictionary>> = readImported();

function readImported(): Partial<Record<Locale, Dictionary>> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Partial<Record<Locale, Dictionary>> = {};
    for (const locale of LOCALES) {
      const value = (parsed as Record<string, unknown>)[locale];
      if (isDictionary(value)) result[locale] = value;
    }
    return result;
  } catch {
    return {};
  }
}

function persist(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
  } catch {
    // Preferences still apply for this session if storage is unavailable.
  }
}

function isDictionary(value: unknown): value is Dictionary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every((v) => typeof v === 'string');
}

/** Active dictionary for a locale (imported copy if present, else built-in). */
export function getDictionary(locale: Locale): Dictionary {
  return imported[locale] ?? BUILTIN[locale];
}

/**
 * Resolve a caller string to a namespaced key. Callers normally pass the
 * English source text; a value that is already a namespaced key passes
 * through. Unknown strings have no key and fall back verbatim.
 */
export function resolveKey(text: string): string | undefined {
  if (!text) return undefined;
  const mapped = KEY_MAP[text];
  if (mapped !== undefined) return mapped;
  // Allow an already-namespaced key to be used directly.
  if (/^[a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9-]+$/.test(text) && text in BUILTIN['en']) return text;
  return undefined;
}

/** Translate an exact source string. Missing keys fall back to English. */
/** Translate a dotted key directly, with optional `{name}` interpolation. */
export function translateKey(
  key: string,
  locale: Locale,
  params?: Record<string, string | number>
): string {
  const template = getDictionary(locale)[key] ?? englishOf(key);
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  );
}

export function lookup(text: string, locale: Locale): string {
  if (!text) return text;
  const key = resolveKey(text) ?? text;
  return getDictionary(locale)[key] ?? text;
}

function englishOf(key: string): string {
  const enDict = getDictionary('en');
  return enDict[key] ?? BUILTIN['en'][key] ?? key;
}

/**
 * Reverse lookup: given a rendered translation, find its English source. Used
 * by the DOM engine to remember the source of text React rendered through
 * `t()`, so switching language (or re-importing) can refresh it again.
 */
export function reverseLookup(value: string, locale: Locale): string | undefined {
  if (locale === 'en') return undefined;
  const dictionary = getDictionary(locale);
  for (const key of Object.keys(dictionary)) {
    if (dictionary[key] === value) return englishOf(key);
  }
  return undefined;
}

export type ImportResult =
  | { ok: true; count: number }
  | { ok: false; error: 'invalid-json' | 'invalid-shape' };

/** Parse and install a JSON dictionary for a locale. */
export function importDictionary(locale: Locale, json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'invalid-json' };
  }
  if (!isDictionary(parsed)) return { ok: false, error: 'invalid-shape' };
  imported[locale] = parsed;
  persist();
  return { ok: true, count: Object.keys(parsed).length };
}

/** Export the active dictionary as a pretty JSON template (namespaced keys). */
export function exportDictionary(locale: Locale): string {
  return JSON.stringify(getDictionary(locale), null, 2);
}

/** Discard the imported dictionary and go back to the built-in one. */
export function resetDictionary(locale: Locale): void {
  delete imported[locale];
  persist();
}

export function isImported(locale: Locale): boolean {
  return imported[locale] !== undefined;
}
