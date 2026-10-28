/**
 * A chapter's frontmatter: the `key: value` lines between two `---` lines at
 * the top of its Markdown. Only flat keys are needed (title, order,
 * summary), so this reads that small subset of YAML and nothing more.
 */

/** The keys every chapter must have. */
export const REQUIRED_FIELDS = ['title', 'order', 'summary'];

/**
 * Split a chapter's source into its frontmatter and its body.
 *
 * @param {string} source
 * @returns {{ data: Record<string, string | number>, body: string, bodyLine: number, problems: string[] }}
 *   `bodyLine` is the source line (0-based) the body starts on, so problems
 *   found in the body can name their line in the file.
 */
export function parseFrontmatter(source) {
  const problems = [];
  const text = source.replace(/^﻿/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) {
    return {
      data: {},
      body: text,
      bodyLine: 0,
      problems: ['has no frontmatter (start the file with ---, title, order and summary, ---)'],
    };
  }

  /** @type {Record<string, string | number>} */
  const data = {};
  const lines = match[1].split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/^\s*(#.*)?$/.test(line)) return;
    const field = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!field) {
      problems.push(`frontmatter line ${index + 2} isn't "key: value": ${line.trim()}`);
      return;
    }
    const key = field[1];
    let value = field[2].trim();
    const quoted = /^(["'])(.*)\1$/.exec(value);
    if (quoted) {
      value = quoted[1] === '"' ? quoted[2].replace(/\\"/g, '"') : quoted[2].replace(/''/g, "'");
    }
    if (key in data) problems.push(`frontmatter has "${key}" twice`);
    data[key] = value;
  });

  for (const key of REQUIRED_FIELDS) {
    if (data[key] === undefined || data[key] === '') {
      problems.push(`frontmatter is missing "${key}"`);
    }
  }
  if (data.order !== undefined && data.order !== '') {
    const order = Number(data.order);
    if (!Number.isFinite(order)) {
      problems.push(`frontmatter "order" must be a number, not "${data.order}"`);
    } else {
      data.order = order;
    }
  }

  const bodyLine = match[0].split('\n').length - 1;
  return { data, body: text.slice(match[0].length), bodyLine, problems };
}
