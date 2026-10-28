/**
 * Tests for FontPicker: the searchable font family combobox
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '../../test/utils';
import { FontPicker } from './FontPicker';
import { GOOGLE_FONTS_CONSENT_KEY } from './ConsentBanner';
import { resetFontPreviewsForTests, PREVIEW_DELAY_MS } from '../../services/fontPreviews';
import { RECENT_FONTS_KEY } from '../../services/recentFonts';

interface HarnessProps {
  initial?: string;
  onPick?: (family: string) => void;
  documentFamilies?: () => readonly string[];
}

/** The picker with its value kept, as the Properties panel keeps it. */
function Harness({ initial = 'Roboto', onPick, documentFamilies }: HarnessProps) {
  const [value, setValue] = useState(initial);
  return (
    <FontPicker
      value={value}
      documentFamilies={documentFamilies}
      onChange={(family) => {
        onPick?.(family);
        setValue(family);
      }}
    />
  );
}

const combobox = () => screen.getByRole('combobox', { name: 'Font' });
const listbox = () => screen.getByRole('listbox', { name: 'Fonts' });
// By attribute: name queries over 300 options are slow
const options = () => [...listbox().querySelectorAll<HTMLElement>('[role="option"]')];
const optionNames = () => options().map((option) => option.dataset.family);
const activeOption = () => options().find((o) => o.getAttribute('aria-selected') === 'true');
const option = (family: string) => {
  const row = listbox().querySelector<HTMLElement>(`[role="option"][data-family="${family}"]`);
  if (!row) throw new Error(`No option ${family}`);
  return row;
};

describe('FontPicker', () => {
  beforeEach(() => {
    localStorage.clear();
    resetFontPreviewsForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the family set, and opens on a click with it active', async () => {
    const user = userEvent.setup();
    render(<Harness documentFamilies={() => ['Roboto', 'Lato']} />);

    expect(combobox()).toHaveValue('Roboto');
    expect(combobox()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).toBeNull();

    await user.click(combobox());

    expect(combobox()).toHaveAttribute('aria-expanded', 'true');
    const groups = within(listbox()).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('aria-labelledby'))).toHaveLength(3);
    expect(within(listbox()).getByRole('group', { name: 'In this document' })).toBeInTheDocument();
    expect(within(listbox()).getByRole('group', { name: 'Google Fonts' })).toBeInTheDocument();
    expect(optionNames().slice(0, 2)).toEqual(['Lato', 'Roboto']);
    expect(activeOption()?.dataset.family).toBe('Roboto');
    expect(combobox()).toHaveAttribute('aria-activedescendant', activeOption()?.id);
  });

  it('filters as you type, best matches first', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(combobox());
    await user.keyboard('lobster');

    expect(combobox()).toHaveValue('lobster');
    expect(optionNames()).toEqual(['Lobster', 'Lobster Two']);
    expect(screen.getByRole('status')).toHaveTextContent('2 fonts');
    // The first match is the one Enter picks
    expect(activeOption()?.dataset.family).toBe('Lobster');
  });

  it('says when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(combobox());
    await user.keyboard('qqqq');
    expect(options()).toEqual([]);
    expect(listbox()).toHaveTextContent('No fonts match “qqqq”');
  });

  it('moves with ↑/↓ and picks with Enter', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Harness initial="Roboto" onPick={onPick} />);

    combobox().focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(activeOption()?.dataset.family).toBe('Roboto');

    const families = optionNames();
    const at = families.indexOf('Roboto');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}');
    expect(activeOption()?.dataset.family).toBe(families[at + 1]);

    await user.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledWith(families[at + 1]);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(combobox()).toHaveValue(families[at + 1]);
    expect(combobox()).toHaveFocus();
  });

  it('closes on Escape without picking, and keeps Escape from the editor', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const editorEscape = vi.fn();
    document.addEventListener('keydown', editorEscape);
    render(<Harness onPick={onPick} />);

    await user.click(combobox());
    await user.keyboard('lat{Escape}');

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(combobox()).toHaveValue('Roboto');
    expect(onPick).not.toHaveBeenCalled();
    expect(editorEscape).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
    document.removeEventListener('keydown', editorEscape);
  });

  it('picks the option clicked', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);

    await user.click(combobox());
    await user.click(option('Playfair Display'));

    expect(onPick).toHaveBeenCalledWith('Playfair Display');
    expect(combobox()).toHaveValue('Playfair Display');
  });

  it("doesn't pick the family set again", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    await user.click(combobox());
    await user.keyboard('{Enter}');
    expect(onPick).not.toHaveBeenCalled();
  });

  it('filters by category', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(combobox());

    await user.click(screen.getByRole('radio', { name: 'Serif' }));

    expect(screen.getByRole('radio', { name: 'Serif' })).toHaveAttribute('aria-checked', 'true');
    expect(optionNames()).toContain('Playfair Display');
    expect(optionNames()).not.toContain('Roboto');
    expect(optionNames()).not.toContain('Lobster');
    // The search keeps the focus
    expect(combobox()).toHaveFocus();
  });

  it('goes to the categories with Tab, moves them with the arrows, and types on in the search', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(combobox());

    await user.keyboard('{Tab}');
    expect(screen.getByRole('radio', { name: 'All' })).toHaveFocus();
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
    const mono = screen.getByRole('radio', { name: 'Mono' });
    expect(mono).toHaveFocus();
    expect(mono).toHaveAttribute('aria-checked', 'true');
    expect(optionNames()).toContain('JetBrains Mono');
    expect(optionNames()).not.toContain('Poppins');

    await user.keyboard('j');
    expect(combobox()).toHaveFocus();
    expect(combobox()).toHaveValue('j');
    expect(optionNames()).toEqual(['JetBrains Mono']);

    await user.keyboard('{Tab}');
    await user.keyboard('{Tab}');
    expect(combobox()).toHaveFocus();
  });

  it("can't pick a font that isn't available, and the keys pass it by", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Harness initial="Lato" onPick={onPick} documentFamilies={() => ['Arial', 'Lato']} />);
    await user.click(combobox());

    const arial = option('Arial');
    expect(arial).toHaveAttribute('aria-disabled', 'true');
    expect(arial).toHaveTextContent('Missing');
    await user.click(arial);
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    // Lato is active; up from it would be Arial, which is skipped
    await user.keyboard('{ArrowUp}');
    expect(activeOption()?.dataset.family).toBe('Lato');
  });

  it('lists the families picked lately at the top', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(combobox());
    await user.click(option('Lobster'));
    await user.click(combobox());
    await user.click(option('Lato'));

    expect(JSON.parse(localStorage.getItem(RECENT_FONTS_KEY) ?? '[]')).toEqual(['Lato', 'Lobster']);
    await user.click(combobox());
    const recent = within(listbox()).getByRole('group', { name: 'Recent' });
    expect(
      [...recent.querySelectorAll<HTMLElement>('[role="option"]')].map((o) => o.dataset.family)
    ).toEqual(['Lato', 'Lobster']);
  });

  it('closes when the focus goes elsewhere', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <button type="button">Elsewhere</button>
      </>
    );
    await user.click(combobox());
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(combobox()).toHaveValue('Roboto');
  });

  describe('previews', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
      fetchMock.mockReset().mockResolvedValue({ ok: true, text: async () => '' });
      vi.stubGlobal('fetch', fetchMock);
      vi.stubGlobal(
        'FontFace',
        class {
          load() {
            return Promise.resolve(this);
          }
        }
      );
      Object.defineProperty(document, 'fonts', { value: { add: vi.fn() }, configurable: true });
    });

    afterEach(() => {
      Reflect.deleteProperty(document, 'fonts');
    });

    const afterPreviewDelay = () =>
      new Promise((resolve) => setTimeout(resolve, PREVIEW_DELAY_MS * 2));

    it('asks Google for nothing before Google Fonts are allowed', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(combobox());
      await user.keyboard('{ArrowDown}{ArrowDown}');
      await afterPreviewDelay();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByText(/once Google Fonts are allowed/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Allow' })).toBeInTheDocument();
    });

    it('asks for previews of the rows in view once they are allowed', async () => {
      localStorage.setItem(GOOGLE_FONTS_CONSENT_KEY, 'true');
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(combobox());
      await afterPreviewDelay();

      expect(fetchMock).toHaveBeenCalled();
      const urls = fetchMock.mock.calls.map(([url]) => new URL(url as string));
      expect(urls.every((url) => url.origin === 'https://fonts.googleapis.com')).toBe(true);
      expect(urls.every((url) => url.searchParams.has('text'))).toBe(true);
      const asked = urls.flatMap((url) => url.searchParams.getAll('family'));
      expect(asked).toContain('Roboto:wght@400');
      expect(asked.length).toBeLessThanOrEqual(13);
      expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
    });
  });
});
