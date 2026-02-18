/**
 * .quar File Migration System
 *
 * Handles:
 * - Parsing .quar files (auto-detects binary v3 vs JSON v1/v2)
 * - Writing .quar files (always v3 binary)
 * - Migration chain: v1 → v2 → v3
 */

import {
  encodeQuarBinary,
  decodeQuarBinary,
  extractImageBuffers,
  restoreImageBuffers,
  isQuarBinary,
} from './quarFormat';

// ============================================================================
// Types (re-export for convenience)
// ============================================================================

export type { QuarBuffer, QuarFile } from './quarFormat';

// ============================================================================
// Migration: v1 → v2
// ============================================================================

/**
 * Migrates a v1.0 (single-page) project to v2.0 (multi-page) format.
 * Moved from projectSerializer.ts for centralized migration logic.
 */
export function migrateV1ToV2(data: Record<string, unknown>): Record<string, unknown> {
  const pageId = `page-migrated-${Date.now()}`;
  return {
    version: '2.0',
    name: data.name,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    pages: [
      {
        id: pageId,
        name: 'Page 1',
        sceneGraph: data.sceneGraph,
        timeline: data.timeline,
      },
    ],
    activePageId: pageId,
    settings: data.settings,
    rigging: data.rigging,
    symbols: data.symbols,
  };
}

// ============================================================================
// Migration: v2 → v3
// ============================================================================

/**
 * Migrates a v2.0 project to v3.0 format.
 * v3 adds formatVersion field. Images stay as data URIs in the JSON —
 * they get extracted to binary buffers during writeQuarFile().
 */
export function migrateV2ToV3(data: Record<string, unknown>): Record<string, unknown> {
  return {
    ...data,
    version: '3.0',
  };
}

// ============================================================================
// Migration chain
// ============================================================================

/**
 * Runs the full migration chain from any version to v3.0.
 */
export function migrateToLatest(data: Record<string, unknown>): Record<string, unknown> {
  const version = data.version as string | undefined;

  if (version === '3.0') {
    return data;
  }

  if (version === '2.0') {
    return migrateV2ToV3(data);
  }

  // v1.0 or unversioned — migrate through v2 first, then to v3
  const v2 = migrateV1ToV2(data);
  return migrateV2ToV3(v2);
}

// ============================================================================
// Parse .quar file (auto-detect format)
// ============================================================================

/**
 * Parses a .quar file from either binary (v3) or JSON string (v1/v2).
 * Auto-detects the format and migrates to v3.0.
 *
 * @param data - Binary ArrayBuffer or JSON string
 * @returns The parsed project data (v3.0 format with data URIs restored)
 */
export function parseQuarFile(data: ArrayBuffer | string): Record<string, unknown> {
  if (typeof data === 'string') {
    // Legacy JSON format (v1 or v2)
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(data) as Record<string, unknown>;
    } catch {
      throw new Error('Invalid .quar file: failed to parse JSON');
    }
    return migrateToLatest(parsed);
  }

  // Binary data — check for QUAR magic
  if (isQuarBinary(data)) {
    const quarFile = decodeQuarBinary(data);
    // Restore buffer references to data URIs
    const restored = restoreImageBuffers(quarFile.json, quarFile.buffers) as Record<
      string,
      unknown
    >;
    return migrateToLatest(restored);
  }

  // Binary data but not QUAR format — try as JSON text
  let text: string;
  try {
    const decoder = new TextDecoder();
    text = decoder.decode(data);
  } catch {
    throw new Error('Invalid .quar file: not a recognized format');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('Invalid .quar file: not a recognized format');
  }

  return migrateToLatest(parsed);
}

// ============================================================================
// Write .quar file (always v3 binary)
// ============================================================================

/**
 * Writes a project as a .quar v3 binary file.
 * Extracts images from data URIs into binary buffers for efficient storage.
 *
 * @param project - Project data (any version — will be migrated to v3)
 * @returns Binary ArrayBuffer in .quar v3 format
 */
export function writeQuarFile(project: Record<string, unknown>): ArrayBuffer {
  // Ensure the data is v3
  const v3 = migrateToLatest(project);

  // Extract images to binary buffers
  const { json, buffers } = extractImageBuffers(v3);

  return encodeQuarBinary({
    json: json as Record<string, unknown>,
    buffers,
  });
}
