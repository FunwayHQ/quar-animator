/**
 * PDF Content
 * What a page, or a group painted on it, draws: PDF's drawing operators, and
 * the named resources they use (graphics states, patterns, shadings,
 * pictures and groups), kept in one dictionary every page and group shares.
 */

import { forEachSegment, getAbsoluteControlPoints, mat3 } from '@quar/core';
import type { Matrix3, PathPoint, Vector2 } from '@quar/types';
import { pdfNumber as n, type PdfDocument } from './pdfDocument';

/** One contour of a shape: its points, and whether it closes. */
export interface Contour {
  points: PathPoint[];
  closed: boolean;
}

export type ResourceKind = 'ExtGState' | 'Pattern' | 'Shading' | 'XObject';

const PREFIXES: Record<ResourceKind, string> = {
  ExtGState: 'G',
  Pattern: 'P',
  Shading: 'S',
  XObject: 'X',
};

export class PdfResources {
  /** The dictionary's object: written last, once every resource is known */
  readonly id: number;
  private readonly entries: Record<ResourceKind, Map<string, number>> = {
    ExtGState: new Map(),
    Pattern: new Map(),
    Shading: new Map(),
    XObject: new Map(),
  };
  private readonly keyed = new Map<string, string>();

  constructor(private readonly doc: PdfDocument) {
    this.id = doc.reserve();
  }

  /** The name object `objectId` goes by as a `kind`. */
  add(kind: ResourceKind, objectId: number): string {
    const entries = this.entries[kind];
    const name = `${PREFIXES[kind]}${entries.size + 1}`;
    entries.set(name, objectId);
    return name;
  }

  /** A resource made once per `key`: the same name every time after. */
  shared(kind: ResourceKind, key: string, make: () => number): string {
    const cacheKey = `${kind}|${key}`;
    const known = this.keyed.get(cacheKey);
    if (known) return known;
    const name = this.add(kind, make());
    this.keyed.set(cacheKey, name);
    return name;
  }

  /** A graphics state: fill and stroke alpha, a blend mode. */
  alpha(fill: number, stroke: number, blend?: string): string {
    const ca = n(Math.max(0, Math.min(1, fill)));
    const CA = n(Math.max(0, Math.min(1, stroke)));
    const bm = blend ? ` /BM /${blend}` : '';
    return this.shared('ExtGState', `${ca}|${CA}|${blend ?? ''}`, () =>
      this.doc.add(`<< /Type /ExtGState /ca ${ca} /CA ${CA}${bm} >>`)
    );
  }

  write(): void {
    const parts = (Object.keys(this.entries) as ResourceKind[])
      .filter((kind) => this.entries[kind].size > 0)
      .map((kind) => {
        const items = [...this.entries[kind]].map(([name, id]) => `/${name} ${id} 0 R`);
        return `/${kind} << ${items.join(' ')} >>`;
      });
    this.doc.set(this.id, `<< ${parts.join(' ')} >>`);
  }
}

export class PdfContent {
  private readonly ops: string[] = [];

  /**
   * `base` maps this stream's drawing space (the document's world, Y up) to
   * the space its patterns are placed in: the page's for a page, none for a
   * group (a group's space is the world it's painted in).
   */
  constructor(readonly base: Matrix3 = mat3.identity()) {}

  op(text: string): this {
    this.ops.push(text);
    return this;
  }

  save(): this {
    return this.op('q');
  }

  restore(): this {
    return this.op('Q');
  }

  transform(m: Matrix3): this {
    return this.op(`${n(m.a)} ${n(m.b)} ${n(m.c)} ${n(m.d)} ${n(m.tx)} ${n(m.ty)} cm`);
  }

  /** Contours as a path, in their own space or mapped by `m`. */
  path(contours: readonly Contour[], m?: Matrix3): this {
    const at = (p: Vector2) => {
      const q = m ? mat3.transformPoint(m, p) : p;
      return `${n(q.x)} ${n(q.y)}`;
    };
    for (const { points, closed } of contours) {
      const first = points[0];
      if (!first || points.length < 2) continue;
      this.op(`${at(first.position)} m`);
      const last = closed ? points.length - 1 : -1;
      forEachSegment(points, closed, (from, to, index) => {
        const { cp1, cp2 } = getAbsoluteControlPoints(from, to);
        const straight =
          cp1.x === from.position.x &&
          cp1.y === from.position.y &&
          cp2.x === to.position.x &&
          cp2.y === to.position.y;
        // A straight closing segment is the close itself (so its corner joins)
        if (straight && index === last) return;
        this.op(straight ? `${at(to.position)} l` : `${at(cp1)} ${at(cp2)} ${at(to.position)} c`);
      });
      if (closed) this.op('h');
    }
    return this;
  }

  /** A polygon (x, y pairs) as a closed path. */
  polygon(vertices: ArrayLike<number>): this {
    if (vertices.length < 6) return this;
    for (let i = 0; i < vertices.length; i += 2) {
      this.op(`${n(vertices[i] ?? 0)} ${n(vertices[i + 1] ?? 0)} ${i === 0 ? 'm' : 'l'}`);
    }
    return this.op('h');
  }

  rect(x: number, y: number, width: number, height: number): this {
    return this.op(`${n(x)} ${n(y)} ${n(width)} ${n(height)} re`);
  }

  get empty(): boolean {
    return this.ops.length === 0;
  }

  toString(): string {
    return this.ops.join('\n');
  }
}

/** A color's channels as PDF has them (0–1). */
export function rgb(color: { r: number; g: number; b: number }): string {
  const c = (v: number) => n(Math.max(0, Math.min(255, v)) / 255);
  return `${c(color.r)} ${c(color.g)} ${c(color.b)}`;
}
