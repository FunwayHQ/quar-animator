import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopOnlyGate } from './DesktopOnlyGate';

describe('DesktopOnlyGate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the desktop-only message on a phone-sized viewport', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => createMediaQuery(true))
    );

    render(
      <DesktopOnlyGate>
        <div>Editor workspace</div>
      </DesktopOnlyGate>
    );

    expect(screen.getByText('Desktop only')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /needs a larger screen/i })).toBeInTheDocument();
    expect(screen.queryByText('Editor workspace')).not.toBeInTheDocument();
  });

  it('renders the app on a desktop-sized viewport', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => createMediaQuery(false))
    );

    render(
      <DesktopOnlyGate>
        <div>Editor workspace</div>
      </DesktopOnlyGate>
    );

    expect(screen.getByText('Editor workspace')).toBeInTheDocument();
    expect(screen.queryByText('Desktop only')).not.toBeInTheDocument();
  });

  it('switches modes when the viewport crosses the breakpoint', () => {
    let matches = true;
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(
        () =>
          ({
            get matches() {
              return matches;
            },
            addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
              listeners.add(listener),
            removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
              listeners.delete(listener),
          }) as unknown as MediaQueryList
      )
    );

    render(
      <DesktopOnlyGate>
        <div>Editor workspace</div>
      </DesktopOnlyGate>
    );
    expect(screen.getByText('Desktop only')).toBeInTheDocument();

    act(() => {
      matches = false;
      listeners.forEach((listener) => listener({ matches } as MediaQueryListEvent));
    });

    expect(screen.getByText('Editor workspace')).toBeInTheDocument();
  });
});

function createMediaQuery(matches: boolean): MediaQueryList {
  return {
    matches,
    media: '(max-width: 767px), (max-width: 1024px) and (hover: none) and (pointer: coarse)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  } as unknown as MediaQueryList;
}
