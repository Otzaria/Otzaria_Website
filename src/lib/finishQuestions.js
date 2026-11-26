// שאלות בסיום עמוד: תיבות סימון רשות שמופיעות בחלון "סיום עמוד", מתחת לבדיקות האוטומטיות.
//
// שתי שכבות, כמו הנחיות העריכה:
//   * שאלות כלליות — SystemConfig (המפתח GLOBAL_FINISH_QUESTIONS_KEY), { items: string[] }
//   * שאלות לספר  — book.finishQuestions, { mode, items: string[] }
// mode קובע מה המתנדב רואה:
//   'base'        — רק השאלות הכלליות (ברירת המחדל, גם לספר בלי הגדרה)
//   'base+custom' — הכלליות ואחריהן של הספר
//   'custom'      — רק של הספר (במקום הכלליות)
// שלוש הבדיקות האוטומטיות (מילים חשודות, שורות, שמירה) מוצגות תמיד, בכל מצב.

export const GLOBAL_FINISH_QUESTIONS_KEY = 'global_finish_questions'

export const FINISH_QUESTION_MODES = Object.freeze({
  BASE: 'base',
  BASE_AND_CUSTOM: 'base+custom',
  CUSTOM: 'custom'
})

export const FINISH_QUESTION_MODE_LABELS = Object.freeze({
  [FINISH_QUESTION_MODES.BASE]: 'שאלות בסיס בלבד',
  [FINISH_QUESTION_MODES.BASE_AND_CUSTOM]: 'שאלות בסיס + שאלות לספר',
  [FINISH_QUESTION_MODES.CUSTOM]: 'שאלות לספר בלבד'
})

export const MAX_FINISH_QUESTIONS = 30
export const MAX_FINISH_QUESTION_LENGTH = 300

const VALID_MODES = new Set(Object.values(FINISH_QUESTION_MODES))

/** רשימת שאלות נקייה: מחרוזות בלבד, בלי רווחים מיותרים, בלי ריקות וכפולות, עם תקרה לאורך ולכמות */
export function normalizeQuestionItems(items) {
  if (!Array.isArray(items)) return []
  const seen = new Set()
  const out = []
  for (const raw of items) {
    if (typeof raw !== 'string') continue
    const text = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_FINISH_QUESTION_LENGTH)
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push(text)
    if (out.length >= MAX_FINISH_QUESTIONS) break
  }
  return out
}

/** השאלות הכלליות כפי שנשמרות ב-SystemConfig */
export function normalizeGlobalFinishQuestions(value) {
  return { items: normalizeQuestionItems(value?.items) }
}

/** ההגדרה של ספר. מצב לא מוכר או חסר → 'base' */
export function normalizeBookFinishQuestions(value) {
  const mode = VALID_MODES.has(value?.mode) ? value.mode : FINISH_QUESTION_MODES.BASE
  return { mode, items: normalizeQuestionItems(value?.items) }
}

/**
 * השאלות שיוצגו בחלון הסיום, לפי מצב הספר.
 * @returns {{ id: string, text: string, source: 'global'|'book' }[]}
 */
export function resolveFinishQuestions(globalValue, bookValue) {
  const globalItems = normalizeGlobalFinishQuestions(globalValue).items
  const book = normalizeBookFinishQuestions(bookValue)
  const fromGlobal = globalItems.map((text, i) => ({ id: `global-${i}`, text, source: 'global' }))
  const fromBook = book.items.map((text, i) => ({ id: `book-${i}`, text, source: 'book' }))

  if (book.mode === FINISH_QUESTION_MODES.CUSTOM) return fromBook
  if (book.mode === FINISH_QUESTION_MODES.BASE_AND_CUSTOM) {
    // שאלה של הספר שזהה לשאלה כללית — פעם אחת
    const globalSet = new Set(globalItems)
    return [...fromGlobal, ...fromBook.filter((q) => !globalSet.has(q.text))]
  }
  return fromGlobal
}

/** טקסט מרובה שורות (שורה = שאלה) → רשימה */
export function questionsFromText(text) {
  return normalizeQuestionItems(String(text ?? '').split('\n'))
}
