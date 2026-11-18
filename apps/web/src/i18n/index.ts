/** Public API for the editor's UI localization. */

export {
  type Locale,
  getLocale,
  setLocale,
  toggleLocale,
  useLocale,
  notifyCatalogChange,
} from './store';
export {
  installI18n,
  uninstallI18n,
  refreshI18n,
  t,
  tf,
  translateText,
  translateTree,
} from './translator';
export {
  type Dictionary,
  type ImportResult,
  getDictionary,
  lookup,
  resolveKey,
  importDictionary as parseDictionary,
  exportDictionary,
  resetDictionary as clearDictionary,
  isImported,
} from './catalog';

import { importDictionary, resetDictionary, type ImportResult } from './catalog';
import { notifyCatalogChange } from './store';

/** Import a JSON dictionary, then refresh the whole UI. */
export function applyDictionary(locale: import('./store').Locale, json: string): ImportResult {
  const result = importDictionary(locale, json);
  if (result.ok) notifyCatalogChange();
  return result;
}

/** Restore the built-in dictionary, then refresh the whole UI. */
export function restoreDictionary(locale: import('./store').Locale): void {
  resetDictionary(locale);
  notifyCatalogChange();
}
