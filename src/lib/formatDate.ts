/**
 * עיצוב תאריכים גרגוריאניים בעברית (he-IL) — עטיפות דקות סביב toLocaleDateString
 * לצמצום כפילויות. כל פונקציה תואמת בדיוק לפורמט שהיה בשימוש באתרי הקריאה
 * שאוחדו לכאן, ללא שינוי בפלט המוצג.
 */

/** תאריך קצר: יום.חודש.שנה (למשל 15.3.2025). ללא אפשרויות עיצוב נוספות. */
export function formatDateShort(date: Date | number | string): string {
  return new Date(date).toLocaleDateString('he-IL');
}

/** תאריך עם שם חודש ושעה: "15 במרץ בשעה 09:05". ללא שנה. */
export function formatDateWithTime(date: Date | number | string): string {
  return new Date(date).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** תאריך מלא עם שם חודש ושנה: "15 במרץ 2025". ללא שעה. */
export function formatDateFull(date: Date | number | string): string {
  return new Date(date).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
