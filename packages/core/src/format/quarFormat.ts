/**
 * Binary .quar File Format (v3.0)
 *
 * Layout:
 * ┌─────────────────────────┐
 * │ Magic: "QUAR"           │ 4 bytes (0x51 0x55 0x41 0x52)
 * │ Format version: 3       │ 4 bytes (uint32 LE)
 * │ Flags: 0                │ 4 bytes (reserved)
 * │ JSON chunk length        │ 4 bytes (uint32 LE)
 * │ JSON chunk (UTF-8)       │ variable
 * │ Buffer count             │ 4 bytes (uint32 LE)
 * │ For each buffer:         │
 * │   Buffer data length     │ 4 bytes (uint32 LE)
 * │   MIME type length       │ 4 bytes (uint32 LE)
 * │   MIME type (UTF-8)      │ variable
 * │   Buffer data (raw)      │ variable
 * └─────────────────────────┘
 */

// ============================================================================
// Constants
// ============================================================================

export const QUAR_MAGIC = 0x52415551; // "QUAR" read as little-endian uint32
export const FORMAT_VERSION = 3;
const HEADER_SIZE = 16; // magic(4) + version(4) + flags(4) + jsonLength(4)

// ============================================================================
// Types
// ============================================================================

export interface QuarBuffer {
  data: Uint8Array;
  mimeType: string;
}

export interface QuarFile {
  json: Record<string, unknown>;
  buffers: QuarBuffer[];
}

// ============================================================================
// Text encoding helpers (work in both browser and Node.js/vitest)
// ============================================================================

function encodeUTF8(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  // Node.js fallback
  const buf = Buffer.from(str, 'utf-8');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function decodeUTF8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }
  // Node.js fallback
  return Buffer.from(bytes).toString('utf-8');
}

// ============================================================================
// Base64 ↔ Binary helpers
// ============================================================================

function base64ToBytes(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  // Node.js fallback
  const buf = Buffer.from(base64, 'base64');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
  }
  // Node.js fallback
  return Buffer.from(bytes).toString('base64');
}

// ============================================================================
// Data URI regex
// ============================================================================

const DATA_URI_REGEX = /^data:(image\/[^;]+);base64,(.+)$/;

// ============================================================================
// Image Extraction / Restoration
// ============================================================================

/**
 * Deep-walks a JSON structure, extracts all `src` fields matching
 * `data:image/...;base64,...` and replaces them with `"buffer:N"` references.
 * Returns the modified JSON and the extracted binary buffers.
 */
export function extractImageBuffers(json: unknown): {
  json: unknown;
  buffers: QuarBuffer[];
} {
  const buffers: QuarBuffer[] = [];
  const bufferMap = new Map<string, number>(); // data URI → buffer index (dedup)

  function walk(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return obj;
    if (typeof obj === 'number' || typeof obj === 'boolean') return obj;

    if (Array.isArray(obj)) {
      return obj.map(walk);
    }

    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (key === 'src' && typeof value === 'string') {
          const match = DATA_URI_REGEX.exec(value);
          if (match) {
            // Check if we've already extracted this exact data URI
            const existing = bufferMap.get(value);
            if (existing !== undefined) {
              result[key] = `buffer:${existing}`;
            } else {
              const mimeType = match[1]!;
              const base64Data = match[2]!;
              const index = buffers.length;
              buffers.push({
                data: base64ToBytes(base64Data),
                mimeType,
              });
              bufferMap.set(value, index);
              result[key] = `buffer:${index}`;
            }
            continue;
          }
        }
        result[key] = walk(value);
      }
      return result;
    }

    return obj;
  }

  const modifiedJson = walk(json);
  return { json: modifiedJson, buffers };
}

/**
 * Reverse of extractImageBuffers. Finds `"buffer:N"` references in `src` fields
 * and restores them to data URIs using the provided buffers.
 */
export function restoreImageBuffers(json: unknown, buffers: QuarBuffer[]): unknown {
  const BUFFER_REF_REGEX = /^buffer:(\d+)$/;

  function walk(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return obj;
    if (typeof obj === 'number' || typeof obj === 'boolean') return obj;

    if (Array.isArray(obj)) {
      return obj.map(walk);
    }

    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (key === 'src' && typeof value === 'string') {
          const match = BUFFER_REF_REGEX.exec(value);
          if (match) {
            const index = parseInt(match[1]!, 10);
            if (index >= 0 && index < buffers.length) {
              const buf = buffers[index]!;
              result[key] = `data:${buf.mimeType};base64,${bytesToBase64(buf.data)}`;
              continue;
            }
          }
        }
        result[key] = walk(value);
      }
      return result;
    }

    return obj;
  }

  return walk(json);
}

// ============================================================================
// Binary Encoding
// ============================================================================

/**
 * Encodes a QuarFile into a binary ArrayBuffer in the .quar v3.0 format.
 */
export function encodeQuarBinary(file: QuarFile): ArrayBuffer {
  const jsonBytes = encodeUTF8(JSON.stringify(file.json));

  // Calculate total size
  let totalSize = HEADER_SIZE + jsonBytes.length + 4; // +4 for buffer count
  for (const buf of file.buffers) {
    const mimeBytes = encodeUTF8(buf.mimeType);
    totalSize += 4 + 4 + mimeBytes.length + buf.data.length; // dataLen + mimeLen + mime + data
  }

  const result = new ArrayBuffer(totalSize);
  const view = new DataView(result);
  const bytes = new Uint8Array(result);
  let offset = 0;

  // Header
  view.setUint32(offset, QUAR_MAGIC, true);
  offset += 4;
  view.setUint32(offset, FORMAT_VERSION, true);
  offset += 4;
  view.setUint32(offset, 0, true); // flags (reserved)
  offset += 4;
  view.setUint32(offset, jsonBytes.length, true);
  offset += 4;

  // JSON chunk
  bytes.set(jsonBytes, offset);
  offset += jsonBytes.length;

  // Buffer count
  view.setUint32(offset, file.buffers.length, true);
  offset += 4;

  // Each buffer
  for (const buf of file.buffers) {
    const mimeBytes = encodeUTF8(buf.mimeType);

    view.setUint32(offset, buf.data.length, true);
    offset += 4;
    view.setUint32(offset, mimeBytes.length, true);
    offset += 4;
    bytes.set(mimeBytes, offset);
    offset += mimeBytes.length;
    bytes.set(buf.data, offset);
    offset += buf.data.length;
  }

  return result;
}

// ============================================================================
// Binary Decoding
// ============================================================================

/**
 * Decodes a binary ArrayBuffer in .quar v3.0 format into a QuarFile.
 * Throws descriptive errors for invalid/corrupt data.
 */
export function decodeQuarBinary(buffer: ArrayBuffer): QuarFile {
  if (buffer.byteLength < HEADER_SIZE) {
    throw new Error('Invalid .quar file: too small to contain header');
  }

  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  // Read magic
  const magic = view.getUint32(offset, true);
  offset += 4;
  if (magic !== QUAR_MAGIC) {
    throw new Error('Invalid .quar file: wrong magic bytes');
  }

  // Read version
  const version = view.getUint32(offset, true);
  offset += 4;
  if (version !== FORMAT_VERSION) {
    throw new Error(`Unsupported .quar format version: ${version}`);
  }

  // Skip flags
  offset += 4;

  // Read JSON chunk
  const jsonLength = view.getUint32(offset, true);
  offset += 4;

  if (offset + jsonLength > buffer.byteLength) {
    throw new Error('Invalid .quar file: JSON chunk extends beyond file');
  }

  const jsonBytes = bytes.slice(offset, offset + jsonLength);
  offset += jsonLength;

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(decodeUTF8(jsonBytes)) as Record<string, unknown>;
  } catch {
    throw new Error('Invalid .quar file: corrupted JSON chunk');
  }

  // Read buffer count
  if (offset + 4 > buffer.byteLength) {
    throw new Error('Invalid .quar file: missing buffer count');
  }
  const bufferCount = view.getUint32(offset, true);
  offset += 4;

  // Read each buffer
  const buffers: QuarBuffer[] = [];
  for (let i = 0; i < bufferCount; i++) {
    if (offset + 8 > buffer.byteLength) {
      throw new Error(`Invalid .quar file: truncated buffer ${i} header`);
    }

    const dataLength = view.getUint32(offset, true);
    offset += 4;
    const mimeLength = view.getUint32(offset, true);
    offset += 4;

    if (offset + mimeLength > buffer.byteLength) {
      throw new Error(`Invalid .quar file: truncated MIME type for buffer ${i}`);
    }
    const mimeType = decodeUTF8(bytes.slice(offset, offset + mimeLength));
    offset += mimeLength;

    if (offset + dataLength > buffer.byteLength) {
      throw new Error(`Invalid .quar file: truncated data for buffer ${i}`);
    }
    const data = bytes.slice(offset, offset + dataLength);
    offset += dataLength;

    buffers.push({ data, mimeType });
  }

  return { json, buffers };
}

// ============================================================================
// Magic detection helper
// ============================================================================

/**
 * Returns true if the first 4 bytes of the ArrayBuffer match the QUAR magic.
 */
export function isQuarBinary(data: ArrayBuffer): boolean {
  if (data.byteLength < 4) return false;
  const view = new DataView(data);
  return view.getUint32(0, true) === QUAR_MAGIC;
}
