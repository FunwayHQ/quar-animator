/**
 * GIF Decoding
 * An animated GIF read as the video code reads a video: its size, its
 * frames each with its moment and delay (a delay of 10 ms or less plays
 * as 100 ms, as browsers play it), and the picture it shows at each frame,
 * composited as browsers composite it — each frame drawn over the picture
 * before it where it isn't transparent, then disposed of as it says: left
 * there, cleared to transparent, or put back as it was before it.
 *
 * Reading a GIF only walks its blocks (no picture is decoded); a frame's
 * pixels are decoded (LZW) when it's drawn. A compositor holds one picture
 * and draws on from it; going back, or far ahead, it starts again from the
 * nearest restore point: a frame drawn onto nothing, or a copy of the
 * picture a frame was drawn onto, kept now and then as it goes (as many as
 * fit in a few megabytes), so a big GIF is never held whole.
 */

/** A GIF's type. */
export const GIF_TYPE = 'image/gif';

/** A frame of a GIF: where its picture is, when it shows, how it's drawn and disposed of. */
export interface GifFrame {
  /** Where its picture goes on the GIF, in pixels */
  left: number;
  top: number;
  width: number;
  height: number;
  /** When it shows, in seconds, and for how long */
  timestamp: number;
  duration: number;
  /** What's done with it before the next is drawn: 0 and 1 leave it, 2 clears it, 3 puts back what it covered */
  disposal: number;
  /** Its palette's transparent colour (-1: none) */
  transparentIndex: number;
  /** Whether its rows are stored in four passes */
  interlaced: boolean;
  /** Where its palette (its own, else the GIF's) is in the file, and its colours */
  paletteOffset: number;
  paletteSize: number;
  /** Its picture's LZW code size, and where its data (in sub-blocks) begins in the file */
  minCodeSize: number;
  dataOffset: number;
}

/** What a GIF is: its size, its frames, how long they last together (in seconds). */
export interface GifInfo {
  width: number;
  height: number;
  frames: GifFrame[];
  duration: number;
  /**
   * How many times it repeats after its first pass, as it says (its
   * NETSCAPE2.0 block): 0 over and over; null without a count, when it plays once
   */
  loopCount: number | null;
}

/** The application blocks that say how many times a GIF plays */
const LOOP_BLOCKS = new Set(['NETSCAPE2.0', 'ANIMEXTS1.0']);

/** The shortest delay played as it says, in hundredths of a second; shorter ones play as `SLOW_DELAY` */
const FASTEST_DELAY = 2;
const SLOW_DELAY = 10;

/** Whether bytes begin as a GIF does ("GIF87a" or "GIF89a"). */
export function isGifData(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  );
}

/** Whether a file is a GIF, by its first bytes. */
export async function isGifFile(file: Blob): Promise<boolean> {
  return isGifData(new Uint8Array(await file.slice(0, 6).arrayBuffer()));
}

/**
 * Whether a file is a GIF of more than one frame (its blocks read, no
 * picture decoded): such a GIF is a clip; one of a single frame, a picture.
 */
export async function isAnimatedGif(file: Blob): Promise<boolean> {
  if (!(await isGifFile(file))) return false;
  try {
    return readGif(new Uint8Array(await file.arrayBuffer())).frames.length > 1;
  } catch {
    return false;
  }
}

/** The offset just past a run of sub-blocks starting at `at`; -1 where the file ends first. */
function skipSubBlocks(bytes: Uint8Array, at: number): number {
  let p = at;
  while (p < bytes.length) {
    const size = bytes[p]!;
    p += 1 + size;
    if (size === 0) return p;
  }
  return -1;
}

/**
 * A GIF's size and frames, read from its blocks (no picture decoded). A
 * file cut short keeps the frames it has whole; one with none, or that
 * isn't a GIF, throws.
 */
export function readGif(bytes: Uint8Array): GifInfo {
  if (!isGifData(bytes) || bytes.length < 13) throw new Error('It isn’t a GIF.');
  const u16 = (at: number) => bytes[at]! | (bytes[at + 1]! << 8);
  let width = u16(6);
  let height = u16(8);
  const screen = bytes[10]!;
  let p = 13;
  let globalPalette = { offset: 0, size: 0 };
  if (screen & 0x80) {
    globalPalette = { offset: p, size: 1 << ((screen & 7) + 1) };
    p += globalPalette.size * 3;
  }

  const frames: GifFrame[] = [];
  /** The Graphic Control Extension waiting for the next picture */
  let control = { disposal: 0, delay: 0, transparentIndex: -1 };
  /** Hundredths of a second so far */
  let elapsed = 0;
  let loopCount: number | null = null;
  while (p < bytes.length) {
    const block = bytes[p]!;
    if (block === 0x3b) break;
    if (block === 0x21) {
      const label = bytes[p + 1];
      if (label === undefined) break;
      if (label === 0xf9 && bytes[p + 2] === 4 && p + 7 < bytes.length) {
        const packed = bytes[p + 3]!;
        control = {
          disposal: (packed >> 2) & 7,
          delay: u16(p + 4),
          transparentIndex: packed & 1 ? bytes[p + 6]! : -1,
        };
      } else if (label === 0xff && bytes[p + 2] === 11 && p + 18 < bytes.length) {
        const name = String.fromCharCode(...bytes.subarray(p + 3, p + 14));
        if (LOOP_BLOCKS.has(name) && bytes[p + 14]! >= 3 && bytes[p + 15] === 1) {
          loopCount = u16(p + 16);
        }
      }
      const end = skipSubBlocks(bytes, p + 2);
      if (end < 0) break;
      p = end;
      continue;
    }
    if (block !== 0x2c || p + 10 > bytes.length) break;
    const left = u16(p + 1);
    const top = u16(p + 3);
    const frameWidth = u16(p + 5);
    const frameHeight = u16(p + 7);
    const packed = bytes[p + 9]!;
    p += 10;
    let palette = globalPalette;
    if (packed & 0x80) {
      palette = { offset: p, size: 1 << ((packed & 7) + 1) };
      p += palette.size * 3;
    }
    const minCodeSize = bytes[p];
    if (minCodeSize === undefined) break;
    const dataOffset = p + 1;
    const end = skipSubBlocks(bytes, dataOffset);
    if (end < 0) break;
    p = end;
    // A screen of no size is as big as its first picture
    if (frames.length === 0) {
      if (width === 0) width = left + frameWidth;
      if (height === 0) height = top + frameHeight;
    }
    const delay = control.delay < FASTEST_DELAY ? SLOW_DELAY : control.delay;
    frames.push({
      left,
      top,
      width: frameWidth,
      height: frameHeight,
      timestamp: elapsed / 100,
      duration: delay / 100,
      disposal: control.disposal,
      transparentIndex: control.transparentIndex,
      interlaced: (packed & 0x40) !== 0,
      paletteOffset: Math.min(palette.offset, bytes.length),
      paletteSize: Math.max(
        0,
        Math.min(palette.size, Math.floor((bytes.length - palette.offset) / 3))
      ),
      minCodeSize: Math.min(11, Math.max(1, minCodeSize)),
      dataOffset,
    });
    elapsed += delay;
    control = { disposal: 0, delay: 0, transparentIndex: -1 };
  }
  if (frames.length === 0 || !(width > 0 && height > 0)) {
    throw new Error('The GIF has no pictures in it.');
  }
  return { width, height, frames, duration: elapsed / 100, loopCount };
}

/** The frame shown at a moment of a GIF, in seconds: -1 before its first. */
export function gifFrameAt(gif: GifInfo, seconds: number): number {
  const { frames } = gif;
  if (!(seconds >= 0)) return -1;
  let low = 0;
  let high = frames.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (frames[middle]!.timestamp <= seconds) low = middle;
    else high = middle - 1;
  }
  return low;
}

const MAX_CODES = 4096;

/**
 * A frame's pixels as palette indices, row after row as they're stored
 * (an interlaced frame's in its passes' order), into `out`: how many it
 * gave (fewer than its size where its data is cut short or garbled).
 */
export function decodeGifIndices(bytes: Uint8Array, frame: GifFrame, out: Uint8Array): number {
  const pixels = Math.min(out.length, frame.width * frame.height);
  const prefix = new Uint16Array(MAX_CODES);
  const suffix = new Uint8Array(MAX_CODES);
  const first = new Uint8Array(MAX_CODES);
  const length = new Uint16Array(MAX_CODES);
  const clear = 1 << frame.minCodeSize;
  const end = clear + 1;
  for (let code = 0; code < clear; code++) {
    suffix[code] = code;
    first[code] = code;
    length[code] = 1;
  }
  let codeSize = frame.minCodeSize + 1;
  let mask = (1 << codeSize) - 1;
  let next = end + 1;
  let previous = -1;
  let written = 0;

  // Reading codes across the sub-blocks
  let p = frame.dataOffset;
  let blockLeft = 0;
  let bits = 0;
  let datum = 0;

  /** Writes a code's string at the end of what's written. */
  const emit = (code: number) => {
    const count = length[code]!;
    let k = code;
    for (let i = count - 1; i >= 0; i--) {
      const at = written + i;
      if (at < pixels) out[at] = suffix[k]!;
      k = prefix[k]!;
    }
    written += count;
  };

  while (written < pixels) {
    while (bits < codeSize) {
      if (blockLeft === 0) {
        blockLeft = p < bytes.length ? bytes[p++]! : 0;
        if (blockLeft === 0) return Math.min(written, pixels);
      }
      if (p >= bytes.length) return Math.min(written, pixels);
      datum |= bytes[p++]! << bits;
      blockLeft--;
      bits += 8;
    }
    const code = datum & mask;
    datum >>>= codeSize;
    bits -= codeSize;

    if (code === clear) {
      codeSize = frame.minCodeSize + 1;
      mask = (1 << codeSize) - 1;
      next = end + 1;
      previous = -1;
      continue;
    }
    if (code === end) break;
    if (previous < 0) {
      // The first code after a clear is a colour of its own
      if (code >= clear) break;
      emit(code);
      previous = code;
      continue;
    }
    if (code > next || (code === next && next >= MAX_CODES)) break;
    if (next < MAX_CODES) {
      // The string before, and the first colour of this one (of itself, when it's the one being made)
      prefix[next] = previous;
      suffix[next] = first[code === next ? previous : code]!;
      first[next] = first[previous]!;
      length[next] = length[previous]! + 1;
      next++;
      if (next === mask + 1 && codeSize < 12) {
        codeSize++;
        mask = (1 << codeSize) - 1;
      }
    }
    emit(code);
    previous = code;
  }
  return Math.min(written, pixels);
}

/** The picture rows of an interlaced frame's stored rows, in order. */
function interlacedRows(height: number): Int32Array {
  const rows = new Int32Array(height);
  let i = 0;
  for (const [start, step] of [
    [0, 8],
    [4, 8],
    [2, 4],
    [1, 2],
  ] as const) {
    for (let row = start; row < height; row += step) rows[i++] = row;
  }
  return rows;
}

/** Whether a frame covers the whole GIF. */
function covers(gif: GifInfo, frame: GifFrame): boolean {
  return (
    frame.left === 0 && frame.top === 0 && frame.width >= gif.width && frame.height >= gif.height
  );
}

/**
 * Which frames are drawn onto nothing: the first, and one after a frame
 * that covered the GIF and was cleared (or put back what was there, when
 * that was nothing).
 */
function drawnOntoNothing(gif: GifInfo): boolean[] {
  const { frames } = gif;
  const blank = frames.map(() => false);
  blank[0] = true;
  for (let i = 1; i < frames.length; i++) {
    const before = frames[i - 1]!;
    blank[i] =
      (before.disposal === 2 && covers(gif, before)) || (before.disposal === 3 && blank[i - 1]!);
  }
  return blank;
}

/** A frame's part of the GIF, clipped to it, in pixels. */
interface Area {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function areaOf(gif: GifInfo, frame: GifFrame): Area {
  return {
    left: Math.min(frame.left, gif.width),
    top: Math.min(frame.top, gif.height),
    right: Math.min(frame.left + frame.width, gif.width),
    bottom: Math.min(frame.top + frame.height, gif.height),
  };
}

export interface GifCompositorOptions {
  /** Bytes of pictures kept to start again from, at most (default 16 MB) */
  keepBytes?: number;
}

/** Draws a GIF's frames, as they show, one picture at a time. */
export interface GifCompositor {
  /**
   * The picture shown at frame `index` (RGBA, the GIF's size; transparent
   * where nothing is): the compositor's own, drawn over by the next call.
   */
  pictureAt(index: number): Uint8ClampedArray;
  /** How many pictures it keeps to start again from */
  readonly keptPictures: number;
}

const KEEP_BYTES = 16 * 1024 * 1024;

export function createGifCompositor(
  bytes: Uint8Array,
  gif: GifInfo,
  options: GifCompositorOptions = {}
): GifCompositor {
  const { width, height, frames } = gif;
  const size = width * height * 4;
  const picture = new Uint8ClampedArray(size);
  const indices = new Uint8Array(Math.max(1, ...frames.map((f) => f.width * f.height)));
  const blank = drawnOntoNothing(gif);
  const most = Math.floor((options.keepBytes ?? KEEP_BYTES) / Math.max(1, size));
  const every = most > 0 ? Math.max(1, Math.ceil(frames.length / most)) : Infinity;
  /** The pictures some frames were drawn onto, by frame */
  const kept = new Map<number, Uint8ClampedArray>();
  /** The frame drawn last (-1: none) */
  let at = -1;
  /** What it covered, to put back (a frame disposed of so) */
  let covered: Uint8ClampedArray | null = null;
  const rowsOf = new Map<number, Int32Array>();

  function rows(frame: GifFrame): Int32Array | null {
    if (!frame.interlaced) return null;
    let order = rowsOf.get(frame.height);
    if (!order) {
      order = interlacedRows(frame.height);
      rowsOf.set(frame.height, order);
    }
    return order;
  }

  function copyArea(area: Area): Uint8ClampedArray {
    const rowBytes = (area.right - area.left) * 4;
    const copy = new Uint8ClampedArray(Math.max(0, rowBytes * (area.bottom - area.top)));
    for (let y = area.top; y < area.bottom; y++) {
      const from = (y * width + area.left) * 4;
      copy.set(picture.subarray(from, from + rowBytes), (y - area.top) * rowBytes);
    }
    return copy;
  }

  function putArea(area: Area, pixels: Uint8ClampedArray | null): void {
    const rowBytes = (area.right - area.left) * 4;
    for (let y = area.top; y < area.bottom; y++) {
      const to = (y * width + area.left) * 4;
      if (pixels)
        picture.set(pixels.subarray((y - area.top) * rowBytes, (y - area.top + 1) * rowBytes), to);
      else picture.fill(0, to, to + rowBytes);
    }
  }

  /** Frame `index` disposed of, before the next is drawn. */
  function dispose(index: number): void {
    const frame = frames[index]!;
    if (frame.disposal === 2) putArea(areaOf(gif, frame), null);
    else if (frame.disposal === 3 && covered) putArea(areaOf(gif, frame), covered);
  }

  /** Frame `index` drawn over the picture. */
  function draw(index: number): void {
    if (!blank[index] && index % every === 0 && !kept.has(index)) kept.set(index, picture.slice());
    const frame = frames[index]!;
    covered = frame.disposal === 3 ? copyArea(areaOf(gif, frame)) : null;
    const count = decodeGifIndices(bytes, frame, indices);
    const order = rows(frame);
    const { paletteOffset, paletteSize, transparentIndex } = frame;
    for (let row = 0; row * frame.width < count && row < frame.height; row++) {
      const y = frame.top + (order ? order[row]! : row);
      if (y >= height) continue;
      const stored = row * frame.width;
      const across = Math.min(frame.width, width - frame.left, count - stored);
      let o = (y * width + frame.left) * 4;
      for (let x = 0; x < across; x++, o += 4) {
        const colour = indices[stored + x]!;
        if (colour === transparentIndex || colour >= paletteSize) continue;
        const c = paletteOffset + colour * 3;
        picture[o] = bytes[c]!;
        picture[o + 1] = bytes[c + 1]!;
        picture[o + 2] = bytes[c + 2]!;
        picture[o + 3] = 255;
      }
    }
    at = index;
  }

  return {
    get keptPictures() {
      return kept.size;
    },
    pictureAt(wanted) {
      const index = Math.max(0, Math.min(frames.length - 1, Math.floor(wanted)));
      if (index === at) return picture;
      // The nearest frame at or before it that can be started from: the one drawn last, if that's nearer
      let start = index;
      while (start > 0 && start !== at && !blank[start] && !kept.has(start)) start--;
      if (!(at >= start && at < index)) {
        const base = kept.get(start);
        if (base && !blank[start]) picture.set(base);
        else picture.fill(0);
        covered = null;
        draw(start);
      }
      for (let i = at + 1; i <= index; i++) {
        dispose(i - 1);
        draw(i);
      }
      return picture;
    },
  };
}

/** How long a run of work goes before letting the page do its own, in ms */
const WORK_SLICE = 30;

/**
 * Whether any frame of a GIF shows something transparent (GIF transparency
 * is all or nothing: a pixel shows its colour or what's behind it): its
 * first frame not covering it, a transparent colour drawn where nothing
 * was, a frame cleared or put back to show nothing there. Every frame is
 * drawn in turn; the page gets to do its own work between runs of them.
 */
export async function gifHasTransparency(bytes: Uint8Array, gif: GifInfo): Promise<boolean> {
  const { frames } = gif;
  if (!covers(gif, frames[0]!)) return true;
  const compositor = createGifCompositor(bytes, gif, { keepBytes: 0 });
  let slice = Date.now();
  for (let i = 0; i < frames.length; i++) {
    const picture = compositor.pictureAt(i);
    // Only where it was drawn, and where the frame before was disposed of, can it have changed
    const areas = [areaOf(gif, frames[i]!)];
    const before = frames[i - 1];
    if (before && (before.disposal === 2 || before.disposal === 3)) areas.push(areaOf(gif, before));
    for (const area of areas) {
      for (let y = area.top; y < area.bottom; y++) {
        const row = y * gif.width;
        for (let x = area.left; x < area.right; x++) {
          if (picture[(row + x) * 4 + 3] === 0) return true;
        }
      }
    }
    if (Date.now() - slice > WORK_SLICE) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      slice = Date.now();
    }
  }
  return false;
}

/**
 * Whether a GIF's pictures may be transparent, from its blocks alone: its
 * first frame doesn't cover it, or a frame has a transparent colour or is
 * cleared or put back. (gifHasTransparency says whether they are.)
 */
export function gifMayBeTransparent(gif: GifInfo): boolean {
  return (
    !covers(gif, gif.frames[0]!) ||
    gif.frames.some(
      (frame) => frame.transparentIndex >= 0 || frame.disposal === 2 || frame.disposal === 3
    )
  );
}
