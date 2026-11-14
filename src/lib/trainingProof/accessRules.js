// מי נכנס לדף "הגהה לאימון המודלים" (docs/75 ה-1, ה-17; docs/76 §8.2) — טהור.
// רק מגיה ברשימה (TrainingProofVolunteer) במצב approved, או מנהל OCR (hasOcrAccess:
// מנהל כללי, מנהל OCR, מאמן מודלים). לא תפקיד חדש ב-roles.js — רשימה משלה.

import { hasOcrAccess } from '../roles.js';

// access: 'admin' | 'approved' | 'pending' | 'denied' | 'revoked' | 'none'
export function accessOf(user, volunteer) {
  if (user && hasOcrAccess(user)) return 'admin';
  const s = volunteer?.status;
  if (s === 'approved' || s === 'pending' || s === 'denied' || s === 'revoked') return s;
  return 'none';
}

export const canProof = (access) => access === 'admin' || access === 'approved';

// אפשר לבקש גישה: מי שאין לו רשומה, או שבקשתו נדחתה/בוטלה (בקשה חדשה מחזירה ל-pending).
// מי שבקשתו ממתינה — לא שולח שוב
export const canRequest = (access) => access === 'none' || access === 'denied' || access === 'revoked';

// ההודעה בדף לפי המצב — "אין לך הרשאת גישה לדף זה" + שורת-מצב
export const ACCESS_NOTE = {
  none: '',
  pending: 'הבקשה שלך התקבלה ומחכה לאישור.',
  denied: 'הבקשה הקודמת שלך לא אושרה. אפשר לשלוח בקשה חדשה.',
  revoked: 'הגישה שלך הופסקה. אפשר לשלוח בקשה חדשה.',
};
