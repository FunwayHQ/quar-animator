/**
 * Project Serializer for Quar Animator
 * Converts editor state to/from a portable JSON format
 * Supports v1.0 (single page), v2.0 (multi-page), and v3.0 (binary) formats
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import type {
  Node,
  Timeline,
  VitruvianController,
  DynamicChain,
  WindSettings,
  SymbolDefinition,
} from '@quar/types';
import type { OnionSkinSettings } from '@quar/core';
import type { SceneGraph } from '@quar/core';
import { createTimeline } from '@quar/animation';
import { DEFAULT_ONION_SKIN_SETTINGS, writeQuarFile, parseQuarFile } from '@quar/core';
import type { Guide, PageData } from '../stores/editorStore';

// ============================================================================
// Types
// ============================================================================

/** v1.0 single-page format (legacy) */
export interface ProjectDataV1 {
  version: '1.0';
  name: string;
  createdAt: string;
  updatedAt: string;
  sceneGraph: {
    nodes: Node[];
    rootNodeIds: string[];
  };
  timeline: Timeline;
  settings: {
    timelineDuration: number;
    frameRate: number;
    autoKeyframe: boolean;
    onionSkin: OnionSkinSettings;
    guides?: Guide[];
  };
  rigging?: {
    vitruvianControllers?: VitruvianController[];
    dynamicChains?: DynamicChain[];
    globalWind?: WindSettings;
  };
}

/** Serialized page data within v2.0 format */
export interface SerializedPage {
  id: string;
  name: string;
  sceneGraph: {
    nodes: Node[];
    rootNodeIds: string[];
  };
  timeline: Timeline;
}

/** v2.0 multi-page format */
export interface ProjectDataV2 {
  version: '2.0';
  name: string;
  createdAt: string;
  updatedAt: string;
  pages: SerializedPage[];
  activePageId: string;
  settings: {
    timelineDuration: number;
    frameRate: number;
    autoKeyframe: boolean;
    onionSkin: OnionSkinSettings;
    guides?: Guide[];
  };
  rigging?: {
    vitruvianControllers?: VitruvianController[];
    dynamicChains?: DynamicChain[];
    globalWind?: WindSettings;
  };
  symbols?: SymbolDefinition[];
}

/** v3.0 binary format (same structure as v2.0, different version tag) */
export interface ProjectDataV3 extends Omit<ProjectDataV2, 'version'> {
  version: '3.0';
}

/** Union type for all supported formats */
export type ProjectData = ProjectDataV1 | ProjectDataV2 | ProjectDataV3;

export interface EditorStateSnapshot {
  timeline: Timeline;
  timelineDuration: number;
  frameRate: number;
  autoKeyframe: boolean;
  onionSkin: OnionSkinSettings;
  guides?: Guide[];
  vitruvianControllers?: VitruvianController[];
  dynamicChains?: DynamicChain[];
  globalWind?: WindSettings;
  pages?: PageData[];
  activePageId?: string;
  symbols?: SymbolDefinition[];
}

// ============================================================================
// Serialization
// ============================================================================

export function serializeProject(
  name: string,
  sceneGraph: SceneGraph,
  editorState: EditorStateSnapshot,
  existingCreatedAt?: string
): ProjectDataV2 {
  const now = new Date().toISOString();

  // Build pages array from editor state
  let pages: SerializedPage[];
  let activePageId: string;

  if (editorState.pages && editorState.pages.length > 0 && editorState.activePageId) {
    // Multi-page project: snapshot the active page's current scene graph state
    pages = editorState.pages.map((page) => {
      if (page.id === editorState.activePageId) {
        // Active page — use live scene graph + timeline
        return {
          id: page.id,
          name: page.name,
          sceneGraph: sceneGraph.toJSON(),
          timeline: structuredClone(editorState.timeline),
        };
      } else {
        // Inactive page — use stored snapshot
        return {
          id: page.id,
          name: page.name,
          sceneGraph: structuredClone(page.sceneGraphJSON),
          timeline: structuredClone(page.timeline),
        };
      }
    });
    activePageId = editorState.activePageId;
  } else {
    // Single page fallback (shouldn't normally happen with the new store defaults)
    const pageId = `page-${Date.now()}`;
    pages = [
      {
        id: pageId,
        name: 'Page 1',
        sceneGraph: sceneGraph.toJSON(),
        timeline: structuredClone(editorState.timeline),
      },
    ];
    activePageId = pageId;
  }

  return {
    version: '2.0',
    name,
    createdAt: existingCreatedAt ?? now,
    updatedAt: now,
    pages,
    activePageId,
    settings: {
      timelineDuration: editorState.timelineDuration,
      frameRate: editorState.frameRate,
      autoKeyframe: editorState.autoKeyframe,
      onionSkin: { ...editorState.onionSkin },
      guides: editorState.guides ? [...editorState.guides] : [],
    },
    rigging: {
      vitruvianControllers: editorState.vitruvianControllers
        ? structuredClone(editorState.vitruvianControllers)
        : [],
      dynamicChains: editorState.dynamicChains ? structuredClone(editorState.dynamicChains) : [],
      globalWind: editorState.globalWind ? { ...editorState.globalWind } : undefined,
    },
    symbols: editorState.symbols ? structuredClone(editorState.symbols) : [],
  };
}

/**
 * Serializes a project directly to a v3.0 binary ArrayBuffer.
 * Convenience wrapper around serializeProject + writeQuarFile.
 */
export function serializeProjectToBinary(
  name: string,
  sceneGraph: SceneGraph,
  editorState: EditorStateSnapshot,
  existingCreatedAt?: string
): ArrayBuffer {
  const json = serializeProject(name, sceneGraph, editorState, existingCreatedAt);
  return writeQuarFile(json as unknown as Record<string, unknown>);
}

/**
 * Deserializes a project from binary ArrayBuffer or legacy JSON string.
 * Convenience wrapper around parseQuarFile + deserializeProject.
 */
export function deserializeProjectFromBinary(
  data: ArrayBuffer | string,
  sceneGraph: SceneGraph,
  applyEditorState: (state: Partial<EditorStateSnapshot & { currentFrame: number }>) => void
): Record<string, unknown> {
  const parsed = parseQuarFile(data);
  deserializeProject(parsed as unknown as ProjectData, sceneGraph, applyEditorState);
  return parsed;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validates that unknown data conforms to a supported ProjectData shape (v1.0, v2.0, or v3.0).
 * Lightweight structural checks without a schema library.
 */
export function validateProjectData(data: unknown): data is ProjectData {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // version must be a string
  if (typeof obj.version !== 'string') {
    return false;
  }

  if (obj.version === '2.0' || obj.version === '3.0') {
    return validateV2Data(obj);
  }

  // v1.0 or unversioned — validate as v1
  return validateV1Data(obj);
}

function validateV1Data(obj: Record<string, unknown>): boolean {
  // sceneGraph must be an object with nodes array and rootNodeIds array
  if (
    obj.sceneGraph == null ||
    typeof obj.sceneGraph !== 'object' ||
    Array.isArray(obj.sceneGraph)
  ) {
    return false;
  }
  const sg = obj.sceneGraph as Record<string, unknown>;
  if (!Array.isArray(sg.nodes) || !Array.isArray(sg.rootNodeIds)) {
    return false;
  }

  if (!validateNodes(sg.nodes)) return false;

  return validateSettings(obj);
}

function validateV2Data(obj: Record<string, unknown>): boolean {
  // pages must be an array with at least one entry
  if (!Array.isArray(obj.pages) || obj.pages.length === 0) {
    return false;
  }

  // activePageId must be a string
  if (typeof obj.activePageId !== 'string') {
    return false;
  }

  // Validate each page
  for (const page of obj.pages) {
    if (page == null || typeof page !== 'object' || Array.isArray(page)) {
      return false;
    }
    const p = page as Record<string, unknown>;
    if (typeof p.id !== 'string' || typeof p.name !== 'string') {
      return false;
    }
    if (p.sceneGraph == null || typeof p.sceneGraph !== 'object' || Array.isArray(p.sceneGraph)) {
      return false;
    }
    const sg = p.sceneGraph as Record<string, unknown>;
    if (!Array.isArray(sg.nodes) || !Array.isArray(sg.rootNodeIds)) {
      return false;
    }
    if (!validateNodes(sg.nodes)) return false;
  }

  return validateSettings(obj);
}

function validateNodes(nodes: unknown[]): boolean {
  for (const node of nodes) {
    if (node == null || typeof node !== 'object' || Array.isArray(node)) {
      return false;
    }
    const n = node as Record<string, unknown>;
    if (typeof n.id !== 'string') {
      return false;
    }
    if (typeof n.type !== 'string') {
      return false;
    }
    if (n.transform == null || typeof n.transform !== 'object' || Array.isArray(n.transform)) {
      return false;
    }
  }
  return true;
}

function validateSettings(obj: Record<string, unknown>): boolean {
  // settings must be an object with numeric timelineDuration and frameRate
  if (obj.settings == null || typeof obj.settings !== 'object' || Array.isArray(obj.settings)) {
    return false;
  }
  const settings = obj.settings as Record<string, unknown>;
  if (typeof settings.timelineDuration !== 'number' || !isFinite(settings.timelineDuration)) {
    return false;
  }
  if (typeof settings.frameRate !== 'number' || !isFinite(settings.frameRate)) {
    return false;
  }
  return true;
}

// ============================================================================
// Migration: v1.0 → v2.0
// ============================================================================

function migrateV1ToV2(data: ProjectDataV1): ProjectDataV2 {
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
  };
}

function migrateTimeline(
  timeline: Timeline,
  settings: { timelineDuration: number; frameRate: number }
): Timeline {
  const result =
    timeline ??
    createTimeline({
      duration: settings.timelineDuration,
      frameRate: settings.frameRate,
    });

  if (result.tracks) {
    for (const track of result.tracks) {
      // Migrate fill.* → fills.0.*
      if (track.property.startsWith('fill.')) {
        track.property = track.property.replace(/^fill\./, 'fills.0.');
      }
      // Migrate stroke.* → strokes.0.*
      if (track.property.startsWith('stroke.')) {
        track.property = track.property.replace(/^stroke\./, 'strokes.0.');
      }
    }
  }

  return result;
}

// ============================================================================
// Deserialization
// ============================================================================

export interface DeserializedPages {
  pages: PageData[];
  activePageId: string;
}

export function deserializeProject(
  data: ProjectData,
  sceneGraph: SceneGraph,
  applyEditorState: (state: Partial<EditorStateSnapshot & { currentFrame: number }>) => void
): void {
  // Normalize to v2.0 structure (v3.0 has same structure as v2.0)
  const v2 =
    data.version === '2.0' || data.version === '3.0'
      ? (data as ProjectDataV2)
      : migrateV1ToV2(data);

  // Find the active page (or first page as fallback)
  const activePage = v2.pages.find((p) => p.id === v2.activePageId) ?? v2.pages[0]!;

  // Load active page's scene graph
  sceneGraph.fromJSON(activePage.sceneGraph);

  // Migrate all page timelines
  for (const page of v2.pages) {
    page.timeline = migrateTimeline(page.timeline, v2.settings);
  }

  // Build PageData array
  const pages: PageData[] = v2.pages.map((p) => ({
    id: p.id,
    name: p.name,
    sceneGraphJSON: structuredClone(p.sceneGraph),
    timeline: structuredClone(p.timeline),
    selectedNodeIds: [],
    undoStack: [],
    redoStack: [],
  }));

  // Restore editor state
  applyEditorState({
    timeline: structuredClone(activePage.timeline),
    timelineDuration: v2.settings.timelineDuration,
    frameRate: v2.settings.frameRate,
    autoKeyframe: v2.settings.autoKeyframe,
    onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS, ...v2.settings.onionSkin },
    guides: v2.settings.guides ?? [],
    currentFrame: 0,
    vitruvianControllers: v2.rigging?.vitruvianControllers ?? [],
    dynamicChains: v2.rigging?.dynamicChains ?? [],
    globalWind: v2.rigging?.globalWind,
    pages,
    activePageId: activePage.id,
    symbols: v2.symbols ?? [],
  });
}

// ============================================================================
// File Download / Upload
// ============================================================================

export function downloadProjectFile(name: string, data: ProjectData): void {
  const binary = writeQuarFile(data as unknown as Record<string, unknown>);
  const blob = new Blob([binary], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFilename(name)}.quar`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function uploadProjectFile(): Promise<ProjectData> {
  return new Promise<ProjectData>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.quar,application/json';

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }

      // Reject files over 50MB to prevent memory exhaustion
      const MAX_FILE_SIZE = 50 * 1024 * 1024;
      if (file.size > MAX_FILE_SIZE) {
        reject(new Error('File too large. Maximum size is 50MB.'));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const arrayBuffer = reader.result as ArrayBuffer;
          const parsed = parseQuarFile(arrayBuffer);
          if (!validateProjectData(parsed)) {
            reject(new Error('Invalid .quar file format'));
            return;
          }
          resolve(parsed as unknown as ProjectData);
        } catch {
          reject(new Error('Failed to parse .quar file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    };

    input.click();
  });
}

// ============================================================================
// Helpers
// ============================================================================

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'untitled';
}
