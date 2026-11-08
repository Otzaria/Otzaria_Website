// צורת הדף — תוויות בעברית למסך הניהול (סוגי גוש, הכרעות, קטגוריות דיווח, רמזים). שמות המצבים — lib/adminTzuratScreen/tzuratTerms.
// הערכים עצמם — CONTRACT.md ו-PACKAGE.md.

export const KIND_LABEL = Object.freeze({ g: 'גמרא', r: 'רש"י', t: 'תוספות', mg: 'גיליון ושוליים' })
export const kindLabel = (k) => KIND_LABEL[k] || (String(k || '').startsWith('mg') ? KIND_LABEL.mg : k || '—')

export const QUESTION_LABEL = Object.freeze({
  replace: 'מה כתוב בדפוס?',
  print_only: 'מילים שבדפוס ואינן אצלנו',
  otz_only: 'מילים שאצלנו ואינן בדפוס',
  paren: 'מראה מקום בסוגריים',
})

export const VERDICT_LABEL = Object.freeze({
  print: 'כמו הדפוס',
  otz: 'כמו אוצריא',
  other: 'טקסט אחר',
  elsewhere: 'נדפס במקום אחר',
  unclear: 'לא ברור',
})

// איך המתנדב ענה: במסלול המהיר (שאלה בודדת בכל פעם) או תוך בדיקת עמוד
export const VIA_LABEL = Object.freeze({ fast: 'במסלול המהיר (שאלה בודדת)', page: 'תוך בדיקת עמוד' })

// רמזים מהעדים בצורת הדף (למנהל בלבד): te — תורת אמת, oh — מקור נוסף, bx — ה-OCR של הסריקה, rule — כלל כתיבה שזוהה
export const HINT_LABEL = Object.freeze({ te: 'תורת אמת', oh: 'מקור נוסף', bx: 'זיהוי הטקסט בסריקה', rule: 'כלל כתיבה' })
// ערכי rule (מזהים באנגלית מהחבילה) — בעברית; ערך לא מוכר מוצג כמו שהוא
export const RULE_LABEL = Object.freeze({ abbr: 'ראשי תיבות וקיצורים' })

/** רמזי הפריט כרשימת תגיות קצרות: [{key, text}] (בלי ערכים ריקים). */
export function hintBadges(hints) {
  if (!hints || typeof hints !== 'object') return []
  const out = []
  for (const [k, v] of Object.entries(hints)) {
    if (v === null || v === undefined || v === '') continue
    const val = typeof v === 'string' ? (k === 'rule' ? RULE_LABEL[v] : VERDICT_LABEL[v]) || v : JSON.stringify(v)
    out.push({ key: k, text: `${HINT_LABEL[k] || k}: ${val}` })
  }
  return out
}

/**
 * ההכרעות שהמנהל יכול לתת לפריט, לפי סוג השאלה. elsewhere — רק כשהשאלה על מילים שאצלנו בלבד
 * (otz_only, או paren שצד הדפוס שלו ריק).
 */
export function resolveVerdicts(item) {
  const printEmpty = !(item?.print || []).length
  const out = ['print', 'otz', 'other']
  if (item?.question === 'otz_only' || (item?.question === 'paren' && printEmpty)) out.push('elsewhere')
  return out
}

export const REPORT_CATEGORY = Object.freeze({
  missing: 'חסר טקסט',
  extra: 'טקסט עודף',
  linebreak: 'שבירת שורה',
  block: 'גוש',
  size: 'גודל אות',
  header: 'כותרת',
  ein_mishpat: 'עין משפט',
  gilyon: 'גיליון',
  overflow: 'גלישה',
  other: 'אחר',
})

export const CHECK_LABEL = Object.freeze({ blocks: 'גושים', headers: 'כותרות', edges: 'קצוות', size: 'גודל אות' })
export const CHECK_VALUE = Object.freeze({ ok: 'תקין', issue: 'בעיה' })

/** מילים כמחרוזת (מערך או מחרוזת). */
export const words = (w) => (Array.isArray(w) ? w.join(' ') : String(w ?? ''))
