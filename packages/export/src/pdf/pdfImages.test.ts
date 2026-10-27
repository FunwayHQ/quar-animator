/**
 * Tests for reading a JPEG's header, to embed it as it is
 */

import { describe, it, expect } from 'vitest';
import { jpegInfo, jpegOrientation } from './pdfImages';

/** A JPEG's markers up to its frame header: optional EXIF orientation, then SOF0. */
function jpeg({ orientation }: { orientation?: number } = {}): Uint8Array {
  const parts: number[] = [0xff, 0xd8];
  // An APP0 (JFIF) segment to step over
  parts.push(0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46);
  if (orientation !== undefined) {
    // APP1: "Exif\0\0", a big-endian TIFF header, IFD0 with the orientation tag
    const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01];
    const entry = [0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00];
    const body = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff, ...entry, 0, 0, 0, 0];
    parts.push(0xff, 0xe1, ((body.length + 2) >> 8) & 0xff, (body.length + 2) & 0xff, ...body);
  }
  // SOF0: precision 8, height 300, width 640, 3 components
  parts.push(
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    0x01,
    0x2c,
    0x02,
    0x80,
    0x03,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1
  );
  parts.push(0xff, 0xd9);
  return new Uint8Array(parts);
}

describe('jpegInfo', () => {
  it('reads the size and color channels from the frame header', () => {
    expect(jpegInfo(jpeg())).toEqual({ width: 640, height: 300, components: 3 });
  });

  it('is null for what isn’t a JPEG', () => {
    expect(jpegInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
});

describe('jpegOrientation', () => {
  it('reads EXIF’s orientation, upright without one', () => {
    expect(jpegOrientation(jpeg())).toBe(1);
    expect(jpegOrientation(jpeg({ orientation: 6 }))).toBe(6);
  });
});
