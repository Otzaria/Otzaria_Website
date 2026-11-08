// סיווג שגיאות של בקשות בניהול (AdminApiError מ-components/admin/list/adminRequest.js) — לוגיקה טהורה.
//
// isAccessLost — ההרשאה אבדה: התחברות שפגה (sessionExpired / 401) או אין הרשאה (403). המסכים ננעלים / מציגים
//   "התחבר" רק במקרה הזה.
// isFatal — אין טעם להמשיך פעולה מרובה: ההרשאה אבדה, או תקלה בשרת (5xx) — שכמעט תמיד פוגעת בכל הפריטים, והמשך
//   עם כמה בקשות במקביל רק מעמיס. הפריטים שלא נשלחו נשארים מסומנים, וההודעה אומרת שהפעולה נעצרה.
//   שגיאה אחרת (4xx של פריט אחד, 408 זמן, 0 רשת) — נספרת כפריט שנכשל, והשאר ממשיכים.

/** @param {any} error */
export function isAccessLost(error) {
  return error?.sessionExpired === true || error?.status === 401 || error?.status === 403
}

/** @param {any} error */
export function isFatal(error) {
  return isAccessLost(error) || (typeof error?.status === 'number' && error.status >= 500)
}
