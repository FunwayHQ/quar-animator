/**
 * Tests for layers on the system clipboard
 */

import { describe, it, expect } from 'vitest';
import type { Node, SymbolDefinition } from '@quar/types';
import { createDefaultTransform } from '@quar/core';
import {
  CLIPBOARD_TYPE,
  decodeClipboard,
  encodeClipboard,
  symbolsUsedBy,
  type ClipboardPayload,
} from './systemClipboard';

function node(id: string, extra: Record<string, unknown> = {}): Node {
  return {
    id,
    name: id,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 10,
    height: 10,
    cornerRadius: [0, 0, 0, 0],
    fills: [],
    strokes: [],
    ...extra,
  } as Node;
}

const payload: ClipboardPayload = {
  nodes: [node('a', { name: 'Quote " <tag> & ünïcode' })],
  extras: null,
  symbols: [],
};

describe('system clipboard format', () => {
  it('reads back what it writes, as text and as HTML', () => {
    const { text, html } = encodeClipboard(payload);
    expect(JSON.parse(text).type).toBe(CLIPBOARD_TYPE);
    expect(decodeClipboard(text)).toEqual(payload);
    expect(decodeClipboard(null, html)).toEqual(payload);
    // HTML wins when both are there (some apps rewrite plain text)
    expect(decodeClipboard('not ours', html)).toEqual(payload);
  });

  it('leaves anything else alone', () => {
    expect(decodeClipboard('hello')).toBeNull();
    expect(decodeClipboard('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBeNull();
    expect(decodeClipboard('{"type":"something-else","nodes":[]}')).toBeNull();
    expect(decodeClipboard(`{"type":"${CLIPBOARD_TYPE}", broken`)).toBeNull();
    expect(decodeClipboard(null, '<p>Some copied page</p>')).toBeNull();
  });

  it('turns down malformed layers, unsafe image sources and newer versions', () => {
    const wrap = (nodes: unknown[], version = 1) =>
      JSON.stringify({ type: CLIPBOARD_TYPE, version, nodes, extras: null, symbols: [] });
    expect(decodeClipboard(wrap([{ id: 'x' }]))).toBeNull();
    expect(decodeClipboard(wrap([]))).toBeNull();
    expect(
      decodeClipboard(wrap([node('i', { type: 'image', src: 'javascript:alert(1)' })]))
    ).toBeNull();
    expect(
      decodeClipboard(wrap([node('i', { type: 'image', src: 'data:image/png;base64,AAAA' })]))
    ).not.toBeNull();
    expect(decodeClipboard(wrap([node('a')], 99))).toBeNull();
  });

  it('takes the symbols the layers use along, nested ones too', () => {
    const inner: SymbolDefinition = {
      id: 'inner',
      name: 'Inner',
      sceneGraphJSON: { nodes: [node('r')], rootNodeIds: ['r'] },
    };
    const outer: SymbolDefinition = {
      id: 'outer',
      name: 'Outer',
      sceneGraphJSON: {
        nodes: [node('use-inner', { type: 'symbol-instance', symbolId: 'inner', overrides: [] })],
        rootNodeIds: ['use-inner'],
      },
    };
    const unused: SymbolDefinition = { ...inner, id: 'unused' };
    const layers = [
      node('use-outer', { type: 'symbol-instance', symbolId: 'outer', overrides: [] }),
    ];

    expect(symbolsUsedBy(layers, [inner, outer, unused]).map((s) => s.id)).toEqual([
      'outer',
      'inner',
    ]);
  });
});
