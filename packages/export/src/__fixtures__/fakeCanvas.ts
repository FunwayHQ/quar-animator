/**
 * Canvases for tests under Node (which has none): each keeps its pixels
 * (RGBA), set by putImageData and drawImage (scaled nearest-neighbour),
 * cleared by clearRect — enough to see which picture a GIF's sink drew.
 * `installFakeCanvases` puts them where OffscreenCanvas is looked for.
 */

/** A picture to draw from, as a canvas or a decoded frame is. */
export interface FakePicture {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export class FakeCanvas implements FakePicture {
  pixels: Uint8ClampedArray;
  readonly drawn: string[] = [];

  constructor(
    public width: number,
    public height: number
  ) {
    this.pixels = new Uint8ClampedArray(width * height * 4);
  }

  getContext(): FakeContext {
    return new FakeContext(this);
  }

  /** Its pixels as they are, typed as asked (no encoding: a test reads them back with `pixelsOfUri`) */
  convertToBlob({ type }: { type: string }): Promise<Blob> {
    return Promise.resolve(new Blob([this.pixels.slice()], { type }));
  }
}

/** The pixels of a fake canvas's picture written as a data URI (convertToBlob's). */
export function pixelsOfUri(uri: string): Uint8ClampedArray {
  const binary = atob(uri.slice(uri.indexOf(',') + 1));
  return Uint8ClampedArray.from(binary, (char) => char.charCodeAt(0));
}

class FakeContext {
  imageSmoothingEnabled = false;
  imageSmoothingQuality = 'low';

  constructor(readonly canvas: FakeCanvas) {}

  clearRect(): void {
    this.canvas.pixels.fill(0);
    this.canvas.drawn.push('clear');
  }

  createImageData(width: number, height: number) {
    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
  }

  getImageData(x: number, y: number, width: number, height: number) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let row = 0; row < height; row++) {
      const from = ((y + row) * this.canvas.width + x) * 4;
      data.set(this.canvas.pixels.subarray(from, from + width * 4), row * width * 4);
    }
    return { width, height, data };
  }

  putImageData(image: { width: number; height: number; data: Uint8ClampedArray }): void {
    this.canvas.pixels.set(image.data.subarray(0, this.canvas.pixels.length));
    this.canvas.drawn.push('put');
  }

  drawImage(source: FakePicture, x: number, y: number, width: number, height: number): void {
    const { canvas } = this;
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const tx = x + col;
        const ty = y + row;
        if (tx < 0 || ty < 0 || tx >= canvas.width || ty >= canvas.height) continue;
        const sx = Math.min(source.width - 1, Math.floor((col * source.width) / width));
        const sy = Math.min(source.height - 1, Math.floor((row * source.height) / height));
        const from = (sy * source.width + sx) * 4;
        canvas.pixels.set(source.pixels.subarray(from, from + 4), (ty * canvas.width + tx) * 4);
      }
    }
    canvas.drawn.push('draw');
  }
}

/** Fake canvases where OffscreenCanvas is looked for (no document: the GIF sinks make those); undoes itself. */
export function installFakeCanvases(): () => void {
  const scope = globalThis as { OffscreenCanvas?: unknown };
  const before = scope.OffscreenCanvas;
  scope.OffscreenCanvas = FakeCanvas;
  return () => {
    scope.OffscreenCanvas = before;
  };
}

/** A canvas's pixel, as [r, g, b, a]. */
export function canvasPixel(canvas: unknown, x: number, y: number): number[] {
  if (!(canvas instanceof FakeCanvas)) throw new Error('Not a fake canvas.');
  const at = (y * canvas.width + x) * 4;
  return [...canvas.pixels.subarray(at, at + 4)];
}
