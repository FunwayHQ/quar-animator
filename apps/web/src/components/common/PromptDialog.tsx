/**
 * Prompt Dialog for Quar Animator
 *
 * Custom replacement for the native browser `prompt()`.
 * Renders a centered modal with a single text input, Cancel and a primary
 * action button.  Portal-rendered at z-modal level.
 *
 * Usage (imperative):
 *   import { promptDialog } from './PromptDialog';
 *   const name = await promptDialog({ title: 'New Profile', placeholder: 'Profile name' });
 *   if (name) { ... }
 *
 * Usage (declarative):
 *   <PromptDialog
 *     title="New Profile"
 *     placeholder="Profile name"
 *     onConfirm={(value) => ...}
 *     onCancel={() => ...}
 *   />
 *
 * Mount <PromptDialogHost /> once in the app root for the imperative API.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styles from './PromptDialog.module.css';

// ============================================================================
// Types
// ============================================================================

export interface PromptDialogProps {
  title: string;
  /** A line of explanation under the title. */
  message?: string;
  /** Without an input it's a yes/no question (see confirmDialog). */
  input?: boolean;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

// ============================================================================
// Component
// ============================================================================

const EXIT_MS = 120;

export function PromptDialog({
  title,
  message,
  input = true,
  placeholder = '',
  defaultValue = '',
  confirmLabel = 'Create',
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const [exiting, setExiting] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // A question needs no answer typed to be confirmed
  const canConfirm = !input || value.trim() !== '';
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus + select on mount
  useEffect(() => {
    const t = setTimeout(() => {
      if (!input) {
        confirmRef.current?.focus();
        return;
      }
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(t);
  }, [input]);

  const close = useCallback(
    (confirmed: boolean) => {
      setExiting(true);
      setTimeout(() => {
        if (confirmed && canConfirm) {
          onConfirm(value.trim());
        } else {
          onCancel();
        }
      }, EXIT_MS);
    },
    [value, canConfirm, onConfirm, onCancel]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && canConfirm) {
        e.preventDefault();
        close(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      }
    },
    [canConfirm, close]
  );

  return createPortal(
    <div
      className={`${styles.backdrop} ${exiting ? styles.exiting : ''}`}
      // Catches clicks outside the dialog (Escape closes it from the keyboard)
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close(false);
      }}
      data-testid="prompt-dialog-backdrop"
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="prompt-dialog"
        onKeyDown={input ? undefined : handleKeyDown}
      >
        <div className={styles.header}>
          <h3 className={styles.title}>{title}</h3>
        </div>
        <div className={styles.body}>
          {message && <p className={styles.message}>{message}</p>}
          {input && (
            <div className={styles.inputWrapper}>
              <input
                ref={inputRef}
                className={styles.input}
                type="text"
                value={value}
                placeholder={placeholder}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                data-testid="prompt-dialog-input"
              />
            </div>
          )}
        </div>
        <div className={styles.footer}>
          <button
            className={styles.btnCancel}
            onClick={() => close(false)}
            data-testid="prompt-dialog-cancel"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            className={styles.btnPrimary}
            onClick={() => close(true)}
            disabled={!canConfirm}
            data-testid="prompt-dialog-confirm"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
// Imperative API  —  await promptDialog({ title, placeholder })
// ============================================================================

interface PromptRequest {
  /** Tells requests apart, so each gets a dialog of its own */
  id: number;
  title: string;
  message?: string;
  input?: boolean;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  resolve: (value: string | null) => void;
}

type HostListener = (req: PromptRequest) => void;

const hostListeners = new Set<HostListener>();
let nextRequestId = 1;

export function promptDialog(opts: {
  title: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    const req: PromptRequest = { ...opts, id: nextRequestId++, resolve };
    hostListeners.forEach((fn) => fn(req));
  });
}

/**
 * Ask a yes/no question in the same dialog, without an input. Resolves true
 * when confirmed. Needs <PromptDialogHost /> mounted, like promptDialog.
 */
export function confirmDialog(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const req: PromptRequest = {
      ...opts,
      id: nextRequestId++,
      input: false,
      resolve: (value) => resolve(value !== null),
    };
    hostListeners.forEach((fn) => fn(req));
  });
}

/**
 * Mount once in the app root to enable the `promptDialog()` imperative API.
 */
export function PromptDialogHost() {
  // Questions asked while one is open wait their turn, so each caller gets its
  // answer (one replacing another would leave the first waiting forever)
  const [queue, setQueue] = useState<PromptRequest[]>([]);

  useEffect(() => {
    const listener: HostListener = (req) => setQueue((q) => [...q, req]);
    hostListeners.add(listener);
    return () => {
      hostListeners.delete(listener);
    };
  }, []);

  const request = queue[0];
  if (!request) return null;
  const answer = (value: string | null) => {
    request.resolve(value);
    setQueue((q) => q.filter((r) => r !== request));
  };

  return (
    <PromptDialog
      key={request.id}
      title={request.title}
      message={request.message}
      input={request.input}
      placeholder={request.placeholder}
      defaultValue={request.defaultValue}
      confirmLabel={request.confirmLabel}
      onConfirm={answer}
      onCancel={() => answer(null)}
    />
  );
}
