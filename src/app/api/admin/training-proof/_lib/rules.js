// כללי הסקירה בניהול — טהורים (בלי מסד, בלי next), עם בדיקה צמודה ב-rules.test.mjs.
// נתיבים יחסיים עם סיומת — כדי שירוצו גם ב-node:test.

import { LINE_SCRIPTS, OCR_RETURN_ACTIONS, SECTIONS } from '../../../../../lib/trainingProof/vocab.js';

export const PAGE_SIZE = 50;
// הסטטוסים שמסך הסקירה מציג (נדחה = חזר ל-available, ואינו "פריט בסקירה")
export const REVIEW_STATUSES = ['submitted', 'approved'];

export const adminImageUrl = (id) => `/api/admin/training-proof/items/${id}/image`;
export const adminCtxUrl = (id) => `/api/admin/training-proof/items/${id}/ctx`;

// הפרמטרים של רשימת-הסקירה מהכתובת. vol נשאר מחרוזת (הנתיב ממיר ל-ObjectId)
export function parseReviewQuery(sp) {
  const get = (k) => (sp.get(k) || '').trim();
  const section = SECTIONS.includes(get('section')) ? get('section') : 'ocr';
  const status = REVIEW_STATUSES.includes(get('status')) ? get('status') : 'submitted';
  const track = LINE_SCRIPTS.includes(get('track')) ? get('track') : null;
  const action = OCR_RETURN_ACTIONS.includes(get('action')) ? get('action') : null;
  const vol = /^[0-9a-f]{24}$/i.test(get('vol')) ? get('vol') : null;
  const lowConf = get('lowConf') === '1';
  const page = Math.max(1, Math.min(10000, parseInt(get('page'), 10) || 1));
  // router: agree=1 — רק מה שהמתנדב הסכים בו עם הנתב; differ=1 — רק מה ששונה מההצעה
  const agree = get('agree') === '1' ? true : get('agree') === '0' ? false : null;
  return { section, status, track, action, vol, lowConf, page, agree };
}

// המסנן במסד (בלי vol — הנתיב מוסיף אותו כ-ObjectId). track בזיהוי = כתב-השורה;
// בנתב track הוא ההצעה (pred) — שם המסנן הוא "מה המתנדב סימן" (result.label)
export function reviewFilter(q) {
  const f = { section: q.section, status: q.status };
  if (q.section === 'ocr') {
    if (q.track) f.track = q.track;
    if (q.action) f['result.action'] = q.action;
  } else if (q.section === 'router' && q.track) {
    f['result.label'] = q.track;
  }
  return f;
}

const sameBox = (a, b) =>
  Array.isArray(a) && Array.isArray(b) && a.length === 4 && b.length === 4 && a.every((v, i) => Math.abs(v - b[i]) < 0.5);

// router: המתנדב הסכים עם הנתב — אותו כתב-שורה כמו ההצעה, ובשורה מעורבת גם אותו
// כתב לכל מילה ועל אותן תיבות. שורה בלי הצעה (pred) — אין הסכמה
export function routerAgrees(payload, result) {
  if (!payload?.pred || !result || result.bad) return false;
  if (result.label !== payload.pred) return false;
  if (result.label !== 'mixed') return true;
  const src = Array.isArray(payload.words) ? payload.words : [];
  const got = Array.isArray(result.words) ? result.words : [];
  if (!src.length || src.length !== got.length) return false;
  return got.every((w) => {
    const s = src.find((x) => x.k === w.k);
    return s && s.pred && s.pred === w.label && sameBox(s.box, w.box);
  });
}

// frames: כמה מסגרות השתנו מהצעת המודל — נוספו, נמחקו, או שתפקיד/זרם/סדר/המשך/תיבה שלהן שונו
export function framesChanges(before, after) {
  const a = new Map((Array.isArray(before) ? before : []).map((f) => [f.fid, f]));
  const b = Array.isArray(after) ? after : [];
  let n = 0;
  const seen = new Set();
  for (const f of b) {
    seen.add(f.fid);
    const o = a.get(f.fid);
    if (!o) {
      n++;
      continue;
    }
    const keys = ['kind', 'role', 'obj', 'stream', 'ord', 'cont'];
    if (keys.some((k) => (o[k] ?? null) !== (f[k] ?? null)) || !sameBox(o.box, f.box)) n++;
  }
  for (const fid of a.keys()) if (!seen.has(fid)) n++;
  return n;
}

const iso = (d) => (d ? new Date(d).toISOString() : null);

// פריט כפי שמסך הסקירה מקבל אותו. names — Map(userId → שם). בלי מפתח-הספר (book):
// מוצג רק הכינוי (alias) ומספר העמוד
export function adminItem(d, names = new Map()) {
  const p = d.payload || {};
  const id = String(d._id);
  const vol = d.vol ? { id: String(d.vol), name: names.get(String(d.vol)) || 'מתנדב' } : null;
  const base = {
    id,
    section: d.section,
    status: d.status,
    img: adminImageUrl(id),
    w: p.w,
    h: p.h,
    alias: p.alias || '',
    page: Number.isInteger(p.page) ? p.page : null,
    result: d.result || null,
    volResult: d.volResult || null,
    adminFixed: !!d.adminFixed,
    vol,
    submittedAt: iso(d.submittedAt),
    reviewedAt: iso(d.reviewedAt),
    rejectedCount: Array.isArray(d.rejectedFor) ? d.rejectedFor.length : 0,
  };
  if (d.section === 'ocr') {
    return {
      ...base,
      track: p.track,
      source: p.source,
      text: p.text || '',
      conf: typeof p.conf === 'number' ? p.conf : null,
      lineNo: Number.isInteger(p.line_no) ? p.line_no : null,
      ctx: d.ctxPath && p.ctx?.bbox ? { img: adminCtxUrl(id), bbox: p.ctx.bbox } : null,
    };
  }
  if (d.section === 'router') {
    return {
      ...base,
      pred: p.pred || null,
      predP: typeof p.pred_p === 'number' ? p.pred_p : null,
      text: p.text || '',
      words: Array.isArray(p.words)
        ? p.words.map((w) => ({ k: w.k, box: w.box, pred: w.pred || null, text: w.text || '' })).sort((a, b) => a.k - b.k)
        : null,
      ctx: d.ctxPath && p.ctx?.bbox ? { img: adminCtxUrl(id), bbox: p.ctx.bbox } : null,
      agrees: routerAgrees(p, d.result),
    };
  }
  return {
    ...base,
    book: p.book,
    ptype: p.ptype || 'scan',
    scale: typeof p.scale === 'number' ? p.scale : 1,
    frames: Array.isArray(p.frames) ? p.frames : [],
    changes: d.result ? framesChanges(p.frames, d.result.frames) : 0,
  };
}

// האישור: מה נקבע בפריט. by — מי אישר
export const approveSet = (by, now) => ({ status: 'approved', reviewedAt: now, reviewedBy: by });

// הדחייה (docs/76 §8.2): הפריט חוזר למאגר, התוצאה נמחקת, ואותו מתנדב לא יקבל אותו
// שוב. vol — המתנדב שהגיש (ObjectId)
export function rejectUpdate(vol) {
  return {
    $set: {
      status: 'available',
      result: null,
      vol: null,
      heldBy: null,
      heldUntil: null,
      heldAt: null,
      round: null,
      submittedAt: null,
      reviewedAt: null,
      reviewedBy: null,
      adminFixed: false,
      volResult: null,
    },
    ...(vol ? { $addToSet: { notFor: vol, rejectedFor: vol } } : {}),
  };
}

// "החזר לממתינות": מאושר ← ממתין. אם המנהל תיקן — חוזרת התוצאה של המתנדב
export function unapproveUpdate(item) {
  const set = { status: 'submitted', reviewedAt: null, reviewedBy: null, adminFixed: false, volResult: null, correctionLoggedAt: null };
  if (item.adminFixed && item.volResult) set.result = item.volResult;
  return { $set: set };
}

// שיעור-ההתאמה כאחוז שלם, או null
export const matchPct = (m) => (typeof m === 'number' && Number.isFinite(m) ? Math.round(m * 100) : null);
