import { useEffect, useState, type ReactNode } from 'react';
import { Monitor } from 'lucide-react';
import styles from './DesktopOnlyGate.module.css';

const MOBILE_VIEWPORT_QUERY =
  '(max-width: 767px), (max-width: 1024px) and (hover: none) and (pointer: coarse)';

export function DesktopOnlyGate({ children }: { children: ReactNode }) {
  const [isMobileViewport, setIsMobileViewport] = useState(() => matchesMobileViewport());

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia(MOBILE_VIEWPORT_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setIsMobileViewport(event.matches);

    setIsMobileViewport(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  if (isMobileViewport) {
    return (
      <main className={styles.screen}>
        <section className={styles.card} aria-labelledby="desktop-only-title">
          <div className={styles.icon} aria-hidden="true">
            <Monitor size={24} strokeWidth={1.7} />
          </div>
          <p className={styles.eyebrow}>Desktop only</p>
          <h1 className={styles.title} id="desktop-only-title">
            QUAR Animator needs a larger screen
          </h1>
          <p className={styles.description}>
            The full animation workspace needs more room than this screen provides. Open QUAR
            Animator on a desktop or laptop to work on your projects.
          </p>
          <div className={styles.deviceHint}>
            <Monitor size={14} aria-hidden="true" />
            <span>Designed for desktop browsers</span>
          </div>
        </section>
      </main>
    );
  }

  return children;
}

function matchesMobileViewport(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(MOBILE_VIEWPORT_QUERY).matches
  );
}
