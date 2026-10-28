/**
 * System Clipboard for Quar Animator
 * Copied layers on the system clipboard, so they paste into another window —
 * or another browser. Browsers only share plain formats, so they go as JSON
 * text (and the same JSON in an HTML attribute, for apps that prefer HTML),
 * with everything they need to stand alone: their rigging and the symbols
 * they use. Images travel inside them, as data URIs.
 */

import { readSlideTransition } from '@quar/animation';
import type { ArtboardTimeline, Node, SymbolDefinition } from '@quar/types';
import type { ClipboardExtras } from '../stores/clipboardRig';
import { readSoundClips, readSounds } from './soundData';

/** Marks clipboard text as Quar Animator layers. */
export const CLIPBOARD_TYPE = 'quar-animator/clipboard';
const VERSION = 1;

export interface ClipboardPayload {
  /** The copied layers, descendants included (as the in-app clipboard keeps them). */
  nodes: Node[];
  extras: ClipboardExtras | null;
  /** Definitions of the symbols the layers use, nested ones included. */
  symbols: SymbolDefinition[];
}

/** The symbols these layers use, and the symbols those use in turn. */
export function symbolsUsedBy(nodes: Node[], symbols: SymbolDefinition[]): SymbolDefinition[] {
  const byId = new Map(symbols.map((symbol) => [symbol.id, symbol]));
  const used = new Map<string, SymbolDefinition>();
  const visit = (list: Node[]) => {
    for (const node of list) {
      if (node.type !== 'symbol-instance' || used.has(node.symbolId)) continue;
      const symbol = byId.get(node.symbolId);
      if (!symbol) continue;
      used.set(symbol.id, symbol);
      visit(symbol.sceneGraphJSON.nodes);
    }
  };
  visit(nodes);
  return [...used.values()];
}

/** The clipboard's text and HTML for these layers. */
export function encodeClipboard(payload: ClipboardPayload): { text: string; html: string } {
  const text = JSON.stringify({ type: CLIPBOARD_TYPE, version: VERSION, ...payload });
  // URI-encoded, the JSON survives HTML (quotes, angle brackets) untouched
  const html = `<meta charset="utf-8"><span data-quar-clipboard="${encodeURIComponent(text)}">Quar Animator layers</span>`;
  return { text, html };
}

// A picture comes with the layers it's in: a link to one elsewhere doesn't paste
const IMAGE_SOURCE = /^data:image\//i;

/**
 * Layers copied from Quar Animator, from the clipboard's HTML or text; null
 * when it holds anything else. Only what has the shape of layers is taken,
 * and images only from data or web URLs.
 */
export function decodeClipboard(
  text: string | null | undefined,
  html?: string | null
): ClipboardPayload | null {
  const fromHtml = html?.match(/data-quar-clipboard="([^"]*)"/)?.[1];
  let json: string | undefined;
  try {
    json = fromHtml ? decodeURIComponent(fromHtml) : text?.trim();
  } catch {
    json = text?.trim();
  }
  if (!json || !json.startsWith('{') || !json.includes(CLIPBOARD_TYPE)) return null;

  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.type !== CLIPBOARD_TYPE || typeof data.version !== 'number')
    return null;
  if (data.version > VERSION) return null;
  if (!Array.isArray(data.nodes) || data.nodes.length === 0) return null;

  const nodes = data.nodes as unknown[];
  const looksLikeNode = (node: unknown): node is Node =>
    isRecord(node) &&
    typeof node.id === 'string' &&
    typeof node.type === 'string' &&
    isRecord(node.transform) &&
    Array.isArray(node.children) &&
    (node.type !== 'image' || (typeof node.src === 'string' && IMAGE_SOURCE.test(node.src)));
  if (!nodes.every(looksLikeNode)) return null;

  const symbols = Array.isArray(data.symbols)
    ? (data.symbols as unknown[]).filter(
        (symbol): symbol is SymbolDefinition =>
          isRecord(symbol) &&
          typeof symbol.id === 'string' &&
          isRecord(symbol.sceneGraphJSON) &&
          Array.isArray(symbol.sceneGraphJSON.nodes) &&
          (symbol.sceneGraphJSON.nodes as unknown[]).every(looksLikeNode)
      )
    : [];
  return {
    nodes,
    extras: isRecord(data.extras) ? readExtras(data.extras) : null,
    symbols,
  };
}

/** The extras, their artboard timelines and sounds as the editor can use them. */
function readExtras(extras: Record<string, unknown>): ClipboardExtras {
  const timelines: Record<string, ArtboardTimeline> = {};
  if (isRecord(extras.artboardTimelines)) {
    for (const [id, entry] of Object.entries(extras.artboardTimelines)) {
      if (!isRecord(entry) || typeof entry.duration !== 'number') continue;
      if (!Number.isFinite(entry.duration) || entry.duration < 1) continue;
      const sounds = readSoundClips(entry.sounds);
      const transition = readSlideTransition(entry.transition);
      timelines[id] = {
        duration: Math.round(entry.duration),
        ...(sounds.length > 0 ? { sounds } : {}),
        ...(transition ? { transition } : {}),
      };
    }
  }
  return {
    ...(extras as unknown as ClipboardExtras),
    artboardTimelines: timelines,
    sounds: readSounds(extras.sounds),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
