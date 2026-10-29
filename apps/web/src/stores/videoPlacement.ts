/**
 * Placing an imported video: its layer fitted to the artboard in view (or,
 * outside every artboard, the canvas view) and centred, its clip from the
 * playhead for the whole video, and its sound on the same timeline as a
 * clip linked to the layer — all one undo step, the timeline lengthened to
 * play it through.
 */

import { SelectionManager, artboardAt, createDefaultTransform } from '@quar/core';
import type { SceneGraph } from '@quar/core';
import { generateId, scopeSounds, videoClipEndFrame, withScopeSounds } from '@quar/animation';
import type { Node, Rect, Sound, SoundClip, Video, VideoNode } from '@quar/types';

import { useEditorStore } from './editorStore';
import { canvasViewBounds, canvasViewCenter } from '../services/canvasView';

/** How much of the canvas view a video placed outside every artboard fills, at most */
const VIEW_FILL = 0.8;

/**
 * The artboard in view: the one whose timeline is shown, else the one the
 * canvas is looking at (its middle); none outside every artboard.
 */
function artboardInView(sceneGraph: SceneGraph): Node | undefined {
  const { timelineScope } = useEditorStore.getState();
  const shown = timelineScope ? sceneGraph.getNode(timelineScope) : undefined;
  if (shown?.type === 'artboard' && shown.visible && !shown.parent) return shown;
  const middle = canvasViewCenter();
  return middle ? artboardAt(sceneGraph, middle) : undefined;
}

/** The box a video is fitted into, on the canvas; null to keep its own size at the origin. */
function placeFor(sceneGraph: SceneGraph, artboard: Node | undefined): Rect | null {
  if (artboard) {
    const box = new SelectionManager().getSelectionBounds(new Set([artboard.id]), sceneGraph);
    if (box) return box.rect;
  }
  const view = canvasViewBounds();
  if (!view) return null;
  const width = view.width * VIEW_FILL;
  const height = view.height * VIEW_FILL;
  return {
    x: view.x + (view.width - width) / 2,
    y: view.y + (view.height - height) / 2,
    width,
    height,
  };
}

/**
 * Put a video of the library on the canvas, its clip starting on `frame`
 * (the playhead's by default), and its sound, if it has one, on the same
 * timeline linked to it (the sound added to the library if it's new). One
 * undo step; the layer is selected. Returns the layer's id.
 */
export function placeVideoLayer(
  sceneGraph: SceneGraph,
  video: Video,
  sound: Sound | null,
  frame?: number
): string {
  const artboard = artboardInView(sceneGraph);
  // The timeline the layer plays on is the one in view (its artboard's, or the page's)
  const scope = artboard?.id ?? null;
  if (useEditorStore.getState().timelineScope !== scope) {
    useEditorStore.getState().setTimelineScope(scope);
  }
  const state = useEditorStore.getState();
  state.pushUndo(sceneGraph);

  const box = placeFor(sceneGraph, artboard);
  const scale = box ? Math.min(box.width / video.width, box.height / video.height) : 1;
  const id = generateId('video');
  const node: VideoNode = {
    id,
    name: video.name,
    type: 'video',
    parent: null,
    children: [],
    transform: {
      ...createDefaultTransform(),
      position: box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : { x: 0, y: 0 },
      anchor: { x: 0.5, y: 0.5 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    videoId: video.id,
    width: video.width * scale,
    height: video.height * scale,
    naturalWidth: video.width,
    naturalHeight: video.height,
    cornerRadius: [0, 0, 0, 0],
    clip: {
      start: Math.max(0, Math.round(frame ?? state.currentFrame)),
      offset: 0,
      duration: video.duration,
    },
  };
  sceneGraph.addNode(node);
  if (artboard) state.moveNodeKeepingPlacement(sceneGraph, id, artboard.id);

  // Its sound, where its clip is, moving with it until it's unlinked
  const soundClip: SoundClip | null = sound
    ? {
        id: generateId('sound'),
        soundId: sound.id,
        start: node.clip.start,
        offset: node.clip.offset,
        duration: node.clip.duration,
        gain: 1,
        linkedTo: id,
      }
    : null;
  const { timeline, sounds } = useEditorStore.getState();
  useEditorStore.setState({
    timeline: soundClip
      ? withScopeSounds(timeline, scope, [...scopeSounds(timeline, scope), soundClip])
      : timeline,
    sounds: sound && !sounds.some((known) => known.id === sound.id) ? [...sounds, sound] : sounds,
    selectedNodeIds: new Set([id]),
    selectedSoundClipId: null,
    selectedKeyframeIds: new Set<string>(),
    isDirty: true,
  });

  // Long enough to play it to its end
  const needed = Math.ceil(videoClipEndFrame(node.clip, timeline.frameRate) - 1e-6);
  if (needed > useEditorStore.getState().timelineDuration) {
    useEditorStore.getState().setTimelineDuration(needed);
  }
  return id;
}
