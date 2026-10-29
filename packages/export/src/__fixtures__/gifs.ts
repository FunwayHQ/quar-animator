/**
 * GIFs written for tests, frame by frame as they're described: where each
 * frame's picture goes, its colours (palette indices), its delay, how it's
 * disposed of, its transparent colour, interlaced or not — the cases real
 * encoders rarely write (putting back what a frame covered, delays of
 * nothing). The pictures are stored without compression (LZW codes that
 * are each a colour, the table cleared before it grows), which any GIF
 * decoder reads.
 */

export type Rgb = readonly [number, number, number];

export interface TestGifFrame {
  left?: number;
  top?: number;
  width: number;
  height: number;
  /** Palette indices, row after row (as shown: interlacing is done here) */
  pixels: ArrayLike<number>;
  /** Its own palette (else the GIF's) */
  palette?: readonly Rgb[];
  /** In hundredths of a second */
  delay?: number;
  disposal?: number;
  transparentIndex?: number;
  interlaced?: boolean;
}

export interface TestGif {
  width: number;
  height: number;
  palette?: readonly Rgb[];
  frames: readonly TestGifFrame[];
  /** How many times it repeats after its first pass, 0 forever (the default); null: no count, it plays once */
  loopCount?: number | null;
}

/** A palette's size as a GIF stores it: a power of two, 2 at least. */
function tableBits(colours: number): number {
  let bits = 1;
  while (1 << bits < colours) bits++;
  return bits;
}

function writePalette(out: number[], palette: readonly Rgb[], bits: number): void {
  for (let i = 0; i < 1 << bits; i++) out.push(...(palette[i] ?? [0, 0, 0]));
}

/** Rows in the order an interlaced GIF stores them. */
function interlacedOrder(height: number): number[] {
  const rows: number[] = [];
  for (const [start, step] of [
    [0, 8],
    [4, 8],
    [2, 4],
    [1, 2],
  ] as const) {
    for (let row = start; row < height; row += step) rows.push(row);
  }
  return rows;
}

/** Palette indices as LZW codes that are each a colour, cleared before the table makes codes longer. */
function uncompressed(pixels: readonly number[], minCodeSize: number): number[] {
  const clear = 1 << minCodeSize;
  const width = minCodeSize + 1;
  const perClear = clear - 2;
  const bytes: number[] = [];
  let datum = 0;
  let bits = 0;
  const put = (code: number) => {
    datum |= code << bits;
    bits += width;
    while (bits >= 8) {
      bytes.push(datum & 0xff);
      datum >>>= 8;
      bits -= 8;
    }
  };
  for (let i = 0; i < pixels.length; i++) {
    if (i % perClear === 0) put(clear);
    put(pixels[i]!);
  }
  put(clear + 1);
  if (bits > 0) bytes.push(datum & 0xff);
  return bytes;
}

/** A GIF of the frames described. */
export function writeTestGif(gif: TestGif): Uint8Array {
  const out: number[] = [...'GIF89a'].map((c) => c.charCodeAt(0));
  const u16 = (value: number) => out.push(value & 0xff, (value >> 8) & 0xff);
  u16(gif.width);
  u16(gif.height);
  const globalBits = gif.palette ? tableBits(gif.palette.length) : 0;
  out.push(gif.palette ? 0x80 | (globalBits - 1) : 0, 0, 0);
  if (gif.palette) writePalette(out, gif.palette, globalBits);
  // Played over and over, or as many times as it says
  const loops = gif.loopCount === undefined ? 0 : gif.loopCount;
  if (loops !== null) {
    out.push(0x21, 0xff, 11, ...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)), 3, 1);
    u16(loops);
    out.push(0);
  }

  for (const frame of gif.frames) {
    const transparent = frame.transparentIndex ?? -1;
    out.push(0x21, 0xf9, 4, ((frame.disposal ?? 0) << 2) | (transparent >= 0 ? 1 : 0));
    u16(frame.delay ?? 10);
    out.push(Math.max(0, transparent), 0);

    out.push(0x2c);
    u16(frame.left ?? 0);
    u16(frame.top ?? 0);
    u16(frame.width);
    u16(frame.height);
    const bits = frame.palette ? tableBits(frame.palette.length) : globalBits;
    out.push((frame.palette ? 0x80 | (bits - 1) : 0) | (frame.interlaced ? 0x40 : 0));
    if (frame.palette) writePalette(out, frame.palette, bits);

    const rows = frame.interlaced
      ? interlacedOrder(frame.height)
      : Array.from({ length: frame.height }, (_, row) => row);
    const stored: number[] = [];
    for (const row of rows) {
      for (let x = 0; x < frame.width; x++) stored.push(frame.pixels[row * frame.width + x] ?? 0);
    }
    const minCodeSize = Math.max(2, bits);
    out.push(minCodeSize);
    const data = uncompressed(stored, minCodeSize);
    for (let i = 0; i < data.length; i += 255) {
      const block = data.slice(i, i + 255);
      out.push(block.length, ...block);
    }
    out.push(0);
  }
  out.push(0x3b);
  return new Uint8Array(out);
}

/** A frame of one colour. */
export function solid(width: number, height: number, colour: number): number[] {
  return new Array<number>(width * height).fill(colour);
}

/** A picture's pixel, as [r, g, b, a]. */
export function pixelOf(picture: ArrayLike<number>, width: number, x: number, y: number) {
  const at = (y * width + x) * 4;
  return [picture[at], picture[at + 1], picture[at + 2], picture[at + 3]];
}
