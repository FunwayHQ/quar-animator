/**
 * Project Serializer for Quar Animator
 * Converts editor state to/from a portable JSON format
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import type { Node, Timeline } from '@quar/types';
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
}

export interface EditorStateSnapshot {
  timeline: Timeline;
  timelineDuration: number;
  frameRate: number;
  autoKeyframe: boolean;
  onionSkin: OnionSkinSettings;
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
  };
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

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string) as ProjectData;
          if (!data.version || !data.sceneGraph || !data.settings) {
            reject(new Error('Invalid .quar file format'));
            return;
          }
          resolve(data);
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
