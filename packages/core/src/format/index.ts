/**
 * .quar Binary File Format
 *
 * Public API for reading/writing .quar files.
 */

export {
  encodeQuarBinary,
  encodeQuarBlob,
  decodeQuarBinary,
  extractImageBuffers,
  extractImageAndFileBuffers,
  restoreImageBuffers,
  isQuarBinary,
  QUAR_MAGIC,
  FORMAT_VERSION,
} from './quarFormat';

export type { QuarBuffer, QuarBlobBuffer, QuarFile } from './quarFormat';

export {
  parseQuarFile,
  writeQuarFile,
  writeQuarBlob,
  migrateV1ToV2,
  migrateV2ToV3,
  migrateToLatest,
} from './quarMigration';
