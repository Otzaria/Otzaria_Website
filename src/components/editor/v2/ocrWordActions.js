// הפעולות על מילה חשודה, משותפות לחלונית "מילים חשודות" (OcrWordReviewPanel) ולחלונית שעל המילה
// (OcrWordPopup): לפני כל החלפה או סימון "המילה תקינה" — השדה החי חייב להכיל בדיוק את הטקסט שעליו
// חושבה הבדיקה (הקלדה, רינדור או משיכה מהשרת אולי שינו אותו מאז שהכפתור הוצג). ההחלפה עצמה עוברת
// באותו מסלול עריכה של העורך (applyFieldEdit) — צעד ביטול אחד, שמירה אוטומטית כרגיל.

import { queryEditorField } from '@/lib/editor/editorField'
import { applyFieldEdit } from '@/lib/editor/applyFieldEdit'
import { replaceReviewedWord } from '@/lib/editor/ocrWordReview'

/** שדה הטור של המילה, רק אם הטקסט בו הוא בדיוק הטקסט שנבדק; אחרת null (הנתונים התיישנו) */
export function liveSuspectField(root, review, suspect) {
  const column = suspect?.column || 'content'
  const field = queryEditorField(root, column)
  const checked = review?.fields?.[column]?.text
  return field && typeof checked === 'string' && field.value === checked ? field : null
}

/** הטקסט החדש אחרי ההחלפה ({value, start, end}), או null כשהמילה כבר לא במקומה */
export function planSuspectReplacement(field, suspect, replacement) {
  return field ? replaceReviewedWord(field.value, suspect, replacement) : null
}

/**
 * מחיל החלפה שתוכננה. collapse — הסמן אחרי המילה החדשה (במקום בחירתה), כדי שהקלדה מיד אחרי
 * הלחיצה לא תדרוס את המילה. מחזיר האם הטקסט השתנה.
 */
export function applySuspectReplacement(field, suspect, next, onApplyText, { collapse = false } = {}) {
  const target = collapse ? { ...next, start: next.end } : next
  return applyFieldEdit(field, () => target, (value) => onApplyText(suspect.column, value))
}
