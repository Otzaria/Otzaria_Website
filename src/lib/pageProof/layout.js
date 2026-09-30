// העדפות-התצוגה של עורך הגהת-העמודים, שנשמרות בדפדפן ('pageProof.layout'):
// רוחב לוח-הסריקה באחוזים, באיזה צד הסריקה, וגודל וגופן הטקסט בתצוגה.
// לוגיקה טהורה — הקריאה/הכתיבה ל-localStorage נעשית בעורך.
//
// הדף מימין לשמאל: בברירת-המחדל הסריקה מימין והטקסט משמאל (כמו בעורך הישן
// של האתר); swap מחליף ביניהם.

export const LAYOUT_KEY = 'pageProof.layout';
export const SPLIT_MIN = 20;
export const SPLIT_MAX = 80;
export const SPLIT_STEP = 2;
export const FONT_MIN = 12;
export const FONT_MAX = 40;

export const LAYOUT_DEFAULT = Object.freeze({ split: 50, swap: false, fontSize: 20, fontFamily: null });

// רוחב לוח-הסריקה באחוזים, בין 20 ל-80 (עשירית-אחוז)
export function clampSplit(n) {
  const v = Number.isFinite(n) ? n : LAYOUT_DEFAULT.split;
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(v * 10) / 10));
}

// ההעדפות מהמחרוזת השמורה (או מאובייקט); ערך חסר/פגום ← ברירת-המחדל שלו
export function readLayout(raw) {
  let v = raw;
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw);
    } catch {
      v = null;
    }
  }
  const out = { ...LAYOUT_DEFAULT };
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  if (Number.isFinite(v.split)) out.split = clampSplit(v.split);
  if (typeof v.swap === 'boolean') out.swap = v.swap;
  if (Number.isFinite(v.fontSize)) out.fontSize = Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(v.fontSize)));
  if (typeof v.fontFamily === 'string' && v.fontFamily.trim() && v.fontFamily.length <= 200) out.fontFamily = v.fontFamily;
  return out;
}

// רוחב לוח-הסריקה לפי מקום המפריד בזמן גרירה. rect = מלבן אזור-הלוחות;
// בלי swap הסריקה בצד ימין (רוחבה = מהמצביע עד הקצה הימני), עם swap — בצד
// שמאל. null כשאין למלבן רוחב.
export function splitFromPointer(rect, clientX, swap = false) {
  const w = Number(rect?.width) || 0;
  if (w <= 0 || !Number.isFinite(clientX)) return null;
  const px = swap ? clientX - rect.left : rect.right - clientX;
  return clampSplit((px / w) * 100);
}

// הזזת המפריד מהמקלדת (← / → / Home / End). החץ מזיז את המפריד לכיוונו:
// כשהסריקה מימין, ← מרחיב אותה; כשהיא משמאל — מצר. null למקש אחר.
export function nudgeSplit(split, key, swap = false) {
  const cur = clampSplit(split);
  if (key === 'Home') return SPLIT_MIN;
  if (key === 'End') return SPLIT_MAX;
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
  const towardLeft = key === 'ArrowLeft';
  const grows = swap ? !towardLeft : towardLeft;
  return clampSplit(cur + (grows ? SPLIT_STEP : -SPLIT_STEP));
}
