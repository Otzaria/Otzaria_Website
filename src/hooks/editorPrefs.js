// העדפות התצוגה של העורך החדש — לוגיקה טהורה (בלי window/localStorage), כדי שתיבדק לבד
// (editorPrefs.test.js). ה-hook שקורא וכותב ל-localStorage: useEditorPrefs.js.
//
// כל ערך שמגיע מהאחסון עובר ולידציה: ערך לא מוכר, מחוץ לטווח או מטיפוס שגוי → ברירת המחדל.
// כך גרסה ישנה של האתר, עריכה ידנית של localStorage או שדה שהוסר לא שוברים את העורך.

/** גרסת הסכמה. מעלים כשמשמעות של שדה קיים משתנה (לא כשמוסיפים שדה — שדה חסר מקבל ברירת מחדל). */
export const EDITOR_PREFS_VERSION = 7

export const EDITOR_PREFS_STORAGE_KEY = 'otzaria-editor-prefs'

export const EDITOR_THEMES = ['light', 'paper', 'evening']
/**
 * גופן ההקלדה: frank — עם תגים (סריף); sans / assistant / noto / ibmPlex / googleSans / openSans — בלי תגים (נוחים יותר למסך).
 * sans ו-noto (ואחריהם ibmPlex / googleSans / openSans) נוספו בגרסה 5 בלי העלאת גרסה: ערכים חדשים
 * בלבד, משמעות הקיימים לא השתנתה; ערך לא מוכר חוזר לברירת המחדל.
 * התוויות, הקבוצות וה-font-family — editorShellLogic.js (EDITOR_FONT_OPTIONS, editorFontFamily).
 */
export const EDITOR_FONTS = ['frank', 'sans', 'assistant', 'noto', 'ibmPlex', 'googleSans', 'openSans']
/**
 * סידור השורות (השם lineSpacing היסטורי — עד גרסה 6 הוא קבע גם את גובה השורה): 'facing' — שורה
 * מול שורה כמו בצילום, בלי גלישה (רק כשהטקסט באמת מחולק לשורות — effectiveWrap); 'fixed' — גלישה רגילה.
 */
export const LINE_SPACING_MODES = ['facing', 'fixed']
/** ריווח השורות (גובה השורה) — מגרסה 6, נפרד מסידור השורות. הערכים המספריים: editorShellLogic.LINE_HEIGHT */
export const LINE_HEIGHTS = ['compact', 'normal', 'relaxed', 'loose']
/** רווח בין פסקאות (שורות לוגיות) — בתצוגה המעוצבת בלבד. הערכים: editorShellLogic.PARA_GAP_EM */
export const PARA_SPACINGS = ['none', 'small', 'medium', 'large']
/** יישור הטקסט בעורך (textarea, שכבת ה-mirror ותצוגה עשירה — כולם מאותה העדפה) */
export const TEXT_ALIGNMENTS = ['justify', 'right', 'center', 'left']
/** עוצמת סימון המילה והשורה (בצילום ובטקסט) */
export const HIGHLIGHT_STRENGTHS = ['strong', 'normal']
/** תצוגת הטקסט בעורך: 'rich' — העיצוב (מודגש נראה מודגש); 'code' — המחרוזת עם התגים, כמו שנשמרת */
export const TEXT_VIEWS = ['rich', 'code']

/** טווחי המחוונים — משותפים לולידציה ולגיליון התצוגה */
export const PREF_RANGES = {
  // טווח רחב: העורך הישן איפשר 10–60 (textZoom), ומתנדבים עם ראייה חלשה משתמשים בגופן גדול
  fontSize: { min: 12, max: 40, step: 1 },
  scanBrightness: { min: 50, max: 110, step: 2 },
  scanContrast: { min: 80, max: 140, step: 2 },
  restIntervalMin: { min: 5, max: 60, step: 5 }
}

export const DEFAULT_EDITOR_PREFS = Object.freeze({
  theme: 'light',
  // פרנק ריהל (Frank Ruehl CLM) — גופן ההקלדה כברירת מחדל מגרסה 3
  fontFamily: 'frank',
  fontSize: 18,
  // יישור לשני הצדדים (השורה האחרונה בכל פסקה — לימין, text-align-last: auto) מגרסה 4
  textAlign: 'justify',
  lineSpacing: 'facing',
  // מגרסה 6: גובה השורה; מגרסה 7 ברירת המחדל "מרווח" (2.4) — נוח יותר לקריאה ממושכת
  lineHeight: 'relaxed',
  // מגרסה 6: רווח בין פסקאות בתצוגה המעוצבת (ב-textarea אין דרך להוסיף רווח בין שורות);
  // מגרסה 7 ברירת המחדל "גדול"
  paraSpacing: 'large',
  scanBrightness: 100,
  scanContrast: 100,
  trackingFrame: true,
  followScroll: true,
  lineStrip: false,
  highlightStrength: 'strong',
  // כבויה כברירת מחדל — מי שרוצה מפעיל בגיליון התצוגה (החלטה פתוחה 6 בתוכנית)
  restReminder: false,
  restIntervalMin: 20,
  // מגרסה 4: הטקסט מוצג מעוצב (RichTextArea); "קוד" — ה-textarea עם התגים, כמו קודם
  textView: 'rich',
  // מגרסה 5: עימוד ספר בתצוגה המעוצבת — "חלון" בתחילת פסקה וסיום משולש (תצוגה בלבד).
  // מגרסה 6 כבויים כברירת מחדל — מי שרוצה מדליק בגיליון התצוגה
  paraWindow: false,
  paraFunnel: false
})

const ENUMS = {
  theme: EDITOR_THEMES,
  fontFamily: EDITOR_FONTS,
  lineSpacing: LINE_SPACING_MODES,
  lineHeight: LINE_HEIGHTS,
  paraSpacing: PARA_SPACINGS,
  highlightStrength: HIGHLIGHT_STRENGTHS,
  textAlign: TEXT_ALIGNMENTS,
  textView: TEXT_VIEWS
}

const BOOLEANS = ['trackingFrame', 'followScroll', 'lineStrip', 'restReminder', 'paraWindow', 'paraFunnel']

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** מספר בטווח (מעוגל לשלם); אחרת undefined */
function validNumber(value, { min, max }) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** ערך אחד: מחזיר את הערך התקף, או undefined אם השדה לא מוכר או שהערך פסול */
export function validatePref(key, value) {
  if (Object.prototype.hasOwnProperty.call(ENUMS, key)) return ENUMS[key].includes(value) ? value : undefined
  if (BOOLEANS.includes(key)) return typeof value === 'boolean' ? value : undefined
  if (Object.prototype.hasOwnProperty.call(PREF_RANGES, key)) return validNumber(value, PREF_RANGES[key])
  return undefined
}

/** אובייקט כלשהו → העדפות מלאות ותקפות (שדות פסולים או חסרים — ברירת מחדל; שדות זרים נזרקים) */
export function sanitizeEditorPrefs(raw) {
  const source = isPlainObject(raw) ? raw : {}
  const out = { ...DEFAULT_EDITOR_PREFS }
  for (const key of Object.keys(DEFAULT_EDITOR_PREFS)) {
    const valid = validatePref(key, source[key])
    if (valid !== undefined) out[key] = valid
  }
  return out
}

/** עדכון חלקי: רק שדות תקפים מה-patch נכנסים; השאר נשארים כמו ב-current */
export function mergeEditorPrefs(current, patch) {
  const base = sanitizeEditorPrefs(current)
  if (!isPlainObject(patch)) return base
  const out = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    const valid = validatePref(key, value)
    if (valid !== undefined) out[key] = valid
  }
  return out
}

/**
 * מעבר בין גרסאות. רשומה בלי version (או מגרסה עתידית לא מוכרת) — שומרים ממנה רק את מה שעובר
 * ולידציה, כך שלא מאבדים העדפות שלא השתנו.
 * גרסה 1 → 2: נוסף highlightStrength; ברשומת גרסה 1 הוא חסר ולכן מקבל את ברירת המחדל "חזק"
 * (הסימון הקודם, העדין, נמצא חלש מדי) — מי שמעדיף יחזיר ל"רגיל" בגיליון התצוגה.
 * גרסה 2 → 3: ברירת המחדל של גופן ההקלדה הפכה לפרנק ריהל. אי אפשר להבחין בין מי שבחר
 * "אסיסטנט" לבין מי שנשאר על ברירת המחדל הישנה, ולכן כל רשומה מגרסה קודמת (או בלי version)
 * עוברת לפרנק ריהל פעם אחת; מגרסה 3 והלאה הבחירה נשמרת כמו שהיא.
 * גרסה 3 → 4: נוסף textAlign (עד אז ב-localStorage 'textAlign' של העמוד, ברירת מחדל "ימין");
 * ברירת המחדל החדשה — לשני הצדדים. מי שבחר בעבר יישור אחר מ"ימין" — legacyTextAlignPatch.
 * באותה גרסה נוספה גם textView (תצוגה מעוצבת / קוד). רשומה מגרסה קודמת מקבלת את ברירת המחדל
 * "מעוצבת" במפורש — גם אם נשאר בה (מעריכה ידנית) ערך אחר.
 * גרסה 4 → 5: נוספו paraWindow ו-paraFunnel (עימוד ספר בתצוגה המעוצבת). רשומה מגרסה קודמת
 * מקבלת את ברירת המחדל במפורש — הם לא היו קיימים, ולכן אין בחירה קודמת לשמר.
 * גרסה 5 → 6: גובה השורה נפרד מ-lineSpacing לשדה lineHeight (ונוסף paraSpacing, ברירת מחדל "בלי").
 * עד עכשיו "מול הסריקה" היה גם גובה 2 ו"קבוע" — 1.625; כדי שהטקסט ייראה כמו קודם, "קבוע" עובר
 * ל"צפוף" (1.6) ו"מול הסריקה" ל"רגיל" (2). lineSpacing עצמו נשמר (הוא עדיין קובע את הגלישה).
 * באותה גרסה עימוד הספר (paraWindow, paraFunnel) כבוי כברירת מחדל. רשומה ששניהם דלוקים בה —
 * ברירת המחדל הישנה — עוברת לכבויים; מי שכיבה אחד מהם (בחירה מפורשת) נשאר כמו שהוא.
 * גרסה 6 → 7: ברירות המחדל של הריווח — "מרווח" ורווח פסקאות "גדול". רשומה שנשארה על ברירות
 * המחדל של גרסה 6 (רגיל + בלי) עוברת לחדשות; בחירה אחרת נשמרת. רשומה מלפני גרסה 6 מקבלת את
 * החדשות ישירות, אלא אם בחרה "קבוע" (שעובר ל"צפוף", כמו קודם).
 */
export function migrateEditorPrefs(stored) {
  if (!isPlainObject(stored)) return { ...DEFAULT_EDITOR_PREFS }
  const prefs = sanitizeEditorPrefs(isPlainObject(stored.prefs) ? stored.prefs : stored)
  const version = Number.isInteger(stored.version) ? stored.version : 1
  if (version < 3) prefs.fontFamily = 'frank'
  if (version < 4) prefs.textAlign = DEFAULT_EDITOR_PREFS.textAlign
  if (version < 4) prefs.textView = DEFAULT_EDITOR_PREFS.textView
  if (version < 5) {
    prefs.paraWindow = DEFAULT_EDITOR_PREFS.paraWindow
    prefs.paraFunnel = DEFAULT_EDITOR_PREFS.paraFunnel
  }
  if (version < 6) {
    prefs.lineHeight = prefs.lineSpacing === 'fixed' ? 'compact' : DEFAULT_EDITOR_PREFS.lineHeight
    prefs.paraSpacing = DEFAULT_EDITOR_PREFS.paraSpacing
    if (prefs.paraWindow && prefs.paraFunnel) {
      prefs.paraWindow = false
      prefs.paraFunnel = false
    }
  } else if (version < 7 && prefs.lineHeight === 'normal' && prefs.paraSpacing === 'none') {
    prefs.lineHeight = DEFAULT_EDITOR_PREFS.lineHeight
    prefs.paraSpacing = DEFAULT_EDITOR_PREFS.paraSpacing
  }
  return prefs
}

/** מחרוזת מהאחסון → העדפות. JSON שבור או ריק → ברירות מחדל */
export function parseStoredEditorPrefs(text) {
  if (typeof text !== 'string' || text === '') return { ...DEFAULT_EDITOR_PREFS }
  try {
    return migrateEditorPrefs(JSON.parse(text))
  } catch {
    return { ...DEFAULT_EDITOR_PREFS }
  }
}

export function serializeEditorPrefs(prefs) {
  return JSON.stringify({ version: EDITOR_PREFS_VERSION, prefs: sanitizeEditorPrefs(prefs) })
}

/** האם שתי רשומות העדפות זהות (לחיסכון בכתיבה ובשינוי state) */
export function editorPrefsEqual(a, b) {
  return Object.keys(DEFAULT_EDITOR_PREFS).every((key) => a?.[key] === b?.[key])
}

/** מפתחות ה-localStorage של העורך הישן — גופן וגודל הטקסט (נקראים פעם אחת, בהעברה) */
export const LEGACY_FONT_KEY = 'selectedFont'
export const LEGACY_TEXT_ZOOM_KEY = 'textZoom'
/** היישור של העורך הישן (נקרא פעם אחת ונמחק — legacyTextAlignPatch) */
export const LEGACY_TEXT_ALIGN_KEY = 'textAlign'
/** סימון שההעברה מהמפתחות הישנים כבר נעשתה (כדי לא לדרוס בחירה חדשה בגיליון התצוגה) */
export const LEGACY_MIGRATED_KEY = 'otzaria-editor-prefs-legacy-migrated'

// גופנים עם תגים (serif) → פרנק ריהל; כל השאר (Arial, Verdana, monospace...) → אסיסטנט
const SERIF_FONT_RE = /times|georgia|frank|david|serif/i

/**
 * הגדרות העורך הישן (selectedFont, textZoom — מחרוזות כפי שנשמרו ב-localStorage) → patch להעדפות.
 * רק מה שקיים ותקף נכנס; לא קיים כלום — אובייקט ריק. sans-serif נספר כ-sans ולא כ-serif.
 *
 * @param {{ selectedFont?: string | null, textZoom?: string | null }} legacy
 */
export function legacyEditorPrefsPatch({ selectedFont, textZoom } = {}) {
  const patch = {}
  if (typeof selectedFont === 'string' && selectedFont.trim()) {
    const font = selectedFont.replace(/sans-serif/gi, '')
    patch.fontFamily = SERIF_FONT_RE.test(font) ? 'frank' : 'assistant'
  }
  if (typeof textZoom === 'string' && textZoom.trim()) {
    const size = validatePref('fontSize', Number.parseInt(textZoom, 10))
    if (size !== undefined) patch.fontSize = size
  }
  return patch
}

/**
 * היישור הישן (localStorage 'textAlign') → patch. "ימין" היה ברירת המחדל הישנה, ולכן מי שנשאר
 * עליו עובר ליישור לשני הצדדים (ברירת המחדל החדשה) — patch ריק; בחירה אחרת תקפה נשמרת.
 *
 * @param {string | null | undefined} value
 */
export function legacyTextAlignPatch(value) {
  if (value === 'right') return {}
  const align = validatePref('textAlign', value)
  return align === undefined ? {} : { textAlign: align }
}

/**
 * העברה מהמפתחות של העורך הישן (selectedFont, textZoom, textAlign) — רק כשאין עדיין רשומת
 * העדפות חדשה: מי שכבר בחר בגיליון התצוגה לא נדרס משאריות ישנות. בכל מקרה המפתחות הישנים
 * (וסימון ההעברה הישן) נמחקים, כך שההעברה לא חוזרת לעולם.
 *
 * @param {Pick<Storage, 'getItem' | 'removeItem'>} storage
 * @param {string} [prefsKey]
 * @returns {Partial<typeof DEFAULT_EDITOR_PREFS>} ה-patch להחלה (ריק — אין מה להעביר)
 */
export function migrateLegacyEditorPrefs(storage, prefsKey = EDITOR_PREFS_STORAGE_KEY) {
  const keys = [LEGACY_FONT_KEY, LEGACY_TEXT_ZOOM_KEY, LEGACY_TEXT_ALIGN_KEY]
  const hasPrefs = storage.getItem(prefsKey) !== null
  const patch = hasPrefs
    ? {}
    : {
        ...legacyEditorPrefsPatch({
          selectedFont: storage.getItem(LEGACY_FONT_KEY),
          textZoom: storage.getItem(LEGACY_TEXT_ZOOM_KEY)
        }),
        ...legacyTextAlignPatch(storage.getItem(LEGACY_TEXT_ALIGN_KEY))
      }
  for (const key of [...keys, LEGACY_MIGRATED_KEY]) storage.removeItem(key)
  return patch
}
