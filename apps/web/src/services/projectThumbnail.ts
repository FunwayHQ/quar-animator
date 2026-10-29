/**
 * Project Thumbnails for Quar Animator
 * Renders a small picture of a saved project for the Projects page: its first
 * artboard, or when it has none, the area its artwork covers. A video layer
 * is drawn as its strip's still nearest the moment it shows (nothing is
 * decoded on the Projects page).
 */

import type {
  Color,
  Rect,
  SymbolDefinition,
  IKChain,
  Node,
  SmartBoneAction,
  Timeline,
  Video,
} from '@quar/types';
import {
  DEFAULT_DOCUMENT_BACKGROUND,
  SceneGraph,
  SelectionManager,
  getArtworkBounds,
  padRect,
  parseQuarFile,
  timelineScopeOf,
  widenToAspect,
} from '@quar/core';
import { createTimeline, openingScope, videoPosterTime, videoTimeAt } from '@quar/animation';
import { createFrameRenderer, stripStillAt, videoMoments } from '@quar/export';
import { deserializeProject } from './projectSerializer';
import type { EditorStateSnapshot, ProjectData } from './projectSerializer';
import { bundledWeightsUsed, loadBundledFonts } from './bundledFonts';

// ============================================================================
// Types
// ============================================================================

/** An artboard is shown as a page; loose artwork floats on the card. */
export type ThumbnailKind = 'artboard' | 'content';

export interface ThumbnailRegion {
  kind: ThumbnailKind;
  /** World-space rectangle the thumbnail shows. */
  bounds: Rect;
  /** Roots to draw; all of them when absent. */
  rootIds?: string[];
}

export interface ProjectThumbnail {
  kind: ThumbnailKind;
  /** Transparent where nothing is drawn. */
  png: Blob;
  /** The document background, which loose artwork is shown on. */
  background: Color;
}

// ============================================================================
// Constants
// ============================================================================

/** Largest thumbnail in pixels: about twice a project card's picture. */
export const THUMBNAIL_MAX_WIDTH = 560;
export const THUMBNAIL_MAX_HEIGHT = 350;

/** Space left around loose artwork, as a share of its larger side. */
const CONTENT_PADDING = 0.08;

// ============================================================================
// Region
// ============================================================================

/**
 * What a page's thumbnail shows: its first visible artboard, else the bounds
 * of its visible artwork widened to the card's shape. Bones are rig helpers
 * and don't count. Null when there's nothing to show.
 */
export function findThumbnailRegion(
  sceneGraph: SceneGraph,
  symbols: SymbolDefinition[] = []
): ThumbnailRegion | null {
  const selection = new SelectionManager();
  selection.setSymbolDefinitions(symbols);

  const artboard = sceneGraph.getRootNodes().find((n) => n.type === 'artboard' && n.visible);
  if (artboard) {
    const bounds = selection.getSelectionBounds(new Set([artboard.id]), sceneGraph)?.rect;
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      return { kind: 'artboard', bounds, rootIds: [artboard.id] };
    }
  }

  const artwork = getArtworkBounds(sceneGraph, symbols);
  if (!artwork) return null;

  const { rect: content, strokePadding } = artwork;
  const padding = Math.max(content.width, content.height, 1) * CONTENT_PADDING + strokePadding;
  return {
    kind: 'content',
    bounds: widenToAspect(padRect(content, padding), THUMBNAIL_MAX_WIDTH / THUMBNAIL_MAX_HEIGHT),
  };
}

/** Pixel size of a thumbnail showing a region of this size, as large as fits. */
export function thumbnailPixelSize(bounds: Rect): { width: number; height: number } {
  const scale = Math.min(THUMBNAIL_MAX_WIDTH / bounds.width, THUMBNAIL_MAX_HEIGHT / bounds.height);
  return {
    width: Math.max(1, Math.round(bounds.width * scale)),
    height: Math.max(1, Math.round(bounds.height * scale)),
  };
}

// ============================================================================
// Scene
// ============================================================================

export interface ThumbnailScene {
  sceneGraph: SceneGraph;
  region: ThumbnailRegion;
  /** The page's timeline (which one it opens on says what its video layers show) */
  timeline: Timeline;
  /** The video library, for the video layers' strips */
  videos: Video[];
  symbols: SymbolDefinition[];
  ikChains: IKChain[];
  smartBoneActions: SmartBoneAction[];
  frameRate: number;
  background: Color;
}

/**
 * The page a project's thumbnail shows — the one it opens on, or else the
 * first page with something on it — with that page's region.
 */
export function pickThumbnailScene(project: ProjectData): ThumbnailScene | null {
  let state: Partial<EditorStateSnapshot> = {};
  deserializeProject(project, new SceneGraph(), (s) => {
    state = s;
  });
  const pages = state.pages ?? [];
  const ordered = [
    ...pages.filter((p) => p.id === state.activePageId),
    ...pages.filter((p) => p.id !== state.activePageId),
  ];
  const symbols = state.symbols ?? [];

  for (const page of ordered) {
    const sceneGraph = new SceneGraph();
    sceneGraph.fromJSON(page.sceneGraphJSON);
    const region = findThumbnailRegion(sceneGraph, symbols);
    if (region) {
      return {
        sceneGraph,
        region,
        timeline: page.timeline ?? createTimeline(),
        videos: state.videos ?? [],
        symbols,
        ikChains: state.ikChains ?? [],
        smartBoneActions: state.smartBoneActions ?? [],
        frameRate: state.frameRate ?? 30,
        background: state.documentBackground ?? DEFAULT_DOCUMENT_BACKGROUND,
      };
    }
  }
  return null;
}

// ============================================================================
// Rendering
// ============================================================================

/** A still, loaded as a picture; null when it won't load. */
function loadStill(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/**
 * The picture each video layer drawn is shown with: its strip's still
 * nearest the moment the canvas shows of it as the project opens — of the
 * timeline it opens on, the first frame's (nothing outside its clip); of
 * another, its clip's first. By layer id.
 */
async function videoStillPictures(
  scene: ThumbnailScene,
  roots: Node[]
): Promise<Map<string, HTMLImageElement>> {
  const { sceneGraph, timeline } = scene;
  const scope = openingScope(sceneGraph, timeline);
  const moments = videoMoments(
    roots,
    (id) => sceneGraph.getNode(id),
    (node) =>
      timelineScopeOf(sceneGraph, node.id) === scope
        ? videoTimeAt(node.clip, 0, scene.frameRate)
        : videoPosterTime(node.clip)
  );
  const pictures = new Map<string, HTMLImageElement>();
  await Promise.all(
    moments.map(async ({ nodeId, videoId, seconds }) => {
      const strip = scene.videos.find((video) => video.id === videoId)?.strip;
      const src = stripStillAt(strip, seconds);
      const picture = src ? await loadStill(src) : null;
      if (picture) pictures.set(nodeId, picture);
    })
  );
  return pictures;
}

/**
 * Render a stored project (binary or legacy JSON) as a PNG thumbnail. The
 * scene is drawn as it was saved, posed by its IK and Smart Bones as the
 * editor shows it when not playing. Resolves null for a project with nothing
 * to show; rejects when the project can't be read or drawn.
 */
export async function renderProjectThumbnail(
  data: string | ArrayBuffer
): Promise<ProjectThumbnail | null> {
  const project = parseQuarFile(data) as unknown as ProjectData;
  const scene = pickThumbnailScene(project);
  if (!scene) return null;
  // Text falls back to Inter, which may still be loading at startup; text
  // set in it is in its own weights
  const weights = bundledWeightsUsed(scene.sceneGraph.getNodes(), scene.symbols);
  await loadBundledFonts([400, 700, ...weights]).catch(() => undefined);

  const { sceneGraph, region } = scene;
  const size = thumbnailPixelSize(region.bounds);
  const renderer = createFrameRenderer(size);
  try {
    const roots = region.rootIds
      ? region.rootIds.flatMap((id) => sceneGraph.getNode(id) ?? [])
      : sceneGraph.getRootNodes();
    await renderer.preloadTextures(roots, sceneGraph, scene.symbols);
    const stills = await videoStillPictures(scene, roots);
    const png = await renderer.renderFrameAsBlob(
      {
        sceneGraph,
        // No keyframes: the saved scene is drawn as it is
        timeline: createTimeline(),
        rig: {
          ikChains: scene.ikChains,
          smartBoneActions: scene.smartBoneActions,
          frameRate: scene.frameRate,
        },
        exportRootIds: region.rootIds,
        viewportBounds: region.bounds,
        symbols: scene.symbols,
        videoFrames: (node) => {
          const still = stills.get(node.id);
          return still ? { source: still, key: still.src } : null;
        },
      },
      0
    );
    if (!png) throw new Error('Could not encode the thumbnail');
    return { kind: region.kind, png, background: scene.background };
  } finally {
    renderer.dispose();
  }
}
