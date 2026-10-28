/**
 * The help panel: openHelp() and F1 show the user guide's pages beside the
 * canvas, with back, contents, a tab of its own and close.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { HelpHost } from './HelpWindow';
import { closeHelp, getHelpPanel, helpTopicFor, helpUrl, openHelp } from './helpPanel';
import { setUiTheme } from '../../hooks/useUiTheme';

const frame = () => screen.getByTestId('help-frame') as HTMLIFrameElement;
const src = () => frame().getAttribute('src');

/** Pretend the frame has loaded one of the guide's pages. */
function loadPage(href: string, title: string) {
  const doc = document.implementation.createHTMLDocument(title);
  const hashListeners: (() => void)[] = [];
  const win = {
    // What React looks for when the focus is in a frame
    document: doc,
    HTMLIFrameElement: window.HTMLIFrameElement,
    location: { href, replace: vi.fn() },
    addEventListener: vi.fn((type: string, listener: () => void) => {
      if (type === 'hashchange') hashListeners.push(listener);
    }),
  };
  const element = frame();
  Object.defineProperty(element, 'contentWindow', { configurable: true, get: () => win });
  Object.defineProperty(element, 'contentDocument', { configurable: true, get: () => doc });
  fireEvent.load(element);
  return {
    win,
    doc,
    /** The reader followed a link within the page. */
    hashTo(next: string) {
      win.location.href = next;
      act(() => hashListeners.forEach((listener) => listener()));
    },
  };
}

beforeEach(() => {
  window.localStorage.removeItem('quar-animator-help-window');
});

afterEach(() => {
  act(() => closeHelp());
  setUiTheme('dark');
});

describe('helpUrl', () => {
  it('finds the guide beside the app, whichever page of the app asks', () => {
    expect(helpUrl('index', null, 'http://localhost:3000/editor?project=p1')).toBe(
      'http://localhost:3000/help/'
    );
    expect(helpUrl('getting-started', 'saving', 'https://free.quar.pro/')).toBe(
      'https://free.quar.pro/help/getting-started/#saving'
    );
  });

  it('names index.html when the app was opened from files (the desktop app)', () => {
    expect(
      helpUrl(
        'getting-started',
        'pages',
        'file:///Applications/Quar/resources/web/index.html#/editor'
      )
    ).toBe('file:///Applications/Quar/resources/web/help/getting-started/index.html#pages');
  });
});

describe('helpTopicFor', () => {
  it('reads the nearest data-help around an element', () => {
    document.body.innerHTML =
      '<div data-help="timeline#keyframes"><button id="inner">Key</button></div><div data-help="layers"><span id="plain"></span></div><p id="none"></p>';
    expect(helpTopicFor(document.getElementById('inner'))).toEqual({
      page: 'timeline',
      anchor: 'keyframes',
    });
    expect(helpTopicFor(document.getElementById('plain'))).toEqual({
      page: 'layers',
      anchor: null,
    });
    expect(helpTopicFor(document.getElementById('none'))).toBeNull();
    expect(helpTopicFor(null)).toBeNull();
    document.body.innerHTML = '';
  });
});

describe('the help panel', () => {
  it('is not there until asked for', () => {
    render(<HelpHost />);
    expect(screen.queryByRole('dialog', { name: 'User Guide' })).toBeNull();
    // Escape and the editor's keys reach nothing of it
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'v' });
    expect(getHelpPanel().open).toBe(false);
  });

  it('opens at the page and part asked for, beside the canvas', () => {
    render(<HelpHost />);
    act(() => openHelp('getting-started', 'saving'));
    const dialog = screen.getByRole('dialog', { name: 'User Guide' });
    expect(src()).toBe(helpUrl('getting-started', 'saving'));
    expect(frame().title).toBe('User Guide');
    // Its keys stay its own (Space doesn't play the timeline from here)
    expect(dialog).toHaveAttribute('data-own-keys');
    // Down the right of the window by default
    expect(dialog.style.width).toBe('440px');
    expect(parseFloat(dialog.style.left)).toBe(window.innerWidth - 440 - 16);
  });

  it('goes to another page when asked while open', () => {
    render(<HelpHost />);
    act(() => openHelp('getting-started'));
    act(() => openHelp('getting-started', 'undo'));
    expect(src()).toBe(helpUrl('getting-started', 'undo'));
    fireEvent.click(screen.getByRole('button', { name: 'Contents' }));
    expect(src()).toBe(helpUrl());
  });

  it('closes with its button or Escape, and gives the focus back', () => {
    render(
      <>
        <button type="button">Canvas tool</button>
        <HelpHost />
      </>
    );
    const tool = screen.getByRole('button', { name: 'Canvas tool' });
    tool.focus();
    act(() => openHelp());
    fireEvent.click(screen.getByRole('button', { name: 'Close the User Guide' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(tool);

    act(() => openHelp());
    fireEvent.keyDown(screen.getByRole('button', { name: 'Contents' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the page’s title, follows the editor’s theme, and closes on Escape inside the page', () => {
    render(<HelpHost />);
    act(() => openHelp('getting-started'));
    const page = loadPage(
      'http://localhost:3000/help/getting-started/',
      'Getting started · Quar Animator User Guide'
    );
    expect(screen.getByTestId('help-page-title')).toHaveTextContent('Getting started');
    expect(page.doc.documentElement.dataset.theme).toBe('dark');
    act(() => setUiTheme('light'));
    expect(page.doc.documentElement.dataset.theme).toBe('light');

    // F1 inside the page is the editor's, not the browser's help
    const f1 = new KeyboardEvent('keydown', { key: 'F1', bubbles: true, cancelable: true });
    page.doc.dispatchEvent(f1);
    expect(f1.defaultPrevented).toBe(true);

    // The search box keeps an Escape it used (to clear itself)
    const kept = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    kept.preventDefault();
    act(() => {
      page.doc.dispatchEvent(kept);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => {
      page.doc.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      );
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('goes back through the pages read, without leaving the guide', () => {
    render(<HelpHost />);
    act(() => openHelp());
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back).toBeDisabled();

    loadPage('http://localhost:3000/help/', 'Quar Animator User Guide');
    expect(back).toBeDisabled();
    const chapter = loadPage(
      'http://localhost:3000/help/getting-started/',
      'Getting started · Quar Animator User Guide'
    );
    chapter.hashTo('http://localhost:3000/help/getting-started/#pages');
    expect(back).toBeEnabled();

    fireEvent.click(back);
    expect(chapter.win.location.replace).toHaveBeenCalledWith(
      'http://localhost:3000/help/getting-started/'
    );
    // That page coming back isn't a new step
    chapter.hashTo('http://localhost:3000/help/getting-started/');
    expect(back).toBeEnabled();
    fireEvent.click(back);
    expect(chapter.win.location.replace).toHaveBeenLastCalledWith('http://localhost:3000/help/');
    loadPage('http://localhost:3000/help/', 'Quar Animator User Guide');
    expect(back).toBeDisabled();
  });

  it('opens the page in view in a tab of its own', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<HelpHost />);
    act(() => openHelp('getting-started'));
    loadPage(
      'http://localhost:3000/help/getting-started/#undo',
      'Getting started · Quar Animator User Guide'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open in a new tab' }));
    expect(open).toHaveBeenCalledWith(
      'http://localhost:3000/help/getting-started/#undo',
      '_blank',
      'noopener'
    );
    open.mockRestore();
  });

  it('opens where it was left', () => {
    window.localStorage.setItem(
      'quar-animator-help-window',
      JSON.stringify({ x: 40, y: 60, width: 500, height: 400 })
    );
    render(<HelpHost />);
    act(() => openHelp());
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.left).toBe('40px');
    expect(dialog.style.top).toBe('60px');
    expect(dialog.style.width).toBe('500px');
  });
});

describe('F1', () => {
  it('opens the guide’s contents', () => {
    render(<HelpHost />);
    fireEvent.keyDown(window, { key: 'F1' });
    expect(screen.getByRole('dialog', { name: 'User Guide' })).toBeInTheDocument();
    expect(src()).toBe(helpUrl());
  });

  it('opens the page for what has the focus, or else what is under the pointer', () => {
    render(
      <>
        <div data-help="timeline#keyframes">
          <button type="button">Add keyframe</button>
        </div>
        <div data-help="layers" data-testid="layers" />
        <HelpHost />
      </>
    );
    fireEvent.pointerOver(screen.getByTestId('layers'));
    fireEvent.keyDown(window, { key: 'F1' });
    expect(src()).toBe(helpUrl('layers'));

    screen.getByRole('button', { name: 'Add keyframe' }).focus();
    fireEvent.keyDown(window, { key: 'F1' });
    expect(src()).toBe(helpUrl('timeline', 'keyframes'));
  });

  it('leaves F1 with a modifier alone', () => {
    render(<HelpHost />);
    fireEvent.keyDown(window, { key: 'F1', ctrlKey: true });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
