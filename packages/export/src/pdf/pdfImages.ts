/**
 * PDF Images
 * A document's pictures as they go into a PDF: a JPEG as it is (PDF reads
 * JPEG itself), turned upright first if it says it's rotated; anything else
 * as its pixels, read by the browser as the canvas reads them.
 */

import { isDocumentImage } from '@quar/core';
import type { DecodedImage } from './pdfWriter';

/** A JPEG's size and color channels, from its frame header; null when it isn't one. */
export function jpegInfo(
  bytes: Uint8Array
): { width: number; height: number; components: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1] ?? 0;
    // Fill bytes, and markers that stand alone
    if (marker === 0xff) {
      at++;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      at += 2;
      continue;
    }
    const length = ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0);
    // A start of frame: any of C0–CF but DHT (C4), JPG (C8) and DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        height: ((bytes[at + 5] ?? 0) << 8) | (bytes[at + 6] ?? 0),
        width: ((bytes[at + 7] ?? 0) << 8) | (bytes[at + 8] ?? 0),
        components: bytes[at + 9] ?? 0,
      };
    }
    at += 2 + length;
  }
  return null;
}

/** A JPEG's EXIF orientation (1, upright, when it has none). */
export function jpegOrientation(bytes: Uint8Array): number {
  let at = 2;
  while (at + 4 < bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1] ?? 0;
    const length = ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0);
    // The frame starts: no orientation came before it
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return 1;
    }
    const exif = at + 4;
    if (
      marker === 0xe1 &&
      String.fromCharCode(...bytes.subarray(exif, exif + 4)) === 'Exif' &&
      bytes[exif + 4] === 0 &&
      bytes[exif + 5] === 0
    ) {
      const tiff = exif + 6;
      const little = bytes[tiff] === 0x49;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const u16 = (i: number) => (i + 2 <= bytes.length ? view.getUint16(i, little) : 0);
      const u32 = (i: number) => (i + 4 <= bytes.length ? view.getUint32(i, little) : 0);
      const ifd = tiff + u32(tiff + 4);
      const entries = u16(ifd);
      for (let i = 0; i < entries; i++) {
        const entry = ifd + 2 + i * 12;
        if (u16(entry) === 0x0112) return u16(entry + 8) || 1;
      }
      return 1;
    }
    at += 2 + length;
  }
  return 1;
}

/** A picture's bytes and their type, from a data or object URL. */
async function sourceBytes(src: string): Promise<{ type: string; bytes: Uint8Array }> {
  const blob = await (await fetch(src)).blob();
  return { type: blob.type, bytes: new Uint8Array(await blob.arrayBuffer()) };
}

/** A picture's pixels, as the browser draws it (upright, at its own size). */
async function pixelsOf(src: string): Promise<DecodedImage | null> {
  if (!isDocumentImage(src)) return null;
  const image = new Image();
  image.src = src;
  await image.decode();
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, 0, 0);
  return { kind: 'pixels', width, height, data: context.getImageData(0, 0, width, height).data };
}

/**
 * A document picture as a PDF takes it; null when it can't be read — or
 * isn't the document's own (data: or blob:): one linked from elsewhere is
 * never fetched.
 */
export async function decodeDocumentImage(src: string): Promise<DecodedImage | null> {
  if (!isDocumentImage(src)) return null;
  const { type, bytes } = await sourceBytes(src);
  if (type === 'image/jpeg') {
    const info = jpegInfo(bytes);
    if (info && (info.components === 1 || info.components === 3) && jpegOrientation(bytes) === 1) {
      return {
        kind: 'jpeg',
        width: info.width,
        height: info.height,
        components: info.components,
        bytes,
      };
    }
  }
  return pixelsOf(src);
}
