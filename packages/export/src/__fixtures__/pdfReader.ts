/**
 * A PDF read back, for tests: each object found where the cross-reference
 * table says it starts, its stream inflated.
 */

export interface PdfObject {
  id: number;
  /** The object's text (a stream's dictionary, without the stream) */
  body: string;
  /** A stream's bytes, inflated */
  stream?: Uint8Array;
  /** …and as text (for content streams) */
  text?: string;
}

export interface ReadPdf {
  objects: Map<number, PdfObject>;
  trailer: string;
  /** The pages, in order */
  pages: PdfObject[];
  /** An object a reference ("12 0 R") names */
  ref(reference: string | undefined): PdfObject | undefined;
  /** A page's content stream */
  content(page: PdfObject): string;
}

const latin1 = new TextDecoder('latin1');

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readPdf(blob: Blob | Uint8Array): Promise<ReadPdf> {
  const bytes = new Uint8Array(blob instanceof Uint8Array ? blob : await blob.arrayBuffer());
  const text = latin1.decode(bytes);
  if (!text.startsWith('%PDF-1.4\n')) throw new Error('No PDF header');
  const startxref = /startxref\n(\d+)\n%%EOF\n$/.exec(text);
  if (!startxref) throw new Error('No startxref');
  const xrefAt = Number(startxref[1]);
  if (!text.startsWith('xref\n', xrefAt)) throw new Error('startxref is not at the xref table');
  const header = /^xref\n0 (\d+)\n/.exec(text.slice(xrefAt));
  if (!header) throw new Error('Bad xref header');
  const count = Number(header[1]);
  const rowsAt = xrefAt + header[0].length;
  const objects = new Map<number, PdfObject>();
  for (let id = 1; id < count; id++) {
    const row = text.slice(rowsAt + id * 20, rowsAt + id * 20 + 20);
    if (!/^\d{10} 00000 n \n$/.test(row))
      throw new Error(`Bad xref row ${id}: ${JSON.stringify(row)}`);
    const at = Number(row.slice(0, 10));
    const head = `${id} 0 obj\n`;
    if (!text.startsWith(head, at)) throw new Error(`Object ${id} is not where the xref says`);
    const start = at + head.length;
    const end = text.indexOf('\nendobj\n', start);
    const body = text.slice(start, end);
    const streamAt = body.indexOf('\nstream\n');
    if (streamAt < 0) {
      objects.set(id, { id, body });
      continue;
    }
    const dictionary = body.slice(0, streamAt);
    const length = Number(/\/Length (\d+)/.exec(dictionary)?.[1]);
    const dataAt = start + streamAt + '\nstream\n'.length;
    let data = bytes.slice(dataAt, dataAt + length);
    if (!text.startsWith('\nendstream', dataAt + length))
      throw new Error(`Stream ${id}: bad length`);
    if (dictionary.includes('/FlateDecode')) data = await inflate(data);
    objects.set(id, { id, body: dictionary, stream: data, text: latin1.decode(data) });
  }
  const trailer = text.slice(text.indexOf('trailer\n', rowsAt));
  const ref = (reference: string | undefined) => {
    const id = reference ? /(\d+) 0 R/.exec(reference)?.[1] : undefined;
    return id ? objects.get(Number(id)) : undefined;
  };
  const catalog = ref(/\/Root (\d+ 0 R)/.exec(trailer)?.[1]);
  const tree = ref(/\/Pages (\d+ 0 R)/.exec(catalog?.body ?? '')?.[1]);
  const kids = /\/Kids \[([^\]]*)\]/.exec(tree?.body ?? '')?.[1] ?? '';
  const pages = [...kids.matchAll(/(\d+) 0 R/g)].flatMap((m) => objects.get(Number(m[1])) ?? []);
  return {
    objects,
    trailer,
    pages,
    ref,
    content: (page) => ref(/\/Contents (\d+ 0 R)/.exec(page.body)?.[1])?.text ?? '',
  };
}
