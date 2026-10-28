/**
 * The guide's Markdown: CommonMark with tables (markdown-it), plus the few
 * things a manual needs, all written so the sources still read well on
 * GitHub:
 *
 * - every heading gets an id (`## Saving {#saving}` sets it, otherwise it's
 *   made from the heading's words), so any section can be linked to;
 * - `[[Mod+S]]` is a keyboard shortcut (Mod is Ctrl, or Cmd on a Mac);
 * - an image alone in a paragraph is a figure, its title the caption:
 *   `![What it shows](img/name.png "The caption.")`;
 * - `> [!TIP]`, `> [!NOTE]` and `> [!CAUTION]` blockquotes are callouts;
 * - links to other chapters are written as files (`saving.md#backups`) and
 *   become links between the pages.
 *
 * What a chapter links to, shows and is made of is recorded in `env` as it
 * renders, for the checks and the search index.
 */

import MarkdownIt from 'markdown-it';

/** Keys written in `[[…]]`, as they're shown. Mod and Alt change on a Mac. */
const KEY_LABELS = {
  mod: 'Ctrl',
  ctrl: 'Ctrl',
  control: 'Ctrl',
  cmd: 'Cmd',
  command: 'Cmd',
  alt: 'Alt',
  option: 'Option',
  shift: 'Shift',
  enter: 'Enter',
  return: 'Enter',
  esc: 'Esc',
  escape: 'Esc',
  space: 'Space',
  tab: 'Tab',
  del: 'Delete',
  delete: 'Delete',
  backspace: 'Backspace',
  home: 'Home',
  end: 'End',
  pageup: 'Page Up',
  pagedown: 'Page Down',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
};

/** Keys whose label help.js swaps on a Mac (Ctrl → Cmd, Alt → Option). */
const PLATFORM_KEYS = new Set(['mod', 'alt']);

const CALLOUTS = {
  tip: 'Tip',
  note: 'Note',
  important: 'Note',
  caution: 'Caution',
  warning: 'Caution',
};

/**
 * `Ctrl+Shift+Z` → ['Ctrl', 'Shift', 'Z']; `Ctrl++` → ['Ctrl', '+'].
 *
 * @param {string} text
 * @returns {string[]}
 */
export function splitKeys(text) {
  const keys = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '+' && current !== '') {
      keys.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current !== '') keys.push(current);
  return keys.map((key) => key.trim()).filter((key) => key !== '');
}

/**
 * How a key is shown, and whether a Mac shows it differently.
 *
 * @param {string} key
 */
export function keyLabel(key) {
  const name = key.toLowerCase().replace(/\s+/g, '');
  return {
    label: KEY_LABELS[name] ?? (key.length === 1 ? key.toUpperCase() : key),
    platform: PLATFORM_KEYS.has(name) ? name : null,
  };
}

/** Heading words → an id: "Save your work" → "save-your-work". */
export function slugify(text) {
  return (
    text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

/** The plain text of an inline token's children (for ids, search and the contents). */
export function inlineText(children) {
  let text = '';
  for (const child of children ?? []) {
    if (child.type === 'text' || child.type === 'code_inline') text += child.content;
    else if (child.type === 'softbreak' || child.type === 'hardbreak') text += ' ';
    else if (child.type === 'kbd') text += child.meta.keys.map((k) => keyLabel(k).label).join('+');
    // A picture's description is for those who can't see it, not words on the page
    else if (child.children && child.type !== 'image') text += inlineText(child.children);
  }
  return text;
}

// ============================================================================
// Rules
// ============================================================================

/** `[[Mod+S]]`: a keyboard shortcut. */
function kbdRule(state, silent) {
  const start = state.pos;
  if (state.src.charCodeAt(start) !== 0x5b || state.src.charCodeAt(start + 1) !== 0x5b) {
    return false;
  }
  const end = state.src.indexOf(']]', start + 2);
  if (end < 0 || end > state.posMax) return false;
  const content = state.src.slice(start + 2, end);
  if (!content || content.length > 40 || /[\n[\]]/.test(content)) return false;
  if (!silent) {
    const token = state.push('kbd', 'kbd', 0);
    token.content = content;
    token.meta = { keys: splitKeys(content) };
  }
  state.pos = end + 2;
  return true;
}

/** Give each inline child its source line, for the checks' messages. */
function linesRule(state) {
  for (const token of state.tokens) {
    if (token.type !== 'inline' || !token.map || !token.children) continue;
    for (const child of token.children) {
      child.meta = { ...(child.meta ?? {}), line: token.map[0] };
    }
  }
}

/** `> [!TIP]` blockquotes become callouts. */
function calloutRule(state) {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i];
    if (open.type !== 'blockquote_open') continue;
    const inline = tokens[i + 2];
    if (tokens[i + 1]?.type !== 'paragraph_open' || inline?.type !== 'inline') continue;
    const marker = /^\[!([A-Za-z]+)\][ \t]*\n?/.exec(inline.content);
    const kind = marker && CALLOUTS[marker[1].toLowerCase()] ? marker[1].toLowerCase() : null;
    if (!kind) continue;

    // Find the matching close
    let depth = 0;
    let close = -1;
    for (let j = i; j < tokens.length; j++) {
      if (tokens[j].type === 'blockquote_open') depth++;
      if (tokens[j].type === 'blockquote_close' && --depth === 0) {
        close = j;
        break;
      }
    }
    if (close < 0) continue;
    const style = kind === 'important' ? 'note' : kind === 'warning' ? 'caution' : kind;
    open.meta = { callout: style, label: CALLOUTS[kind] };
    tokens[close].meta = { callout: style };

    // Take the marker out of the first paragraph (and the paragraph, if that's all it was)
    inline.content = inline.content.slice(marker[0].length);
    const children = inline.children ?? [];
    const first = children[0];
    if (first?.type === 'text') {
      first.content = first.content.replace(/^\[![A-Za-z]+\][ \t]*/, '');
      if (first.content === '') {
        children.shift();
        if (children[0]?.type === 'softbreak') children.shift();
      }
    }
    if (inline.content.trim() === '' && children.length === 0) {
      tokens.splice(i + 1, 3);
    }
  }
}

/** Ids on every heading: `{#id}` at the end chooses one. */
function headingRule(state) {
  const env = state.env;
  env.headings ??= [];
  env.ids ??= new Set();
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i];
    if (open.type !== 'heading_open') continue;
    const inline = tokens[i + 1];
    let id = null;
    const custom = /\s*\{#([A-Za-z0-9_-]+)\}\s*$/.exec(inline.content);
    if (custom) {
      id = custom[1];
      inline.content = inline.content.slice(0, custom.index);
      const last = inline.children?.at(-1);
      if (last?.type === 'text') {
        last.content = last.content.replace(/\s*\{#[A-Za-z0-9_-]+\}\s*$/, '');
      }
    }
    const text = inlineText(inline.children).trim();
    if (!id) {
      const base = slugify(text);
      id = base;
      for (let n = 2; env.ids.has(id); n++) id = `${base}-${n}`;
    } else if (env.ids.has(id)) {
      (env.problems ??= []).push({
        line: open.map?.[0] ?? 0,
        message: `heading id "${id}" is used twice`,
      });
    }
    env.ids.add(id);
    open.attrSet('id', id);
    env.headings.push({ level: Number(open.tag.slice(1)), id, text, line: open.map?.[0] ?? 0 });
  }
}

/** An image alone in a paragraph is a figure. */
function figureRule(state) {
  const tokens = state.tokens;
  for (let i = 0; i + 2 < tokens.length; i++) {
    if (tokens[i].type !== 'paragraph_open' || tokens[i + 1].type !== 'inline') continue;
    const parts = (tokens[i + 1].children ?? []).filter(
      (child) =>
        !(child.type === 'text' && child.content.trim() === '') && child.type !== 'softbreak'
    );
    if (parts.length !== 1 || parts[0].type !== 'image') continue;
    // Not inside a list or a callout: a figure stands on its own
    if (tokens[i].level !== 0) continue;
    tokens[i].meta = { figure: true };
    tokens[i + 2].meta = { figure: parts[0] };
    parts[0].meta = { ...(parts[0].meta ?? {}), inFigure: true };
  }
}

/** Each part of the chapter (an h2 and what follows it) is a section. */
function sectionRule(state) {
  const tokens = state.tokens;
  const out = [];
  let open = false;
  for (const token of tokens) {
    if (token.type === 'heading_open' && token.tag === 'h2') {
      const html = new state.Token('html_block', '', 0);
      html.content = `${open ? '</section>\n' : ''}<section class="part">\n`;
      out.push(html);
      open = true;
    }
    out.push(token);
  }
  if (open) {
    const html = new state.Token('html_block', '', 0);
    html.content = '</section>\n';
    out.push(html);
  }
  state.tokens = out;
}

// ============================================================================
// Renderer
// ============================================================================

/**
 * Where a link goes: another chapter (`name.md#anchor`), a part of this one
 * (`#anchor`), or somewhere else on the web.
 *
 * @param {string} href
 */
export function classifyLink(href) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { kind: 'external', href };
  if (href.startsWith('#')) return { kind: 'anchor', anchor: decodeURIComponent(href.slice(1)) };
  const chapter = /^(?:\.\/)?([A-Za-z0-9_-]+)\.md(?:#(.*))?$/.exec(href);
  if (chapter) {
    return {
      kind: 'chapter',
      page: chapter[1],
      anchor: chapter[2] ? decodeURIComponent(chapter[2]) : null,
    };
  }
  return { kind: 'other', href };
}

function installRenderer(md) {
  const { escapeHtml } = md.utils;
  const rules = md.renderer.rules;

  rules.kbd = (tokens, idx) => {
    const keys = tokens[idx].meta.keys.map((key) => {
      const { label, platform } = keyLabel(key);
      return `<kbd${platform ? ` data-key="${platform}"` : ''}>${escapeHtml(label)}</kbd>`;
    });
    return `<kbd class="keys">${keys.join('<span class="plus">+</span>')}</kbd>`;
  };

  rules.blockquote_open = (tokens, idx, options, env, slf) => {
    const meta = tokens[idx].meta;
    if (!meta?.callout) return slf.renderToken(tokens, idx, options);
    return `<aside class="callout ${meta.callout}" role="note"><p class="callout-label">${meta.label}</p>\n`;
  };
  rules.blockquote_close = (tokens, idx, options, env, slf) =>
    tokens[idx].meta?.callout ? '</aside>\n' : slf.renderToken(tokens, idx, options);

  rules.paragraph_open = (tokens, idx, options, env, slf) =>
    tokens[idx].meta?.figure ? '<figure>' : slf.renderToken(tokens, idx, options);
  rules.paragraph_close = (tokens, idx, options, env, slf) => {
    const image = tokens[idx].meta?.figure;
    if (!image) return slf.renderToken(tokens, idx, options);
    const title = image.attrGet('title');
    return `${title ? `<figcaption><span>${md.renderInline(title, env)}</span></figcaption>` : ''}</figure>\n`;
  };

  rules.image = (tokens, idx, options, env, slf) => {
    const token = tokens[idx];
    const src = token.attrGet('src') ?? '';
    const alt = slf.renderInlineAsText(token.children ?? [], options, env);
    const line = token.meta?.line ?? 0;
    const image = env.onImage ? env.onImage(src, { alt, line }) : { src };
    const attrs = [`src="${escapeHtml(image.src)}"`, `alt="${escapeHtml(alt)}"`];
    if (image.width && image.height) {
      attrs.push(`width="${image.width}"`, `height="${image.height}"`);
    }
    attrs.push('loading="lazy"', 'decoding="async"');
    const title = token.attrGet('title');
    if (title && !token.meta?.inFigure) attrs.push(`title="${escapeHtml(title)}"`);
    return `<img ${attrs.join(' ')}>`;
  };

  rules.link_open = (tokens, idx, options, env, slf) => {
    const token = tokens[idx];
    const href = token.attrGet('href') ?? '';
    const link = classifyLink(href);
    (env.links ??= []).push({ ...link, href, line: token.meta?.line ?? 0 });
    if (link.kind === 'chapter') {
      token.attrSet(
        'href',
        `${env.root ?? '../'}${link.page}/${link.anchor ? `#${encodeURIComponent(link.anchor)}` : ''}`
      );
    } else if (link.kind === 'external' && /^https?:/i.test(href)) {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener noreferrer');
    }
    return slf.renderToken(tokens, idx, options);
  };

  rules.table_open = () => '<div class="table-wrap">\n<table>\n';
  rules.table_close = () => '</table>\n</div>\n';

  // A link to each section, beside its heading (the contents rail is the keyboard way there)
  rules.heading_close = (tokens, idx, options, env, slf) => {
    const open = tokens[idx - 2];
    const id = open?.attrGet('id');
    const level = Number(tokens[idx].tag.slice(1));
    const anchor =
      id && level >= 2
        ? `<a class="anchor" href="#${escapeHtml(id)}" aria-hidden="true" tabindex="-1">#</a>`
        : '';
    return `${anchor}${slf.renderToken(tokens, idx, options)}`;
  };
}

/** The guide's Markdown renderer. */
export function createMarkdown() {
  const md = new MarkdownIt({ html: true, linkify: false, typographer: true });
  md.inline.ruler.before('link', 'kbd', kbdRule);
  md.core.ruler.push('quar_lines', linesRule);
  md.core.ruler.push('quar_callouts', calloutRule);
  md.core.ruler.push('quar_headings', headingRule);
  md.core.ruler.push('quar_figures', figureRule);
  md.core.ruler.push('quar_sections', sectionRule);
  installRenderer(md);
  return md;
}

/**
 * The text of a chapter, part by part, for the search index: each h2 and h3
 * with the words under it (the chapter's opening words under its title).
 *
 * @param {import('markdown-it').Token[]} tokens
 * @param {string} title
 */
export function searchSections(tokens, title) {
  const sections = [{ id: '', title, words: [] }];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'heading_open' && (token.tag === 'h2' || token.tag === 'h3')) {
      sections.push({
        id: token.attrGet('id') ?? '',
        title: inlineText(tokens[i + 1]?.children).trim(),
        words: [],
      });
      i += 2;
      continue;
    }
    if (token.type === 'inline' && tokens[i - 1]?.type !== 'heading_open') {
      sections.at(-1).words.push(inlineText(token.children));
    } else if (token.type === 'fence' || token.type === 'code_block') {
      sections.at(-1).words.push(token.content);
    }
  }
  return sections
    .map(({ id, title: heading, words }) => ({
      id,
      title: heading,
      text: words.join(' ').replace(/\s+/g, ' ').trim(),
    }))
    .filter((section) => section.id !== '' || section.text !== '');
}
