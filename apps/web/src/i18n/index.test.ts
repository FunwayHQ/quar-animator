import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getLocale, setLocale, LOCALES } from './store';
import { translateText, translateTree, installI18n, uninstallI18n } from './translator';

describe('i18n dictionaries', () => {
  it('keeps every locale key in lockstep and uses namespaced keys', async () => {
    const en = (await import('./locales/en.json')).default;
    const dictionaries = await Promise.all(
      LOCALES.filter((locale) => locale !== 'en').map(async (locale) => ({
        locale,
        dictionary: (await import(`./locales/${locale}.json`)).default as Record<string, string>,
      }))
    );
    expect(dictionaries.map((entry) => entry.locale)).toEqual(['zh-CN', 'zh-TW', 'ja']);

    for (const { locale, dictionary } of dictionaries) {
      expect(Object.keys(dictionary).sort(), locale).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en)) {
        expect(key).toMatch(/^[a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9-]+$/);
        expect(typeof dictionary[key], `${locale}:${key}`).toBe('string');
        expect((dictionary[key] as string).length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every {placeholder} of the English source', async () => {
    const en = (await import('./locales/en.json')).default as Record<string, string>;
    for (const locale of LOCALES.filter((entry) => entry !== 'en')) {
      const dictionary = (await import(`./locales/${locale}.json`)).default as Record<
        string,
        string
      >;
      for (const key of Object.keys(en)) {
        const expected = (en[key]!.match(/\{\w+\}/g) ?? []).slice().sort();
        const actual = (dictionary[key]!.match(/\{\w+\}/g) ?? []).slice().sort();
        expect(actual, `${locale}:${key}`).toEqual(expected);
      }
    }
  });

  it('maps English source text to namespaced keys', async () => {
    const { resolveKey } = await import('./catalog');
    expect(resolveKey('New Project')).toMatch(/\.new-project$/);
    expect(resolveKey('Untranslatable qwerty 12345')).toBeUndefined();
  });
});

describe('translateText', () => {
  it('returns the source unchanged in English', () => {
    expect(translateText('New Project', 'en')).toBe('New Project');
  });

  it('translates a known string to Chinese', () => {
    expect(translateText('New Project', 'zh-CN')).toBe('新建项目');
  });

  it('leaves unknown strings untouched', () => {
    expect(translateText('Some dynamic value 42', 'zh-CN')).toBe('Some dynamic value 42');
  });

  it('preserves surrounding whitespace', () => {
    expect(translateText('  Save  ', 'zh-CN')).toBe('  保存  ');
  });
});

describe('DOM translation engine', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    uninstallI18n();
    setLocale('en');
  });

  afterEach(() => {
    uninstallI18n();
    document.body.innerHTML = '';
  });

  it('translates rendered text nodes only in Chinese', () => {
    installI18n();
    document.body.innerHTML = '<button>Timeline</button><button>Unknown label</button>';
    translateTree();
    setLocale('zh-CN');
    const buttons = document.querySelectorAll('button');
    expect(buttons[0]?.textContent).toBe('时间轴');
    expect(buttons[1]?.textContent).toBe('Unknown label');
    setLocale('en');
    expect(document.querySelector('button')?.textContent).toBe('Timeline');
  });

  it('translates tooltip and aria-label attributes', () => {
    installI18n();
    document.body.innerHTML =
      '<button title="Zoom In" aria-label="Toggle visibility" placeholder="Type something..."></button>';
    translateTree();
    setLocale('zh-CN');
    const button = document.querySelector('button');
    expect(button?.getAttribute('title')).toBe('放大');
    expect(button?.getAttribute('aria-label')).toBe('切换可见性');
    expect(button?.getAttribute('placeholder')).toBe('请输入...');
  });

  it('does not loop on its own DOM writes', () => {
    installI18n();
    document.body.innerHTML = '<span>Save</span>';
    translateTree();
    expect(() => setLocale('zh-CN')).not.toThrow();
    expect(document.querySelector('span')?.textContent).toBe('保存');
  });

  it('respects data-i18n-skip', () => {
    installI18n();
    document.body.innerHTML = '<span data-i18n-skip>Save</span><span>Save</span>';
    translateTree();
    setLocale('zh-CN');
    const spans = document.querySelectorAll('span');
    expect(spans[0]?.textContent).toBe('Save');
    expect(spans[1]?.textContent).toBe('保存');
  });

  it('reflects the locale on the document element', () => {
    expect(getLocale()).toBe('en');
    setLocale('zh-CN');
    expect(document.documentElement.lang).toBe('zh-CN');
    setLocale('en');
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('mutable catalog', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('imports a partial dictionary and falls back to English for missing keys', async () => {
    const { applyDictionary, restoreDictionary } = await import('./index');
    const { lookup, resolveKey } = await import('./catalog');
    setLocale('zh-CN');
    const saveKey = resolveKey('Save');
    expect(saveKey).toBeDefined();
    const result = applyDictionary('zh-CN', JSON.stringify({ [saveKey!]: '存储' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.count).toBe(1);
    expect(lookup('Save', 'zh-CN')).toBe('存储');
    // Missing key falls back to the English source text.
    expect(lookup('New Project', 'zh-CN')).toBe('New Project');
    restoreDictionary('zh-CN');
    expect(lookup('Save', 'zh-CN')).toBe('保存');
  });

  it('rejects invalid JSON and non-object shapes', async () => {
    const { applyDictionary } = await import('./index');
    expect(applyDictionary('zh-CN', '{not json')).toEqual({ ok: false, error: 'invalid-json' });
    expect(applyDictionary('zh-CN', '[1,2]')).toEqual({ ok: false, error: 'invalid-shape' });
    expect(applyDictionary('zh-CN', JSON.stringify({ A: 5 }))).toEqual({
      ok: false,
      error: 'invalid-shape',
    });
  });

  it('exports a JSON template of the active dictionary with namespaced keys', async () => {
    const { exportDictionary } = await import('./index');
    const { resolveKey } = await import('./catalog');
    const en = JSON.parse(exportDictionary('en')) as Record<string, string>;
    const key = resolveKey('New Project')!;
    expect(en[key]).toBe('New Project');
  });
});
