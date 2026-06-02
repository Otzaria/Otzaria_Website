/**
 * קבועים משותפים למרחב עריכת הספרים הערוכים.
 * סיווג סוג התיקון הוא אופציונלי (שדה מומלץ, לא חוסם).
 */

export const EDIT_TYPES = [
  { id: 'ocr', label: 'טעות OCR' },
  { id: 'missing', label: 'קטע חסר שדולג בהמרה' },
  { id: 'linebreak', label: 'חוסר/עודף בירידת שורה' },
  { id: 'extra', label: 'טקסט מיותר' },
  { id: 'punctuation', label: 'ניקוד / פיסוק' },
  { id: 'heading', label: 'כותרת / תגית עיצוב' },
  { id: 'other', label: 'אחר' },
];

export const EDIT_TYPE_IDS = EDIT_TYPES.map((t) => t.id);

export const EDIT_TYPE_LABELS = Object.fromEntries(EDIT_TYPES.map((t) => [t.id, t.label]));

export const EDIT_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

export const EDIT_KIND = {
  MANUAL: 'manual',
  FIND_REPLACE: 'find-replace',
};
