/**
 * Project Serializer for Quar Animator
 * Converts editor state to/from a portable JSON format
 * Supports v1.0 (single page), v2.0 (multi-page), and v3.0 (binary) formats
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import type {
  Node,
  Timeline,
  PropertyTrack,
  VitruvianController,
  DynamicChain,
  WindSettings,
  SymbolDefinition,
  IKChain,
  SmartBoneAction,
  SkinData,
  Color,
  Sound,
  BrushProfile,
  Video,
} from '@quar/types';
import type { OnionSkinSettings } from '@quar/core';
import type { SceneGraph } from '@quar/core';
import {
  createAnimationSequence,
  createTimeline,
  openingScope,
  readSlideTransition,
  scopeDuration,
  soundIdsUsed,
  withoutGoneArtboards,
} from '@quar/animation';
import { DEFAULT_WIND_SETTINGS } from '@quar/rigging';
import type { AnimationSequence } from '@quar/animation';
import {
  DEFAULT_DOCUMENT_BACKGROUND,
  DEFAULT_ONION_SKIN_SETTINGS,
  writeQuarFile,
  writeQuarBlob,
  parseQuarFile,
  migrateV1ToV2,
  mat3,
} from '@quar/core';
import type { Guide, PageData } from '../stores/editorStore';
import { readSoundClips, readSounds } from './soundData';
import { mendVideoNodes, readVideos } from './videoData';
import { videoFile } from './videoFiles';
import { customBrushProfiles, readBrushProfiles, withBuiltInProfiles } from './brushProfiles';

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
    /** The document (canvas) background; absent in older files, which get the default. */
    backgroundColor?: Color;
  };
  rigging?: {
    vitruvianControllers?: VitruvianController[];
    dynamicChains?: DynamicChain[];
    globalWind?: WindSettings;
    ikChains?: IKChain[];
    smartBoneActions?: SmartBoneAction[];
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
  /** PowerPoint-style numbered steps (optional — older files have none). */
  animationSequence?: AnimationSequence;
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
    /** The document (canvas) background; absent in older files, which get the default. */
    backgroundColor?: Color;
  };
  rigging?: {
    vitruvianControllers?: VitruvianController[];
    dynamicChains?: DynamicChain[];
    globalWind?: WindSettings;
    ikChains?: IKChain[];
    smartBoneActions?: SmartBoneAction[];
  };
  symbols?: SymbolDefinition[];
  /** The sounds the pages' timelines play (each clip names one) */
  sounds?: Sound[];
  /** The videos the layers show, on the pages and in the symbols (each layer names one) */
  videos?: SavedVideo[];
  /** The brush profiles made in the document (its brush strokes name them) */
  brushProfiles?: BrushProfile[];
}

/**
 * A video as a project file keeps it: what's known about it, and its file
 * when the file holds it — a buffer of the .quar (its JSON names it
 * "buffer:N"), a Blob once read. The browser's storage keeps the files
 * apart, so its copy of a project has none.
 */
export interface SavedVideo extends Video {
  file?: Blob;
}

/** v3.0 binary format (same structure as v2.0, different version tag) */
export interface ProjectDataV3 extends Omit<ProjectDataV2, 'version'> {
  version: '3.0';
}

/** Union type for all supported formats */
export type ProjectData = ProjectDataV1 | ProjectDataV2 | ProjectDataV3;

export interface EditorStateSnapshot {
  timeline: Timeline;
  animationSequence?: AnimationSequence;
  timelineDuration: number;
  /** The timeline in view (loading shows the page's own: null) */
  timelineScope?: string | null;
  frameRate: number;
  autoKeyframe: boolean;
  onionSkin: OnionSkinSettings;
  guides?: Guide[];
  documentBackground?: Color;
  vitruvianControllers?: VitruvianController[];
  dynamicChains?: DynamicChain[];
  globalWind?: WindSettings;
  ikChains?: IKChain[];
  smartBoneActions?: SmartBoneAction[];
  pages?: PageData[];
  activePageId?: string;
  symbols?: SymbolDefinition[];
  sounds?: Sound[];
  /** The video library (the files are kept apart: services/videoFiles) */
  videos?: Video[];
  /** Every brush profile, the built-in ones too (those aren't saved) */
  brushProfiles?: BrushProfile[];
  /**
   * The active page's layers, when the scene graph doesn't hold them: while
   * a symbol is edited, it holds the symbol's
   */
  pageScene?: { nodes: Node[]; rootNodeIds: string[] };
}

/**
 * What opening a project applies: the editor's state, and the files of the
 * videos the project file held, by video id (for services/videoFiles, not
 * the store). Always there, empty for a file without them.
 */
export type OpenedProjectState = Partial<EditorStateSnapshot & { currentFrame: number }> & {
  videoFiles?: Map<string, Blob>;
};

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
  const activeScene = () =>
    editorState.pageScene ? structuredClone(editorState.pageScene) : sceneGraph.toJSON();

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
          sceneGraph: activeScene(),
          timeline: structuredClone(editorState.timeline),
          animationSequence: structuredClone(
            editorState.animationSequence ?? createAnimationSequence()
          ),
        };
      } else {
        // Inactive page — use stored snapshot
        return {
          id: page.id,
          name: page.name,
          sceneGraph: structuredClone(page.sceneGraphJSON),
          timeline: structuredClone(page.timeline),
          animationSequence: structuredClone(page.animationSequence ?? createAnimationSequence()),
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
        sceneGraph: activeScene(),
        timeline: structuredClone(editorState.timeline),
        animationSequence: structuredClone(
          editorState.animationSequence ?? createAnimationSequence()
        ),
      },
    ];
    activePageId = pageId;
  }

  // A deleted artboard's timeline (its length, its clips) goes with it
  pages = pages.map((page) => ({
    ...page,
    timeline: withoutGoneArtboards(
      page.timeline,
      new Set(
        page.sceneGraph.nodes.filter((node) => node.type === 'artboard').map((node) => node.id)
      )
    ),
  }));

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
      ...(editorState.documentBackground && {
        backgroundColor: { ...editorState.documentBackground },
      }),
    },
    rigging: {
      vitruvianControllers: editorState.vitruvianControllers
        ? structuredClone(editorState.vitruvianControllers)
        : [],
      dynamicChains: editorState.dynamicChains ? structuredClone(editorState.dynamicChains) : [],
      globalWind: editorState.globalWind ? { ...editorState.globalWind } : undefined,
      ikChains: editorState.ikChains ? structuredClone(editorState.ikChains) : [],
      smartBoneActions: editorState.smartBoneActions
        ? structuredClone(editorState.smartBoneActions)
        : [],
    },
    symbols: editorState.symbols ? structuredClone(editorState.symbols) : [],
    // Only the sounds some clip plays: one taken off the timeline goes with it
    sounds: soundsPlayedOn(pages, editorState.sounds ?? []),
    // And only the videos some layer shows
    videos: videosShownIn(
      [
        ...pages.map((page) => page.sceneGraph),
        ...(editorState.symbols ?? []).map((symbol) => symbol.sceneGraphJSON),
      ],
      editorState.videos ?? []
    ),
    brushProfiles: customBrushProfiles(editorState.brushProfiles ?? []),
  };
}

/** The library's sounds that clips on the pages' timelines play. */
function soundsPlayedOn(pages: SerializedPage[], sounds: Sound[]): Sound[] {
  const used = new Set<string>();
  for (const page of pages) for (const id of soundIdsUsed(page.timeline)) used.add(id);
  return sounds.filter((sound) => used.has(sound.id)).map((sound) => ({ ...sound }));
}

/** The library's videos that layers in these scenes (pages, symbols) show. */
function videosShownIn(scenes: Array<{ nodes: Node[] }>, videos: Video[]): Video[] {
  const shown = new Set<string>();
  for (const scene of scenes) {
    for (const node of scene.nodes) if (node.type === 'video') shown.add(node.videoId);
  }
  return videos.filter((video) => shown.has(video.id)).map((video) => ({ ...video }));
}

/**
 * Serializes a project directly to a v3.0 binary ArrayBuffer.
 * Convenience wrapper around serializeProject + projectDataToBinary.
 */
export function serializeProjectToBinary(
  name: string,
  sceneGraph: SceneGraph,
  editorState: EditorStateSnapshot,
  existingCreatedAt?: string
): ArrayBuffer {
  return projectDataToBinary(serializeProject(name, sceneGraph, editorState, existingCreatedAt));
}

/**
 * A project already serialized (serializeProject), as a v3.0 binary .quar
 * file — for callers that also need the serialized data itself. Without its
 * videos' files: the copy the browser's storage keeps, which keeps those
 * apart (projectFileBlob writes the whole file).
 */
export function projectDataToBinary(data: ProjectData): ArrayBuffer {
  return writeQuarFile(data as unknown as Record<string, unknown>);
}

/**
 * A project already serialized, as the whole .quar file: each video's file
 * in it too, a buffer of its own (`files` gives them, by video id; one it
 * lacks is left out, the video kept). A Blob put together from its parts, so
 * the videos are never read into memory to be written.
 */
export function projectFileBlob(
  data: ProjectData,
  files: (videoId: string) => Blob | undefined = videoFile
): Blob {
  const videos = 'videos' in data ? data.videos : undefined;
  return writeQuarBlob({
    ...data,
    ...(videos && {
      videos: videos.map((video) => {
        const file = files(video.id) ?? video.file;
        // Typed as its video is, which is what the file names its buffer
        return file ? { ...video, file: new Blob([file], { type: video.mimeType }) } : video;
      }),
    }),
  } as unknown as Record<string, unknown>);
}

/**
 * Deserializes a project from binary ArrayBuffer or legacy JSON string.
 * Convenience wrapper around parseQuarFile + deserializeProject.
 */
export function deserializeProjectFromBinary(
  data: ArrayBuffer | string,
  sceneGraph: SceneGraph,
  applyEditorState: (state: OpenedProjectState) => void
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

/**
 * Bindings saved before meshBindLocal existed ignored the mesh's own
 * transform, so they were drawn where they were bound whatever it said.
 * Taking the current transform as the bind one keeps them looking exactly
 * the same, and moving them works from now on.
 */
function migrateSkinBindings(nodes: Node[]): void {
  for (const node of nodes) {
    const skin = (node as { skinData?: SkinData }).skinData;
    if (!skin || skin.meshBindLocal) continue;
    // The local matrix as the scene graph builds it (geometry applies the anchor)
    const { position, rotation, scale } = node.transform;
    const local = mat3.compose(position, rotation, scale);
    skin.meshBindLocal = [local.a, local.b, local.c, local.d, local.tx, local.ty];
  }
}

/**
 * A v1.0 project as v2.0, by the migration .quar files get when opened
 * (parseQuarFile, in @quar/core), so there is one copy of it to keep right.
 */
function migrateV1Project(data: ProjectDataV1): ProjectDataV2 {
  return migrateV1ToV2({ ...data }) as unknown as ProjectDataV2;
}

/** A track that names the property it animates. */
function isUsableTrack(track: unknown): track is PropertyTrack {
  return (
    typeof track === 'object' &&
    track !== null &&
    'property' in track &&
    typeof track.property === 'string'
  );
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

  const tracks: unknown = result.tracks;
  if (tracks != null) {
    // A file edited by hand or made by another tool can hold tracks that
    // aren't a list, or tracks that don't name a property. Those animate
    // nothing, and code that reads a track's property would trip on them.
    result.tracks = Array.isArray(tracks) ? tracks.filter(isUsableTrack) : [];
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

  // Clips (and slide transitions) a hand-edited or tool-made file got wrong are left out
  if (result.sounds !== undefined) result.sounds = readSoundClips(result.sounds);
  for (const board of Object.values(result.artboards ?? {})) {
    if (board.sounds !== undefined) board.sounds = readSoundClips(board.sounds);
    if (board.transition !== undefined) {
      const transition = readSlideTransition(board.transition);
      if (transition) board.transition = transition;
      else delete board.transition;
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

/**
 * A page's sequence made whole: a file without one, or one a tool wrote with
 * its parts missing or null, opens with no steps and no rest poses (the
 * editor reads both on every edit, export and frame shown).
 */
function readAnimationSequence(sequence: AnimationSequence | undefined): AnimationSequence {
  const parts = (sequence ?? {}) as Partial<Record<keyof AnimationSequence, unknown>>;
  return {
    ...createAnimationSequence(),
    ...sequence,
    steps: Array.isArray(parts.steps) ? structuredClone(parts.steps) : [],
    restPoses:
      parts.restPoses && typeof parts.restPoses === 'object'
        ? structuredClone(parts.restPoses as AnimationSequence['restPoses'])
        : {},
  };
}

export function deserializeProject(
  data: ProjectData,
  sceneGraph: SceneGraph,
  applyEditorState: (state: OpenedProjectState) => void
): void {
  // Normalize to v2.0 structure (v3.0 has same structure as v2.0)
  const v2 =
    data.version === '2.0' || data.version === '3.0'
      ? (data as ProjectDataV2)
      : migrateV1Project(data);

  // Everything that can fail on a damaged file runs before the open project is
  // touched, so a file that can't be read leaves it as it was rather than half
  // replaced (and open to being autosaved that way)
  for (const page of v2.pages) migrateSkinBindings(page.sceneGraph.nodes);
  for (const page of v2.pages) mendVideoNodes(page.sceneGraph.nodes);
  for (const symbol of v2.symbols ?? []) mendVideoNodes(symbol.sceneGraphJSON?.nodes ?? []);
  const { videos, files: videoFiles } = readVideos(v2.videos);

  // Find the active page (or first page as fallback)
  const activePage = v2.pages.find((p) => p.id === v2.activePageId) ?? v2.pages[0]!;

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
    animationSequence: readAnimationSequence(p.animationSequence),
    selectedNodeIds: [],
    undoStack: [],
    redoStack: [],
  }));

  const editorState: Parameters<typeof applyEditorState>[0] = {
    timeline: structuredClone(activePage.timeline),
    animationSequence: readAnimationSequence(activePage.animationSequence),
    // The page's own timeline in view to begin with (see below)
    timelineDuration: activePage.timeline.duration,
    timelineScope: null,
    frameRate: v2.settings.frameRate,
    autoKeyframe: v2.settings.autoKeyframe,
    onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS, ...v2.settings.onionSkin },
    guides: v2.settings.guides ?? [],
    documentBackground: { ...DEFAULT_DOCUMENT_BACKGROUND, ...v2.settings.backgroundColor },
    currentFrame: 0,
    vitruvianControllers: v2.rigging?.vitruvianControllers ?? [],
    dynamicChains: v2.rigging?.dynamicChains ?? [],
    // Projects without rigging data (older saves, MCP-made files) get no wind
    globalWind: { ...DEFAULT_WIND_SETTINGS, ...v2.rigging?.globalWind },
    ikChains: v2.rigging?.ikChains ?? [],
    smartBoneActions: v2.rigging?.smartBoneActions ?? [],
    pages,
    activePageId: activePage.id,
    symbols: v2.symbols ?? [],
    sounds: readSounds(v2.sounds),
    videos,
    videoFiles,
    brushProfiles: withBuiltInProfiles(readBrushProfiles(v2.brushProfiles)),
  };

  // Load the active page's scene graph, then restore the editor state —
  // with the first artboard's timeline in view when only artboards animate
  // (every file made before they had timelines of their own), so Play plays
  // the animation
  sceneGraph.fromJSON(activePage.sceneGraph);
  const scope = openingScope(sceneGraph, activePage.timeline);
  applyEditorState({
    ...editorState,
    timelineScope: scope,
    timelineDuration: scopeDuration(activePage.timeline, scope),
  });
}

// ============================================================================
// File Download / Upload
// ============================================================================

/** Download the whole .quar file: each video's file in it (from `files`, by video id). */
export function downloadProjectFile(
  name: string,
  data: ProjectData,
  files: (videoId: string) => Blob | undefined = videoFile
): void {
  const blob = projectFileBlob(data, files);
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFilename(name)}.quar`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Browsers begin reading the blob asynchronously after the click. Revoking
  // the URL in the same task can cancel the download, especially in Safari.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export class ProjectFileCancelledError extends Error {
  constructor() {
    super('Project file selection was cancelled');
    this.name = 'ProjectFileCancelledError';
  }
}

const MB = 1024 * 1024;
/**
 * The biggest .quar file that opens. A project keeps each sound (up to 50 MB),
 * picture (up to 10 MB) and video (up to 100 MB) in it, so a backup can be
 * far bigger than any one of them. The file is read whole into memory, its
 * pictures and sounds become data URIs about a third bigger again and its
 * videos Blobs of their own, so opening one this size takes well over a
 * gigabyte for a moment: as much as a browser tab comfortably has.
 */
const MAX_PROJECT_FILE_SIZE = 512 * MB;

/** Read and validate a project file without opening a file picker. */
export function readProjectFile(file: File): Promise<ProjectData> {
  if (file.size > MAX_PROJECT_FILE_SIZE) {
    return Promise.reject(
      new Error(
        `This file is ${Math.ceil(file.size / MB)} MB: Quar Animator opens .quar files of up to ${MAX_PROJECT_FILE_SIZE / MB} MB.`
      )
    );
  }

  return new Promise<ProjectData>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseQuarFile(reader.result as ArrayBuffer);
        if (!validateProjectData(parsed)) {
          reject(new Error('Invalid .quar file format'));
          return;
        }
        resolve(parsed as unknown as ProjectData);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Failed to parse .quar file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onabort = () => reject(new Error('Reading the project file was aborted'));
    reader.readAsArrayBuffer(file);
  });
}

export function uploadProjectFile(): Promise<ProjectData> {
  return new Promise<ProjectData>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.quar,.json,application/json';
    // Keep the picker attached to the document. Some browsers ignore clicks
    // on detached file inputs.
    input.style.position = 'fixed';
    input.style.left = '-10000px';
    input.style.width = '1px';
    input.style.height = '1px';
    input.style.opacity = '0';

    let settled = false;
    const cleanup = () => {
      input.removeEventListener('cancel', handleCancel);
      input.remove();
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const handleCancel = () => finish(() => reject(new ProjectFileCancelledError()));

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        finish(() => reject(new ProjectFileCancelledError()));
        return;
      }

      void readProjectFile(file).then(
        (data) => finish(() => resolve(data)),
        (error: unknown) => finish(() => reject(error))
      );
    };

    input.addEventListener('cancel', handleCancel, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

// ============================================================================
// Helpers
// ============================================================================

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'untitled';
}
