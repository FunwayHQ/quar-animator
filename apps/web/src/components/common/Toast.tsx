/**
 * Toast Notification System for Quar Animator
 *
 * Minimal pub/sub toast with portal rendering.
 * Usage:
 *   import { toast, ToastContainer } from './Toast';
 *   toast.success('Saved!');
 *   toast.error('Something went wrong');
 *   toast.info('Tip: press V for selection tool');
 *   const progress = toast.progress('Importing…'); progress.update('…40%'); progress.done();
 *
 * Mount <ToastContainer /> once in the app root.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './Toast.module.css';

// ============================================================================
// Types
// ============================================================================

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  /** Milliseconds it stays up; Infinity until it's dismissed */
  duration: number;
  /** Takes the toast with this id down */
  dismiss?: boolean;
  /** A new message for the toast with this id, if it's still up */
  update?: boolean;
}

/** A toast that stays up while something goes on, saying how far it has got. */
export interface ProgressToast {
  update(message: string): void;
  done(): void;
}

// ============================================================================
// Pub/Sub Bus
// ============================================================================

type Listener = (item: ToastItem) => void;

const listeners = new Set<Listener>();

function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit(item: ToastItem): void {
  listeners.forEach((fn) => fn(item));
}

let nextId = 0;

function createToast(message: string, variant: ToastVariant, duration?: number): void {
  const defaultDuration = variant === 'error' ? 6000 : 4000;
  const item: ToastItem = {
    id: `toast_${++nextId}`,
    message,
    variant,
    duration: duration ?? defaultDuration,
  };
  emit(item);
}

// ============================================================================
// Singleton toast API
// ============================================================================

export const toast = {
  success(message: string, duration?: number): void {
    createToast(message, 'success', duration);
  },
  error(message: string, duration?: number): void {
    createToast(message, 'error', duration);
  },
  info(message: string, duration?: number): void {
    createToast(message, 'info', duration);
  },
  progress(message: string): ProgressToast {
    const id = `toast_${++nextId}`;
    let shown = true;
    emit({ id, message, variant: 'info', duration: Infinity });
    return {
      update(next) {
        if (shown) emit({ id, message: next, variant: 'info', duration: Infinity, update: true });
      },
      done() {
        if (!shown) return;
        shown = false;
        emit({ id, message: '', variant: 'info', duration: 0, dismiss: true });
      },
    };
  },
};

// ============================================================================
// Internal state for exiting animation
// ============================================================================

interface ToastState extends ToastItem {
  exiting: boolean;
}

// ============================================================================
// Single Toast Component
// ============================================================================

interface ToastProps {
  item: ToastState;
  onRemove: (id: string) => void;
}

function Toast({ item, onRemove }: ToastProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // A progress toast stays until it's done
    if (!Number.isFinite(item.duration)) return;
    timerRef.current = setTimeout(() => {
      onRemove(item.id);
    }, item.duration);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [item.id, item.duration, onRemove]);

  const classNames = [styles.toast, styles[item.variant], item.exiting ? styles.exiting : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classNames} role="alert" data-testid={`toast-${item.id}`}>
      <span className={styles.message}>{item.message}</span>
      <button
        className={styles.closeButton}
        onClick={() => onRemove(item.id)}
        aria-label="Close"
        data-testid={`toast-close-${item.id}`}
      >
        &#x2715;
      </button>
    </div>
  );
}

// ============================================================================
// Toast Container (mount once in app root)
// ============================================================================

const EXIT_ANIMATION_MS = 150;

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastState[]>([]);

  const removeToast = useCallback((id: string) => {
    // Set exiting flag for slide-out animation
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    // Actually remove after animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_ANIMATION_MS);
  }, []);

  useEffect(() => {
    return subscribe((item) => {
      if (item.dismiss) {
        removeToast(item.id);
        return;
      }
      // A progress toast says how far it has got in its own place
      setToasts((prev) =>
        item.update
          ? prev.map((t) => (t.id === item.id ? { ...t, message: item.message } : t))
          : [...prev, { ...item, exiting: false }]
      );
    });
  }, [removeToast]);

  if (toasts.length === 0) return null;

  return createPortal(
    <div className={styles.container} data-testid="toast-container">
      {toasts.map((item) => (
        <Toast key={item.id} item={item} onRemove={removeToast} />
      ))}
    </div>,
    document.body
  );
}
