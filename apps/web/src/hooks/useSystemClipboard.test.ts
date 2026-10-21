/**
 * Tests for copying layers onto the system clipboard and pasting them back
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { SceneGraph, createDefaultTransform } from '@quar/core';
import type { Node, RectangleNode, SymbolDefinition } from '@quar/types';
import { useEditorStore } from '../stores/editorStore';
import { copyLayers, useSystemClipboard } from './useSystemClipboard';
import { decodeClipboard, encodeClipboard } from '../services/systemClipboard';

function rect(id: string, extra: Partial<Node> = {}): RectangleNode {
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
    width: 40,
    height: 20,
    cornerRadius: [0, 0, 0, 0],
    fills: [],
    strokes: [],
    ...extra,
  } as RectangleNode;
}

/** A copy/cut event with a clipboard to write to, dispatched on `target`. */
function clipboardEvent(type: 'copy' | 'cut', target: EventTarget = document.body) {
  const data = new Map<string, string>();
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { setData: (format: string, value: string) => data.set(format, value) },
  });
  target.dispatchEvent(event);
  return { event, data };
}

describe('useSystemClipboard', () => {
  let sceneGraph: SceneGraph;

  beforeEach(() => {
    sceneGraph = new SceneGraph();
    sceneGraph.addNode(rect('r1'));
    useEditorStore.setState({
      selectedNodeIds: new Set(['r1']),
      clipboard: null,
      clipboardExtras: null,
      symbols: [],
    });
  });

  it('puts the selected layers on the clipboard, as text and HTML', () => {
    renderHook(() => useSystemClipboard(sceneGraph));

    const { event, data } = clipboardEvent('copy');

    expect(event.defaultPrevented).toBe(true);
    const payload = decodeClipboard(data.get('text/plain'));
    expect(payload?.nodes.map((n) => n.id)).toEqual(['r1']);
    expect(decodeClipboard(null, data.get('text/html'))?.nodes).toHaveLength(1);
  });

  it('cuts: the layers go to the clipboard and leave the page', () => {
    renderHook(() => useSystemClipboard(sceneGraph));
    const { data } = clipboardEvent('cut');
    expect(decodeClipboard(data.get('text/plain'))?.nodes[0]?.id).toBe('r1');
    expect(sceneGraph.getNode('r1')).toBeUndefined();
  });

  it('leaves copying in a text field to the field', () => {
    renderHook(() => useSystemClipboard(sceneGraph));
    const input = document.createElement('input');
    document.body.appendChild(input);

    const { event, data } = clipboardEvent('copy', input);

    expect(event.defaultPrevented).toBe(false);
    expect(data.size).toBe(0);
    input.remove();
  });

  it("copies on Ctrl+C on a Mac, where that's no copy command", () => {
    const platform = vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const execCommand = vi.fn((kind: string) => {
      clipboardEvent(kind as 'copy');
      return true;
    });
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    renderHook(() => useSystemClipboard(sceneGraph));

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, cancelable: true })
    );

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(useEditorStore.getState().clipboard?.[0]?.id).toBe('r1');
    platform.mockRestore();
  });

  it('copies from a menu through the async clipboard when there is no copy event', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    Object.defineProperty(document, 'execCommand', { value: () => false, configurable: true });

    copyLayers(sceneGraph, 'copy');

    await Promise.resolve();
    expect(decodeClipboard(writeText.mock.calls[0]![0] as string)?.nodes[0]?.id).toBe('r1');
  });
});

describe('pastePayload', () => {
  it('pastes layers from another window, adding the symbols they use', () => {
    const symbol: SymbolDefinition = {
      id: 'sym-1',
      name: 'Badge',
      sceneGraphJSON: { nodes: [rect('inside')], rootNodeIds: ['inside'] },
    };
    const instance = {
      ...rect('inst'),
      type: 'symbol-instance',
      symbolId: 'sym-1',
      overrides: [],
    } as unknown as Node;
    // What another window copied, read back off the clipboard
    const payload = decodeClipboard(
      encodeClipboard({ nodes: [instance], extras: null, symbols: [symbol] }).text
    )!;

    const target = new SceneGraph();
    useEditorStore.setState({ symbols: [], selectedNodeIds: new Set() });
    useEditorStore.getState().pastePayload(target, payload);

    const pasted = target.getRootNodes();
    expect(pasted).toHaveLength(1);
    expect(pasted[0]!.id).not.toBe('inst');
    expect(useEditorStore.getState().symbols.map((s) => s.id)).toEqual(['sym-1']);
    expect([...useEditorStore.getState().selectedNodeIds]).toEqual([pasted[0]!.id]);

    // Pasting again doesn't add the symbol twice
    useEditorStore.getState().pastePayload(target, payload);
    expect(useEditorStore.getState().symbols).toHaveLength(1);
  });

  it('undoing the paste takes out the symbols it brought in; redo puts them back', () => {
    const symbol: SymbolDefinition = {
      id: 'sym-2',
      name: 'Star',
      sceneGraphJSON: { nodes: [rect('in')], rootNodeIds: ['in'] },
    };
    const instance = {
      ...rect('inst2'),
      type: 'symbol-instance',
      symbolId: 'sym-2',
      overrides: [],
    } as unknown as Node;
    const keep: SymbolDefinition = { ...symbol, id: 'already-here', name: 'Mine' };
    const target = new SceneGraph();
    useEditorStore.setState({ symbols: [keep], undoStack: [], redoStack: [] });

    useEditorStore
      .getState()
      .pastePayload(target, { nodes: [instance], extras: null, symbols: [symbol] });
    const ids = () => useEditorStore.getState().symbols.map((s) => s.id);
    expect(ids()).toEqual(['already-here', 'sym-2']);

    useEditorStore.getState().undo(target);
    expect(target.getRootNodes()).toHaveLength(0);
    expect(ids()).toEqual(['already-here']);

    useEditorStore.getState().redo(target);
    expect(target.getRootNodes()).toHaveLength(1);
    expect(ids()).toEqual(['already-here', 'sym-2']);

    useEditorStore.getState().undo(target);
    expect(ids()).toEqual(['already-here']);
  });
});
