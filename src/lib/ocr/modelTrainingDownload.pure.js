// קובץ-ההורדה של חמשת העמודים המוגהים (GET /api/admin/model-training/{id}/download) — מודול טהור.
//
// הקובץ נבנה מהארכיון הקפוא של עבודת האימון (inputPath, אותו ZIP שנשלח לשירות) **בלי לשנות אותו**:
// כל רשומה בו מועתקת כמות שהיא (התמונות ו-dataset.json — בייט-בבייט), ונוספים רק:
//   - layouts/<pageId>.json — ה-layout השמור של העמוד מ-OcrPageResult (שורות, תיבות, כתב), אם יש;
//   - download.json — מה יש בקובץ ומאיפה (עבודה, inputSha256, העמודים, מצב ה-layout לכל עמוד).
// הארכיון שבדיסק והמעטפה לשירות אינם משתנים; התוספות קיימות רק בקובץ שהמנהל מוריד.
// imports יחסיים/חבילות בלבד (נבדק ב-node:test).
import { strFromU8, strToU8 } from 'fflate';

export const DOWNLOAD_SCHEMA_VERSION = 1;
const ID_RE = /^[a-f0-9]{24}$/;
const LAYOUT_DIR = 'layouts/';

/** שם הקובץ להורדה: ASCII בלבד, בלי שם הספר (רק מזהה העבודה). */
export function downloadFileName(jobId) {
  if (!ID_RE.test(String(jobId))) throw new Error('invalid_job_id');
  return `training-pages-${jobId}.zip`;
}

/**
 * Parses only the small dataset entry; image contents stay in the file stream.
 * @param {Uint8Array} raw
 */
export function parseFrozenDataset(raw) {
  let dataset;
  try { dataset = JSON.parse(strFromU8(raw)); } catch { throw new Error('training_package_invalid'); }
  if (dataset?.kind !== 'corrected-pages' || !Array.isArray(dataset.pages)) throw new Error('training_package_invalid');
  return dataset;
}

export const isDownloadEntry = name => name === 'download.json' || name.startsWith(LAYOUT_DIR);

/** מזהי העמודים שבארכיון (רק מזהים תקינים — הם נכנסים לשמות קבצים). */
export function frozenPageIds(dataset) {
  return dataset.pages.map(p => String(p?.pageId || '')).filter(id => ID_RE.test(id));
}

/**
 * רשומת layout לקובץ-ההורדה, מתוך רשומת OcrPageResult הנוכחית של העמוד (lean).
 * הקואורדינטות הן של התמונה שנשלחה לזיהוי (record.imageSha256 = sha256 של קובץ התמונה המקורי);
 * imageSha256Now — sha256 של קובץ התמונה של העמוד בזמן ההורדה, כדי שהצרכן יידע אם זו אותה תמונה.
 * @returns {{ status: string, entry: any|null }}
 */
export function layoutEntry({ pageId, record, imageSha256Now = null }) {
  if (!record) return { status: 'none', entry: null };
  if (record.layoutStatus !== 'ok' || typeof record.layoutJson !== 'string') return { status: record.layoutStatus || 'absent', entry: null };
  let layout;
  try { layout = JSON.parse(record.layoutJson); } catch { return { status: 'invalid', entry: null }; }
  const ocrImage = typeof record.imageSha256 === 'string' ? record.imageSha256 : null;
  return { status: 'ok', entry: {
    pageId, layoutVersion: record.layoutVersion ?? null,
    ocrJobId: record.job ? String(record.job) : null, resultSha256: record.resultSha256 || null,
    pipelineVersion: record.pipelineVersion || null, receivedAt: record.receivedAt || null,
    ocrImageSha256: ocrImage, imageSha256Now,
    sameImageAsOcr: ocrImage && imageSha256Now ? ocrImage === imageSha256Now : null,
    layout,
  } };
}

/**
 * Builds only the added metadata entries, without loading or copying images.
 * @param {{ dataset: any, job: { id: string, inputSha256: string, preparedAt?: any },
 *   layouts: Record<string, { status: string, entry: any|null }> }} args
 * @returns {Record<string, Uint8Array>}
 */
export function downloadEntries({ dataset, job, layouts }) {
  const out = {};
  const pages = dataset.pages.map(p => {
    const id = String(p?.pageId || '');
    const l = ID_RE.test(id) ? layouts[id] : null;
    const layoutFile = l?.entry ? `${LAYOUT_DIR}${id}.json` : null;
    if (layoutFile) out[layoutFile] = strToU8(JSON.stringify(l.entry));
    return { pageId: id, pageNumber: p.pageNumber, image: p.image, imageSha256: p.imageSha256,
      expectedUpdatedAt: p.expectedUpdatedAt, layout: layoutFile, layoutStatus: l?.status || 'none' };
  });
  out['download.json'] = strToU8(JSON.stringify({
    schemaVersion: DOWNLOAD_SCHEMA_VERSION, kind: 'corrected-pages-download',
    jobId: job.id, inputSha256: job.inputSha256, preparedAt: job.preparedAt || null,
    bookId: dataset.bookId, script: dataset.script, datasetSchemaVersion: dataset.schemaVersion,
    pages,
  }));
  return out;
}
