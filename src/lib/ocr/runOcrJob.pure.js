// פונקציות טהורות של runOcrJob.js — ללא DB/fs/network — מופרדות כדי שניתן
// יהיה לבדוק אותן ביחידה.
import { createHash } from 'node:crypto';
import { normalizePageRange, pageInRange } from '../pageRange.js';
import { pageRunsOf } from './pageRuns.js';

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
 * - טקסט בטורים — ערוך (OCR כותב רק ל-content ומאפס את הטורים).
 * - יש lastOcrTextSha256 — ערוך אם content שונה ממה ש-OCR כתב, גם אם נמחק כולו.
 * - בלי טביעה, contentSaveRevision הוא עדות לשמירה אנושית, גם אם העמוד ריק.
 * - עמוד ריק בלי עדות לעריכה — לא ערוך.
 * - אחרת (עמוד ישן): לא ערוך רק אם השתנה לאחרונה באותה כתיבה של OCR מקומי (lastOcrAt).
 * @param {{status?:string, content?:string, rightColumn?:string, leftColumn?:string,
 *   contentSaveRevision?:number, lastOcrTextSha256?:string, lastOcrAt?:Date|string, updatedAt?:Date|string}} p
 */
export function pageEditedByHuman(p) {
  if (p.status && p.status !== 'available') return true;
  if (p.rightColumn?.trim() || p.leftColumn?.trim()) return true;
  if (p.lastOcrTextSha256) return ocrTextSha256(p.content ?? '') !== p.lastOcrTextSha256;
  if (p.contentSaveRevision > 0) return true;
  if (!pageHasText(p)) return false;
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
// revision חיובי מסמן כאן עריכה גם בעמוד ריק; עותק הבחירה אינו נכתב חזרה למסד.
export function selectionView(p) {
  const hasText = pageHasText(p);
  const edited = pageEditedByHuman(p);
  return {
    status: p.status,
    content: hasText ? '1' : '',
    lastOcrTextSha256: hasText && !edited ? ocrTextSha256('1') : undefined,
    ...(edited ? { contentSaveRevision: 1 } : {}),
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

// טווח העמודים ("מעמוד / עד עמוד") השמור בעבודה (OcrJob.pageRange) → { from, to } או null (כל הספר).
// ערך שמור פגום — כל הספר, כמו עבודה בלי טווח. נפרד בכוונה מ-job.options (שהוא חלק ממעטפת
// העובד המקומי — הטווח אינו נחשף לעובד; ה-PDF וה-pageMap פשוט מכילים רק עמודים בטווח).
export function jobPageRange(job) {
  const r = job?.pageRange;
  if (!r) return null;
  const n = normalizePageRange({ from: r.from, to: r.to });
  return n.ok ? n.range : null;
}

// העמודים שעבודת שרת (gemini/ocrwin) מעבדת: עם תמונה, לא מדולגים במצב, ובטווח (null = הכל).
// שומר על הסדר המקורי (runOcrJob ממיין לפי pageNumber בשאילתה).
export function selectServerJobPages(pages, mode, range = null) {
  return (pages || []).filter(
    (p) => !!p.imagePath && !pageSkippedInMode(p, mode) && pageInRange(p.pageNumber, range)
  );
}

// ספירות לחלון "OCR לספר שלם": עמודים עם תמונה, עמודים עם טקסט, עמודים שנערכו בידי אדם, וכמה
// עמודים יעובדו בכל מצב (בדיוק לפי pageSkippedInMode — אותה בחירה כמו בעבודה עצמה).
// range — toProcess נספר רק בטווח (שאר הספירות לכל הספר, לתצוגה). withRuns — מוסיף
// toProcessRuns (רצפי מספרי העמודים שיעובדו בכל מצב, לכל הספר — הטופס סופר מהם לפי הטווח שנבחר)
// ו-maxPageNumber (מספר העמוד הגבוה בספר, לשדה "עד עמוד"). שניהם דורשים pageNumber בעמודים.
export function countOcrPages(pages, { range = null, withRuns = false } = {}) {
  const counts = {
    pagesWithImage: 0,
    editedPagesCount: 0,
    humanEditedPagesCount: 0,
    toProcess: Object.fromEntries(EXISTING_TEXT_MODES.map((m) => [m, 0])),
  };
  const numbers = withRuns ? Object.fromEntries(EXISTING_TEXT_MODES.map((m) => [m, []])) : null;
  let maxPageNumber = 0;
  for (const p of pages || []) {
    if (withRuns && Number.isSafeInteger(p.pageNumber) && p.pageNumber > maxPageNumber) maxPageNumber = p.pageNumber;
    if (pageHasText(p)) counts.editedPagesCount += 1;
    if (pageEditedByHuman(p)) counts.humanEditedPagesCount += 1;
    if (!(typeof p.imagePath === 'string' && p.imagePath.trim() !== '')) continue;
    counts.pagesWithImage += 1;
    const inRange = pageInRange(p.pageNumber, range);
    for (const m of EXISTING_TEXT_MODES) {
      if (pageSkippedInMode(p, m)) continue;
      if (inRange) counts.toProcess[m] += 1;
      if (numbers) numbers[m].push(p.pageNumber);
    }
  }
  if (withRuns) {
    counts.toProcessRuns = Object.fromEntries(EXISTING_TEXT_MODES.map((m) => [m, pageRunsOf(numbers[m])]));
    counts.maxPageNumber = maxPageNumber;
  }
  return counts;
}
