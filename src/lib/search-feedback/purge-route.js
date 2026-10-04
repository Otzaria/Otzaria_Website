/**
 * POST /api/search-feedback/admin/purge — ניקוי אירועים לפי מסננים.
 * ?dryRun=1 מחזיר {count, asOf}; המחיקה עצמה דורשת את אותם מסננים + asOf + confirmCount זהה לספירה.
 */
import { requireSearchFeedbackAccess, jsonNoStore } from './route-auth.js';
import { buildPurgeFilter, previewPurge, purgeEvents } from './service.js';

const MAX_PURGE_BODY_CHARS = 4096;

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
    const text = await request.text();
    if (text.length > MAX_PURGE_BODY_CHARS) return invalidFilterResponse('body');
    body = JSON.parse(text);
  } catch {
    return invalidFilterResponse('body');
  }
  const parsed = buildPurgeFilter(body);
  if (!parsed.ok) return invalidFilterResponse(parsed.field);

  const now = (deps.now || (() => new Date()))();
  try {
    if (new URL(request.url).searchParams.get('dryRun') === '1') {
      const { count, asOf } = await previewPurge(parsed.filter, { now });
      return jsonNoStore({ success: true, dryRun: true, count, asOf: asOf.toISOString() });
    }

    const asOfMs = typeof body.asOf === 'string' ? Date.parse(body.asOf) : Number.NaN;
    if (Number.isNaN(asOfMs) || asOfMs > now.getTime()) return invalidFilterResponse('asOf');
    if (!Number.isSafeInteger(body.confirmCount) || body.confirmCount < 0) return invalidFilterResponse('confirmCount');

    const result = await purgeEvents(parsed.filter, { confirmCount: body.confirmCount, asOf: new Date(asOfMs) });
    if (!result.ok) {
      return jsonNoStore({
        error: 'מספר האירועים התואמים השתנה מאז התצוגה המקדימה — לא נמחק דבר. יש להריץ תצוגה מקדימה שוב.',
        count: result.count,
      }, 409);
    }
    return jsonNoStore({ success: true, deleted: result.deleted });
  } catch (error) {
    console.error('Search feedback purge failed:', error?.message);
    return jsonNoStore({ error: 'הניקוי נכשל' }, 500);
  }
}
