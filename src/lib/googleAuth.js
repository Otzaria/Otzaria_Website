// לוגיקה טהורה להתחברות עם Google למשתמשים רשומים (לפי המייל המשויך).
// ההתחברות עם Google אינה יוצרת חשבון — רק מזהה חשבון קיים לפי כתובת המייל.

// קודי שגיאה שמוחזרים לדף השגיאה של ההתחברות (/library/auth/error?error=...)
export const GOOGLE_AUTH_ERRORS = {
  NO_ACCOUNT: 'GoogleNoAccount',
  EMAIL_NOT_VERIFIED: 'GoogleEmailNotVerified',
  AMBIGUOUS: 'GoogleAmbiguousAccount',
};

// הספק פעיל רק כששני הסודות מוגדרים — אחרת מתעלמים ממנו לגמרי.
export function isGoogleAuthConfigured(env = process.env) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

// Google מחזיר email_verified כבוליאני (ובמקרים ישנים כמחרוזת "true").
export function isGoogleProfileVerified(profile) {
  return profile?.email_verified === true || profile?.email_verified === 'true';
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// המייל בסכמה אינו מנורמל לאותיות קטנות, לכן חיפוש שאינו תלוי-רישיות.
export function buildEmailLookupQuery(email) {
  return { email: new RegExp(`^${escapeRegExp(normalizeEmail(email))}$`, 'i') };
}

// בחירת החשבון מבין המועמדים (תוצאת buildEmailLookupQuery).
// יותר ממועמד אחד = חשבונות שונים שנבדלים רק ברישיות: מעדיפים התאמה מדויקת,
// ואם אין — לא מנחשים (מחזירים ambiguous) כדי לא לחבר לחשבון הלא-נכון.
export function pickUserForEmail(candidates, email) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (list.length === 0) return { user: null, error: GOOGLE_AUTH_ERRORS.NO_ACCOUNT };
  if (list.length === 1) return { user: list[0], error: null };
  const exact = list.filter((u) => u?.email === email);
  if (exact.length === 1) return { user: exact[0], error: null };
  return { user: null, error: GOOGLE_AUTH_ERRORS.AMBIGUOUS };
}

// שדות המשתמש שנשמרים ב-token — משותף להתחברות בסיסמה ולהתחברות עם Google.
export function toTokenUserFields(user) {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    acceptReminders: user.acceptReminders,
    isVerified: user.isVerified,
    // חשבון שנוצר דרך Google אין לו סיסמה — הממשק מציע לו "קביעת סיסמה"
    // במקום "שינוי סיסמה", בלי לבקש סיסמה נוכחית.
    hasPassword: Boolean(user.password),
    isSupervisor: user.isSupervisor === true,
    isCorrectionsVolunteer: user.isCorrectionsVolunteer === true,
  };
}
