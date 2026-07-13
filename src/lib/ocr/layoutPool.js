import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import OcrLayoutPage from '@/models/OcrLayoutPage';
import { hasBookLibraryAccess } from '@/lib/roles';

// עזרים משותפים למסלולי תיוג מבנה-עמוד (/api/ocr-layout) — אותו מנגנון
// החכרה רכה של linePool, אבל היחידה כאן היא עמוד אחד (לא מנת שורות):
// כל השאלות של אותו עמוד נענות יחד במסך אחד.

// משך ההחכרה הרכה של עמוד שנשלח למשתמש (ראו הערה במודל OcrLayoutPage)
export const PAGE_LEASE_MS = 10 * 60 * 1000;

// צורת העמוד הנשלחת למתנדב — בלי מזהי אצווה/מהדורה (אין להם משמעות עבורו)
// ובלי שדות ניהול. ה-prefill נדרש לציור השכבות ולכפתור "הכול נכון".
export function publicPageShape(d) {
  return {
    id: String(d._id),
    imageWidth: d.imageWidth || 0,
    imageHeight: d.imageHeight || 0,
    tasks: (d.tasks || []).map((t) => ({ kind: t.kind, prefill: t.prefill })),
  };
}

// דוגם עמוד זמין אקראי ומחכיר אותו אטומית (עדכון מותנה על lease פנוי) —
// שני מתנדבים לא יקבלו את אותו עמוד. excludeIds: עמודים שהמתנדב דילג
// עליהם בדף הנוכחי (חסום בגודל קטן כדי שאי אפשר "לרוקן" את המאגר).
export async function sampleAvailablePage(excludeIds = []) {
  const exclude = (Array.isArray(excludeIds) ? excludeIds : [])
    .slice(0, 12)
    .filter((v) => mongoose.Types.ObjectId.isValid(v))
    .map((v) => new mongoose.Types.ObjectId(v));

  const leaseFree = () => ({ $or: [{ leasedUntil: null }, { leasedUntil: { $lt: new Date() } }] });
  const seen = new Set(exclude.map(String));

  // מספר סבבים חסום — הפסד במרוץ מפוצה בדגימת מועמד אחר בסבב הבא
  for (let round = 0; round < 4; round++) {
    const candidates = await OcrLayoutPage.aggregate([
      { $match: { status: 'available', _id: { $nin: exclude }, ...leaseFree() } },
      { $sample: { size: 3 } },
      { $project: { _id: 1 } },
    ]);
    if (!candidates.length) break;

    for (const c of candidates) {
      const k = String(c._id);
      if (seen.has(k)) continue;
      seen.add(k);

      // תפיסת ההחכרה — עדכון מותנה יחיד; רק בקשה אחת יכולה לזכות בעמוד
      const doc = await OcrLayoutPage.findOneAndUpdate(
        { _id: c._id, status: 'available', ...leaseFree() },
        { leasedUntil: new Date(Date.now() + PAGE_LEASE_MS) },
        { new: true, lean: true }
      );
      if (doc) return publicPageShape(doc);
    }
  }

  // המאגר הפנוי התרוקן — משלימים מעמוד שמוחכר לאחר, בלי לגעת בהחכרתו
  // (עדיף התנגשות אפשרית מדף ריק; השמירה first-wins מגינה)
  const extra = await OcrLayoutPage.aggregate([
    { $match: { status: 'available', _id: { $nin: exclude } } },
    { $sample: { size: 1 } },
  ]);
  return extra.length ? publicPageShape(extra[0]) : null;
}

// בדיקת הרשאה משותפת: רק משתמשים מאומתים (או מנהלי ספרייה) צופים ומתייגים.
export async function requireVerifiedSession() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!session.user.isVerified && !hasBookLibraryAccess(session.user.role)) {
    return {
      error: NextResponse.json(
        { success: false, error: 'רק משתמשים מאומתים יכולים לתייג מבנה-עמוד' },
        { status: 403 }
      ),
    };
  }
  return { session };
}
