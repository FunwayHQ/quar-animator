/**
 * GDPR Consent Banner
 *
 * Informational banner shown on first visit to inform users that
 * all data is stored locally. No tracking, cookies, or external requests.
 * Includes optional Google Fonts opt-in (sends requests to Google servers).
 *
 * Mount <ConsentBanner /> once in the app root.
 */

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styles from './ConsentBanner.module.css';

const STORAGE_KEY = 'quar-consent-accepted';
export const GOOGLE_FONTS_CONSENT_KEY = 'quar-google-fonts-consent';
const EXIT_ANIMATION_MS = 150;

/** Check if user has granted Google Fonts consent */
export function hasGoogleFontsConsent(): boolean {
  try {
    return localStorage.getItem(GOOGLE_FONTS_CONSENT_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Set Google Fonts consent */
export function setGoogleFontsConsent(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(GOOGLE_FONTS_CONSENT_KEY, 'true');
    } else {
      localStorage.removeItem(GOOGLE_FONTS_CONSENT_KEY);
    }
  } catch {
    // localStorage not available
  }
}

export function ConsentBanner() {
  // Show banner if either: never accepted OR Google Fonts consent not yet granted
  const [visible, setVisible] = useState(
    () => localStorage.getItem(STORAGE_KEY) !== 'true' || !hasGoogleFontsConsent()
  );
  const [exiting, setExiting] = useState(false);
  const [googleFonts, setGoogleFonts] = useState(hasGoogleFontsConsent);

  const handleAccept = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    if (googleFonts) {
      setGoogleFontsConsent(true);
    }
    setExiting(true);
    setTimeout(() => setVisible(false), EXIT_ANIMATION_MS);
  }, [googleFonts]);

  if (!visible) return null;

  return createPortal(
    <div className={styles.overlay} data-testid="consent-banner">
      <div className={`${styles.banner} ${exiting ? styles.exiting : ''}`}>
        <span className={styles.icon} aria-hidden="true">
          &#x1F512;
        </span>
        <div className={styles.text}>
          <strong>Your data stays on your device.</strong> QUAR Animator stores projects locally
          using your browser&apos;s storage. No cookies or tracking.
          <label className={styles.googleFontsToggle}>
            <input
              type="checkbox"
              checked={googleFonts}
              onChange={(e) => setGoogleFonts(e.target.checked)}
              data-testid="google-fonts-consent"
            />
            <span>
              Enable Google Fonts{' '}
              <span className={styles.hint}>(sends requests to Google servers)</span>
            </span>
          </label>
        </div>
        <button className={styles.acceptButton} onClick={handleAccept} data-testid="consent-accept">
          Got it
        </button>
      </div>
    </div>,
    document.body
  );
}
