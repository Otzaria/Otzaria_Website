// צורת הדף — הצורות שנשלחות ללקוח (CONTRACT.md "צורות התגובה"), טהור: FastItem, מצב עמוד בעיני הצופה,
// העמוד לבדיקה, ופריט למנהל. כתובות התמונה יחסיות, עם גרסה (v) — כך שתמונה שנשמרה במטמון הדפדפן
// (immutable) לא תוצג לבנייה אחרת של העמוד.

import { fnv1a, kindLabel } from './common.js';
import { effectiveQuestion, optionsFor, focusOf, allowTextFor, promptFor } from './questions.js';
import { cropRect, relBox } from './imageCrop.js';

export const API = '/api/tzurat-hadaf';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const timeOf = (v) => (v ? new Date(v).getTime() : NaN);

// גרסת התמונות של עמוד: הבנייה והסבב
export const reviewVersion = (page) => JSON.stringify([page?.buildId || '', page?.round || 1]);

export const imageVersion = (page) => fnv1a(`${page?.buildId || ''}|${page?.round || 1}`).toString(36);

export function itemImageUrls(item, page) {
  const id = String(item._id ?? item.id);
  const v = imageVersion(page);
  return {
    imageUrl: item.box ? `${API}/items/${id}/image?v=${v}` : null,
    fullImageUrl: `${API}/items/${id}/image?full=1&v=${v}`,
  };
}

export const pageImageUrl = (page, side) => `${API}/pages/${String(page._id ?? page.id)}/image?side=${side}&v=${imageVersion(page)}`;

/** FastItem — עיוור: בלי otz/print מסומנים, בלי hints ובלי תשובות של אחרים */
export function fastItemShape(item, page, userId) {
  const W = page?.scan?.w || 0;
  const H = page?.scan?.h || 0;
  const crop = item.box ? cropRect(item.box, W, H) : null;
  return {
    id: String(item._id ?? item.id),
    revision: item.revision ?? 0,
    slug: item.slug,
    masechet: item.masechet || page?.masechet || '',
    daf: item.daf || page?.daf || '',
    kind: item.kind,
    kindLabel: kindLabel(item.kind),
    question: effectiveQuestion(item),
    prompt: promptFor(item),
    focus: focusOf(item),
    options: optionsFor(item, userId),
    allowText: allowTextFor(item),
    ctxBefore: Array.isArray(item.ctxBefore) ? item.ctxBefore : [],
    ctxAfter: Array.isArray(item.ctxAfter) ? item.ctxAfter : [],
    ...itemImageUrls(item, page),
    box: crop ? relBox(item.box, crop, W, H) : null,
    // התיבה כשברים מהסריקה המלאה (fullImageUrl) — לסימון ולגלילה בתצוגת העמוד המלא
    fullBox: item.box ? { x: item.box.x, y: item.box.y, w: item.box.w, h: item.box.h } : null,
  };
}

// מצבי עמוד בעיני הצופה (CONTRACT: books/[slug]/pages)
export const PAGE_STATES = Object.freeze(['open', 'mine', 'taken', 'submitted', 'approved', 'done', 'closed']);

/**
 * page: {status, required, activeCount, submitters, leasedBy, leasedUntil}; mySub — סטטוס ההגשה של הצופה
 * בסבב הנוכחי ('submitted'/'approved'; נדחתה — כאילו אין). הגשה של הצופה קודמת לכל השאר.
 */
export function pageStateFor(page, viewerId, mySub = null, now = new Date()) {
  const p = page || {};
  const me = viewerId == null || viewerId === '' ? null : String(viewerId);
  if (mySub === 'processing') return 'mine';
  if (mySub === 'approved') return 'approved';
  if (mySub === 'submitted' || (me && (p.submitters || []).some((s) => sameId(s, me)))) return 'submitted';
  const leased = p.leasedBy && timeOf(p.leasedUntil) > now.getTime();
  const leasedToMe = leased && me && sameId(p.leasedBy, me);
  if (p.status === 'closed') return leasedToMe ? 'mine' : 'closed';
  if (p.status === 'done') return 'done';
  if (leased) return leasedToMe ? 'mine' : 'taken';
  // כל המקומות מלאים (ממתין לאישור) — אין מה לעשות בו
  if ((p.activeCount || 0) >= (p.required || 1)) return 'done';
  return 'open';
}

/** העמוד לבדיקה (GET pages/[id]) */
export function pageShape(page, state) {
  return {
    id: String(page._id),
    slug: page.slug,
    masechet: page.masechet || '',
    daf: page.daf || '',
    dafKey: page.dafKey,
    round: page.round || 1,
    version: reviewVersion(page),
    nonVilna: !!page.nonVilna,
    state,
    leasedUntil: page.leasedUntil || null,
    scan: { url: page.scan?.path ? pageImageUrl(page, 'scan') : null, w: page.scan?.w || 0, h: page.scan?.h || 0 },
    ours: { url: page.ours?.path ? pageImageUrl(page, 'ours') : null, w: page.ours?.w || 0, h: page.ours?.h || 0 },
    model: page.model || { blocks: [] },
  };
}

/** AdminItem — כל השדות, עם id, שמות העונים וכתובת החיתוך */
export function adminItemShape(item, page) {
  const { _id, __v, page: pageRef, ...rest } = item;
  return {
    ...rest,
    id: String(_id),
    page: pageRef ? String(pageRef) : null,
    answers: (item.answers || []).map((a) => ({ ...a, user: a.user ? String(a.user) : null, name: a.name || '' })),
    ...(page ? itemImageUrls(item, page) : { imageUrl: null, fullImageUrl: null }),
  };
}

// העלאה — הצורה שנשלחת למנהל (CONTRACT: Upload)
export function uploadShape(u) {
  return {
    id: String(u._id),
    name: u.name,
    size: u.size,
    chunkSize: u.chunkSize,
    chunks: u.chunks,
    received: [...(u.received || [])].sort((a, b) => a - b),
    status: u.status,
    progress: { pages: u.progress?.pages || 0, items: u.progress?.items || 0, images: u.progress?.images || 0 },
    summary: u.summary || null,
    errors: u.errorList || [],
    startedAt: u.startedAt || null,
    finishedAt: u.finishedAt || null,
  };
}
