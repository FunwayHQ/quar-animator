/**
 * Project Thumbnails for Quar Animator
 * Renders a small picture of a saved project for the Projects page: its first
 * artboard, or when it has none, the area its artwork covers.
 */

import type { Color, Rect, SymbolDefinition, IKChain, SmartBoneAction } from '@quar/types';
import {
  DEFAULT_DOCUMENT_BACKGROUND,
  SceneGraph,
  SelectionManager,
  parseQuarFile,
} from '@quar/core';
import { createTimeline } from '@quar/animation';
import { createFrameRenderer } from '@quar/export';
import { deserializeProject } from './projectSerializer';
import type { EditorStateSnapshot, ProjectData } from './projectSerializer';
import { loadBundledFonts } from './bundledFonts';

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

  // Leaves only: a group's bounds would take in the bones inside it
  const artworkIds = new Set<string>();
  let strokePadding = 0;
  sceneGraph.traverseVisible((node) => {
    // Faded out entirely, so nothing below it shows either
    if (node.opacity <= 0) return false;
    if (node.type === 'group' || node.type === 'bone') return true;
    artworkIds.add(node.id);
    if ('strokes' in node && Array.isArray(node.strokes)) {
      for (const stroke of node.strokes) {
        if (stroke.visible && stroke.width > 0) {
          strokePadding = Math.max(strokePadding, stroke.width / 2);
        }
      }
    }
    return true;
  });
  const content = selection.getSelectionBounds(artworkIds, sceneGraph)?.rect;
  if (!content || !isFiniteRect(content)) return null;

  const padding = Math.max(content.width, content.height, 1) * CONTENT_PADDING + strokePadding;
  return {
    kind: 'content',
    bounds: widenToAspect(
      {
        x: content.x - padding,
        y: content.y - padding,
        width: content.width + padding * 2,
        height: content.height + padding * 2,
      },
      THUMBNAIL_MAX_WIDTH / THUMBNAIL_MAX_HEIGHT
    ),
  };
}

function isFiniteRect(r: Rect): boolean {
  return [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width >= 0 && r.height >= 0;
}

/** Grow the shorter side of a rectangle, about its center, to the given width/height ratio. */
function widenToAspect(r: Rect, aspect: number): Rect {
  if (r.width / r.height < aspect) {
    const width = r.height * aspect;
    return { x: r.x - (width - r.width) / 2, y: r.y, width, height: r.height };
  }
  const height = r.width / aspect;
  return { x: r.x, y: r.y - (height - r.height) / 2, width: r.width, height };
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
  // Text falls back to Inter, which may still be loading at startup
  await loadBundledFonts().catch(() => undefined);

  const scene = pickThumbnailScene(project);
  if (!scene) return null;

  const { sceneGraph, region } = scene;
  const size = thumbnailPixelSize(region.bounds);
  const renderer = createFrameRenderer(size);
  try {
    const roots = region.rootIds
      ? region.rootIds.flatMap((id) => sceneGraph.getNode(id) ?? [])
      : sceneGraph.getRootNodes();
    await renderer.preloadTextures(roots, sceneGraph);
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
      },
      0
    );
    if (!png) throw new Error('Could not encode the thumbnail');
    return { kind: region.kind, png, background: scene.background };
  } finally {
    renderer.dispose();
  }
}
