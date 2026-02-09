/**
 * Toast Notification System for Quar Animator
 *
 * Minimal pub/sub toast with portal rendering.
 * Usage:
 *   import { toast, ToastContainer } from './Toast';
 *   toast.success('Saved!');
 *   toast.error('Something went wrong');
 *   toast.info('Tip: press V for selection tool');
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
  duration: number;
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

  useEffect(() => {
    return subscribe((item) => {
      setToasts((prev) => [...prev, { ...item, exiting: false }]);
    });
  }, []);

  const removeToast = useCallback((id: string) => {
    // Set exiting flag for slide-out animation
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    // Actually remove after animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_ANIMATION_MS);
  }, []);

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
