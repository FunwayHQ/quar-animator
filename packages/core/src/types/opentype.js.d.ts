declare module 'opentype.js' {
  export interface Font {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    glyphs: { length: number; get(index: number): Glyph };
    charToGlyph(char: string): Glyph;
    stringToGlyphs(str: string): Glyph[];
    getPath(text: string, x: number, y: number, fontSize: number): Path;
    getAdvanceWidth(text: string, fontSize: number): number;
    getKerningValue(leftGlyph: Glyph, rightGlyph: Glyph): number;
  }

  export interface Glyph {
    name: string;
    unicode: number;
    advanceWidth: number;
    path: Path;
    getPath(x: number, y: number, fontSize: number): Path;
    getBoundingBox(): BoundingBox;
  }

  export interface Path {
    commands: PathCommand[];
    getBoundingBox(): BoundingBox;
    toSVG(decimalPlaces?: number): string;
  }

  export interface PathCommand {
    type: 'M' | 'L' | 'C' | 'Q' | 'Z';
    x: number;
    y: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }

  export interface BoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }

  export function load(url: string, callback: (err: Error | null, font?: Font) => void): void;

  export function parse(buffer: ArrayBuffer): Font;
}
