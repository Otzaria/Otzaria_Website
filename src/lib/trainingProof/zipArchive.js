import { unzipSync } from 'fflate';

// Limits are evaluated from the ZIP central directory by fflate's filter before
// any entry is inflated. This prevents a small compressed upload from allocating
// an unbounded amount of memory.
export const MAX_UNZIPPED_BYTES = 256 * 1024 * 1024;
export const MAX_ZIP_ENTRY_BYTES = 32 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 7000;

export function unzipTrainingZip(
  bytes,
  { maxBytes = MAX_UNZIPPED_BYTES, maxEntryBytes = MAX_ZIP_ENTRY_BYTES, maxEntries = MAX_ZIP_ENTRIES, include = null } = {}
) {
  let total = 0;
  let count = 0;
  return unzipSync(bytes, {
    filter(file) {
      count += 1;
      if (count > maxEntries) throw new Error(`בקובץ יש יותר מדי קבצים (מעל ${maxEntries})`);
      if (!Number.isSafeInteger(file.originalSize) || file.originalSize < 0 || file.originalSize > maxEntryBytes) {
        throw new Error(`קובץ מחולץ גדול מדי: ${file.name}`);
      }
      total += file.originalSize;
      if (!Number.isSafeInteger(total) || total > maxBytes) throw new Error('ה-ZIP גדול מדי לאחר חילוץ');
      return include ? include(file) : true;
    },
  });
}
