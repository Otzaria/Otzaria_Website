// איפה נשמרות תמונות ההגהה לאימון, ואיך פריט מ-items.jsonl נעשה מסמך במסד — טהור.
// משותף לקליטה (מסך הניהול, סשן ד') ולנתיבי התמונה של המתנדב, כדי ששניהם יסכימו
// על אותו נתיב. התמונות יושבות תחת תיקיית ההעלאות (lib/ocr/images.js:
// resolveImageFsPath), בתיקייה לכל packageId; כל חלקי הייצוא חולקים אותה, ולכן
// תמונת-הקשר משותפת (img/ctx-…) נכתבת פעם אחת.

import { PACKAGE_ID_RE, safeZipPath } from './vocab.js';
import { trackOf } from './zipCheck.js';

export const TP_IMAGE_ROOT = '/uploads/training-proof';

// הנתיב השמור במסד לקובץ מתוך ה-ZIP (relInZip יחסי ל-base של ה-manifest)
export function storageRel(packageId, relInZip) {
  if (!PACKAGE_ID_RE.test(String(packageId || ''))) throw new Error('מזהה חבילה לא תקין');
  if (!safeZipPath(relInZip)) throw new Error('נתיב לא תקין בתוך הקובץ');
  return `${TP_IMAGE_ROOT}/${packageId}/${relInZip}`;
}

// התיקייה של חבילה (למחיקה אחרי ההורדה)
export function packageDirRel(packageId) {
  if (!PACKAGE_ID_RE.test(String(packageId || ''))) throw new Error('מזהה חבילה לא תקין');
  return `${TP_IMAGE_ROOT}/${packageId}`;
}

// פריט מ-items.jsonl (אחרי checkToSiteZip) → מסמך TrainingProofItem חדש
export function itemDoc(manifest, payload) {
  const section = manifest.section;
  return {
    uid: payload.uid,
    section,
    packageId: manifest.package_id,
    part: manifest.part,
    sig: payload.sig,
    payload,
    imagePath: storageRel(manifest.package_id, payload.img),
    ctxPath: payload.ctx?.img ? storageRel(manifest.package_id, payload.ctx.img) : null,
    book: payload.book || null,
    track: trackOf(section, payload),
    status: 'available',
  };
}
