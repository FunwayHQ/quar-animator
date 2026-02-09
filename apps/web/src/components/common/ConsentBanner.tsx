/**
 * GDPR Consent Banner
 *
 * Informational banner shown on first visit to inform users that
 * all data is stored locally. No tracking, cookies, or external requests.
 *
 * Mount <ConsentBanner /> once in the app root.
 */

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styles from './ConsentBanner.module.css';

const STORAGE_KEY = 'quar-consent-accepted';
const EXIT_ANIMATION_MS = 150;

export function ConsentBanner() {
  const [visible, setVisible] = useState(() => localStorage.getItem(STORAGE_KEY) !== 'true');
  const [exiting, setExiting] = useState(false);

  const handleAccept = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setExiting(true);
    setTimeout(() => setVisible(false), EXIT_ANIMATION_MS);
  }, []);

  if (!visible) return null;

  return createPortal(
    <div className={styles.overlay} data-testid="consent-banner">
      <div className={`${styles.banner} ${exiting ? styles.exiting : ''}`}>
        <span className={styles.icon} aria-hidden="true">
          &#x1F512;
        </span>
        <span className={styles.text}>
          <strong>Your data stays on your device.</strong> QUAR Animator stores projects locally
          using your browser&apos;s storage. No data is sent to any server. No cookies or tracking.
        </span>
        <button className={styles.acceptButton} onClick={handleAccept} data-testid="consent-accept">
          Got it
        </button>
      </div>
    </div>,
    document.body
  );
}
