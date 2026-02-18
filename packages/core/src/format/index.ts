/**
 * .quar Binary File Format
 *
 * Public API for reading/writing .quar files.
 */

export {
  encodeQuarBinary,
  decodeQuarBinary,
  extractImageBuffers,
  restoreImageBuffers,
  isQuarBinary,
  QUAR_MAGIC,
  FORMAT_VERSION,
} from './quarFormat';

export type { QuarBuffer, QuarFile } from './quarFormat';

export {
  parseQuarFile,
  writeQuarFile,
  migrateV1ToV2,
  migrateV2ToV3,
  migrateToLatest,
} from './quarMigration';
