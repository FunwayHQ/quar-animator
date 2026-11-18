/**
 * Runtime DOM translation engine.
 *
 * The editor's UI strings are rendered as English from JSX (and from module
 * level constants such as the shortcut list). Components can also call `t()`
 * to read the catalog directly. This engine covers every rendered node:
 * a MutationObserver watches the tree and translates visible text and
 * tooltips using the active locale's JSON dictionary.
 *
 * Every translated node remembers its English source, which makes the mapping
 * idempotent (our own DOM writes don't re-trigger translation) and lets us
 * restore / re-translate instantly on a language switch or dictionary import.
 * Nodes that React rendered already translated through `t()` are traced back
 * to their source key with a reverse lookup.
 *
 * Only exact dictionary matches are replaced, so user data (project names,
 * numbers, font names) is left untouched.
 */

import { lookup, reverseLookup, translateKey } from './catalog';
import { getLocale, subscribeLocale, type Locale } from './store';

/** Element attributes that contain user-visible text. */
const OBSERVED_ATTRIBUTES = ['title', 'aria-label', 'placeholder', 'alt'] as const;
/** Containers whose text must never be translated. */
const SKIP_SELECTOR = 'script, style, noscript, [data-i18n-skip], [contenteditable="true"]';

/** English source of each translated text node / attribute. */
const textSources = new Map<Text, string>();
const attributeSources = new Map<Element, Map<string, string>>();

let observer: MutationObserver | null = null;
let installed = false;

/**
 * Translate an exact string, preserving any surrounding whitespace React may
 * have inserted around a label. Components call this to read the catalog.
 */
export function t(text: string, locale: Locale = getLocale()): string {
  if (!text) return text;
  const exact = lookup(text, locale);
  if (exact !== text) return exact;
  if (text.trim() !== text) {
    const trimmed = text.trim();
    const translated = lookup(trimmed, locale);
    if (translated !== trimmed) {
      const start = text.indexOf(trimmed);
      return text.slice(0, start) + translated + text.slice(start + trimmed.length);
    }
  }
  return text;
}

/**
 * Translate a dotted key with `{name}` placeholders. Use it for sentences whose
 * word order differs per language; pass the locale you got from `useLocale()`
 * so the component re-renders when the language changes.
 */
export function tf(
  key: string,
  params?: Record<string, string | number>,
  locale: Locale = getLocale()
): string {
  return translateKey(key, locale, params);
}

/** Backwards-compatible alias used in tests and by callers. */
export const translateText = t;

function shouldSkip(element: Element | null): boolean {
  return !!element && element.closest(SKIP_SELECTOR) !== null;
}

/** Resolve the English source of a node's current text. */
function sourceOf(raw: string, remembered: string | undefined, locale: Locale): string {
  if (remembered !== undefined) {
    // Trust the remembered source only while it still maps back to what's shown;
    // a component may have re-rendered the node through `t()`/`tf()` since.
    if (locale === 'en' || t(remembered, locale) === raw) return remembered;
  }
  if (locale !== 'en') {
    const reversed = reverseLookup(raw, locale);
    if (reversed !== undefined && t(reversed, locale) === raw) return reversed;
  }
  return raw;
}

function processTextNode(node: Text, locale: Locale): void {
  const raw = node.nodeValue ?? '';
  if (!raw.trim()) return;
  if (shouldSkip(node.parentElement)) return;

  const source = sourceOf(raw, textSources.get(node), locale);
  const target = t(source, locale);
  if (target !== raw) {
    textSources.set(node, source);
    node.nodeValue = target;
  } else if (!textSources.has(node) && source !== raw) {
    // Already translated by React via t(); remember it for future switches.
    textSources.set(node, source);
  }
}

/**
 * Attribute text, translated. Tooltips usually read "Label (Shortcut)" — the
 * whole string is rarely in the catalog, so fall back to translating the label
 * and keeping the shortcut as it is.
 */
function translateAttributeValue(raw: string, locale: Locale): string {
  const direct = t(raw, locale);
  if (direct !== raw) return direct;
  const match = /^(.*?)\s*\(([^()]*)\)$/.exec(raw);
  if (!match) return raw;
  const label = (match[1] ?? '').trim();
  if (!label) return raw;
  const translated = t(label, locale);
  if (translated === label) return raw;
  return `${translated} (${match[2]})`;
}

function processElement(element: Element, locale: Locale): void {
  if (shouldSkip(element)) return;
  let sources = attributeSources.get(element);
  for (const attr of OBSERVED_ATTRIBUTES) {
    if (!element.hasAttribute(attr)) continue;
    const raw = element.getAttribute(attr) ?? '';
    if (!raw.trim()) continue;
    const source = sourceOf(raw, sources?.get(attr), locale);
    const target = translateAttributeValue(source, locale);
    if (target !== raw) {
      if (!sources) {
        sources = new Map<string, string>();
        attributeSources.set(element, sources);
      }
      sources.set(attr, source);
      element.setAttribute(attr, target);
    }
  }
}

function processNode(node: Node, locale: Locale): void {
  if (node.nodeType === Node.TEXT_NODE) {
    processTextNode(node as Text, locale);
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    processElement(element, locale);
    element.querySelectorAll('*').forEach((child) => processElement(child, locale));
  }
}

/** Translate everything currently under `root` (used on install and refresh). */
export function translateTree(
  root: ParentNode = document.body,
  locale: Locale = getLocale()
): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) processTextNode(current as Text, locale);
    else processElement(current as Element, locale);
    current = walker.nextNode();
  }
}

/** Re-apply the active locale to nodes we have already translated, and prune dead ones. */
function refresh(): void {
  const locale = getLocale();
  textSources.forEach((source, node) => {
    if (!node.isConnected) {
      textSources.delete(node);
      return;
    }
    node.nodeValue = t(source, locale);
  });
  attributeSources.forEach((sources, element) => {
    if (!element.isConnected) {
      attributeSources.delete(element);
      return;
    }
    sources.forEach((source, attr) => {
      element.setAttribute(attr, translateAttributeValue(source, locale));
    });
  });
  translateTree(document.body, locale);
}

function handleMutations(records: MutationRecord[]): void {
  const locale = getLocale();
  for (const record of records) {
    if (record.type === 'characterData') {
      processTextNode(record.target as Text, locale);
    } else if (record.type === 'attributes' && record.attributeName) {
      const element = record.target as Element;
      const attr = record.attributeName;
      if ((OBSERVED_ATTRIBUTES as readonly string[]).includes(attr)) {
        let sources = attributeSources.get(element);
        const raw = element.getAttribute(attr) ?? '';
        const source = sourceOf(raw, sources?.get(attr), locale);
        const target = translateAttributeValue(source, locale);
        if (target !== raw) {
          if (!sources) {
            sources = new Map<string, string>();
            attributeSources.set(element, sources);
          }
          sources.set(attr, source);
          element.setAttribute(attr, target);
        }
      }
    } else if (record.type === 'childList') {
      record.addedNodes.forEach((node) => processNode(node, locale));
    }
  }
}

/**
 * Install the translation engine. Safe to call more than once; calling it
 * before React mounts is fine because the observer picks up rendered nodes.
 */
export function installI18n(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  observer = new MutationObserver(handleMutations);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...OBSERVED_ATTRIBUTES],
  });
  subscribeLocale(refresh);
  translateTree(document.body, getLocale());
}

/** Re-translate the whole UI after the dictionary is imported or reset. */
export function refreshI18n(): void {
  if (installed) refresh();
}

/** Tear down the engine (mainly for tests). */
export function uninstallI18n(): void {
  observer?.disconnect();
  observer = null;
  installed = false;
  textSources.clear();
  attributeSources.clear();
}
