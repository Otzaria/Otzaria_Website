import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { requireTrainingProofSession } from '@/lib/trainingProof/access';
import { readJsonBody } from '@/lib/pageProof/pool';
import { isSection } from '@/lib/trainingProof/vocab';

// עזרים לנתיבי /api/admin/training-proof/* (מסך הניהול, docs/76 §8.3 סשן ד'):
// שער אחד — requireTrainingProofSession({admin:true}) = מנהל OCR (hasOcrAccess) —
// ותשובות פרטיות בלי מטמון (הכול תלוי-צופה, גם שגיאות).
// התיקייה מתחילה ב-"_" — Next לא הופך אותה לנתיב.

export const NO_STORE = { 'Cache-Control': 'private, no-store' };

export const ok = (data = {}, status = 200) => NextResponse.json({ success: true, ...data }, { status, headers: NO_STORE });
export const fail = (status, error, extra = {}) =>
  NextResponse.json({ success: false, error, ...extra }, { status, headers: NO_STORE });

// השער: {userId, session} או {error} (401 בלי התחברות, 403 למי שאינו מנהל OCR)
export async function adminGate() {
  const g = await requireTrainingProofSession({ admin: true });
  if (g.error) {
    g.error.headers.set('Cache-Control', NO_STORE['Cache-Control']);
    return { error: g.error };
  }
  return { userId: g.userId, session: g.session };
}

// גוף JSON עם תקרה. מחזיר {body} או {error}
export async function jsonBody(request, max = 1024 * 1024) {
  const { body, tooBig } = await readJsonBody(request, max);
  if (tooBig) return { error: fail(413, 'הבקשה גדולה מדי') };
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: fail(400, 'גוף הבקשה חסר') };
  return { body };
}

export const oid = (v) => new mongoose.Types.ObjectId(String(v));
export const validId = (v) => mongoose.Types.ObjectId.isValid(String(v ?? '')) && /^[0-9a-f]{24}$/i.test(String(v));

// section מהכתובת/מהגוף — רק אחד משלושת החלקים
export const sectionOf = (v) => (isSection(v) ? v : null);

// רשימת מזהים מהגוף: רק מזהי-Mongo תקינים, בלי כפילויות, עד max
export function idList(raw, max = 5000) {
  if (!Array.isArray(raw)) return null;
  const out = [...new Set(raw.map(String).filter(validId))];
  return out.length && out.length <= max ? out : null;
}

// לכידת שגיאה בנתיב: לוג קצר + 500 בעברית
export function crash(where, e, msg = 'הפעולה נכשלה') {
  console.error(`admin training-proof ${where}`, e?.message || e);
  return fail(500, msg);
}
