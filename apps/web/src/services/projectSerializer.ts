/**
 * Project Serializer for Quar Animator
 * Converts editor state to/from a portable JSON format
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import type { Node, Timeline, VitruvianController, DynamicChain, WindSettings } from '@quar/types';
import type { OnionSkinSettings } from '@quar/core';
import type { SceneGraph } from '@quar/core';
import { createTimeline } from '@quar/animation';
import { DEFAULT_ONION_SKIN_SETTINGS } from '@quar/core';

// ============================================================================
// Types
// ============================================================================

export interface ProjectData {
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
  };
  rigging?: {
    vitruvianControllers?: VitruvianController[];
    dynamicChains?: DynamicChain[];
    globalWind?: WindSettings;
  };
}

export interface EditorStateSnapshot {
  timeline: Timeline;
  timelineDuration: number;
  frameRate: number;
  autoKeyframe: boolean;
  onionSkin: OnionSkinSettings;
  vitruvianControllers?: VitruvianController[];
  dynamicChains?: DynamicChain[];
  globalWind?: WindSettings;
}

// ============================================================================
// Serialization
// ============================================================================

export function serializeProject(
  name: string,
  sceneGraph: SceneGraph,
  editorState: EditorStateSnapshot,
  existingCreatedAt?: string
): ProjectData {
  const now = new Date().toISOString();
  return {
    version: '1.0',
    name,
    createdAt: existingCreatedAt ?? now,
    updatedAt: now,
    sceneGraph: sceneGraph.toJSON(),
    timeline: structuredClone(editorState.timeline),
    settings: {
      timelineDuration: editorState.timelineDuration,
      frameRate: editorState.frameRate,
      autoKeyframe: editorState.autoKeyframe,
      onionSkin: { ...editorState.onionSkin },
    },
    rigging: {
      vitruvianControllers: editorState.vitruvianControllers
        ? structuredClone(editorState.vitruvianControllers)
        : [],
      dynamicChains: editorState.dynamicChains ? structuredClone(editorState.dynamicChains) : [],
      globalWind: editorState.globalWind ? { ...editorState.globalWind } : undefined,
    },
  };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validates that unknown data conforms to the ProjectData shape.
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

  // Validate each node has required fields
  for (const node of sg.nodes) {
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
// Deserialization
// ============================================================================

export function deserializeProject(
  data: ProjectData,
  sceneGraph: SceneGraph,
  applyEditorState: (state: Partial<EditorStateSnapshot & { currentFrame: number }>) => void
): void {
  // Restore scene graph (handles fill→fills migration internally)
  sceneGraph.fromJSON(data.sceneGraph);

  // Migrate timeline track property paths from singular to array-indexed
  const timeline =
    data.timeline ??
    createTimeline({
      duration: data.settings.timelineDuration,
      frameRate: data.settings.frameRate,
    });

  if (timeline.tracks) {
    for (const track of timeline.tracks) {
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

  // Restore editor state
  applyEditorState({
    timeline,
    timelineDuration: data.settings.timelineDuration,
    frameRate: data.settings.frameRate,
    autoKeyframe: data.settings.autoKeyframe,
    onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS, ...data.settings.onionSkin },
    currentFrame: 0,
    vitruvianControllers: data.rigging?.vitruvianControllers ?? [],
    dynamicChains: data.rigging?.dynamicChains ?? [],
    globalWind: data.rigging?.globalWind,
  });
}

// ============================================================================
// File Download / Upload
// ============================================================================

export function downloadProjectFile(name: string, data: ProjectData): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
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
          const parsed: unknown = JSON.parse(reader.result as string);
          if (!validateProjectData(parsed)) {
            reject(new Error('Invalid .quar file format'));
            return;
          }
          resolve(parsed);
        } catch {
          reject(new Error('Failed to parse .quar file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
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
