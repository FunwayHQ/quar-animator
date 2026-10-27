/**
 * Image Sources
 * Where a picture in a document may come from.
 */

/**
 * Whether a picture's source is the document's own: a data URL, as every
 * import, paste and drop makes, or an object URL. One pointing anywhere else
 * would be fetched by everyone who opens the project, telling that server who
 * did and when: it isn't loaded, nor written out.
 */
export function isDocumentImage(src: string): boolean {
  return /^(data:image\/|blob:)/i.test(src);
}
