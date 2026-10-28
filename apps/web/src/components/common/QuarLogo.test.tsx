import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuarLogo } from './QuarLogo';

describe('QuarLogo', () => {
  it('is one picture named Quar Animator', () => {
    render(<QuarLogo className="logo" />);
    const logo = screen.getByRole('img', { name: 'Quar Animator' });
    expect(logo).toHaveClass('logo');
    expect(logo.getAttribute('viewBox')).toBe('-440 -160 880 320');
  });

  it("frames the letters in the theme's ink", () => {
    render(<QuarLogo />);
    const corners = screen.getByTestId('quar-logo').querySelectorAll('path');
    expect(corners).toHaveLength(4);
    const frame = corners[0]?.parentElement as HTMLElement | null;
    expect(frame?.style.stroke).toBe('var(--color-logo-frame, #eef0ff)');
  });

  it('gives each logo on a page a tile of its own', () => {
    render(
      <>
        <QuarLogo />
        <QuarLogo />
      </>
    );
    const ids = [...document.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    // Each tile is painted by its own logo's gradient
    for (const id of ids) {
      expect(document.querySelector(`rect[fill="url(#${id})"]`)).not.toBeNull();
    }
  });
});
