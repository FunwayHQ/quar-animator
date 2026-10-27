/**
 * What an export is of, and how it's posed — shared by the Export dialog
 * and every other way the editor's exports run (the cloud server renders
 * and exports with this same code), so they frame, pose and scope a scene
 * the same way.
 */

import { SelectionManager, artboardsInOrder, inTimelineScope, widenToAspect } from '@quar/core';
import type { SceneGraph } from '@quar/core';
import { scopeDuration, scopedTimeline } from '@quar/animation';
import type {
  DynamicChain,
  IKChain,
  Node,
  RectangleNode,
  SmartBoneAction,
  SymbolDefinition,
  Timeline,
  WindSettings,
} from '@quar/types';
import { getAnimatedArtworkBounds, sampleFrames } from '@quar/export';
import type { FrameRenderContext, FrameRig, FrameSlide } from '@quar/export';

/**
 * The artboard an export is of: the one selected — or, with nothing
 * selected, the page's only artboard (`implicit`). Null otherwise: the
 * export frames everything on the page.
 */
export function getArtboardScope(sceneGraph: SceneGraph, selectedIds: Set<string>) {
  let node = null;
  let implicit = false;
  if (selectedIds.size === 1) {
    const [selectedId] = selectedIds;
    const selected = selectedId ? sceneGraph.getNode(selectedId) : undefined;
    if (selected?.type === 'artboard') node = selected;
  } else if (selectedIds.size === 0) {
    const boards = sceneGraph
      .getRootNodes()
      .filter((root) => root.type === 'artboard' && root.visible);
    if (boards.length === 1) {
      node = boards[0]!;
      implicit = true;
    }
  }
  if (!node || node.type !== 'artboard') return null;

  const bounds = new SelectionManager().getSelectionBounds(new Set([node.id]), sceneGraph)?.rect;
  return bounds ? { node, bounds, implicit } : null;
}

/**
 * The page's slides: its visible artboards, in the Layers panel's order
 * (the topmost first), each with its bounds and its own timeline's length.
 */
export function getSlides(sceneGraph: SceneGraph, timeline: Timeline) {
  const bounds = new SelectionManager();
  return artboardsInOrder(sceneGraph)
    .filter((node) => node.visible)
    .flatMap((node) => {
      const rect = bounds.getSelectionBounds(new Set([node.id]), sceneGraph)?.rect;
      return rect ? [{ node, bounds: rect, frameCount: scopeDuration(timeline, node.id) }] : [];
    });
}

/**
 * The slides of a slides export, each its artboard over its own timeline,
 * fitted (centred, not stretched) into the export's `width` × `height`: the
 * first slide's size, unless changed.
 */
export function slideShow(
  slides: ReturnType<typeof getSlides>,
  base: Pick<FrameRenderContext, 'sceneGraph' | 'timeline' | 'rig' | 'symbols'>,
  width: number,
  height: number
): FrameSlide[] {
  return slides.map((slide) => ({
    ctx: {
      ...base,
      timeline: scopedTimeline(
        base.timeline,
        slide.node.id,
        inTimelineScope(base.sceneGraph, slide.node.id)
      ),
      exportRootIds: [slide.node.id],
      viewportBounds: widenToAspect(slide.bounds, width / height),
    },
    frameCount: slide.frameCount,
  }));
}

/** Exports are at most this many pixels a side. */
const MAX_EXPORT_SIZE = 8192;

/** The size an export starts at: the region's own, scaled down to fit if it's huge. */
export function defaultExportSize(region: { width: number; height: number } | null) {
  if (!region || !(region.width > 0) || !(region.height > 0)) return { width: 800, height: 600 };
  const scale = Math.min(1, MAX_EXPORT_SIZE / Math.max(region.width, region.height));
  return {
    width: Math.max(1, Math.ceil(region.width * scale)),
    height: Math.max(1, Math.ceil(region.height * scale)),
  };
}

/** The rig settings a project keeps beside its pages. */
export interface ExportRigging {
  ikChains?: IKChain[];
  dynamicChains?: DynamicChain[];
  smartBoneActions?: SmartBoneAction[];
  globalWind?: WindSettings;
}

/** The page's rig, as exports pose it on top of the keyframes. */
export function exportRig(rigging: ExportRigging, frameRate: number): FrameRig {
  return {
    ikChains: rigging.ikChains,
    dynamicChains: rigging.dynamicChains,
    smartBoneActions: rigging.smartBoneActions,
    wind: rigging.globalWind,
    frameRate,
  };
}

/**
 * The region an export frames: the artboard it's of (see getArtboardScope),
 * or — with none — all the artwork wherever it moves over the timeline, the
 * rig's motion (IK, physics, bent shapes) included. Null for an empty page.
 */
export function getSceneExportScope(
  sceneGraph: SceneGraph,
  timeline: Timeline,
  symbols: SymbolDefinition[],
  durationFrames: number,
  rig: FrameRig
) {
  return getAnimatedArtworkBounds(
    sceneGraph,
    timeline,
    symbols,
    sampleFrames(0, Math.max(0, durationFrames - 1)),
    rig
  );
}

/**
 * What a Lottie export of an artboard is made from: its children moved and
 * scaled into the output's frame (Lottie's origin is its top-left), its
 * fill as a full-frame background, and their tracks re-expressed to match.
 * The whole page as it is without an artboard.
 */
export function getLottieExportScene(
  sceneGraph: SceneGraph,
  timeline: Timeline,
  artboardScope: ReturnType<typeof getArtboardScope>,
  outputWidth: number,
  outputHeight: number
): { nodes: Node[]; timeline: Timeline } {
  if (!artboardScope) return { nodes: sceneGraph.getRootNodes(), timeline };

  const scaleX = outputWidth / artboardScope.bounds.width;
  const scaleY = outputHeight / artboardScope.bounds.height;
  const rootIds = new Set(artboardScope.node.children);
  const nodes: Node[] = artboardScope.node.children.flatMap((id) => {
    const node = sceneGraph.getNode(id);
    if (!node) return [];

    return [
      {
        ...node,
        transform: {
          ...node.transform,
          position: {
            x: (node.transform.position.x + artboardScope.bounds.width / 2) * scaleX,
            y: (node.transform.position.y + artboardScope.bounds.height / 2) * scaleY,
          },
          scale: {
            x: node.transform.scale.x * scaleX,
            y: node.transform.scale.y * scaleY,
          },
        },
      },
    ];
  });

  // The artboard's own fill, as a full-frame background under its children
  const artboard = artboardScope.node;
  const backgroundId = `${artboard.id}:background`;
  if (artboard.fills.some((fill) => fill.visible)) {
    const background: RectangleNode = {
      id: backgroundId,
      type: 'rectangle',
      name: 'Background',
      parent: null,
      children: [],
      transform: {
        position: { x: outputWidth / 2, y: outputHeight / 2 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        anchor: { x: 0.5, y: 0.5 },
        skew: { x: 0, y: 0 },
      },
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      width: outputWidth,
      height: outputHeight,
      cornerRadius: [0, 0, 0, 0],
      fills: artboard.fills,
      strokes: [],
    };
    nodes.unshift(background);
  }

  const tracks = timeline.tracks.map((track) => {
    if (track.nodeId === artboard.id && track.property.startsWith('fills.')) {
      return { ...track, nodeId: backgroundId };
    }
    if (!rootIds.has(track.nodeId)) return track;

    const coordinate =
      track.property === 'transform.position.x'
        ? (value: number) => (value + artboardScope.bounds.width / 2) * scaleX
        : track.property === 'transform.position.y'
          ? (value: number) => (value + artboardScope.bounds.height / 2) * scaleY
          : track.property === 'transform.scale.x'
            ? (value: number) => value * scaleX
            : track.property === 'transform.scale.y'
              ? (value: number) => value * scaleY
              : null;

    if (!coordinate) return track;
    return {
      ...track,
      keyframes: track.keyframes.map((keyframe) => ({
        ...keyframe,
        value: typeof keyframe.value === 'number' ? coordinate(keyframe.value) : keyframe.value,
      })),
    };
  });

  return { nodes, timeline: { ...timeline, tracks } };
}
