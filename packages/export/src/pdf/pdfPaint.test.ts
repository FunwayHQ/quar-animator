/**
 * Tests for gradients as PDF shadings
 */

import { describe, it, expect } from 'vitest';
import type { Color, Gradient } from '@quar/types';
import { PdfDocument } from './pdfDocument';
import { CONIC_WEDGES, colorAt, gradientPaint, gradientStops, stopFunction } from './pdfPaint';
import { readPdf } from '../__fixtures__/pdfReader';

const RED: Color = { r: 255, g: 0, b: 0, a: 1 };
const BLUE: Color = { r: 0, g: 0, b: 255, a: 1 };
const CLEAR_BLUE: Color = { r: 0, g: 0, b: 255, a: 0 };

/** The body of an object in the document, as a reader finds it. */
async function shadingBody(doc: PdfDocument, id: number): Promise<string> {
  doc.addPageWith(1, 1, doc.addStream('', ''), '<< >>');
  const object = (await readPdf(doc.toBytes())).objects.get(id);
  return object?.body ?? '';
}

function paint(gradient: Gradient) {
  const doc = new PdfDocument();
  const result = gradientPaint(doc, gradient);
  return { doc, result };
}

describe('stopFunction', () => {
  it('runs straight between two stops', () => {
    expect(
      stopFunction(
        gradientStops({
          type: 'linear',
          stops: [
            { offset: 0, color: RED },
            { offset: 1, color: BLUE },
          ],
        }),
        'color'
      )
    ).toBe('<< /FunctionType 2 /Domain [0 1] /C0 [1 0 0] /C1 [0 0 1] /N 1 >>');
  });

  it('stitches runs between more stops, holding the end colors past them', () => {
    const fn = stopFunction(
      [
        { offset: 0.25, color: RED },
        { offset: 0.5, color: BLUE },
        { offset: 0.75, color: RED },
      ],
      'color'
    );
    expect(fn).toMatch(/^<< \/FunctionType 3 /);
    expect(fn).toContain('/Bounds [0.25 0.5 0.75]');
    // Held red before the first stop, held red after the last
    expect(fn.match(/\/FunctionType 2/g)).toHaveLength(4);
    expect(fn).toContain('/C0 [1 0 0] /C1 [1 0 0]');
  });

  it('steps where two stops share a place, with nothing run between them', () => {
    const fn = stopFunction(
      [
        { offset: 0, color: RED },
        { offset: 0.5, color: RED },
        { offset: 0.5, color: BLUE },
        { offset: 1, color: BLUE },
      ],
      'color'
    );
    expect(fn).toContain('/Bounds [0.5]');
    expect(fn.match(/\/FunctionType 2/g)).toHaveLength(2);
  });

  it('writes the stops’ opacity as gray for the alpha channel', () => {
    expect(
      stopFunction(
        [
          { offset: 0, color: RED },
          { offset: 1, color: CLEAR_BLUE },
        ],
        'alpha'
      )
    ).toBe('<< /FunctionType 2 /Domain [0 1] /C0 [1] /C1 [0] /N 1 >>');
  });
});

describe('colorAt', () => {
  it('mixes the colors and opacity straight between stops', () => {
    expect(
      colorAt(
        [
          { offset: 0, color: RED },
          { offset: 1, color: CLEAR_BLUE },
        ],
        0.25
      )
    ).toEqual({
      r: 191.25,
      g: 0,
      b: 63.75,
      a: 0.75,
    });
  });
});

describe('gradientPaint', () => {
  it('makes a linear gradient an axial shading between its ends, in its box', async () => {
    const { doc, result } = paint({
      type: 'linear',
      stops: [
        { offset: 0, color: RED },
        { offset: 1, color: BLUE },
      ],
      start: { x: 0, y: 0.5 },
      end: { x: 1, y: 0.5 },
    });
    if (!('color' in result)) throw new Error('expected shadings');
    expect(result.alpha).toBeNull();
    expect(await shadingBody(doc, result.color)).toContain(
      '/ShadingType 2 /ColorSpace /DeviceRGB /Coords [0 0.5 1 0.5]'
    );
    expect(await shadingBody(doc, result.color)).toContain('/Extend [true true]');
  });

  it('takes a linear gradient’s angle when it has no ends, as the canvas does', async () => {
    const { doc, result } = paint({
      type: 'linear',
      stops: [
        { offset: 0, color: RED },
        { offset: 1, color: BLUE },
      ],
      angle: 90,
    });
    if (!('color' in result)) throw new Error('expected shadings');
    expect(await shadingBody(doc, result.color)).toContain('/Coords [0.5 0 0.5 1]');
  });

  it('draws one color where a linear gradient’s ends meet', () => {
    const { result } = paint({
      type: 'linear',
      stops: [
        { offset: 0, color: RED },
        { offset: 1, color: BLUE },
      ],
      start: { x: 0.5, y: 0.5 },
      end: { x: 0.5, y: 0.5 },
    });
    expect(result).toEqual({ solid: { r: 127.5, g: 0, b: 127.5, a: 1 } });
  });

  it('runs a radial gradient from its focal point, kept inside its circle', async () => {
    const { doc, result } = paint({
      type: 'radial',
      stops: [
        { offset: 0, color: RED },
        { offset: 1, color: BLUE },
      ],
      center: { x: 0.5, y: 0.5 },
      radius: 0.5,
      focal: { x: 2, y: 0.5 },
    });
    if (!('color' in result)) throw new Error('expected shadings');
    // 0.99 of the radius from the center at most
    expect(await shadingBody(doc, result.color)).toContain(
      '/ShadingType 3 /ColorSpace /DeviceRGB /Coords [0.995 0.5 0 0.5 0.5 0.5]'
    );
  });

  it('fans a conic gradient into thin triangles round its center', async () => {
    const { doc, result } = paint({
      type: 'conic',
      stops: [
        { offset: 0, color: RED },
        { offset: 1, color: BLUE },
      ],
      center: { x: 0.5, y: 0.5 },
      angle: 0,
    });
    if (!('color' in result)) throw new Error('expected shadings');
    const body = await shadingBody(doc, result.color);
    expect(body).toContain('/ShadingType 4 /ColorSpace /DeviceRGB');
    // Three vertices a triangle: a flag, two 32-bit coordinates, three channels
    expect(body).toContain(`/Length ${CONIC_WEDGES * 3 * 12}`);
  });

  it('adds a gray shading of the opacity only when some stop isn’t opaque', async () => {
    const { doc, result } = paint({
      type: 'linear',
      stops: [
        { offset: 0, color: RED },
        { offset: 1, color: CLEAR_BLUE },
      ],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    });
    if (!('color' in result) || result.alpha === null) throw new Error('expected an alpha shading');
    expect(await shadingBody(doc, result.alpha)).toContain('/ColorSpace /DeviceGray');
  });
});
