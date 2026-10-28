/**
 * The guide's page templates: the contents page and a page per chapter.
 * Every page works under a strict Content Security Policy — styles and
 * scripts only from files beside it, nothing inline, nothing from elsewhere.
 * Links are relative, so the guide works wherever the app is served.
 */

export const CSP =
  "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' data:; script-src 'self'; base-uri 'none'; form-action 'none'";

export const GUIDE_NAME = 'Quar Animator User Guide';

const EDITIONS = { free: 'Free editor', cloud: 'Cloud edition' };

/** @param {unknown} value */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const pad = (n) => String(n).padStart(2, '0');

function head({ title, description, root, extra = '' }) {
  return `<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="help-root" content="${root}" />
    <link rel="icon" href="${root}assets/mark.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="${root}assets/help.css" />${extra}
    <script src="${root}assets/help.js"></script>
  </head>`;
}

function masthead({ root, current }) {
  return `
    <a class="skip" href="#text">Skip to the text</a>

    <header class="masthead">
      <a class="mark" href="${root}"
        ><img src="${root}assets/mark.svg" alt="" width="26" height="26" /><span class="mark-name"
          >Quar Animator</span
        ><span class="mark-sub">User Guide</span></a
      >
      <div class="search" role="search">
        <label class="visually-hidden" for="help-search">Search the guide</label>
        <input
          id="help-search"
          class="search-input"
          type="search"
          placeholder="Search the guide"
          autocomplete="off"
          spellcheck="false"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="false"
          aria-controls="help-search-results"
        />
        <kbd class="search-key" aria-hidden="true">/</kbd>
        <div id="help-search-results" class="search-results" role="listbox" aria-label="Search results" hidden></div>
      </div>
      <nav class="links" aria-label="Guide">
        <a href="${root}"${current === 'index' ? ' aria-current="page"' : ''}>Contents</a>
        <a class="to-editor" href="${root}../">Open in the editor</a>
      </nav>
    </header>`;
}

function colophon({ root, sourceUrl }) {
  return `
    <footer class="colophon">
      <span>${GUIDE_NAME}</span>
      <span>${
        sourceUrl
          ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Improve this page</a> · `
          : ''
      }<a href="${root}">All chapters</a><span class="to-editor"> · <a href="${root}../">Open in the editor</a></span></span>
    </footer>`;
}

/** The contents rail: the chapter's h2s, numbered, with their h3s under them. */
function contentsRail(headings) {
  const parts = [];
  for (const heading of headings) {
    if (heading.level === 2) parts.push({ heading, children: [] });
    else if (heading.level === 3 && parts.length > 0) parts.at(-1).children.push(heading);
  }
  if (parts.length === 0) return '';
  const link = (h) => `<a href="#${escapeHtml(h.id)}">${escapeHtml(h.text)}</a>`;
  const items = parts
    .map(({ heading, children }) => {
      const sub = children.length
        ? `<ol class="sub">${children.map((c) => `<li>${link(c)}</li>`).join('')}</ol>`
        : '';
      return `<li>${link(heading)}${sub}</li>`;
    })
    .join('\n                ');
  return `
        <aside class="index">
          <details open>
            <summary>On this page</summary>
            <nav aria-label="On this page">
              <ol>
                ${items}
              </ol>
            </nav>
          </details>
        </aside>`;
}

function pager({ prev, next, root }) {
  if (!prev && !next) return '';
  const card = (chapter, rel, label) =>
    chapter
      ? `<a class="pager-${rel}" rel="${rel}" href="${root}${chapter.slug}/"><span>${label}</span><b>${escapeHtml(chapter.title)}</b></a>`
      : '<span></span>';
  return `
      <nav class="pager" aria-label="Chapters">
        ${card(prev, 'prev', 'Previous')}
        ${card(next, 'next', 'Next')}
      </nav>`;
}

/**
 * A chapter's page.
 *
 * @param {object} p
 * @param {{ slug: string, title: string, summary: string, edition: string, number: number, minutes: number, sourceUrl: string | null }} p.chapter
 * @param {string} p.html the rendered Markdown
 * @param {{ level: number, id: string, text: string }[]} p.headings
 * @param {{ slug: string, title: string } | null} p.prev
 * @param {{ slug: string, title: string } | null} p.next
 */
export function chapterPage({ chapter, html, headings, prev, next }) {
  const root = '../';
  const links = [
    prev ? `\n    <link rel="prev" href="${root}${prev.slug}/" />` : '',
    next ? `\n    <link rel="next" href="${root}${next.slug}/" />` : '',
  ].join('');
  const rail = contentsRail(headings);
  return `${head({
    title: `${chapter.title} · ${GUIDE_NAME}`,
    description: chapter.summary,
    root,
    extra: links,
  })}
  <body class="chapter-page" data-chapter="${escapeHtml(chapter.slug)}">${masthead({ root, current: chapter.slug })}

    <main id="main">
      <div class="title">
        <p class="eyebrow">Chapter ${pad(chapter.number)}${
          chapter.edition === 'cloud' ? ' · Cloud edition' : ''
        }</p>
        <h1>${escapeHtml(chapter.title)}</h1>
        <p class="lede">${escapeHtml(chapter.summary)}</p>
        <ul class="stamp">
          <li><b>Reading time</b> ${chapter.minutes} min</li>
          <li><b>Edition</b> ${EDITIONS[chapter.edition] ?? chapter.edition}</li>
        </ul>
      </div>

      <div class="document${rail ? '' : ' no-rail'}">${rail}

        <article class="text" id="text">
${html}
        </article>
      </div>
${pager({ prev, next, root })}
    </main>
${colophon({ root, sourceUrl: chapter.sourceUrl })}
  </body>
</html>
`;
}

/**
 * The guide's front page: the chapters in order, each with its summary and
 * its parts.
 *
 * @param {{ chapters: { slug: string, title: string, summary: string, edition: string, number: number, headings: { level: number, id: string, text: string }[] }[] }} p
 */
export function indexPage({ chapters }) {
  const root = '';
  const items = chapters
    .map((chapter) => {
      const topics = chapter.headings
        .filter((h) => h.level === 2)
        .map(
          (h) => `<li><a href="${chapter.slug}/#${escapeHtml(h.id)}">${escapeHtml(h.text)}</a></li>`
        )
        .join('');
      return `
          <li class="chapter-entry${chapter.edition === 'cloud' ? ' cloud' : ''}">
            <span class="chapter-num" aria-hidden="true">${pad(chapter.number)}</span>
            <div class="chapter-body">
              <h3><a href="${chapter.slug}/">${escapeHtml(chapter.title)}</a>${
                chapter.edition === 'cloud' ? ' <span class="tag">Cloud edition</span>' : ''
              }</h3>
              <p>${escapeHtml(chapter.summary)}</p>${topics ? `\n              <ul class="topics" aria-label="In this chapter">${topics}</ul>` : ''}
            </div>
          </li>`;
    })
    .join('');

  const list = chapters.length
    ? `<ol class="chapter-list">${items}
        </ol>`
    : '<p class="empty">The chapters are on their way.</p>';

  return `${head({
    title: GUIDE_NAME,
    description:
      'How to use Quar Animator, the free 2D animation editor: step by step, with pictures.',
    root,
  })}
  <body class="index-page">${masthead({ root, current: 'index' })}

    <main id="main">
      <div class="title">
        <p class="eyebrow">User Guide</p>
        <h1>Learn Quar Animator</h1>
        <p class="lede">
          Everything the editor does, step by step: from your first shape to a finished animation
          you can share. Press F1 in the editor to open this guide beside your work.
        </p>
      </div>

      <section class="chapters" id="text" aria-labelledby="chapters-title">
        <h2 id="chapters-title">Chapters</h2>
        ${list}
      </section>
    </main>
${colophon({ root, sourceUrl: null })}
  </body>
</html>
`;
}
