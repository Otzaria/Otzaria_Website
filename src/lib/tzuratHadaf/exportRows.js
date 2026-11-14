// צורת הדף — שורות הייצוא (PACKAGE.md §3), טהור: מסמך Mongo ← שורת NDJSON עם `type`.
// הזרם עצמו (קורסורים, since) — exportStream.js.

import { whoOf } from './common.js';

export const EXPORT_FORMAT = 'tzurat-review-export/1';
export const EXPORT_TYPES = Object.freeze(['decision', 'anchor', 'check', 'report', 'contributor']);
export const DECISION_STATUSES = Object.freeze(['agreed', 'resolved']);

const iso = (d) => (d ? new Date(d).toISOString() : null);
const idOf = (v) => (v == null ? null : String(v));

/** `?types=` (או `parts=`) ← רשימת סוגים; ריק/חסר ← הכול. יחיד ורבים (decisions/decision) מתקבלים. */
export function parseTypes(raw) {
  if (raw == null || String(raw).trim() === '') return { types: [...EXPORT_TYPES] };
  const set = new Set();
  for (const part of String(raw).split(',')) {
    let t = part.trim().replace(/s$/, '');
    if (!t) continue;
    // manual (CONTRACT: parts=…,manual,…) — התיקונים הידניים יוצאים כשורות decision עם manual:true
    if (t === 'manual') t = 'decision';
    if (!EXPORT_TYPES.includes(t)) return { error: `סוג ייצוא לא מוכר: ${part.trim().slice(0, 30)}` };
    set.add(t);
  }
  return { types: EXPORT_TYPES.filter((t) => set.has(t)) };
}

/** `?since=` ← Date או null; {error} אם אינו תאריך */
export function parseSince(raw) {
  if (raw == null || raw === '') return { since: null };
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return { error: 'since אינו תאריך תקין (ISO)' };
  return { since: d };
}

export const metaRow = (since, now = new Date()) => ({ type: 'meta', format: EXPORT_FORMAT, exportedAt: iso(now), since: iso(since) });

// ההכרעה של פריט: resolved (מנהל) קודם, אחרת ההסכמה
export function decisionOf(item) {
  if (item?.status === 'resolved' && item.resolved?.verdict) {
    return { verdict: item.resolved.verdict, text: item.resolved.text ?? null, at: item.resolved.at };
  }
  if (item?.status === 'agreed' && item.decision?.verdict) {
    return { verdict: item.decision.verdict, text: item.decision.text ?? null, at: item.decision.at };
  }
  return null;
}

/** פריט ← שורת decision, או null (רק agreed/resolved, לא תרגול) */
export function decisionRow(item) {
  if (!item || item.practice || !DECISION_STATUSES.includes(item.status)) return null;
  const d = decisionOf(item);
  if (!d) return null;
  return {
    type: 'decision',
    sourceKey: item.sourceKey,
    slug: item.slug,
    masechet: item.masechet || '',
    daf: item.daf || '',
    dafKey: item.dafKey,
    kind: item.kind,
    ref: item.ref || '',
    wi: item.wi ?? 0,
    n: item.n ?? 0,
    otz: item.otz || [],
    print: item.print || [],
    verdict: d.verdict,
    text: d.text ?? null,
    status: item.status,
    manual: !!item.manual,
    box: item.box || null,
    answers: (item.answers || []).map((a) => ({
      who: a.who || whoOf(a.user),
      verdict: a.verdict,
      text: a.text ?? null,
      via: a.via || 'fast',
      at: iso(a.at),
    })),
    resolvedBy: item.status === 'resolved' && item.resolved?.by ? whoOf(item.resolved.by) : null,
    at: iso(d.at || item.updatedAt),
  };
}

/**
 * ביטול הכרעה שיצאה בעבר (רק בייצוא since): הפריט נפתח מחדש, נדחה או התיישן.
 * {type:'decision', sourceKey, slug, dafKey, status:'retracted', at}
 */
export const retractionRow = (item) => ({
  type: 'decision',
  sourceKey: item.sourceKey,
  slug: item.slug,
  dafKey: item.dafKey,
  status: 'retracted',
  at: iso(item.updatedAt),
});

/** הגשה מאושרת ← שורות anchor */
export function anchorRows(sub, page) {
  if (!sub || sub.status !== 'approved') return [];
  const base = {
    slug: sub.slug,
    masechet: page?.masechet || sub.masechet || '',
    daf: page?.daf || sub.daf || '',
    dafKey: sub.dafKey,
  };
  const at = iso(sub.reviewedAt || sub.createdAt);
  return (sub.anchors || []).map((a) => ({
    type: 'anchor',
    ...base,
    block: a.block,
    line: a.line,
    ...(a.action === 'start' ? { ref: a.ref, wi: a.wi } : {}),
    action: a.action,
    who: sub.who || whoOf(sub.user),
    submission: idOf(sub._id),
    round: sub.round || 1,
    buildId: sub.buildId || '',
    at,
  }));
}

/** הגשה מאושרת ← שורות check */
export function checkRows(sub, page) {
  if (!sub || sub.status !== 'approved' || !sub.checks || typeof sub.checks !== 'object') return [];
  return Object.entries(sub.checks)
    .filter(([, v]) => v === 'ok' || v === 'issue')
    .map(([key, value]) => ({
      type: 'check',
      slug: sub.slug,
      daf: page?.daf || sub.daf || '',
      dafKey: sub.dafKey,
      key,
      value,
      submission: idOf(sub._id),
    }));
}

/** דיווח ← שורת report (כל הסטטוסים) */
export function reportRow(r, page) {
  return {
    type: 'report',
    id: idOf(r._id),
    slug: r.slug,
    masechet: page?.masechet || r.masechet || '',
    daf: page?.daf || r.daf || '',
    dafKey: r.dafKey,
    category: r.category,
    text: r.text || '',
    regions: (r.regions || []).map(({ side, x, y, w, h }) => ({ side, x, y, w, h })),
    status: r.status,
    who: r.who || whoOf(r.user),
    at: iso(r.createdAt),
  };
}

/** תורם ← שורת contributor */
export const contributorRow = (c) => ({
  type: 'contributor',
  who: whoOf(c.user),
  name: c.name || '',
  decisions: c.decisions || 0,
  pages: c.pages || 0,
  reports: c.reports || 0,
});
