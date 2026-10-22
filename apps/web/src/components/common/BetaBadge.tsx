/**
 * The BETA tag beside the logo, and the notice it opens: what a beta means
 * for your work, and where to report what breaks. The notice opens by itself
 * once per browser (without taking focus); the tag brings it back.
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { Bug, HardDriveDownload, X } from 'lucide-react';
import styles from './BetaBadge.module.css';

/** Where problems are reported: the project's GitHub issues. */
export const REPORT_ISSUES_URL = 'https://github.com/FunwayHQ/quar-animator/issues';

/** Set once the notice has been closed in this browser. */
export const BETA_NOTICE_KEY = 'quar-beta-notice-seen';

function noticeSeen(): boolean {
  try {
    return localStorage.getItem(BETA_NOTICE_KEY) === '1';
  } catch {
    return true; // No storage: don't show it on every load
  }
}

function markNoticeSeen(): void {
  try {
    localStorage.setItem(BETA_NOTICE_KEY, '1');
  } catch {
    // Storage unavailable: closed for this page only
  }
}

/** What the notice says about where projects are kept (a component). */
export type BetaStorageNote = () => ReactElement | null;

/** Where this edition keeps projects, and what to do about it in a beta. */
function LocalStorageNote(): ReactElement {
  return (
    <>
      Your projects live in this browser. Keep a copy of work you care about:{' '}
      <span className={styles.path}>File ▸ Download as .quar</span>
    </>
  );
}

let StorageNote: BetaStorageNote = LocalStorageNote;
let storageIcon: ReactElement = <HardDriveDownload size={15} />;

/**
 * Say where projects are kept differently — for an edition that keeps them
 * elsewhere — with its own icon. Call it before the tag is shown; returns
 * the note it replaced.
 */
export function setBetaStorageNote(note: BetaStorageNote, icon?: ReactElement): BetaStorageNote {
  const previous = StorageNote;
  StorageNote = note;
  if (icon) storageIcon = icon;
  return previous;
}

/** The notice's way of showing a menu path (`File ▸ Download as .quar`). */
export const betaNoticePathClass = styles.path;

export function BetaBadge() {
  const [open, setOpen] = useState(() => !noticeSeen());
  const badgeRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  // Opened from the tag (not on its own): focus goes in, and back on close
  const [fromBadge, setFromBadge] = useState(false);
  const titleId = useId();
  const cardId = useId();

  const close = useCallback(() => {
    markNoticeSeen();
    setOpen(false);
    if (fromBadge || cardRef.current?.contains(document.activeElement)) {
      badgeRef.current?.focus();
    }
    setFromBadge(false);
  }, [fromBadge]);

  const toggle = () => {
    if (open) {
      close();
    } else {
      setFromBadge(true);
      setOpen(true);
    }
  };

  useEffect(() => {
    if (open && fromBadge) doneRef.current?.focus();
  }, [open, fromBadge]);

  // Escape (unless it's for something else — a field being typed in), or a
  // press outside the card and the tag, closes it
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const focused = document.activeElement;
      const ours =
        !focused ||
        focused === document.body ||
        cardRef.current?.contains(focused) ||
        badgeRef.current?.contains(focused);
      if (ours) close();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (cardRef.current?.contains(target) || badgeRef.current?.contains(target)) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, [open, close]);

  return (
    <div className={styles.anchor}>
      <button
        ref={badgeRef}
        type="button"
        className={styles.badge}
        aria-expanded={open}
        aria-controls={cardId}
        aria-haspopup="dialog"
        aria-label="Beta — what that means"
        title="Quar Animator is in beta"
        onClick={toggle}
        data-testid="beta-badge"
      >
        <span className={styles.signal} aria-hidden="true" />
        Beta
      </button>
      {open && (
        <div
          ref={cardRef}
          id={cardId}
          className={styles.card}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          data-testid="beta-notice"
        >
          <div className={styles.header}>
            <span className={styles.eyebrow}>Public beta</span>
            <button
              type="button"
              className={styles.close}
              onClick={close}
              aria-label="Close"
              data-testid="beta-notice-close"
            >
              <X size={14} />
            </button>
          </div>
          <h2 id={titleId} className={styles.title}>
            Quar Animator is in beta
          </h2>
          <p className={styles.lead}>
            It’s ready to use and changing fast — features may move, and now and then something may
            break.
          </p>
          <ul className={styles.points}>
            <li>
              <span className={styles.pointIcon} aria-hidden="true">
                {storageIcon}
              </span>
              <span data-testid="beta-notice-storage">
                <StorageNote />
              </span>
            </li>
            <li>
              <span className={styles.pointIcon} aria-hidden="true">
                <Bug size={15} />
              </span>
              <span>Something broken or odd? Tell us — it helps more than you’d think.</span>
            </li>
          </ul>
          <div className={styles.actions}>
            <a
              className={styles.report}
              href={REPORT_ISSUES_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="beta-notice-report"
            >
              Report an issue
            </a>
            <button
              ref={doneRef}
              type="button"
              className={styles.done}
              onClick={close}
              data-testid="beta-notice-done"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
