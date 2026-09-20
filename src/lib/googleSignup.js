// לוגיקה טהורה להשלמת הרשמה שהתחילה בהתחברות עם Google.
// המייל מגיע מאומת מ-Google, והפרט היחיד שחסר הוא שם המשתמש (ייחודי בסכמה).

// דגל שמסמן שהמשתמש הגיע מ"הרשמה עם Google" (ולא מדף ההתחברות). נשמר
// ב-sessionStorage לפני ההפניה ל-Google ונקרא בחזרה באותה לשונית, כדי שמסלול
// ההרשמה ידלג על מסך ההסבר "אין לך עדיין חשבון".
export const SIGNUP_INTENT_KEY = 'otzaria:googleSignupIntent';

export const USERNAME_MIN_LENGTH = 2;
export const USERNAME_MAX_LENGTH = 50;

const FALLBACK_USERNAME = 'משתמש';

// תווים מותרים בשם משתמש מוצע: אותיות (עברית/לועזית), ספרות, רווח, מקף, קו תחתון
// ונקודה. כל השאר מוחלף ברווח כדי לא ליצור שמות מוזרים מתווים מיוחדים.
function cleanCandidate(text) {
  return String(text ?? '')
    .replace(/[^\p{L}\p{N} ._-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, USERNAME_MAX_LENGTH)
    .trim();
}

// הצעת בסיס לשם משתמש: קודם השם מ-Google, אחרת החלק שלפני ה-@ במייל,
// ואם גם הוא לא שמיש — ברירת מחדל קבועה.
export function suggestUsernameBase(googleName, email) {
  const fromName = cleanCandidate(googleName);
  if (fromName.length >= USERNAME_MIN_LENGTH) return fromName;

  const localPart = String(email ?? '').split('@')[0];
  const fromEmail = cleanCandidate(localPart);
  if (fromEmail.length >= USERNAME_MIN_LENGTH) return fromEmail;

  return FALLBACK_USERNAME;
}

// בחירת שם פנוי: הבסיס עצמו, ואם תפוס — בתוספת מספר עולה. ההשוואה אינה
// תלוית-רישיות כדי לא להציע שם שייחסם בהמשך בבדיקת הייחודיות.
export function pickAvailableUsername(base, takenNames = []) {
  const taken = new Set(takenNames.map((n) => String(n).toLowerCase()));
  const isFree = (candidate) => !taken.has(candidate.toLowerCase());

  if (isFree(base)) return base;

  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const room = USERNAME_MAX_LENGTH - String(suffix).length;
    const candidate = `${base.slice(0, room).trim()}${suffix}`;
    if (isFree(candidate)) return candidate;
  }
  return '';
}

// ולידציה של שם המשתמש שהמשתמש הזין בפועל (מקבילה לבדיקה בהרשמה הרגילה).
export function validateUsername(name) {
  const trimmed = String(name ?? '').trim();
  if (trimmed.length < USERNAME_MIN_LENGTH) return 'שם המשתמש חייב להכיל לפחות 2 תווים';
  if (trimmed.length > USERNAME_MAX_LENGTH) return 'שם המשתמש ארוך מדי';
  return null;
}
