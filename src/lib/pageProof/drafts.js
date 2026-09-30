// טיוטות הגהת-העמודים בדפדפן: מפתח לכל עמוד *ולכל גרסה שלו*
// (`page-proof-draft:<pageId>:<docRevision>`). עמוד שחזר מזיהוי-מחדש
// (revision+1, שורות אחרות) לא ישחזר טיוטה של הגרסה הקודמת — הפעולות בה
// מצביעות על שורות שכבר אינן. בפתיחת עמוד נמחקות הטיוטות של גרסאות אחרות
// שלו, וגם המפתח הישן בלי גרסה (`page-proof-draft:<pageId>`); טיוטה ישנה
// שכל פעולותיה תקפות לעמוד (גרסה 1) עוברת קודם למפתח החדש, כדי שעבודה
// שהתחילה לפני השינוי לא תאבד.
//
// את הטיוטה עצמה כותב וקורא העורך (useProofEditor) לפי המפתח שהדף מעביר
// לו (ProofEditor draftKey). לוגיקה טהורה — האחסון מוזרק (localStorage
// בדפדפן, אובייקט עם getItem/setItem/removeItem/key/length בבדיקות).

import { docRevision } from './textModel.js';
import { validateOps } from './ops.js';

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

// הניקוי בפתיחת עמוד. מחזיר {key, migrated, removed:[מפתחות שנמחקו]}.
// טיוטה ישנה עוברת רק לעמוד בגרסה 1, רק אם אין כבר טיוטה במפתח החדש, ורק
// אם כל פעולותיה עוברות את בדיקת-התקינות מול העמוד (אחרת היא של עמוד אחר).
export function cleanupPageDrafts(storage, page, key = pageDraftKey(page)) {
  const res = { key, migrated: false, removed: [] };
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
  for (const k of staleDraftKeys(storageKeys(storage), page.id, key)) {
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
