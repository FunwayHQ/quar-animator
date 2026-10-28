/**
 * Font Previews
 * Lets the font picker show a family's name in its own font without loading
 * the font: asked with `text=`, Google's CSS API answers with a font of just
 * those letters, a few kB. Only once Google Fonts are allowed, only for the
 * families asked for (the rows in view, the one pointed at), a batch per
 * request. Each goes into document.fonts under an alias of its own, so it
 * never stands in for the app's own DM Sans or Inter.
 */

import { findGoogleFont, nearestWeight } from '@quar/core';
import { hasGoogleFontsConsent } from '../components/common/ConsentBanner';

const CSS_API_URL = 'https://fonts.googleapis.com/css2';
const FILE_HOST = 'https://fonts.gstatic.com/';
/** Families asked for together, in one request */
export const PREVIEW_BATCH_SIZE = 12;
/** How long requests wait for more rows to come into view */
export const PREVIEW_DELAY_MS = 120;

/** Families whose font the app's interface has already (the CSS family to show them in) */
const BUILT_IN: Record<string, string> = { Inter: "'Inter'" };

type PreviewState = 'queued' | 'loading' | 'ready' | 'failed';

const states = new Map<string, PreviewState>();
let queue: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let version = 0;
const listeners = new Set<() => void>();

/** The name a family's preview is known by in document.fonts. */
export function previewAlias(family: string): string {
  return `Quar Preview ${family}`;
}

/** The CSS font-family to show `family`'s name in, once its preview is in; null until then. */
export function fontPreviewFamily(family: string): string | null {
  const builtIn = BUILT_IN[family];
  if (builtIn) return builtIn;
  return states.get(family) === 'ready' ? `"${previewAlias(family)}"` : null;
}

function canLoadFaces(): boolean {
  return typeof FontFace !== 'undefined' && typeof document !== 'undefined' && !!document.fonts;
}

/**
 * Get previews of these Google families ready, each once a session. Nothing
 * is asked of Google unless Google Fonts are allowed.
 */
export function requestFontPreviews(
  families: Iterable<string>,
  allowed: boolean = hasGoogleFontsConsent()
): void {
  if (!allowed || !canLoadFaces()) return;
  for (const family of families) {
    if (states.has(family) || BUILT_IN[family] || !findGoogleFont(family)) continue;
    states.set(family, 'queued');
    queue.push(family);
  }
  if (queue.length > 0 && timer === null) {
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, PREVIEW_DELAY_MS);
  }
}

/** The CSS API request for previews of these families: the letters of their names only. */
export function previewCssUrl(families: readonly string[]): string {
  const params = families.map((family) => {
    const weight = nearestWeight(findGoogleFont(family)?.weights ?? [400], 400);
    return `family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${weight}`;
  });
  const letters = [...new Set([...families.join('')])].sort().join('');
  return `${CSS_API_URL}?${params.join('&')}&text=${encodeURIComponent(letters)}`;
}

/** Each family's file in a CSS API answer (fonts.gstatic.com only). */
export function previewFaces(css: string): Map<string, string> {
  const faces = new Map<string, string>();
  for (const [, body = ''] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const family = /font-family:\s*['"]?([^;'"]+)['"]?\s*;/.exec(body)?.[1]?.trim();
    const url = /src:\s*url\(\s*['"]?([^'")\s]+)/.exec(body)?.[1];
    if (family && url?.startsWith(FILE_HOST) && !faces.has(family)) faces.set(family, url);
  }
  return faces;
}

async function flush(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) await loadBatch(queue.splice(0, PREVIEW_BATCH_SIZE));
  } finally {
    running = false;
  }
}

async function loadBatch(batch: string[]): Promise<void> {
  for (const family of batch) states.set(family, 'loading');
  let faces = new Map<string, string>();
  try {
    const response = await fetch(previewCssUrl(batch), { referrerPolicy: 'no-referrer' });
    if (response.ok) faces = previewFaces(await response.text());
  } catch {
    // Offline or refused: these show in the interface's font
  }
  await Promise.all(
    batch.map(async (family) => {
      const url = faces.get(family);
      try {
        if (!url) throw new Error('No preview');
        const face = new FontFace(previewAlias(family), `url(${JSON.stringify(url)})`);
        await face.load();
        document.fonts.add(face);
        states.set(family, 'ready');
      } catch {
        states.set(family, 'failed');
      }
    })
  );
  version++;
  listeners.forEach((listener) => listener());
}

/** Be told when previews come in; returns the unsubscribe. */
export function subscribeFontPreviews(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Goes up as previews come in (for useSyncExternalStore). */
export function fontPreviewsVersion(): number {
  return version;
}

/** Forget every preview (tests). */
export function resetFontPreviewsForTests(): void {
  states.clear();
  queue = [];
  if (timer !== null) clearTimeout(timer);
  timer = null;
  running = false;
  version = 0;
}
