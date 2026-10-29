/**
 * Videos brought into the document, from File › Import Video… or dropped
 * on the canvas or the timeline: each checked (its size, its format, that
 * this browser decodes it), its frame strip made and its sound copied out,
 * then its layer placed — fitted to the artboard in view, its clip from the
 * playhead, its sound linked on the same timeline — as one undo step.
 */

import type { SceneGraph } from '@quar/core';
// The decoder behind these (mediabunny) loads with the first video read
import { extractVideoSound, makeVideoStrip, probeVideo } from '@quar/export';
import type { VideoProblem } from '@quar/export';
import type { Sound, Video } from '@quar/types';

import { useEditorStore } from '../stores/editorStore';
import { placeVideoLayer } from '../stores/videoPlacement';
import { toast } from '../components/common/Toast';
import { soundFromDecoded } from './soundFiles';
import { setVideoFile } from './videoFiles';

/** The largest video file taken: the project keeps the whole file. */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

/** What a video file is, by its name, when the system doesn't say. */
const TYPES_BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

/** Whether a file is a video: its type says so, or (untyped) its name does. */
export function isVideoFile(file: File): boolean {
  if (file.type) return file.type.startsWith('video/');
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  return extension !== undefined && extension in TYPES_BY_EXTENSION;
}

/** What the file picker offers. */
export const VIDEO_FILE_TYPES = [
  ...new Set(Object.values(TYPES_BY_EXTENSION)),
  ...Object.keys(TYPES_BY_EXTENSION).map((extension) => `.${extension}`),
].join(',');

/** Asks for video files (any number), then hands over those chosen. */
export function chooseVideoFiles(onChosen: (files: File[]) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = VIDEO_FILE_TYPES;
  input.multiple = true;
  input.onchange = () => {
    const files = Array.from(input.files ?? []);
    if (files.length > 0) onChosen(files);
  };
  input.click();
}

/** What to try instead, for each reason a file is turned away. */
const SUGGESTIONS: Record<VideoProblem, string> = {
  'not-a-video': 'Try an MP4 (H.264) file.',
  'no-video-track': 'File › Import Sound takes its sound.',
  undecodable: 'Try an MP4 (H.264) file, or another browser.',
};

/** "2 s", "12.5 s". */
function seconds(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} s`;
}

/** A video file read and placed at `frame` (the playhead's by default); false where it couldn't be. */
async function importVideoFile(
  sceneGraph: SceneGraph,
  file: File,
  frame: number | undefined
): Promise<boolean> {
  const label = `“${file.name}”`;
  if (file.size > MAX_VIDEO_BYTES) {
    toast.error(`${label} is too large: a video can be up to 100 MB.`);
    return false;
  }
  const progress = toast.progress(`Importing ${label}…`);
  try {
    const probe = await probeVideo(file);
    if (!probe.ok) {
      toast.error(`${label} can’t be imported. ${probe.reason} ${SUGGESTIONS[probe.problem]}`);
      return false;
    }
    const { info } = probe;
    // The file's type as its buffer will be kept, and checked when it's read back
    const mimeType = info.mimeType.toLowerCase();
    const strip = await makeVideoStrip(file, info, (done) =>
      progress.update(`Importing ${label}: frames ${Math.round(done * 100)}%`)
    );
    progress.update(`Importing ${label}: its sound…`);
    const name = file.name.replace(/\.[^.]+$/, '') || 'Video';
    let sound: Sound | null = null;
    let soundUnplayable = false;
    try {
      const extracted = await extractVideoSound(file);
      if (extracted) sound = await soundFromDecoded(name, extracted.file, extracted.audio);
    } catch {
      soundUnplayable = true;
    }

    const video: Video = {
      id: `video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      mimeType,
      byteLength: file.size,
      width: info.width,
      height: info.height,
      duration: info.duration,
      frameRate: info.frameRate,
      hasAlpha: info.hasAlpha,
      strip,
    };
    // Kept typed as what it is, whatever the system called it
    setVideoFile(video.id, file.type === mimeType ? file : new Blob([file], { type: mimeType }));
    const store = useEditorStore.getState();
    store.addVideo(video);
    const before = store.timelineDuration;
    placeVideoLayer(sceneGraph, video, sound, frame);

    // Where it can be seen
    const shown = useEditorStore.getState();
    if (!shown.timelineExpanded) shown.setTimelineExpanded(true);
    if (shown.timelineViewMode !== 'dopeSheet') shown.setTimelineViewMode('dopeSheet');
    const { timelineDuration, frameRate } = useEditorStore.getState();
    const added = `Added “${name}” (${seconds(info.duration)})${sound ? ' with its sound' : ''}`;
    toast.success(
      timelineDuration > before
        ? `${added}; the timeline now runs ${seconds(timelineDuration / frameRate)} to play it through`
        : added
    );
    if (soundUnplayable) {
      toast.info(`“${name}” came in without its sound: this browser can’t play it.`);
    }
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'It couldn’t be read.';
    toast.error(`${label} can’t be imported. ${reason}`);
    return false;
  } finally {
    progress.done();
  }
}

/**
 * Each video file, read and put on the canvas, its clip starting on
 * `frame` (the playhead's by default), one after another.
 */
export async function importVideoFiles(
  sceneGraph: SceneGraph,
  files: readonly File[],
  frame?: number
): Promise<void> {
  // A symbol has no timeline for a video's clip to play on
  if (useEditorStore.getState().editingSymbolId) {
    toast.error(
      'Videos can’t be imported while a symbol is edited: symbols can’t hold videos yet.'
    );
    return;
  }
  for (const file of files) await importVideoFile(sceneGraph, file, frame);
}
