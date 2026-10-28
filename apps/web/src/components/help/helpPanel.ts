/**
 * The user guide inside the editor. Any part of the editor can call
 * `openHelp(page, anchor)` to show the guide's page about it in the help
 * panel (Help › User Guide, F1): `page` is a chapter's file name in
 * docs/help/ without `.md`, `anchor` a heading's id. `pnpm help:check` makes
 * sure every page and anchor the editor asks for exists.
 *
 * Parts of the editor can also say which page is theirs with a
 * `data-help="page#anchor"` attribute: F1 opens the page of whatever has the
 * focus, or else of what's under the pointer.
 */

import { useSyncExternalStore } from 'react';

/** The guide's contents page. */
export const HELP_CONTENTS = 'index';

export interface HelpTopic {
  page: string;
  anchor: string | null;
}

export interface HelpPanelState extends HelpTopic {
  open: boolean;
  /** Raised by every openHelp(), so asking again for the page in view still goes there. */
  request: number;
}

let state: HelpPanelState = { open: false, page: HELP_CONTENTS, anchor: null, request: 0 };
const listeners = new Set<() => void>();
/** What had the focus when the panel opened, to give it back when it closes. */
let returnFocus: HTMLElement | null = null;

function update(next: HelpPanelState) {
  state = next;
  listeners.forEach((listener) => listener());
}

/** Show a page of the guide in the help panel, opening it if it's closed. */
export function openHelp(page: string = HELP_CONTENTS, anchor?: string | null): void {
  if (!state.open && typeof document !== 'undefined') {
    const active = document.activeElement;
    returnFocus = active instanceof HTMLElement && active !== document.body ? active : null;
  }
  update({
    open: true,
    page: page || HELP_CONTENTS,
    anchor: anchor ?? null,
    request: state.request + 1,
  });
}

/** Close the help panel, giving the focus back to where it was. */
export function closeHelp(): void {
  if (!state.open) return;
  update({ ...state, open: false });
  const target = returnFocus;
  returnFocus = null;
  if (target?.isConnected) target.focus();
}

export function getHelpPanel(): HelpPanelState {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useHelpPanel(): HelpPanelState {
  return useSyncExternalStore(subscribe, getHelpPanel, getHelpPanel);
}

/**
 * The address of a page of the guide, which is served at help/ beside the
 * app (on the same site, so the panel can follow it).
 */
export function helpUrl(
  page: string = HELP_CONTENTS,
  anchor?: string | null,
  base: string = document.baseURI
): string {
  const folder = page === HELP_CONTENTS ? 'help/' : `help/${encodeURIComponent(page)}/`;
  const url = new URL(folder, base);
  // Opened from files (the desktop app), a folder doesn't open its index.html
  if (url.protocol === 'file:') url.pathname += 'index.html';
  if (anchor) url.hash = encodeURIComponent(anchor);
  return url.href;
}

/** The guide's page for an element: the nearest `data-help="page#anchor"` around it. */
export function helpTopicFor(element: Element | null | undefined): HelpTopic | null {
  const marked = element?.closest('[data-help]');
  const value = marked?.getAttribute('data-help')?.trim();
  if (!value) return null;
  const [page = '', anchor = ''] = value.split('#');
  return page ? { page, anchor: anchor || null } : null;
}
