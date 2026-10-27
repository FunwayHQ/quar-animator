/**
 * Tests for the PDF file itself
 */

import { describe, it, expect } from 'vitest';
import { PdfDocument, pdfNumber, pdfString } from './pdfDocument';
import { readPdf } from '../__fixtures__/pdfReader';

describe('PdfDocument', () => {
  it('writes each object where its cross-reference table says, and its pages in order', async () => {
    const doc = new PdfDocument();
    const first = doc.addStream('', '0 0 m 10 10 l S');
    const second = doc.addStream('', '1 0 0 rg 0 0 5 5 re f');
    doc.addPageWith(450, 300, first, '<< >>');
    doc.addPageWith(612, 792, second, '<< >>', '<< /S /Transparency >>');
    const pdf = await readPdf(doc.toBytes({ title: 'Slides' }));
    expect(pdf.pages.map((page) => /\/MediaBox \[([^\]]+)\]/.exec(page.body)?.[1])).toEqual([
      '0 0 450 300',
      '0 0 612 792',
    ]);
    expect(pdf.content(pdf.pages[1]!)).toBe('1 0 0 rg 0 0 5 5 re f');
    expect(pdf.pages[1]!.body).toContain('/Group << /S /Transparency >>');
    const info = pdf.ref(/\/Info (\d+ 0 R)/.exec(pdf.trailer)?.[1]);
    expect(info?.body).toContain('/Title (Slides)');
  });

  it('marks the file as binary, as transfer tools look for', () => {
    const doc = new PdfDocument();
    doc.addPageWith(10, 10, doc.addStream('', ''), '<< >>');
    const bytes = doc.toBytes();
    expect([...bytes.slice(9, 15)]).toEqual([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]);
  });

  it('refuses a document without pages', () => {
    expect(() => new PdfDocument().toBytes()).toThrow(/at least one page/);
  });
});

describe('pdfNumber', () => {
  it('writes at most four decimals, never an exponent or a negative zero', () => {
    expect(pdfNumber(1)).toBe('1');
    expect(pdfNumber(0.5)).toBe('0.5');
    expect(pdfNumber(1 / 3)).toBe('0.3333');
    expect(pdfNumber(-0.00001)).toBe('0');
    expect(pdfNumber(1e-7)).toBe('0');
    expect(pdfNumber(2.5e21)).toBe('1000000000');
    expect(pdfNumber(-2.5e21)).toBe('-1000000000');
    expect(pdfNumber(Number.NaN)).toBe('0');
    expect(pdfNumber(-12.5)).toBe('-12.5');
  });
});

describe('pdfString', () => {
  it("escapes what would end or break a string, and drops what PDF text can't carry", () => {
    expect(pdfString('a(b)\\c')).toBe('(a\\(b\\)\\\\c)');
    expect(pdfString('Café\n')).toBe('(Caf)');
  });
});
