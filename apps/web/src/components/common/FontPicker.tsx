/**
 * FontPicker
 * The Text section's font family control: a combobox to type a family's
 * name into. Its list has the document's fonts and recent picks first, then
 * those that come with the app and Google Fonts' families by popularity,
 * filtered by what's typed and by category. Names show in their own font
 * once a preview of it is in (fontPreviews: only after Google Fonts are
 * allowed, and only for the rows in view or pointed at).
 *
 * Keys: typing filters; ↑/↓ (Page Up/Down) move; Enter picks; Escape closes;
 * Tab goes to the categories (arrows pick one, Tab comes back).
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { CSSProperties, FocusEvent, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { GOOGLE_FONTS_CATALOG, getFontManager } from '@quar/core';
import type { GoogleFontCategory } from '@quar/core';
import {
  buildFontSections,
  FONT_CATEGORY_FILTERS,
  type FontCategoryFilter,
  type FontOption,
} from './fontPickerOptions';
import {
  fontPreviewFamily,
  fontPreviewsVersion,
  requestFontPreviews,
  subscribeFontPreviews,
} from '../../services/fontPreviews';
import { addRecentFont, getRecentFonts } from '../../services/recentFonts';
import { ensureGoogleFontsConsent, hasGoogleFontsConsent } from './ConsentBanner';
import styles from './FontPicker.module.css';

const POPUP_WIDTH = 296;
const POPUP_MAX_HEIGHT = 420;
const POPUP_GAP = 4;
const VIEWPORT_MARGIN = 8;
/** Rows Page Up/Down move */
const PAGE_ROWS = 8;
/** Rows asked to preview when there's no IntersectionObserver to tell which are in view */
const FALLBACK_PREVIEW_ROWS = 12;
/** How long rows must stay in view before their previews are asked for */
const VISIBLE_SETTLE_MS = 150;

const CATEGORY_TAGS: Record<GoogleFontCategory, string> = {
  'sans-serif': 'Sans',
  serif: 'Serif',
  display: 'Display',
  handwriting: 'Hand',
  monospace: 'Mono',
};

export interface FontPickerProps {
  /** The family set now */
  value: string;
  /** A family was picked (not the one set now) */
  onChange: (family: string) => void;
  /** The families the document's text is set in, asked for as the list opens */
  documentFamilies?: () => readonly string[];
  id?: string;
  'aria-label'?: string;
}

interface ListContext {
  documentFamilies: readonly string[];
  recentFamilies: readonly string[];
  loadedFamilies: readonly string[];
}

interface Placement {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

/** The CSS font-family to show a family's name in: its own once previewed. */
function previewStyle(family: string): CSSProperties | undefined {
  const preview = fontPreviewFamily(family);
  return preview ? { fontFamily: `${preview}, var(--font-family-ui)` } : undefined;
}

export function FontPicker({
  value,
  onChange,
  documentFamilies,
  id,
  'aria-label': ariaLabel = 'Font',
}: FontPickerProps) {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const categoryRefs = useRef(new Map<FontCategoryFilter, HTMLButtonElement>());
  /** The family picked last, until it is the one set (then it's a recent one) */
  const picked = useRef<string | null>(null);

  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [typed, setTyped] = useState(false);
  const [category, setCategory] = useState<FontCategoryFilter>('all');
  const [activeFamily, setActiveFamily] = useState<string | null>(null);
  const [context, setContext] = useState<ListContext>({
    documentFamilies: [],
    recentFamilies: [],
    loadedFamilies: [],
  });
  const [placement, setPlacement] = useState<Placement | null>(null);
  // Previews coming in show at once
  useSyncExternalStore(subscribeFontPreviews, fontPreviewsVersion);

  const query = open && typed ? text : '';
  const sections = useMemo(
    () => (open ? buildFontSections({ query, category, ...context }) : []),
    [open, query, category, context]
  );
  const options = useMemo(() => sections.flatMap((section) => section.options), [sections]);
  const optionIndex = useMemo(
    () => new Map(options.map((option, index) => [option.family, index])),
    [options]
  );
  const choosable = useMemo(() => options.filter((option) => option.available), [options]);
  // The row the keys are on: the one moved to, else the first that can be picked
  const active = choosable.find((option) => option.family === activeFamily) ?? choosable[0];
  const optionId = (family: string) => `${baseId}-option-${optionIndex.get(family) ?? 0}`;

  // ---- Opening and closing ----

  const openList = useCallback(() => {
    setContext({
      documentFamilies: documentFamilies?.() ?? [],
      recentFamilies: getRecentFonts(),
      loadedFamilies: getFontManager().getLoadedFamilies(),
    });
    setText(value);
    setTyped(false);
    setActiveFamily(value);
    setOpen(true);
  }, [documentFamilies, value]);

  const close = useCallback(() => {
    setOpen(false);
    setTyped(false);
    setText('');
    setPlacement(null);
  }, []);

  const choose = (option: FontOption | undefined) => {
    if (!option?.available) return;
    close();
    if (option.family === value) return;
    picked.current = option.family;
    onChange(option.family);
  };

  // A pick is a recent font once it is set (it may wait for its download, or be declined)
  useEffect(() => {
    if (picked.current !== null && picked.current === value) {
      addRecentFont(value);
      picked.current = null;
    }
  }, [value]);

  // Opened: the current family is selected, so typing replaces it
  useLayoutEffect(() => {
    if (open) inputRef.current?.select();
  }, [open]);

  // ---- Placement: under the field (over it when there's no room), right edges in line ----

  const place = useCallback(() => {
    const field = fieldRef.current;
    if (!field) return;
    const rect = field.getBoundingClientRect();
    const width = Math.min(POPUP_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(rect.right - width, window.innerWidth - width - VIEWPORT_MARGIN)
    );
    const below = window.innerHeight - rect.bottom - POPUP_GAP - VIEWPORT_MARGIN;
    const above = rect.top - POPUP_GAP - VIEWPORT_MARGIN;
    const goesBelow = below >= Math.min(POPUP_MAX_HEIGHT, 260) || below >= above;
    const maxHeight = Math.max(160, Math.min(POPUP_MAX_HEIGHT, goesBelow ? below : above));
    setPlacement(
      goesBelow
        ? { left, width, maxHeight, top: rect.bottom + POPUP_GAP }
        : { left, width, maxHeight, bottom: window.innerHeight - rect.top + POPUP_GAP }
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onScroll = (event: Event) => {
      // The list's own scrolling doesn't move the field
      if (event.target instanceof Node && popupRef.current?.contains(event.target)) return;
      place();
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, place]);

  // ---- Previews: the family set, the row pointed at, the rows in view ----

  useEffect(() => {
    requestFontPreviews([value]);
  }, [value]);

  const activeName = open ? active?.family : undefined;
  const activeId = activeName ? optionId(activeName) : undefined;
  useEffect(() => {
    if (!activeName || !activeId) return;
    requestFontPreviews([activeName]);
    document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeName, activeId]);

  useEffect(() => {
    const list = listRef.current;
    if (!open || !list) return;
    if (typeof IntersectionObserver === 'undefined') {
      requestFontPreviews(choosable.slice(0, FALLBACK_PREVIEW_ROWS).map((o) => o.family));
      return;
    }
    const inView = new Set<string>();
    let settle: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const family = (entry.target as HTMLElement).dataset.family;
          if (!family) continue;
          if (entry.isIntersecting) inView.add(family);
          else inView.delete(family);
        }
        // Rows flown past while scrolling aren't asked for
        if (settle) clearTimeout(settle);
        settle = setTimeout(() => requestFontPreviews(inView), VISIBLE_SETTLE_MS);
      },
      { root: list, rootMargin: '48px 0px' }
    );
    list.querySelectorAll('[data-family]').forEach((row) => observer.observe(row));
    return () => {
      observer.disconnect();
      if (settle) clearTimeout(settle);
    };
  }, [open, choosable]);

  // ---- Keys ----

  const move = (by: number) => {
    if (choosable.length === 0) return;
    const at = active ? choosable.indexOf(active) : -1;
    const next = Math.max(0, Math.min(choosable.length - 1, at + by));
    setActiveFamily(choosable[next]?.family ?? null);
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        if (!open) openList();
        else move(event.key === 'ArrowDown' ? 1 : -1);
        return;
      case 'PageDown':
      case 'PageUp':
        if (!open) return;
        event.preventDefault();
        move(event.key === 'PageDown' ? PAGE_ROWS : -PAGE_ROWS);
        return;
      case 'Enter':
        event.preventDefault();
        if (!open) openList();
        else choose(active);
        return;
      case 'Escape':
        if (!open) return;
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      case 'Tab':
        if (!open) return;
        if (event.shiftKey) {
          close();
          return;
        }
        event.preventDefault();
        categoryRefs.current.get(category)?.focus();
        return;
    }
  };

  const onCategoryKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const at = FONT_CATEGORY_FILTERS.findIndex((filter) => filter.id === category);
    const last = FONT_CATEGORY_FILTERS.length - 1;
    const to: Record<string, number> = {
      ArrowRight: Math.min(last, at + 1),
      ArrowDown: Math.min(last, at + 1),
      ArrowLeft: Math.max(0, at - 1),
      ArrowUp: Math.max(0, at - 1),
      Home: 0,
      End: last,
    };
    const next = FONT_CATEGORY_FILTERS[to[event.key] ?? -1];
    if (next) {
      event.preventDefault();
      setCategory(next.id);
      categoryRefs.current.get(next.id)?.focus();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      inputRef.current?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      inputRef.current?.focus();
    } else if (
      event.key.length === 1 &&
      event.key !== ' ' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      // Typing goes on in the search (and doesn't pick tools)
      event.preventDefault();
      event.stopPropagation();
      setText((before) => (typed ? before : '') + event.key);
      setTyped(true);
      setActiveFamily(null);
      inputRef.current?.focus();
    }
  };

  // Focus leaving the field and the list closes it
  const onBlur = (event: FocusEvent) => {
    const next = event.relatedTarget;
    if (next instanceof Node) {
      if (fieldRef.current?.contains(next) || popupRef.current?.contains(next)) return;
    }
    if (open) close();
  };

  const allowPreviews = () => {
    void ensureGoogleFontsConsent().then((allowed) => {
      if (allowed) requestFontPreviews([value]);
    });
  };

  const resultCount = choosable.length;
  const previewsAllowed = open && hasGoogleFontsConsent();

  return (
    <div className={styles.picker} onBlur={onBlur}>
      <div
        ref={fieldRef}
        className={styles.field}
        data-open={open || undefined}
        data-testid="font-picker"
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          className={styles.input}
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          spellCheck={false}
          placeholder={`Search ${GOOGLE_FONTS_CATALOG.length} fonts`}
          value={open ? text : value}
          style={open && typed ? undefined : previewStyle(value)}
          onClick={() => {
            if (!open) openList();
          }}
          onChange={(event) => {
            if (!open) openList();
            setText(event.target.value);
            setTyped(true);
            setActiveFamily(null);
          }}
          onKeyDown={onInputKeyDown}
        />
        <button
          type="button"
          className={styles.toggle}
          tabIndex={-1}
          aria-label={open ? 'Hide fonts' : 'Show fonts'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (open) {
              close();
            } else {
              inputRef.current?.focus();
              openList();
            }
          }}
        >
          <ChevronDown size={12} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.srOnly} role="status" aria-live="polite">
        {open && typed ? `${resultCount} ${resultCount === 1 ? 'font' : 'fonts'}` : ''}
      </div>
      {open &&
        createPortal(
          // The list keeps focus in the field: pointing and clicking don't take it
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions
          <div
            ref={popupRef}
            className={styles.popup}
            data-placement={placement?.bottom !== undefined ? 'above' : 'below'}
            data-own-keys
            data-testid="font-picker-list"
            style={
              placement
                ? {
                    left: placement.left,
                    width: placement.width,
                    maxHeight: placement.maxHeight,
                    top: placement.top,
                    bottom: placement.bottom,
                  }
                : { visibility: 'hidden' }
            }
            onMouseDown={(event) => event.preventDefault()}
          >
            <div className={styles.categories} role="radiogroup" aria-label="Font category">
              {FONT_CATEGORY_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  ref={(button) => {
                    if (button) categoryRefs.current.set(filter.id, button);
                    else categoryRefs.current.delete(filter.id);
                  }}
                  type="button"
                  role="radio"
                  aria-checked={category === filter.id}
                  tabIndex={category === filter.id ? 0 : -1}
                  className={styles.category}
                  onClick={() => setCategory(filter.id)}
                  onKeyDown={onCategoryKeyDown}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-label="Fonts"
              className={styles.list}
            >
              {sections.map((section) => (
                <div
                  key={section.id}
                  role="group"
                  aria-labelledby={`${baseId}-${section.id}`}
                  data-section={section.id}
                >
                  <div className={styles.sectionHeader}>
                    <span id={`${baseId}-${section.id}`}>{section.label}</span>
                    <span className={styles.count} aria-hidden="true">
                      {section.options.length}
                    </span>
                  </div>
                  {section.options.map((option) => {
                    const isActive = option.family === active?.family;
                    const isCurrent = option.family === value;
                    const style = previewStyle(option.family);
                    return (
                      // Picked with the keys from the field (aria-activedescendant)
                      // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                      <div
                        key={option.family}
                        id={optionId(option.family)}
                        role="option"
                        tabIndex={-1}
                        aria-selected={isActive}
                        aria-disabled={!option.available || undefined}
                        data-family={option.family}
                        data-active={isActive || undefined}
                        data-current={isCurrent || undefined}
                        className={styles.option}
                        title={
                          option.available
                            ? undefined
                            : `${option.family} isn't available here: its text shows in a fallback font`
                        }
                        onMouseEnter={() => {
                          if (option.available) setActiveFamily(option.family);
                        }}
                        onClick={() => choose(option)}
                      >
                        <span
                          className={style ? styles.name : `${styles.name} ${styles.plainName}`}
                          style={style}
                        >
                          {option.family}
                        </span>
                        {option.available ? (
                          <span className={styles.tag} aria-hidden="true">
                            {option.category ? CATEGORY_TAGS[option.category] : ''}
                          </span>
                        ) : (
                          <span className={styles.tag}>Missing</span>
                        )}
                        <span className={styles.check} aria-hidden="true">
                          {isCurrent && <Check size={12} />}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
              {options.length === 0 && (
                <div className={styles.empty}>
                  No fonts match <span className={styles.emptyQuery}>“{query.trim()}”</span>
                  {category !== 'all' ? ' in this category' : ''}
                </div>
              )}
            </div>
            {!previewsAllowed && (
              <div className={styles.footer}>
                <span>Names show in their own font once Google Fonts are allowed.</span>
                <button type="button" className={styles.allow} onClick={allowPreviews}>
                  Allow
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
