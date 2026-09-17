/**
 * הגנה שנייה לפני פרסום ציבורי: הלקוח כבר הסיר מידע אישי, כאן מסירים שוב כתובות מייל.
 */
const EMAIL_RE = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}/g;

export function redactEmails(text) {
  return String(text ?? '').replace(EMAIL_RE, '<email>');
}
