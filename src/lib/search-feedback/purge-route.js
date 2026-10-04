/**
 * POST /api/search-feedback/admin/purge — ניקוי אירועים לפי מסננים.
 * ?dryRun=1 מחזיר {count, asOf}; המחיקה עצמה דורשת את אותם מסננים + asOf + confirmCount זהה לספירה.
 */
import { requireSearchFeedbackAccess, jsonNoStore } from './route-auth.js';
import { buildPurgeFilter, previewPurge, purgeEvents } from './service.js';
import { readJsonBodyLimited } from '../corrections/report-email.js';

const MAX_PURGE_BODY_BYTES = 4096;

export const FILTER_FIELD_LABELS = Object.freeze({
  body: 'גוף הבקשה',
  from: 'מתאריך',
  to: 'עד תאריך',
  type: 'סוג אירוע',
  modelFamilyId: 'מודל',
  modelQuantization: 'קוונטיזציה',
  keyId: 'מזהה התקנה',
  all: 'הכל',
  filter: 'יש לבחור לפחות מסנן אחד, או "הכל" במפורש',
  asOf: 'זמן התצוגה המקדימה',
  confirmCount: 'מספר האישור',
  previewId: 'מזהה התצוגה המקדימה',
  replacePreviewId: 'מזהה התצוגה המקדימה הקודמת',
});

export const invalidFilterResponse = (field) =>
  jsonNoStore({ error: `מסנן לא תקין: ${FILTER_FIELD_LABELS[field] || field}`, field }, 400);

/**
 * @param {Request} request
 * @param {{auth?:() => Promise<object>, now?:() => Date}} deps להזרקה בבדיקות
 */
export async function handlePurgeRequest(request, deps = {}) {
  const auth = await (deps.auth || requireSearchFeedbackAccess)();
  if (!auth.ok) return auth.response;

  let body;
  try {
    body = await readJsonBodyLimited(request, MAX_PURGE_BODY_BYTES);
  } catch {
    return invalidFilterResponse('body');
  }
  const parsed = buildPurgeFilter(body);
  if (!parsed.ok) return invalidFilterResponse(parsed.field);

  const now = (deps.now || (() => new Date()))();
  try {
    for (const field of ['previewId', 'replacePreviewId']) {
      if (body[field] !== undefined && (typeof body[field] !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(body[field]))) return invalidFilterResponse(field);
    }
    if (new URL(request.url).searchParams.get('dryRun') === '1') {
      const { count, asOf, previewId } = await previewPurge(parsed.filter, { now, replacePreviewId: body.replacePreviewId });
      return jsonNoStore({ success: true, dryRun: true, count, asOf: asOf.toISOString(), previewId });
    }

    const asOfMs = typeof body.asOf === 'string' ? Date.parse(body.asOf) : Number.NaN;
    if (Number.isNaN(asOfMs) || asOfMs > now.getTime()) return invalidFilterResponse('asOf');
    if (!Number.isSafeInteger(body.confirmCount) || body.confirmCount < 0) return invalidFilterResponse('confirmCount');

    const result = await purgeEvents(parsed.filter, { confirmCount: body.confirmCount, asOf: new Date(asOfMs), previewId: body.previewId });
    if (!result.ok) {
      return jsonNoStore({
        error: 'התצוגה המקדימה אינה תואמת לאישור, פקעה או כבר בשימוש — לא נמחק דבר. יש להריץ תצוגה מקדימה שוב.',
        count: result.count,
      }, 409);
    }
    return jsonNoStore({ success: true, deleted: result.deleted });
  } catch (error) {
    if (error?.code === 'PURGE_PREVIEWS_BUSY') return jsonNoStore({ error: error.message }, 429);
    console.error('Search feedback purge failed:', error?.message);
    return jsonNoStore({ error: 'הניקוי נכשל' }, 500);
  }
}
