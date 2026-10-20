/**
 * Tests for ConsentBanner (F007 — banner no longer reappears forever)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '../../test/utils';
import { ConsentBanner, ensureGoogleFontsConsent, hasGoogleFontsConsent } from './ConsentBanner';
import { PromptDialogHost } from './PromptDialog';

const STORAGE_KEY = 'quar-consent-accepted';
const GOOGLE_FONTS_CONSENT_KEY = 'quar-google-fonts-consent';

describe('ConsentBanner (F007)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stays hidden once dismissed, even without Google Fonts consent', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    // No google-fonts flag (declined) — must NOT force the banner back.
    render(<ConsentBanner />);
    expect(screen.queryByTestId('consent-banner')).toBeNull();
  });

  it('stays hidden when dismissed even with Google Fonts consent granted', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    localStorage.setItem(GOOGLE_FONTS_CONSENT_KEY, 'true');
    render(<ConsentBanner />);
    expect(screen.queryByTestId('consent-banner')).toBeNull();
  });

  it('shows when never dismissed', () => {
    render(<ConsentBanner />);
    expect(screen.getByTestId('consent-banner')).toBeTruthy();
  });
});

describe('ensureGoogleFontsConsent', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('allows straight away when already allowed', async () => {
    localStorage.setItem(GOOGLE_FONTS_CONSENT_KEY, 'true');
    await expect(ensureGoogleFontsConsent()).resolves.toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks the first time, and remembers a yes', async () => {
    vi.useFakeTimers();
    render(<PromptDialogHost />);

    let result!: Promise<boolean>;
    act(() => {
      result = ensureGoogleFontsConsent();
    });
    expect(screen.getByRole('dialog', { name: 'Use Google Fonts?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Allow Google Fonts' }));
    act(() => vi.advanceTimersByTime(120));

    await expect(result).resolves.toBe(true);
    expect(hasGoogleFontsConsent()).toBe(true);
    vi.useRealTimers();
  });

  it('leaves Google Fonts off when declined', async () => {
    vi.useFakeTimers();
    render(<PromptDialogHost />);

    let result!: Promise<boolean>;
    act(() => {
      result = ensureGoogleFontsConsent();
    });
    fireEvent.click(screen.getByTestId('prompt-dialog-cancel'));
    act(() => vi.advanceTimersByTime(120));

    await expect(result).resolves.toBe(false);
    expect(hasGoogleFontsConsent()).toBe(false);
    vi.useRealTimers();
  });
});
