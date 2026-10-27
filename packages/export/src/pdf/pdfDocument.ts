/**
 * PDF Document
 * The file itself: numbered objects (dictionaries, streams), a page tree,
 * and the cross-reference table that says where each object starts.
 */

const encoder = new TextEncoder();

/** Past this (degenerate geometry) numbers are held: readers take no bigger, and no exponents. */
const PDF_NUMBER_LIMIT = 1e9;

/** A number as PDF writes it: at most 4 decimals, no exponent. */
export function pdfNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const held = Math.max(-PDF_NUMBER_LIMIT, Math.min(PDF_NUMBER_LIMIT, value));
  const rounded = Math.round(held * 10_000) / 10_000;
  if (Object.is(rounded, -0)) return '0';
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(4).replace(/0+$/, '');
}

/** A PDF literal string: printable ASCII, with \, ( and ) escaped; anything else dropped. */
export function pdfString(value: string): string {
  const ascii = [...value].filter((c) => c >= ' ' && c <= '~').join('');
  return `(${ascii.replace(/[\\()]/g, (c) => `\\${c}`)})`;
}

export class PdfDocument {
  private readonly bodies: Array<Uint8Array | null> = [null];
  private readonly pageIds: number[] = [];
  /** The page tree's object: known before any page is written */
  readonly pagesId: number;

  constructor() {
    this.pagesId = this.reserve();
  }

  /** A number for an object written later (pages point at their parent). */
  reserve(): number {
    this.bodies.push(null);
    return this.bodies.length - 1;
  }

  /** Write an object (a dictionary, an array…) as `id`, or as a new one. */
  set(id: number, body: string): number {
    this.bodies[id] = encoder.encode(body);
    return id;
  }

  add(body: string): number {
    return this.set(this.reserve(), body);
  }

  /** A stream: its dictionary entries (without /Length) and its bytes. */
  addStream(dictionary: string, data: Uint8Array | string, id = this.reserve()): number {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    const head = encoder.encode(`<< ${dictionary} /Length ${bytes.length} >>\nstream\n`);
    const tail = encoder.encode('\nendstream');
    const body = new Uint8Array(head.length + bytes.length + tail.length);
    body.set(head, 0);
    body.set(bytes, head.length);
    body.set(tail, head.length + bytes.length);
    this.bodies[id] = body;
    return id;
  }

  /**
   * A page of `widthPt` × `heightPt` points, drawn by the content stream
   * `contentId` with these resources, its transparency blended in `group`.
   */
  addPageWith(
    widthPt: number,
    heightPt: number,
    contentId: number,
    resources: string,
    group?: string
  ): number {
    const id = this.add(
      `<< /Type /Page /Parent ${this.pagesId} 0 R /MediaBox [0 0 ${pdfNumber(widthPt)} ${pdfNumber(heightPt)}] ` +
        `/Resources ${resources} /Contents ${contentId} 0 R${group ? ` /Group ${group}` : ''} >>`
    );
    this.pageIds.push(id);
    return id;
  }

  get pageCount(): number {
    return this.pageIds.length;
  }

  /** The file. */
  toBytes(info: { title?: string } = {}): Uint8Array<ArrayBuffer> {
    if (this.pageIds.length === 0) throw new Error('A PDF needs at least one page.');
    this.set(
      this.pagesId,
      `<< /Type /Pages /Count ${this.pageIds.length} /Kids [${this.pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`
    );
    const catalogId = this.add(`<< /Type /Catalog /Pages ${this.pagesId} 0 R >>`);
    const infoId = this.add(
      `<< /Producer (Quar Animator)${info.title !== undefined ? ` /Title ${pdfString(info.title)}` : ''} >>`
    );

    const chunks: Uint8Array[] = [];
    let length = 0;
    const write = (bytes: Uint8Array) => {
      chunks.push(bytes);
      length += bytes.length;
    };
    // The binary comment marks the file as binary for transfer tools
    write(encoder.encode('%PDF-1.4\n'));
    write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    const offsets: number[] = [0];
    for (let id = 1; id < this.bodies.length; id++) {
      offsets[id] = length;
      write(encoder.encode(`${id} 0 obj\n`));
      write(this.bodies[id] ?? encoder.encode('null'));
      write(encoder.encode('\nendobj\n'));
    }
    const xref = length;
    const rows = [`xref\n0 ${this.bodies.length}\n`, '0000000000 65535 f \n'];
    for (let id = 1; id < this.bodies.length; id++) {
      rows.push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
    }
    rows.push(
      `trailer\n<< /Size ${this.bodies.length} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\n` +
        `startxref\n${xref}\n%%EOF\n`
    );
    write(encoder.encode(rows.join('')));

    const pdf = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) {
      pdf.set(chunk, at);
      at += chunk.length;
    }
    return pdf;
  }
}
