import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('../../services/exportService', () => ({ downloadBlob: vi.fn() }));

type PrefModule = typeof import('./PreferencesDialog');

describe('PreferencesDialog', () => {
  let mod: PrefModule;
  let i18n: typeof import('../../i18n');
  const originalLocale = 'en';

  beforeEach(async () => {
    vi.resetModules();
    window.localStorage.clear();
    mod = await import('./PreferencesDialog');
    i18n = await import('../../i18n');
    i18n.setLocale(originalLocale);
  });

  afterEach(async () => {
    // Close any open dialog through its exit animation before RTL unmounts.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 140));
    });
  });

  function open() {
    render(<mod.PreferencesDialogHost />);
    act(() => {
      mod.showPreferences();
    });
  }

  it('opens with a General tab, language select and JSON controls', () => {
    open();
    expect(screen.getByTestId('preferences-dialog')).toBeTruthy();
    expect(screen.getByTestId('preferences-tab-general')).toBeTruthy();
    expect(screen.getByTestId('preferences-language')).toBeTruthy();
    expect(screen.getByTestId('preferences-export')).toBeTruthy();
    expect(screen.getByTestId('preferences-import')).toBeTruthy();
    expect(screen.getByTestId('preferences-file-input')).toBeTruthy();
  });

  it('closes when the backdrop is clicked and plays the exit animation', async () => {
    open();
    const dialog = screen.getByTestId('preferences-dialog');
    fireEvent.mouseDown(screen.getByTestId('preferences-backdrop'));
    expect(dialog.parentElement?.className).toContain('exiting');
    await waitFor(() => expect(screen.queryByTestId('preferences-dialog')).toBeNull());
  });

  it('closes on Escape', async () => {
    open();
    fireEvent.keyDown(screen.getByTestId('preferences-dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('preferences-dialog')).toBeNull());
  });

  it('switches language from the select', () => {
    open();
    const select = screen.getByTestId('preferences-language') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'zh-CN' } });
    expect(i18n.getLocale()).toBe('zh-CN');
  });

  it('rejects an invalid JSON import with an error status', async () => {
    open();
    const input = screen.getByTestId('preferences-file-input') as HTMLInputElement;
    const file = new File(['{bad'], 'bad.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    await waitFor(() => {
      expect(screen.getByTestId('preferences-status')?.textContent).toContain('Invalid JSON');
    });
  });

  it('imports a valid dictionary and shows success', async () => {
    open();
    const select = screen.getByTestId('preferences-language') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'zh-CN' } });
    const key = i18n.resolveKey('Save')!;
    const input = screen.getByTestId('preferences-file-input') as HTMLInputElement;
    const file = new File([JSON.stringify({ [key]: '存储' })], 'dict.json', {
      type: 'application/json',
    });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    await waitFor(() => {
      expect(screen.getByTestId('preferences-status')?.textContent).toContain('Dictionary imported');
    });
  });
});
