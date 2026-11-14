// צורת התשובה של GET /api/page-content/ocr-data (נתוני OCR מקומי לעמוד: layout, metadata,
// אזהרות, בדיקת התמונה) — מודול טהור, imports יחסיים בלבד (נבדק ב-node:test).
import { ocrWarningLabel } from './ocrWarningLabels.js';
import { PENDING_CONFLICT_STATUSES } from './ocrConflictView.js';

export const OCR_DATA_STATES = Object.freeze(['current', 'pending_conflict', 'pending_cancelled', 'history']);

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/** הרשומה היא הנוכחית של העמוד: ה-job וה-resultSha256 שלה הם סימון ה-OCR האחרון שנכתב לעמוד */
export function isCurrentRecord(record, page) {
  return sameId(record?.job, page?.lastOcrJobId)
    && typeof record?.resultSha256 === 'string'
    && record.resultSha256 === page?.lastOcrResultSha256;
}

/**
 * מצב הרשומה ביחס לעמוד:
 *   current           — הטקסט של הרשומה הוא זה שנכתב לעמוד לאחרונה (החלה או אימוץ התנגשות)
 *   pending_conflict  — ממתינה להחלטת מנהל: העמוד נערך אחרי יצירת העבודה (page_changed)
 *   pending_cancelled — ממתינה להחלטת מנהל: העבודה בוטלה (job_cancelled)
 *   history           — כל השאר (עבודה ישנה, התנגשות שנדחתה, עמוד שנכתב אחר כך שוב)
 * @param {any} record OcrPageResult (lean)
 * @param {any} page Page (lean: lastOcrJobId, lastOcrResultSha256)
 * @param {any|null} conflict OcrConflict של (job, page) (lean: status, reason) או null
 */
export function ocrPageDataState(record, page, conflict) {
  if (isCurrentRecord(record, page)) return 'current';
  if (conflict && PENDING_CONFLICT_STATUSES.includes(conflict.status)) {
    return conflict.reason === 'job_cancelled' ? 'pending_cancelled' : 'pending_conflict';
  }
  return 'history';
}

function parseJson(json) {
  if (typeof json !== 'string' || !json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const iso = (d) => (d ? new Date(d).toISOString() : null);

/**
 * @param {{
 *   page: any,              // Page (lean): _id, pageNumber, isTwoColumns
 *   record: any,            // OcrPageResult (lean)
 *   state: string,          // ocrPageDataState
 *   contentSha256: string|null,  // sha256 של Page.content הנוכחי
 *   image: {sha256:string, width:number|null, height:number|null, orientation:number|null}|null,
 *                           // התמונה הנוכחית של העמוד, או null אם לא נקראה (חסרה/גדולה מדי/שגיאה)
 * }} args
 */
export function serializeOcrPageData({ page, record, state, contentSha256, image }) {
  const layout = record.layoutStatus === 'ok' ? parseJson(record.layoutJson) : null;
  const expected = typeof record.imageSha256 === 'string' ? record.imageSha256 : null;
  const layoutImage = layout && typeof layout.image === 'object' ? layout.image : null;
  const sizeMatches = layoutImage && image && image.width != null && image.height != null
    ? layoutImage.width === image.width && layoutImage.height === image.height
    : null;
  return {
    pageId: String(page._id),
    pageNumber: page.pageNumber ?? null,
    state,
    jobId: String(record.job),
    resultSha256: record.resultSha256,
    pipelineVersion: record.pipelineVersion ?? null,
    receivedAt: iso(record.receivedAt ?? record.createdAt),
    // הטקסט בעמוד הוא בדיוק טקסט ה-OCR של הרשומה (לא נערך מאז), בעמודה אחת
    contentMatchesOcr: typeof record.textSha256 === 'string'
      && contentSha256 === record.textSha256
      && !page.isTwoColumns,
    image: {
      expectedSha256: expected,
      matches: image && expected ? image.sha256 === expected : null,
      width: image?.width ?? null,
      height: image?.height ?? null,
      exifOrientation: image?.orientation ?? null,
      sizeMatches,
    },
    layoutStatus: record.layoutStatus,
    layoutVersion: record.layoutVersion ?? null,
    layout,
    metadata: parseJson(record.metadataJson),
    warnings: (record.warnings || []).map((w) => ({
      code: w.code,
      message: w.message || '',
      source: w.source,
      labelHe: ocrWarningLabel(w.code),
    })),
  };
}
