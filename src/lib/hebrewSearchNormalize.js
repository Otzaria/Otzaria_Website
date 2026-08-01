// נרמול עברית לחיפוש — משותף לאינדוקס בשרת ולהדגשת תוצאות בקליינט.
// ראו docs/PLUGIN_STORE_REDESIGN_PLAN.md סעיף 8.3.
//
// דוגמאות (משמשות גם כבדיקות ידניות):
//   normalizeHebrew('גִּימַטְרִיָּה')  → 'גימטריה'
//   normalizeHebrew('ר"ת ותוס׳')       → 'רת ותוס'
//   normalizeHebrew('שֻׁלְחָן עָרוּךְ') → 'שולחנ ערוכ'
//   expandTermVariants('לגימטריה')     → ['לגימטריה', 'גימטריה']
//   expandTermVariants('חיים')         → ['חיימ', 'חימ']

// הרחבת תחיליות שימוש (ו/ה/ב/ל/מ/ש/כ) — דגל כיבוי מרוכז.
// עלולה להוסיף רעש ("מלבן"→"לבן"); הדירוג ממילא מעדיף התאמה מלאה.
export const STRIP_HEBREW_PREFIXES = true

const HEBREW_PREFIX_LETTERS = new Set(['ו', 'ה', 'ב', 'ל', 'מ', 'ש', 'כ'])

const FINAL_LETTERS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }

export function normalizeHebrew(text) {
  if (!text) return ''
  return String(text)
    .normalize('NFKC')
    // ניקוד וטעמים
    .replace(/[֑-ׇ]/g, '')
    // גרש/גרשיים/מירכאות לסוגיהם
    .replace(/[׳״'"’”`]/g, '')
    // אותיות סופיות
    .replace(/[ךםןףץ]/g, (ch) => FINAL_LETTERS[ch])
    .toLowerCase()
    // כל מה שאינו אות עברית/לטינית או ספרה → רווח
    .replace(/[^a-z0-9א-ת]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// פירוק טקסט למונחים מנורמלים
export function tokenizeHebrew(text) {
  return normalizeHebrew(text).split(' ').filter(Boolean)
}

// וריאנטים של מונח בודד (מנורמל) — מרחיב את מרחב ההתאמה באינדוקס ובשאילתה:
// 1. המונח עצמו
// 2. וריאנט "חסר": כיווץ י/ו כפולות (כתיב מלא ↔ מקובל)
// 3. הצורה ללא אות תחילית (ו/ה/ב/ל/מ/ש/כ) למילים באורך 4 ומעלה
export function expandTermVariants(term) {
  if (!term) return []
  const variants = new Set([term])

  const collapsed = term.replace(/יי+/g, 'י').replace(/וו+/g, 'ו')
  if (collapsed !== term) variants.add(collapsed)

  if (STRIP_HEBREW_PREFIXES && term.length >= 4 && HEBREW_PREFIX_LETTERS.has(term[0])) {
    const stripped = term.slice(1)
    variants.add(stripped)
    const strippedCollapsed = stripped.replace(/יי+/g, 'י').replace(/וו+/g, 'ו')
    if (strippedCollapsed !== stripped) variants.add(strippedCollapsed)
  }

  return Array.from(variants)
}
