/**
 * Video data from outside the editor — a file — read as the editor can use
 * it: what's malformed is left out, and a video layer whose clip a file got
 * wrong is mended to show nothing rather than trip whatever draws it.
 */

import type { Node, Video, VideoClip, VideoStrip } from '@quar/types';

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isPositive = (value: unknown): value is number => isNumber(value) && value > 0;

/** The stills of a strip, or none when any of them isn't a picture (each has its moment). */
function readStrip(strip: unknown): VideoStrip {
  const parts = (strip ?? {}) as Partial<Record<keyof VideoStrip, unknown>>;
  const frames = Array.isArray(parts.frames) ? (parts.frames as unknown[]) : [];
  const pictures = frames.every(
    (frame) => typeof frame === 'string' && frame.startsWith('data:image/')
  );
  return {
    rate: isPositive(parts.rate) ? parts.rate : 4,
    height: isPositive(parts.height) ? parts.height : 0,
    frames: pictures ? (frames as string[]) : [],
  };
}

/**
 * The usable videos of a library — each with a picture size and a length —
 * and the files a .quar held for them: a file whose type isn't its video's
 * (a buffer some other tool renumbered) is left out, the video kept.
 */
export function readVideos(videos: unknown): { videos: Video[]; files: Map<string, Blob> } {
  const read: Video[] = [];
  const files = new Map<string, Blob>();
  if (!Array.isArray(videos)) return { videos: read, files };
  for (const entry of videos as Array<Partial<Record<keyof Video | 'file', unknown>> | null>) {
    if (!entry || typeof entry.id !== 'string' || !entry.id) continue;
    if (typeof entry.mimeType !== 'string' || !entry.mimeType) continue;
    if (!isPositive(entry.width) || !isPositive(entry.height) || !isPositive(entry.duration)) {
      continue;
    }
    if (read.some((video) => video.id === entry.id)) continue;
    const file =
      entry.file instanceof Blob && entry.file.type === entry.mimeType.toLowerCase()
        ? entry.file
        : undefined;
    read.push({
      id: entry.id,
      name: typeof entry.name === 'string' ? entry.name : 'Video',
      mimeType: entry.mimeType,
      byteLength:
        isNumber(entry.byteLength) && entry.byteLength >= 0 ? entry.byteLength : (file?.size ?? 0),
      width: entry.width,
      height: entry.height,
      duration: entry.duration,
      frameRate: isPositive(entry.frameRate) ? entry.frameRate : 30,
      hasAlpha: entry.hasAlpha === true,
      strip: readStrip(entry.strip),
    });
    if (file) files.set(entry.id, file);
  }
  return { videos: read, files };
}

/** The files a project file read holds for its videos, by video id (the browser's storage keeps them apart). */
export function videoFilesIn(project: object): Map<string, Blob> {
  return readVideos('videos' in project ? project.videos : undefined).files;
}

/** A clip as the timing can use it: a whole start frame, a place in the video and a length (none: it shows nothing). */
export function readVideoClip(clip: unknown): VideoClip {
  const parts = (clip && typeof clip === 'object' ? clip : {}) as Partial<
    Record<keyof VideoClip, unknown>
  >;
  return {
    ...parts,
    start: isNumber(parts.start) ? Math.max(0, Math.round(parts.start)) : 0,
    offset: isNumber(parts.offset) ? Math.max(0, parts.offset) : 0,
    duration: isNumber(parts.duration) ? Math.max(0, parts.duration) : 0,
  };
}

/** Mend, in place, the video layers among `nodes` a file got wrong: the video they name, their clip. */
export function mendVideoNodes(nodes: Node[]): void {
  for (const node of nodes) {
    if (node.type !== 'video') continue;
    if (typeof node.videoId !== 'string') node.videoId = '';
    node.clip = readVideoClip(node.clip);
  }
}
