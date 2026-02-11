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
  placeholder = '',
  defaultValue = '',
  confirmLabel = 'Create',
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const [exiting, setExiting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus + select on mount
  useEffect(() => {
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const close = useCallback(
    (confirmed: boolean) => {
      setExiting(true);
      setTimeout(() => {
        if (confirmed && value.trim()) {
          onConfirm(value.trim());
        } else {
          onCancel();
        }
      }, EXIT_MS);
    },
    [value, onConfirm, onCancel]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && value.trim()) {
        e.preventDefault();
        close(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      }
    },
    [value, close]
  );

  return createPortal(
    <div
      className={`${styles.backdrop} ${exiting ? styles.exiting : ''}`}
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
      >
        <div className={styles.header}>
          <h3 className={styles.title}>{title}</h3>
        </div>
        <div className={styles.body}>
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
            className={styles.btnPrimary}
            onClick={() => close(true)}
            disabled={!value.trim()}
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
  title: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  resolve: (value: string | null) => void;
}

type HostListener = (req: PromptRequest | null) => void;

const hostListeners = new Set<HostListener>();

export function promptDialog(opts: {
  title: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    const req: PromptRequest = { ...opts, resolve };
    hostListeners.forEach((fn) => fn(req));
  });
}

/**
 * Mount once in the app root to enable the `promptDialog()` imperative API.
 */
export function PromptDialogHost() {
  const [request, setRequest] = useState<PromptRequest | null>(null);

  useEffect(() => {
    const listener: HostListener = (req) => setRequest(req);
    hostListeners.add(listener);
    return () => {
      hostListeners.delete(listener);
    };
  }, []);

  if (!request) return null;

  return (
    <PromptDialog
      title={request.title}
      placeholder={request.placeholder}
      defaultValue={request.defaultValue}
      confirmLabel={request.confirmLabel}
      onConfirm={(val) => {
        request.resolve(val);
        setRequest(null);
      }}
      onCancel={() => {
        request.resolve(null);
        setRequest(null);
      }}
    />
  );
}
