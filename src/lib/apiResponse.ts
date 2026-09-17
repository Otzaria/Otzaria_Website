import { NextResponse } from 'next/server'

/**
 * מקור אמת יחיד לתגובות שגיאה/הצלחה בראוטי API **פנימיים** (לא נצרכים ע"י
 * תוכנת שולחן העבודה/webhooks/cron — ראו refactor-notes/audit/external-api-consumers.md).
 * שם השדה `error` נבחר כי הוא כבר הרוב המוחלט בפועל (~151 מתוך 157 ראוטים
 * פנימיים). **אסור** להשתמש בקובץ הזה בראוטים חיצוניים — החוזה שלהם
 * (סטטוסים/שמות שדות) חייב להישאר בדיוק כפי שהוא.
 *
 * ההבחנה 401/403: 401 = אין session בכלל ("תתחבר"), 403 = יש session אבל
 * אין הרשאה ("אין לך גישה"). זה חשוב במקומות שהפרונט מבחין ביניהם (הפניה
 * להתחברות מול הודעת "אין הרשאה") — לפני שמשנים ראוט קיים לפי זה, ודאו
 * שהצד הקליינטי לא מבחין ספציפית בין 401 ל-403 בצורה שתלויה בהתנהגות הישנה.
 */

export function apiError(status: number, error: string) {
  return NextResponse.json({ error }, { status })
}

/** אין session בכלל — המשתמש לא מחובר. */
export function unauthorized(error = 'יש להתחבר כדי לבצע פעולה זו') {
  return apiError(401, error)
}

/** יש session אך אין הרשאה מספקת לפעולה. */
export function forbidden(error = 'אין הרשאה לבצע פעולה זו') {
  return apiError(403, error)
}

export function badRequest(error: string) {
  return apiError(400, error)
}

export function notFound(error = 'לא נמצא') {
  return apiError(404, error)
}

export function serverError(error = 'אירעה שגיאה, נסה שוב מאוחר יותר') {
  return apiError(500, error)
}

/**
 * שומר-הרשאה גנרי: מקבל session ופונקציית-בדיקה (מ-src/lib/roles.js, כמו
 * hasBooksAccess/hasPluginsAccess), ומחזיר את תגובת ה-401/403 המתאימה אם
 * הבדיקה נכשלת, או null אם הכל תקין (להמשיך בזרימת הראוט).
 *
 * דוגמה:
 *   const denied = requireAccess(session, hasBooksAccess)
 *   if (denied) return denied
 */
export function requireAccess(
  session: { user?: { role?: string } } | null | undefined,
  hasAccessFn: (role: string | undefined) => boolean
) {
  if (!session?.user) return unauthorized()
  if (!hasAccessFn(session.user.role)) return forbidden()
  return null
}
