/**
 * Tests for ConsentBanner (F007 — banner no longer reappears forever)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '../../test/utils';
import { ConsentBanner } from './ConsentBanner';

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
