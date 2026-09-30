// טיוטות הגהת-העמודים בדפדפן: מפתח לכל עמוד *ולכל גרסה שלו*
// (`page-proof-draft:<pageId>:<docRevision>`). עמוד שחזר מזיהוי-מחדש
// (revision+1, שורות אחרות) לא משחזר את הטיוטה של הגרסה הקודמת כמות-שהיא — חלק
// מהפעולות בה מצביעות על שורות שכבר אינן. בפתיחת עמוד בגרסה חדשה, כשאין לו עדיין
// טיוטה: מה שעדיין תקף מהטיוטה של הגרסה הקודמת עובר אליו (carryDraftOps — בלי
// פעולות-החיתוך, שכבר נעשו בחיתוך החדש), והדף מספר למתנדב מה עבר ומה לא (carried).
// אחר כך נמחקות הטיוטות של גרסאות אחרות שלו, וגם המפתח הישן בלי גרסה
// (`page-proof-draft:<pageId>`); טיוטה ישנה שכל פעולותיה תקפות לעמוד (גרסה 1)
// עוברת קודם למפתח החדש, כדי שעבודה שהתחילה לפני השינוי לא תאבד.
//
// את הטיוטה עצמה כותב וקורא העורך (useProofEditor) לפי המפתח שהדף מעביר
// לו (ProofEditor draftKey). לוגיקה טהורה — האחסון מוזרק (localStorage
// בדפדפן, אובייקט עם getItem/setItem/removeItem/key/length בבדיקות).

import { docRevision } from './textModel.js';
import { CUT_KINDS, validateOp, validateOps } from './ops.js';
import { OP_KINDS } from './vocab.js';

export const DRAFT_PREFIX = 'page-proof-draft:';

// המפתח הישן, בלי גרסה
export const legacyDraftKey = (pageId) => `${DRAFT_PREFIX}${pageId}`;

export const draftKeyFor = (pageId, revision) => `${DRAFT_PREFIX}${pageId}:${revision}`;

// מספר-הגרסה של העמוד כפי שהעורך מקבל אותו ({id, doc, revision?}):
// revision שבתוך doc (מתוכנת-הספר) קודם; אחריו זה של העמוד השמור; אחרת 1
export function pageRevisionNumber(page) {
  const r = Number(page?.doc?.revision ?? page?.revision);
  return Number.isInteger(r) && r >= 1 ? r : 1;
}

// מזהה-הגרסה המלא (textModel.docRevision: מספר-גרסה + גיבוב השורות והגודל)
export function pageRevision(page) {
  return docRevision({ ...(page?.doc || {}), revision: pageRevisionNumber(page) });
}

export const pageDraftKey = (page) => draftKeyFor(page?.id, pageRevision(page));

// האם המפתח הוא טיוטה של העמוד (בכל גרסה, או הישן)
export function isDraftKeyOf(key, pageId) {
  if (typeof key !== 'string' || pageId == null || pageId === '') return false;
  const base = legacyDraftKey(pageId);
  return key === base || key.startsWith(`${base}:`);
}

// מפתחות-הטיוטה של העמוד שאינם המפתח הנוכחי
export function staleDraftKeys(keys, pageId, currentKey) {
  return (keys || []).filter((k) => k !== currentKey && isDraftKeyOf(k, pageId));
}

// מספר-הגרסה שבמפתח-טיוטה (`…:<pageId>:<revision>:<hash>`), או null (המפתח הישן / אחר)
export function draftKeyRevision(key, pageId) {
  const base = `${legacyDraftKey(pageId)}:`;
  if (typeof key !== 'string' || !key.startsWith(base)) return null;
  const n = Number(key.slice(base.length).split(':')[0]);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

// פעולות מטיוטה של גרסה קודמת ← העמוד בגרסה החדשה (אחרי חיתוך וזיהוי-מחדש):
//   • פעולות-החיתוך (פיצול / איחוד / שורה חדשה / תיבה) — לא עוברות: העמוד כבר נחתך מחדש (cut);
//   • "החיתוך תקין" (cut_ok) — לא עובר: את החיתוך החדש בודקים מחדש (dropped);
//   • פעולה מקומית (_local — חצי-אישור של פסקה) — עוברת רק אם כל השורות שלה עוד בעמוד;
//   • כל השאר — עוברות אם הן תקינות מול העמוד החדש (אותה בדיקה של הגשה — validateOp), אחרת
//     (השורה נחתכה מחדש או נעלמה) — dropped.
// הסדר נשמר. ← {kept, dropped, cut}
export function carryDraftOps(doc, ops) {
  const kept = [];
  const dropped = [];
  let cut = 0;
  const lines = new Set((doc?.lines || []).map((l) => l?.id));
  for (const op of Array.isArray(ops) ? ops : []) {
    if (!op || typeof op !== 'object') continue;
    if (CUT_KINDS.includes(op.kind)) {
      cut++;
      continue;
    }
    if (op.kind === 'cut_ok') {
      dropped.push(op);
      continue;
    }
    if (op._local) {
      if ((op.ids || []).every((id) => lines.has(id))) kept.push(op);
      continue;
    }
    if (validateOp(doc, op)) dropped.push(op);
    else kept.push(op);
  }
  return { kept, dropped, cut };
}

const clip = (s, n = 40) => {
  const v = String(s ?? '');
  return v.length > n ? `${v.slice(0, n)}…` : v;
};

// תיאור קצר של פעולה שלא עברה (בלי העמוד הישן — השורות שלה כבר אינן): סוג-הפעולה, ולתיקון-
// טקסט גם מה שהוקלד
export function droppedOpLabel(op) {
  const kind = OP_KINDS[op?.kind]?.he || String(op?.kind || '');
  return op?.kind === 'text' && typeof op.value === 'string' ? `${kind}: «${clip(op.value)}»` : kind;
}

// רשימת הפעולות מטיוטה שמורה ({ops, at}); null אם אינה קריאה
export function readDraftOps(raw) {
  if (typeof raw !== 'string') return null;
  try {
    const d = JSON.parse(raw);
    return Array.isArray(d?.ops) ? d.ops : null;
  } catch {
    return null;
  }
}

function storageKeys(storage) {
  const out = [];
  const n = Number(storage?.length) || 0;
  for (let i = 0; i < n; i++) {
    const k = storage.key(i);
    if (k != null) out.push(k);
  }
  return out;
}

// הניקוי בפתיחת עמוד. מחזיר {key, migrated, removed:[מפתחות שנמחקו], carried}.
// טיוטה ישנה (בלי גרסה) עוברת רק לעמוד בגרסה 1, רק אם אין כבר טיוטה במפתח החדש, ורק
// אם כל פעולותיה עוברות את בדיקת-התקינות מול העמוד (אחרת היא של עמוד אחר).
// עמוד בגרסה חדשה (חזר מזיהוי-מחדש) שאין לו עדיין טיוטה: מהטיוטה של הגרסה הקודמת (האחרונה
// שבדפדפן) עובר מה שעדיין תקף — carryDraftOps. carried = {from, kept, cut, dropped:[תיאורים]}
// כשיש מה לספר למתנדב (משהו עבר או לא עבר), אחרת null.
export function cleanupPageDrafts(storage, page, key = pageDraftKey(page)) {
  const res = { key, migrated: false, removed: [], carried: null };
  if (!storage || page?.id == null || page.id === '') return res;
  const legacy = legacyDraftKey(page.id);
  const raw = storage.getItem(legacy);
  if (raw != null && pageRevisionNumber(page) === 1 && storage.getItem(key) == null) {
    const ops = readDraftOps(raw);
    if (ops?.length && page.doc && !validateOps(page.doc, ops)) {
      storage.setItem(key, raw);
      res.migrated = true;
    }
  }
  const stale = staleDraftKeys(storageKeys(storage), page.id, key);
  const rev = pageRevisionNumber(page);
  if (rev > 1 && page.doc && storage.getItem(key) == null) {
    const older = stale
      .map((k) => ({ k, r: draftKeyRevision(k, page.id) }))
      .filter((x) => x.r !== null && x.r < rev)
      .sort((a, b) => b.r - a.r)[0];
    const ops = older ? readDraftOps(storage.getItem(older.k)) : null;
    if (ops?.length) {
      const c = carryDraftOps(page.doc, ops);
      if (c.kept.length) storage.setItem(key, JSON.stringify({ ops: c.kept, at: Date.now() }));
      const kept = c.kept.filter((o) => !o._local).length;
      if (kept || c.dropped.length) res.carried = { from: older.k, kept, cut: c.cut, dropped: c.dropped.map(droppedOpLabel) };
    }
  }
  for (const k of stale) {
    storage.removeItem(k);
    res.removed.push(k);
  }
  return res;
}

// כל הטיוטות של העמוד (אחרי הגשה — אין בהן עוד צורך)
export function removePageDrafts(storage, pageId) {
  const removed = [];
  if (!storage) return removed;
  for (const k of storageKeys(storage).filter((key) => isDraftKeyOf(key, pageId))) {
    storage.removeItem(k);
    removed.push(k);
  }
  return removed;
}
