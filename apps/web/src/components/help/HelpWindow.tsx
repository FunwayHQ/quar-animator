/**
 * The help panel: the user guide's pages (served at /help/, on the same
 * site) in a floating window beside the canvas, like the Animation Sequence
 * window — dragged by its title bar, resized from its edges, and kept where
 * it was left. Back, the contents, the page in a tab of its own, and close;
 * Escape closes it from anywhere inside, and F1 opens it at the page for
 * what you're working on.
 *
 * While it's closed it's not there at all, so it takes none of the editor's
 * keys (F1 aside).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, BookOpen, ExternalLink, X } from 'lucide-react';
import { useUiTheme } from '../../hooks/useUiTheme';
import {
  HELP_CONTENTS,
  closeHelp,
  helpTopicFor,
  helpUrl,
  openHelp,
  useHelpPanel,
} from './helpPanel';
import styles from './HelpWindow.module.css';

const STORAGE_KEY = 'quar-animator-help-window';
const MIN_WIDTH = 320;
const MIN_HEIGHT = 260;
const DEFAULT_WIDTH = 440;
const GUIDE_SUFFIX = / · Quar Animator User Guide$/;

interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clampRect(rect: WindowRect): WindowRect {
  const width = Math.max(MIN_WIDTH, Math.min(rect.width, window.innerWidth));
  const height = Math.max(MIN_HEIGHT, Math.min(rect.height, window.innerHeight));
  return {
    width,
    height,
    // Keep the title bar reachable
    x: Math.max(0, Math.min(rect.x, window.innerWidth - 120)),
    y: Math.max(0, Math.min(rect.y, window.innerHeight - 40)),
  };
}

/** Where the window opens: where it was left, or down the right of the editor. */
export function readStoredRect(): WindowRect {
  const fallback = {
    width: DEFAULT_WIDTH,
    height: Math.min(760, window.innerHeight - 120),
    x: window.innerWidth - DEFAULT_WIDTH - 16,
    y: 84,
  };
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as unknown;
    if (stored && typeof stored === 'object') {
      const r = stored as Partial<WindowRect>;
      if ([r.x, r.y, r.width, r.height].every((v) => typeof v === 'number' && isFinite(v))) {
        return clampRect(r as WindowRect);
      }
    }
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
  return clampRect(fallback);
}

function storeRect(rect: WindowRect): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rect));
  } catch {
    // Remembering the position is a convenience only.
  }
}

/** The window itself (mounted only while the panel is open). */
export function HelpWindow() {
  const help = useHelpPanel();
  const uiTheme = useUiTheme();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [rect, setRect] = useState(readStoredRect);
  const rectRef = useRef(rect);
  rectRef.current = rect;
  const [dragging, setDragging] = useState(false);
  // The panel's own history: pages are revisited with location.replace(), so
  // going back never steps out of the guide into the editor's history
  const historyRef = useRef<string[]>([]);
  const goingBackRef = useRef(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [pageTitle, setPageTitle] = useState('');
  const [currentUrl, setCurrentUrl] = useState(() => helpUrl(help.page, help.anchor));
  const [initialSrc] = useState(currentUrl);

  const record = useCallback((href: string) => {
    const stack = historyRef.current;
    if (goingBackRef.current) {
      goingBackRef.current = false;
    } else if (stack.at(-1) !== href) {
      stack.push(href);
    }
    setCanGoBack(stack.length > 1);
    setCurrentUrl(href);
  }, []);

  const navigate = useCallback((url: string) => {
    if (frameRef.current) frameRef.current.src = url;
  }, []);

  // A later openHelp() while open goes to the page asked for
  const firstRequest = useRef(help.request);
  useEffect(() => {
    if (help.request === firstRequest.current) return;
    navigate(helpUrl(help.page, help.anchor));
  }, [help.request, help.page, help.anchor, navigate]);

  // The pages follow the editor's theme (they also read it themselves)
  useEffect(() => {
    try {
      const doc = frameRef.current?.contentDocument;
      if (doc?.documentElement) doc.documentElement.dataset.theme = uiTheme;
    } catch {
      // Not one of the guide's pages
    }
  }, [uiTheme]);

  const uiThemeRef = useRef(uiTheme);
  uiThemeRef.current = uiTheme;
  const handleFrameLoad = () => {
    const frame = frameRef.current;
    let win: Window | null = null;
    let doc: Document | null = null;
    let href = '';
    try {
      win = frame?.contentWindow ?? null;
      doc = frame?.contentDocument ?? null;
      href = win?.location.href ?? '';
    } catch {
      return; // Somewhere else (not on this site): nothing to follow
    }
    if (!win || !doc || !href || href === 'about:blank') return;
    record(href);
    setPageTitle(doc.title.replace(GUIDE_SUFFIX, ''));
    doc.documentElement.dataset.theme = uiThemeRef.current;
    const frameWindow = win;
    frameWindow.addEventListener('hashchange', () => record(frameWindow.location.href));
    // Escape inside the page closes the panel (the search box keeps the first
    // Escape, to clear itself); F1 there is the editor's, not the browser's
    doc.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        closeHelp();
      } else if (event.key === 'F1') {
        event.preventDefault();
      }
    });
  };

  const goBack = () => {
    const stack = historyRef.current;
    const frame = frameRef.current;
    if (stack.length < 2 || !frame?.contentWindow) return;
    stack.pop();
    const previous = stack.at(-1);
    if (!previous) return;
    goingBackRef.current = true;
    setCanGoBack(stack.length > 1);
    try {
      frame.contentWindow.location.replace(previous);
    } catch {
      goingBackRef.current = false;
      frame.src = previous;
    }
  };

  const openInTab = () => {
    window.open(currentUrl, '_blank', 'noopener');
  };

  // Keep the window on screen when the browser window shrinks
  useEffect(() => {
    const onResize = () => setRect((current) => clampRect(current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Focus the page, so its links and scrolling are a key away
  useEffect(() => {
    frameRef.current?.focus();
  }, []);

  const startPointerGesture = (
    e: ReactPointerEvent<HTMLElement>,
    apply: (dx: number, dy: number, start: WindowRect) => WindowRect
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = rectRef.current;
    const originX = e.clientX;
    const originY = e.clientY;
    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);
    // The page would take the pointer as it passes over it
    setDragging(true);
    const onMove = (ev: PointerEvent) => {
      if (ev.buttons === 0) {
        onUp();
        return;
      }
      setRect(clampRect(apply(ev.clientX - originX, ev.clientY - originY, start)));
    };
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      target.removeEventListener('lostpointercapture', onUp);
      setDragging(false);
      storeRect(rectRef.current);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
    target.addEventListener('lostpointercapture', onUp);
  };

  const handleTitlePointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    startPointerGesture(e, (dx, dy, start) => ({ ...start, x: start.x + dx, y: start.y + dy }));
  };

  const handleCornerPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    startPointerGesture(e, (dx, dy, start) => ({
      ...start,
      width: start.width + dx,
      height: start.height + dy,
    }));
  };

  // From the left edge: the window's right side stays put
  const handleEdgePointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    startPointerGesture(e, (dx, _dy, start) => {
      const width = Math.max(MIN_WIDTH, start.width - dx);
      return { ...start, width, x: start.x + start.width - width };
    });
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeHelp();
    }
  };

  return createPortal(
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape closes the window from any control in it
    <div
      className={`${styles.window} ${dragging ? styles.dragging : ''}`}
      role="dialog"
      aria-label="User Guide"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      onKeyDown={handleKeyDown}
      data-own-keys
      data-testid="help-window"
    >
      <header className={styles.titleBar} onPointerDown={handleTitlePointerDown}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={goBack}
          disabled={!canGoBack}
          aria-label="Back"
          title="Back"
        >
          <ArrowLeft size={14} />
        </button>
        <span className={styles.title}>
          User Guide
          {pageTitle && pageTitle !== 'Quar Animator User Guide' && (
            <span className={styles.pageTitle} data-testid="help-page-title">
              {pageTitle}
            </span>
          )}
        </span>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => openHelp(HELP_CONTENTS)}
          aria-label="Contents"
          title="Contents"
        >
          <BookOpen size={14} />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={openInTab}
          aria-label="Open in a new tab"
          title="Open in a new tab"
        >
          <ExternalLink size={14} />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={closeHelp}
          aria-label="Close the User Guide"
          title="Close (Esc)"
        >
          <X size={14} />
        </button>
      </header>
      <iframe
        ref={frameRef}
        className={styles.frame}
        src={initialSrc}
        title="User Guide"
        onLoad={handleFrameLoad}
        data-testid="help-frame"
      />
      <div className={styles.edgeHandle} onPointerDown={handleEdgePointerDown} aria-hidden="true" />
      <div
        className={styles.cornerHandle}
        onPointerDown={handleCornerPointerDown}
        aria-hidden="true"
      />
    </div>,
    document.body
  );
}

/**
 * F1 opens the guide at the page for what has the focus, or what's under
 * the pointer (their `data-help`), or at its contents.
 */
export function useHelpShortcut(): void {
  useEffect(() => {
    let pointed: Element | null = null;
    const onPointerOver = (event: PointerEvent) => {
      pointed = event.target instanceof Element ? event.target : null;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F1' || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      const topic = helpTopicFor(document.activeElement) ?? helpTopicFor(pointed);
      openHelp(topic?.page ?? HELP_CONTENTS, topic?.anchor);
    };
    document.addEventListener('pointerover', onPointerOver, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerover', onPointerOver);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}

/** The help panel and its F1 shortcut: render once in the editor. */
export function HelpHost() {
  const { open } = useHelpPanel();
  useHelpShortcut();
  return open ? <HelpWindow /> : null;
}
