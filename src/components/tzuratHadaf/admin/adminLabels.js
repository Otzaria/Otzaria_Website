// צורת הדף — תוויות בעברית למסך הניהול (סטטוסים, סוגי גוש, הכרעות, קטגוריות דיווח, רמזים).
// הערכים עצמם — CONTRACT.md ו-PACKAGE.md.

export const ITEM_STATUS = Object.freeze({
  open: 'פתוח',
  agreed: 'הוסכם',
  disputed: 'במחלוקת',
  resolved: 'הוכרע',
  flagged: 'סומן — החיתוך לא מראה',
  obsolete: 'לא רלוונטי',
})
export const ITEM_STATUS_ORDER = ['disputed', 'flagged', 'open', 'agreed', 'resolved', 'obsolete']

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

export const VIA_LABEL = Object.freeze({ fast: 'מסלול מהיר', page: 'בדיקת עמוד' })

// רמזים מהעדים בצורת הדף (למנהל בלבד): te — תורת אמת, oh — עד נוסף, bx — ה-OCR של הסריקה
export const HINT_LABEL = Object.freeze({ te: 'תורת אמת', oh: 'עד נוסף', bx: 'OCR', rule: 'כלל' })

/** רמזי הפריט כרשימת תגיות קצרות: [{key, text}] (בלי ערכים ריקים). */
export function hintBadges(hints) {
  if (!hints || typeof hints !== 'object') return []
  const out = []
  for (const [k, v] of Object.entries(hints)) {
    if (v === null || v === undefined || v === '') continue
    const val = typeof v === 'string' ? VERDICT_LABEL[v] || v : JSON.stringify(v)
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

export const REPORT_STATUS = Object.freeze({
  new: 'חדש',
  in_progress: 'בטיפול',
  fixed: 'תוקן',
  wontfix: 'לא יתוקן',
  duplicate: 'כפול',
})

export const SUBMISSION_STATUS = Object.freeze({ processing: 'שמירה לא הושלמה', submitted: 'ממתינות', approved: 'אושרו', rejected: 'נדחו' })

export const UPLOAD_STATUS = Object.freeze({
  uploading: 'בהעלאה',
  queued: 'בתור לעיבוד',
  processing: 'בעיבוד',
  done: 'הסתיים',
  failed: 'נכשל',
})

export const BATCH_STATUS = Object.freeze({ active: 'פעילה', paused: 'מושהית' })

export const CHECK_LABEL = Object.freeze({ blocks: 'גושים', headers: 'כותרות', edges: 'קצוות', size: 'גודל אות' })
export const CHECK_VALUE = Object.freeze({ ok: 'תקין', issue: 'בעיה' })

export const TONE = Object.freeze({
  open: 'bg-info-50 text-info-800',
  agreed: 'bg-success-50 text-success-800',
  disputed: 'bg-warning-100 text-warning-800',
  resolved: 'bg-success-100 text-success-800',
  flagged: 'bg-danger-50 text-danger-700',
  obsolete: 'bg-surface-variant/60 text-on-surface/70',
  new: 'bg-info-50 text-info-800',
  in_progress: 'bg-warning-100 text-warning-800',
  fixed: 'bg-success-50 text-success-800',
  wontfix: 'bg-surface-variant/60 text-on-surface/70',
  duplicate: 'bg-surface-variant/60 text-on-surface/70',
  submitted: 'bg-info-50 text-info-800',
  approved: 'bg-success-50 text-success-800',
  rejected: 'bg-danger-50 text-danger-700',
  uploading: 'bg-info-50 text-info-800',
  queued: 'bg-info-50 text-info-800',
  processing: 'bg-warning-100 text-warning-800',
  done: 'bg-success-50 text-success-800',
  failed: 'bg-danger-50 text-danger-700',
  active: 'bg-success-50 text-success-800',
  paused: 'bg-surface-variant/60 text-on-surface/70',
})

/** מילים כמחרוזת (מערך או מחרוזת). */
export const words = (w) => (Array.isArray(w) ? w.join(' ') : String(w ?? ''))
