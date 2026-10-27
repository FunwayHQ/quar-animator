import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');

/** The page's Content-Security-Policy, directive by directive. */
function policy(): Map<string, string[]> {
  const meta = new DOMParser()
    .parseFromString(html, 'text/html')
    .querySelector('meta[http-equiv="Content-Security-Policy"]');
  const directives = (meta?.getAttribute('content') ?? '')
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .filter((d) => d[0]);
  return new Map(directives.map(([name = '', ...values]) => [name, values]));
}

describe('the page’s Content-Security-Policy', () => {
  it('loads pictures only from the editor itself or the document', () => {
    expect(policy().get('img-src')).toEqual(["'self'", 'data:', 'blob:']);
  });

  it('allows no plugins and no <base> elsewhere', () => {
    expect(policy().get('object-src')).toEqual(["'none'"]);
    expect(policy().get('base-uri')).toEqual(["'self'"]);
  });

  it('comes before anything the page loads', () => {
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<link'));
  });
});
