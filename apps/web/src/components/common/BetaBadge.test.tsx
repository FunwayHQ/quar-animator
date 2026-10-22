import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BetaBadge, BETA_NOTICE_KEY, REPORT_ISSUES_URL, setBetaStorageNote } from './BetaBadge';

describe('BetaBadge', () => {
  beforeEach(() => {
    localStorage.removeItem(BETA_NOTICE_KEY);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('tells a first-time visitor it’s a beta, once, without taking focus', () => {
    const { unmount } = render(<BetaBadge />);
    const notice = screen.getByRole('dialog', { name: 'Quar Animator is in beta' });
    expect(notice).toBeTruthy();
    expect(notice.contains(document.activeElement)).toBe(false);
    expect(screen.getByTestId('beta-badge').getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(screen.getByTestId('beta-notice-done'));
    expect(screen.queryByTestId('beta-notice')).toBeNull();
    expect(localStorage.getItem(BETA_NOTICE_KEY)).toBe('1');

    // Next visit: only the tag
    unmount();
    render(<BetaBadge />);
    expect(screen.queryByTestId('beta-notice')).toBeNull();
    expect(screen.getByTestId('beta-badge').textContent).toContain('Beta');
  });

  it('opens again from the tag, focus inside, and gives focus back on Escape', () => {
    localStorage.setItem(BETA_NOTICE_KEY, '1');
    render(<BetaBadge />);
    const badge = screen.getByTestId('beta-badge');
    expect(badge.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(badge);
    expect(screen.getByTestId('beta-notice')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByTestId('beta-notice-done'));

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('beta-notice')).toBeNull();
    expect(document.activeElement).toBe(badge);

    // The tag toggles it
    fireEvent.click(badge);
    fireEvent.click(badge);
    expect(screen.queryByTestId('beta-notice')).toBeNull();
  });

  it('leaves Escape to a field being typed in elsewhere', () => {
    render(
      <>
        <BetaBadge />
        <input aria-label="name" />
      </>
    );
    const field = screen.getByLabelText('name');
    field.focus();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.getByTestId('beta-notice')).toBeTruthy();
    field.blur();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('beta-notice')).toBeNull();
  });

  it('closes when you press elsewhere, not inside it', () => {
    render(
      <>
        <BetaBadge />
        <button type="button">elsewhere</button>
      </>
    );
    fireEvent.pointerDown(screen.getByTestId('beta-notice'));
    expect(screen.getByTestId('beta-notice')).toBeTruthy();
    fireEvent.pointerDown(screen.getByText('elsewhere'));
    expect(screen.queryByTestId('beta-notice')).toBeNull();
    expect(localStorage.getItem(BETA_NOTICE_KEY)).toBe('1');
  });

  it('links to the issues, in a new tab', () => {
    render(<BetaBadge />);
    const link = screen.getByTestId('beta-notice-report');
    expect(link.getAttribute('href')).toBe(REPORT_ISSUES_URL);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('says where projects are kept: this browser, unless an edition says otherwise', () => {
    render(<BetaBadge />);
    expect(screen.getByTestId('beta-notice-storage').textContent).toContain('this browser');
    cleanup();
    const previous = setBetaStorageNote(() => <>Saved in the cloud</>);
    try {
      render(<BetaBadge />);
      expect(screen.getByTestId('beta-notice-storage').textContent).toBe('Saved in the cloud');
    } finally {
      setBetaStorageNote(previous);
    }
  });

  it('stays closed when the browser keeps no storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<BetaBadge />);
    expect(screen.queryByTestId('beta-notice')).toBeNull();
  });
});
