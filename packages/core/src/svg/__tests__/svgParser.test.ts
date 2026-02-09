import { describe, it, expect } from 'vitest';
import { parseSvg } from '../svgParser';

describe('parseSvg', () => {
  // --------------------------------------------------------------------------
  // Basic parsing
  // --------------------------------------------------------------------------

  it('parses an empty SVG', () => {
    const result = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(result.elements).toHaveLength(0);
    expect(result.width).toBe(300); // default
    expect(result.height).toBe(150); // default
  });

  it('parses viewBox', () => {
    const result = parseSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"></svg>');
    expect(result.viewBox).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
  });

  it('parses explicit width/height', () => {
    const result = parseSvg('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"></svg>');
    expect(result.width).toBe(400);
    expect(result.height).toBe(300);
  });

  it('throws on invalid SVG', () => {
    expect(() => parseSvg('not xml at all <><>')).toThrow();
  });

  // --------------------------------------------------------------------------
  // Element parsing
  // --------------------------------------------------------------------------

  it('parses rect element', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="20" width="100" height="50" rx="5" fill="red" />
    </svg>`;
    const result = parseSvg(svg);
    expect(result.elements).toHaveLength(1);
    const el = result.elements[0];
    expect(el.tag).toBe('rect');
    if (el.tag === 'rect') {
      expect(el.x).toBe(10);
      expect(el.y).toBe(20);
      expect(el.width).toBe(100);
      expect(el.height).toBe(50);
      expect(el.rx).toBe(5);
      expect(el.style.fill).toBe('red');
    }
  });

  it('parses circle element', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="25" fill="blue" />
    </svg>`;
    const result = parseSvg(svg);
    expect(result.elements).toHaveLength(1);
    const el = result.elements[0];
    expect(el.tag).toBe('circle');
    if (el.tag === 'circle') {
      expect(el.cx).toBe(50);
      expect(el.cy).toBe(50);
      expect(el.r).toBe(25);
    }
  });

  it('parses ellipse element', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="100" cy="50" rx="80" ry="30" />
    </svg>`;
    const result = parseSvg(svg);
    const el = result.elements[0];
    expect(el.tag).toBe('ellipse');
    if (el.tag === 'ellipse') {
      expect(el.rx).toBe(80);
      expect(el.ry).toBe(30);
    }
  });

  it('parses line element', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <line x1="0" y1="0" x2="100" y2="100" stroke="black" />
    </svg>`;
    const result = parseSvg(svg);
    const el = result.elements[0];
    expect(el.tag).toBe('line');
    if (el.tag === 'line') {
      expect(el.x1).toBe(0);
      expect(el.y2).toBe(100);
    }
  });

  it('parses polygon element', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <polygon points="50,0 100,100 0,100" fill="green" />
    </svg>`;
    const result = parseSvg(svg);
    const el = result.elements[0];
    expect(el.tag).toBe('polygon');
    if (el.tag === 'polygon') {
      expect(el.points).toHaveLength(3);
      expect(el.points[0]).toEqual({ x: 50, y: 0 });
    }
  });

  it('parses polyline element', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <polyline points="0,0 50,50 100,0" stroke="red" fill="none" />
    </svg>`;
    const result = parseSvg(svg);
    expect(result.elements[0].tag).toBe('polyline');
  });

  it('parses path element', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <path d="M 10 20 L 30 40" stroke="black" />
    </svg>`;
    const result = parseSvg(svg);
    const el = result.elements[0];
    expect(el.tag).toBe('path');
    if (el.tag === 'path') {
      expect(el.d).toBe('M 10 20 L 30 40');
    }
  });

  // --------------------------------------------------------------------------
  // Groups
  // --------------------------------------------------------------------------

  it('parses nested groups', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <g id="outer" transform="translate(10, 20)">
        <rect x="0" y="0" width="50" height="50" />
        <g id="inner">
          <circle cx="25" cy="25" r="10" />
        </g>
      </g>
    </svg>`;
    const result = parseSvg(svg);
    expect(result.elements).toHaveLength(1);
    const outer = result.elements[0];
    expect(outer.tag).toBe('g');
    if (outer.tag === 'g') {
      expect(outer.id).toBe('outer');
      expect(outer.transform).toBe('translate(10, 20)');
      expect(outer.children).toHaveLength(2);
      expect(outer.children[0].tag).toBe('rect');
      expect(outer.children[1].tag).toBe('g');
    }
  });

  // --------------------------------------------------------------------------
  // Gradients
  // --------------------------------------------------------------------------

  it('parses linear gradient defs', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad1" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="red" />
          <stop offset="100%" stop-color="blue" />
        </linearGradient>
      </defs>
      <rect fill="url(#grad1)" width="100" height="100" />
    </svg>`;
    const result = parseSvg(svg);
    expect(result.defs.gradients.has('grad1')).toBe(true);
    const grad = result.defs.gradients.get('grad1')!;
    expect(grad.type).toBe('linear');
    expect(grad.stops).toHaveLength(2);
    expect(grad.stops[0].color).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(grad.stops[1].color).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    expect(grad.x1).toBe(0);
    expect(grad.x2).toBe(1);
  });

  it('parses radial gradient defs', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="rg" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="white" />
          <stop offset="1" stop-color="black" />
        </radialGradient>
      </defs>
    </svg>`;
    const result = parseSvg(svg);
    const grad = result.defs.gradients.get('rg')!;
    expect(grad.type).toBe('radial');
    expect(grad.cx).toBe(0.5);
    expect(grad.r).toBe(0.5);
  });

  it('parses gradient stop opacity', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g">
          <stop offset="0" stop-color="red" stop-opacity="0.5" />
        </linearGradient>
      </defs>
    </svg>`;
    const result = parseSvg(svg);
    const grad = result.defs.gradients.get('g')!;
    expect(grad.stops[0].color.a).toBe(0.5);
  });

  // --------------------------------------------------------------------------
  // Style
  // --------------------------------------------------------------------------

  it('resolves inline style over attributes', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <rect fill="red" style="fill: blue" width="100" height="100" />
    </svg>`;
    const result = parseSvg(svg);
    expect(result.elements[0].style.fill).toBe('blue');
  });

  it('skips display:none elements', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" />
      <rect width="50" height="50" display="none" />
    </svg>`;
    const result = parseSvg(svg);
    expect(result.elements).toHaveLength(1);
  });

  it('resolves stroke properties', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <line x1="0" y1="0" x2="100" y2="0" stroke="red" stroke-width="3" stroke-linecap="round" stroke-dasharray="5,10" />
    </svg>`;
    const result = parseSvg(svg);
    const style = result.elements[0].style;
    expect(style.stroke).toBe('red');
    expect(style.strokeWidth).toBe(3);
    expect(style.strokeLinecap).toBe('round');
    expect(style.strokeDasharray).toEqual([5, 10]);
  });

  // --------------------------------------------------------------------------
  // Transforms
  // --------------------------------------------------------------------------

  it('captures transform attribute', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <rect transform="translate(50, 100)" width="10" height="10" />
    </svg>`;
    const result = parseSvg(svg);
    expect(result.elements[0].transform).toBe('translate(50, 100)');
  });

  // --------------------------------------------------------------------------
  // Skipped elements
  // --------------------------------------------------------------------------

  it('skips defs, metadata, title, desc', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs>
      <title>My SVG</title>
      <desc>A description</desc>
      <metadata></metadata>
      <rect width="100" height="100" />
    </svg>`;
    const result = parseSvg(svg);
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].tag).toBe('rect');
  });

  // --------------------------------------------------------------------------
  // IDs
  // --------------------------------------------------------------------------

  it('preserves element IDs', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <rect id="myRect" width="100" height="100" />
    </svg>`;
    const result = parseSvg(svg);
    expect(result.elements[0].id).toBe('myRect');
  });
});
