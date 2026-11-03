import { OCR_ACTIONS } from '@/lib/trainingProof/vocab'

// הפעולות והמקשים של מסך המתנדב בזיהוי-הטקסט. בלי "חיתוך גרוע" (seg) — החלטת בעל הפרויקט
// 2026-10-28: הדף הזה לא משמש לחיתוך שורות. השרת והחוזה (vocab, docs/76) עדיין מקבלים seg,
// ולכן סימון seg ישן ממשיך להיות מוצג; רק אין דרך לסמן אותו כאן.
// המקשים רצופים לפי הסדר של OCR_ACTIONS: 1 נכון · 2 תקן · 3 דלג · 4 לא קריא · 5 הכתב שגוי.
export const SCREEN_ACTIONS = OCR_ACTIONS.filter((a) => a !== 'seg')

export const SCREEN_KEYS = Object.fromEntries(SCREEN_ACTIONS.map((a, i) => [String(i + 1), a]))

export const keyOf = (action) => String(SCREEN_ACTIONS.indexOf(action) + 1)
