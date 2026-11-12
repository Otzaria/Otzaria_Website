// סיווג שגיאות של בקשות בניהול (AdminApiError מ-components/admin/list/adminRequest.js) — לוגיקה טהורה.
//
// isAccessLost — ההרשאה אבדה: התחברות שפגה (sessionExpired / 401) או אין הרשאה (403). המסכים ננעלים / מציגים
//   "התחבר" רק במקרה הזה.
// isFatal — אין טעם להמשיך פעולה מרובה: ההרשאה אבדה, תקלה בשרת (5xx), אין חיבור (0 — רשת), או הגבלת קצב (429) —
//   כל אלה פוגעים כמעט תמיד בכל הפריטים, והמשך עם כמה בקשות במקביל רק מעמיס (ובמקרה של 429 — מאריך את החסימה).
//   הפריטים שלא נשלחו נשארים מסומנים, וההודעה אומרת שהפעולה נעצרה. אין ניסיון חוזר אוטומטי ל-429: שכבת הבקשות
//   לא חושפת Retry-After, והמשתמש יכול להפעיל שוב אחרי רגע.
//   שגיאה אחרת (4xx של פריט אחד, 408 זמן) — נספרת כפריט שנכשל, והשאר ממשיכים.

/** @param {any} error */
export function isAccessLost(error) {
  return error?.sessionExpired === true || error?.status === 401 || error?.status === 403
}

/** @param {any} error */
export function isFatal(error) {
  return isAccessLost(error) || error?.status === 0 || error?.status === 429 || (typeof error?.status === 'number' && error.status >= 500)
}
