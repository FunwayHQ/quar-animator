/**
 * Reading video files with mediabunny (the export's muxer, which demuxes
 * and decodes too), loaded only when a video is first read: it isn't part
 * of the editor's first load.
 */

import type { Input, InputVideoTrack } from 'mediabunny';

export type Mediabunny = typeof import('mediabunny');

export function loadMediabunny(): Promise<Mediabunny> {
  return import('mediabunny');
}

/** A video file opened for reading (any container mediabunny knows); dispose it when done. */
export async function openMedia(file: Blob): Promise<{ mb: Mediabunny; input: Input }> {
  const mb = await loadMediabunny();
  return { mb, input: new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS }) };
}

/** A file's video track, or an error saying there's none (a file that was probed has one). */
export async function videoTrackOf(input: Input): Promise<InputVideoTrack> {
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('The file has no video track.');
  return track;
}
