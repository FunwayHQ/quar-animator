/**
 * SVG export of one frame
 *
 * The scene as it is at a frame — keyframes, IK and physics, and shapes
 * bent by their bones, written as paths of their bent outlines — as SVG.
 * SVG can't skin or warp, so bound images are drawn unbent; nor play
 * video, so a video layer is a picture of its still at that frame.
 */

import type { SceneGraph } from '@quar/core';
import { exportNodesToSvg, type SvgExportFrame } from '@quar/core';
import type { SymbolDefinition, Timeline } from '@quar/types';
import type { FrameRig } from './frameRenderer';
import { poseFrame } from './posedFrame';
import { drawVideoStills, type VideoStills } from './videoStills';

export interface SvgFrameOptions {
  frame: number;
  /** Only these layers and what's in them (an artboard); else everything on the page */
  rootIds?: string[];
  /** Definitions symbol instances are drawn from */
  symbols?: SymbolDefinition[];
  /** The page rectangle to show (Y up), in place of the posed art's own bounds */
  viewport?: SvgExportFrame['viewport'];
  /** A color behind everything (the document background) */
  background?: SvgExportFrame['background'];
  /** Video layers' stills at the frame (videoMomentsAtFrame), by layer id; without, they're left out */
  videoStills?: VideoStills;
}

export function exportSvgFrame(
  scene: SceneGraph,
  timeline: Timeline,
  rig: FrameRig | undefined,
  options: SvgFrameOptions
): string {
  const posed = poseFrame(scene, timeline, rig, options.frame);
  if (options.videoStills) drawVideoStills(posed, options.videoStills);
  const roots = options.rootIds
    ? options.rootIds.flatMap((id) => posed.getNode(id) ?? [])
    : posed.getRootNodes();
  return exportNodesToSvg(roots, posed, options.symbols, {
    viewport: options.viewport,
    background: options.background,
  });
}
