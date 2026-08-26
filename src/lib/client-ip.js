/**
 * client-ip — חילוץ כתובת ה-IP האמיתית של הלקוח מתוך בקשת Route Handler,
 * לצורך rate-limiting מהימן.
 *
 * מודל האמון (סינתזה אחרי ביקורת פנימית):
 *
 * `x-forwarded-for` הוא append-only: הלקוח יכול להזריק בו כל ערך, וכל proxy
 * אמין מוסיף את הכתובת שראה בסוף. לכן החילוץ תלוי לחלוטין בשאלה כמה proxy-ים
 * אמינים עוברת הבקשה בפועל — ואין תשובה אוניברסלית.
 *
 *   TRUSTED_PROXY_COUNT (env) — ברירת מחדל **0** (בטוחה-כברירת-מחדל):
 *
 *   T = 0 — אין proxy אמין (הפורט חשוף ישירות ללקוחות, למשל docker-compose
 *          עם ports:3000:3000): משתמשים **רק** בכתובת ה-peer הישיר
 *          (request.ip). כל header — XFF, x-real-ip — נשלט ע"י הלקוח
 *          ומתעלמים ממנו כליל.
 *
 *   T > 0 — הבקשה עוברת בדיוק T proxy-ים אמינים: נבחר **בדיוק** האלמנט
 *          ה-(T)-י מהסוף של XFF — זה שה-proxy האמין החיצוני-ביותר צירף,
 *          גם אם הוא פרטי. **אין** דילוג שמאלה מעבר לאלמנט הנבחר: דילוג כזה
 *          חוצה את גבול האמון ומחזיר ערך שהלקוח עצמו הזריק (עקיפת rate-limit).
 *          - request.ip אינו מועדף במצב זה: תחת proxy אמין הוא מייצג את
 *            ה-peer (ה-proxy הפנימי), לא את המשתמש — שימוש בו היה מאחד את
 *            כל המשתמשים ל-bucket אחד.
 *          - שרשרת קצרה מ-T (חוסר/עקום) = לא ניתן לאתר את האלמנט האמין;
 *            לא "כורים" ימינה-שמאלה — fallback: x-real-ip (header ש-ingress
 *            מדרוס בכתיבה מלאה) ← request.ip ← 'unknown'.
 *          ⚠️ חוזה פריסה: במצב T>0 חייבים לוודא שפורט האפליקציה לא נגיש
 *            במישרין ללקוחות, אחרת תוקף יכול לעקוף את הספירה ע"י פנייה
 *            ישירה עם headers מזויפים.
 *
 * 'unknown' — fail-closed: כל הבקשות הבלתי-מזוהות ידורגו יחד ל-bucket אחד
 * (מונע עקיפה, במחיר חסימה משותפת — עדיף על פתיחות ל-brute-force).
 *
 * בדיקות: src/lib/client-ip.test.mjs
 */

function getHeader(headers, name) {
  if (typeof headers?.get === 'function') return headers.get(name);
  return headers?.[name];
}

function readTrustedProxyCount() {
  const raw = process.env.TRUSTED_PROXY_COUNT ?? '0';
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 20 ? parsed : 0;
}

export function getClientIp(request) {
  const trustedCount = readTrustedProxyCount();
  const directPeer =
    typeof request?.ip === 'string' ? request.ip.trim() : '';

  // אין proxy אמין: רק ה-peer הישיר משמעותי. Headers נשלטי-לקוח מנוטרלים.
  if (trustedCount === 0) {
    return directPeer || 'unknown';
  }

  const headers = request?.headers;

  // בחירה מדויקת של האלמנט ה-(T)-י מהסוף — ללא שום דילוג שמאלה
  const forwardedFor = getHeader(headers, 'x-forwarded-for');
  const parts =
    typeof forwardedFor === 'string' && forwardedFor.trim()
      ? forwardedFor.split(',').map((part) => part.trim()).filter(Boolean)
      : [];

  const idx = parts.length - trustedCount;
  if (idx >= 0 && parts[idx]) {
    return parts[idx];
  }

  // שרשרת קצרה/עקומה מהצפוי: אין אלמנט אמין ב-XFF. נחתוך ל-fallbacks —
  // לא ניגש כלל לערכים ימניים-עמוקים יותר (המקורם הלקוח).
  const realIp = String(getHeader(headers, 'x-real-ip') ?? '').trim();
  if (realIp) {
    return realIp;
  }

  return directPeer || 'unknown';
}