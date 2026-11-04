// פונקציות טהורות של runOcrJob.js — ללא DB/fs/network — מופרדות כדי שניתן
// יהיה לבדוק אותן ביחידה.
import { createHash } from 'node:crypto';

// טיפול בעמודים שכבר יש בהם טקסט, בעבודת OCR לספר שלם:
//   skip        — דילוג על כל עמוד שיש בו טקסט כלשהו (גם פלט OCR גולמי)
//   skip_edited — דילוג רק על עמודים שנערכו בידי אדם (pageEditedByHuman); עמוד שיש בו רק
//                 פלט OCR שאיש לא נגע בו מעובד מחדש
//   overwrite   — עיבוד כל העמודים
export const EXISTING_TEXT_MODES = Object.freeze(['overwrite', 'skip', 'skip_edited']);

// בודק האם עמוד כבר מכיל טקסט כלשהו (תוכן ראשי או טורים).
export function pageHasText(p) {
  return !!(p.content?.trim() || p.rightColumn?.trim() || p.leftColumn?.trim());
}

// טביעת הטקסט ש-OCR כתב לעמוד (נשמרת ב-lastOcrTextSha256) — כך אפשר לדעת אם נערך מאז
export function ocrTextSha256(text) {
  return createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex');
}

// עמודים ש-OCR מקומי כתב להם לפני ש-lastOcrTextSha256 נוסף: updatedAt נקבע באותה כתיבה עם
// lastOcrAt (שנלקח פעם אחת לכל העבודה), כך שבעמוד שלא נגעו בו הפער הוא זמן ההחלה בלבד (נמדד
// בפרודקשן: עד ~1.3 שניות ל-400 עמודים; העריכה האנושית המהירה ביותר — אחרי 4 דקות).
export const LEGACY_OCR_WRITE_SLACK_MS = 30 * 1000;

const time = (d) => (d ? new Date(d).getTime() : NaN);

/**
 * האם העמוד נערך בידי אדם (ולכן מוגן במצב skip_edited). שמרני: כשאין דרך לדעת — נחשב ערוך.
 * - עמוד שמתנדב תפס או סיים (status ≠ available) — ערוך, גם אם הטקסט עוד זהה לפלט ה-OCR.
 * - עמוד ריק — לא ערוך.
 * - טקסט בטורים — ערוך (OCR כותב רק ל-content ומאפס את הטורים).
 * - יש lastOcrTextSha256 — ערוך אם content שונה ממה ש-OCR כתב.
 * - אחרת (עמוד ישן): לא ערוך רק אם השתנה לאחרונה באותה כתיבה של OCR מקומי (lastOcrAt).
 * @param {{status?:string, content?:string, rightColumn?:string, leftColumn?:string,
 *   lastOcrTextSha256?:string, lastOcrAt?:Date|string, updatedAt?:Date|string}} p
 */
export function pageEditedByHuman(p) {
  if (p.status && p.status !== 'available') return true;
  if (!pageHasText(p)) return false;
  if (p.rightColumn?.trim() || p.leftColumn?.trim()) return true;
  if (p.lastOcrTextSha256) return ocrTextSha256(p.content ?? '') !== p.lastOcrTextSha256;
  const gap = time(p.updatedAt) - time(p.lastOcrAt);
  return !(gap >= 0 && gap <= LEGACY_OCR_WRITE_SLACK_MS);
}

// האם העמוד לא יעובד במצב הנתון (מצב לא מוכר מטופל כ-skip, כמו ברירת המחדל במודל)
export function pageSkippedInMode(p, mode) {
  if (mode === 'overwrite') return false;
  if (mode === 'skip_edited') return pageEditedByHuman(p);
  return pageHasText(p);
}

// עותק קל של עמוד לבחירה (בלי הטקסט עצמו, שעשוי להיות גדול) שנותן ל-pageHasText ול-pageEditedByHuman
// בדיוק את אותן תשובות כמו העמוד המלא: content מוחלף בסמן '1'/'', והטביעה נקבעת לפי הסמן.
export function selectionView(p) {
  const hasText = pageHasText(p);
  const edited = pageEditedByHuman(p);
  return {
    status: p.status,
    content: hasText ? '1' : '',
    lastOcrTextSha256: hasText && !edited ? ocrTextSha256('1') : undefined,
  };
}

// העדכון שנכתב לעמוד לאחר OCR: הטקסט מחליף את התוכן, והטורים מתאפסים
// (פלט ה-OCR הוא טקסט יחיד), יחד עם טביעת הטקסט (pageEditedByHuman). במצבי הדילוג ממילא
// נוגעים רק בעמודים שלא נערכו.
export function buildPageUpdate(text) {
  return {
    content: text,
    rightColumn: '',
    leftColumn: '',
    isTwoColumns: false,
    lastOcrTextSha256: ocrTextSha256(text),
  };
}

// ספירות לחלון "OCR לספר שלם": עמודים עם תמונה, עמודים עם טקסט, עמודים שנערכו בידי אדם, וכמה
// עמודים יעובדו בכל מצב (בדיוק לפי pageSkippedInMode — אותה בחירה כמו בעבודה עצמה).
export function countOcrPages(pages) {
  const counts = {
    pagesWithImage: 0,
    editedPagesCount: 0,
    humanEditedPagesCount: 0,
    toProcess: Object.fromEntries(EXISTING_TEXT_MODES.map((m) => [m, 0])),
  };
  for (const p of pages || []) {
    if (pageHasText(p)) counts.editedPagesCount += 1;
    if (pageEditedByHuman(p)) counts.humanEditedPagesCount += 1;
    if (!(typeof p.imagePath === 'string' && p.imagePath.trim() !== '')) continue;
    counts.pagesWithImage += 1;
    for (const m of EXISTING_TEXT_MODES) if (!pageSkippedInMode(p, m)) counts.toProcess[m] += 1;
  }
  return counts;
}
