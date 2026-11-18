/**
 * Preferences dialog — a modal with a tabbed sidebar (General) holding the
 * UI language picker and a JSON dictionary import/export control.
 *
 * Follows the PromptDialog / ExportDialog imperative + host pattern:
 *   import { showPreferences } from './PreferencesDialog';
 *   showPreferences();
 * Mount <PreferencesDialogHost /> once inside the editor.
 *
 * Matches the editor's dialog look: blurred backdrop, click-outside to close,
 * and the same enter/exit animations driven by `exiting`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Upload, RotateCcw, X } from 'lucide-react';
import {
  t,
  type Locale,
  getLocale,
  setLocale,
  applyDictionary,
  exportDictionary,
  restoreDictionary,
  isImported,
  type ImportResult,
} from '../../i18n';
import { downloadBlob } from '../../services/exportService';
import styles from './PreferencesDialog.module.css';

type Tab = 'general';

interface PreferencesState {
  open: boolean;
}

const state: PreferencesState = { open: false };
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

/** Open the Preferences dialog (imperative). */
export function showPreferences(): void {
  if (state.open) return;
  state.open = true;
  emit();
}

function usePreferencesState(): boolean {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  return state.open;
}

const TABS: { id: Tab; label: string }[] = [{ id: 'general', label: 'general' }];

export function PreferencesDialogHost() {
  const open = usePreferencesState();
  return open ? <PreferencesDialog /> : null;
}

function PreferencesDialog() {
  const [tab] = useState<Tab>('general');
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [exiting, setExiting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();

  const close = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      state.open = false;
      emit();
    }, 120);
  }, [exiting]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    },
    [close]
  );

  const handleLocaleChange = (next: Locale) => {
    setLocale(next);
    setLocaleState(next);
    setStatus(null);
  };

  const handleExport = () => {
    const json = exportDictionary(locale);
    downloadBlob(new Blob([json], { type: 'application/json' }), `quar-i18n-${locale}.json`);
  };

  const handleImportFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const result: ImportResult = applyDictionary(locale, text);
      if (result.ok) {
        setStatus({ kind: 'ok', text: t('Dictionary imported') + ` (${result.count})` });
      } else {
        setStatus({
          kind: 'error',
          text:
            result.error === 'invalid-json'
              ? t('Invalid JSON file')
              : t('Invalid dictionary format'),
        });
      }
    };
    reader.onerror = () => setStatus({ kind: 'error', text: t('Could not read the file') });
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleReset = () => {
    restoreDictionary(locale);
    setStatus({ kind: 'ok', text: t('Dictionary reset to default') });
  };

  return createPortal(
    <div
      className={`${styles.backdrop} ${exiting ? styles.exiting : ''}`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      data-testid="preferences-backdrop"
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t('Preferences')}
        data-testid="preferences-dialog"
        onKeyDown={handleKeyDown}
      >
        <div className={styles.header}>
          <h3 className={styles.title}>{t('Preferences')}</h3>
          <button className={styles.close} aria-label={t('Close')} onClick={close}>
            <X size={16} />
          </button>
        </div>
        <div className={styles.body}>
          <nav className={styles.sidebar} aria-label={t('Categories')}>
            {TABS.map((item) => (
              <button
                key={item.id}
                className={`${styles.tab} ${tab === item.id ? styles.tabActive : ''}`}
                onClick={() => setTab(item.id)}
                data-testid={`preferences-tab-${item.id}`}
              >
                {t('General')}
              </button>
            ))}
          </nav>
          <div className={styles.content} data-testid="preferences-content">
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>{t('Appearance')}</h4>
              <div className={styles.row}>
                <label className={styles.rowLabel} htmlFor="preferences-language">
                  {t('Language')}
                </label>
                <select
                  id="preferences-language"
                  className={styles.select}
                  value={locale}
                  onChange={(e) => handleLocaleChange(e.target.value as Locale)}
                  data-testid="preferences-language"
                >
                  <option value="en">English</option>
                  <option value="zh-CN">中文 (Chinese)</option>
                </select>
              </div>
              <p className={styles.hint}>{t('Choose the language used by the interface.')}</p>
            </section>

            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>{t('Translation dictionary')}</h4>
              <p className={styles.hint}>
                {t(
                  'Export a JSON template to edit translations, then import it back. Missing entries fall back to the English original.'
                )}
              </p>
              <div className={styles.actions}>
                <button className={styles.button} onClick={handleExport} data-testid="preferences-export">
                  <Download size={14} /> {t('Export JSON template')}
                </button>
                <button
                  className={styles.button}
                  onClick={() => fileRef.current?.click()}
                  data-testid="preferences-import"
                >
                  <Upload size={14} /> {t('Import JSON')}
                </button>
                <input
                  ref={fileRef}
                  className={styles.fileInput}
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => handleImportFile(e.target.files?.[0])}
                  data-testid="preferences-file-input"
                />
                <button
                  className={styles.buttonGhost}
                  onClick={handleReset}
                  disabled={!isImported(locale)}
                  data-testid="preferences-reset"
                >
                  <RotateCcw size={14} /> {t('Reset to default')}
                </button>
              </div>
              {status && (
                <p
                  className={status.kind === 'ok' ? styles.statusOk : styles.statusError}
                  role="status"
                  data-testid="preferences-status"
                >
                  {status.text}
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
