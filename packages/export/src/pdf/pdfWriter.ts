/**
 * PDF Writer
 * The document a PDF export fills: its pages, the groups and pictures they
 * paint, and one resource dictionary they all share. Streams are compressed
 * (Flate) where the browser can.
 */

import { PdfDocument } from './pdfDocument';
import { PdfContent, PdfResources } from './pdfContent';
import type { Box } from './pdfGeometry';
import { pdfNumber as n } from './pdfDocument';

/** Pixels: rows from the top, RGBA, straight (not premultiplied) alpha. */
export interface PdfRaster {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/** A picture as it can go into a PDF: a JPEG as it is, or its pixels. */
export type DecodedImage =
  | { kind: 'jpeg'; width: number; height: number; components: 1 | 3; bytes: Uint8Array }
  | ({ kind: 'pixels' } & PdfRaster);

/** Compressed with zlib's deflate (PDF's Flate), or null where it can't be. */
export async function deflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array | null> {
  if (typeof CompressionStream !== 'function') return null;
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const encoder = new TextEncoder();

/** The transparency group of what's painted together: in RGB, isolated or not. */
export function transparencyGroup(isolated = false): string {
  return `<< /Type /Group /S /Transparency /CS /DeviceRGB${isolated ? ' /I true' : ''} >>`;
}

export class PdfWriter {
  readonly doc = new PdfDocument();
  readonly resources = new PdfResources(this.doc);
  private readonly images = new Map<string, Promise<number | null>>();

  /** A stream object, compressed when that makes it smaller. */
  async stream(dictionary: string, data: Uint8Array<ArrayBuffer> | string): Promise<number> {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    const packed = bytes.length > 64 ? await deflate(bytes) : null;
    if (packed && packed.length < bytes.length) {
      return this.doc.addStream(`${dictionary} /Filter /FlateDecode`.trim(), packed);
    }
    return this.doc.addStream(dictionary, bytes);
  }

  /** A group of `content`, painted where it's used: in the space it's used in, `box` its extent there. */
  form(content: PdfContent, box: Box, group: string): Promise<number> {
    return this.stream(
      `/Type /XObject /Subtype /Form /BBox [${box.map(n).join(' ')}] /Group ${group} ` +
        `/Resources ${this.resources.id} 0 R`,
      content.toString()
    );
  }

  /** Pixels as an image, with a soft mask of their alpha when some aren't opaque. */
  async raster(raster: PdfRaster): Promise<number> {
    const count = raster.width * raster.height;
    const rgb = new Uint8Array(count * 3);
    const alpha = new Uint8Array(count);
    let opaque = true;
    for (let i = 0; i < count; i++) {
      rgb[i * 3] = raster.data[i * 4] ?? 0;
      rgb[i * 3 + 1] = raster.data[i * 4 + 1] ?? 0;
      rgb[i * 3 + 2] = raster.data[i * 4 + 2] ?? 0;
      const a = raster.data[i * 4 + 3] ?? 255;
      alpha[i] = a;
      if (a !== 255) opaque = false;
    }
    const size = `/Width ${raster.width} /Height ${raster.height} /BitsPerComponent 8`;
    const mask = opaque
      ? ''
      : ` /SMask ${await this.stream(
          `/Type /XObject /Subtype /Image ${size} /ColorSpace /DeviceGray /Interpolate true`,
          alpha
        )} 0 R`;
    return this.stream(
      `/Type /XObject /Subtype /Image ${size} /ColorSpace /DeviceRGB /Interpolate true${mask}`,
      rgb
    );
  }

  /** One color over a soft mask of `alpha` (rows from the top): a shadow. */
  async tinted(
    width: number,
    height: number,
    alpha: Uint8Array<ArrayBuffer>,
    color: { r: number; g: number; b: number }
  ): Promise<number> {
    const size = `/Width ${width} /Height ${height} /BitsPerComponent 8`;
    const mask = await this.stream(
      `/Type /XObject /Subtype /Image ${size} /ColorSpace /DeviceGray /Interpolate true`,
      alpha
    );
    const rgb = new Uint8Array(width * height * 3);
    for (let i = 0; i < rgb.length; i += 3) {
      rgb[i] = color.r;
      rgb[i + 1] = color.g;
      rgb[i + 2] = color.b;
    }
    return this.stream(
      `/Type /XObject /Subtype /Image ${size} /ColorSpace /DeviceRGB /Interpolate true /SMask ${mask} 0 R`,
      rgb
    );
  }

  /** A document picture's image, written once however often it's drawn; null when it can't be read. */
  image(
    src: string,
    decode: (src: string) => Promise<DecodedImage | null>
  ): Promise<number | null> {
    let image = this.images.get(src);
    if (!image) {
      image = decode(src)
        .then((decoded) => {
          if (!decoded) return null;
          if (decoded.kind === 'pixels') return this.raster(decoded);
          return this.doc.addStream(
            `/Type /XObject /Subtype /Image /Width ${decoded.width} /Height ${decoded.height} ` +
              `/ColorSpace /${decoded.components === 1 ? 'DeviceGray' : 'DeviceRGB'} ` +
              `/BitsPerComponent 8 /Interpolate true /Filter /DCTDecode`,
            decoded.bytes
          );
        })
        .catch(() => null);
      this.images.set(src, image);
    }
    return image;
  }

  /** A page `widthPt` × `heightPt` points, drawn by `content`. */
  async page(widthPt: number, heightPt: number, content: PdfContent): Promise<void> {
    const contentId = await this.stream('', content.toString());
    this.doc.addPageWith(
      widthPt,
      heightPt,
      contentId,
      `${this.resources.id} 0 R`,
      transparencyGroup()
    );
  }

  finish(info: { title?: string } = {}): Uint8Array<ArrayBuffer> {
    this.resources.write();
    return this.doc.toBytes(info);
  }
}
