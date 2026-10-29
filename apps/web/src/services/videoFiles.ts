/**
 * Video Files
 * The files of the document's videos, kept as Blobs beside the store, whose
 * `videos` hold what's known about each (the part a .quar's JSON keeps). The
 * decoder reads them, .quar files and the browser's storage write them as
 * buffers and records of their own; they're never copied into undo steps,
 * the JSON or the system clipboard.
 */

const files = new Map<string, Blob>();
const letGo = new Set<(videoId: string) => void>();

/** Keep a video's file (an import, or a project opened). */
export function setVideoFile(videoId: string, file: Blob): void {
  files.set(videoId, file);
}

/** A video's file, while the document has it. */
export function videoFile(videoId: string): Blob | undefined {
  return files.get(videoId);
}

/** Let go of the files no video in `keep` uses (a project closed, the library pruned). */
export function keepVideoFiles(keep: ReadonlySet<string>): void {
  for (const id of [...files.keys()]) {
    if (keep.has(id)) continue;
    files.delete(id);
    for (const listener of letGo) listener(id);
  }
}

/** Hears each video whose file is let go (its decoding can stop); returns how to stop hearing. */
export function onVideoFileLetGo(listener: (videoId: string) => void): () => void {
  letGo.add(listener);
  return () => letGo.delete(listener);
}
