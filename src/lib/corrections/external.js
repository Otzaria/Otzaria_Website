/**
 * טיפול חיצוני בספרי ספריא (CONTRACT §1.4). הספרים נבנים בגנרטור מארכיון
 * SefariaExport, ולכן אין יעד GitHub — נשמרת רק חבילת איתור לייצוא ידני.
 */
import { sha256Hex } from './ocj1.js';
import { computeNewLine } from './payload.js';

export const EXTERNAL_TARGET = 'sefaria_generator';
export const EXTERNAL_PACKAGE_KIND = 'otzaria.external_locator';
export const EXTERNAL_PACKAGE_VERSION = 1;

/**
 * הפונקציה היחידה שמפיקה את החבילה החיצונית. פורמט הקובץ שהגנרטור יקלוט טרם
 * נקבע; החלפת הפורמט בעתיד נעשית כאן בלבד (generator_format נשאר null עד אז).
 * original_line הוא הנוסח ב-DB אחרי ניקוי הגנרטור — לא בהכרח זהה לגולמי בארכיון.
 */
export function buildExternalSefariaPackage(report) {
  const rev = Array.isArray(report.proposals) && report.proposals.length
    ? report.proposals.find((p) => p.revision === report.currentRevision) || report.proposals[report.proposals.length - 1]
    : null;
  const originalLine = rev ? rev.originalLine : null;
  return {
    package_kind: EXTERNAL_PACKAGE_KIND,
    package_version: EXTERNAL_PACKAGE_VERSION,
    external_target: EXTERNAL_TARGET,
    generator_format: null,
    report_id: String(report._id),
    client_report_id: report.reportId,
    book_title: report.bookTitle ?? null,
    he_ref: report.currentRef ?? null,
    he_ref_stable: false,
    db_line_index: report.location?.lineIndex ?? null,
    library_version: report.location?.libraryBuildId ?? report.libraryVersion ?? null,
    original_line: originalLine,
    original_line_sha256: typeof originalLine === 'string' ? sha256Hex(originalLine) : null,
    original_selection: rev ? rev.originalSelection ?? null : null,
    selection_offset: rev?.selectionOffset ? { unit: rev.selectionOffset.unit, start: rev.selectionOffset.start, end: rev.selectionOffset.end } : null,
    new_line: rev ? computeNewLine(rev) : null,
    proposal_revision: rev ? rev.revision : null,
  };
}
