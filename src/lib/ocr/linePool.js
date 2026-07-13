import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import OcrLine from '@/models/OcrLine';
import { hasBookLibraryAccess } from '@/lib/roles';

// עזרים משותפים למסלולי מאגר תמלול השורות (/api/ocr-lines).

// גודל המנה נאכף בצד השרת: לעולם לא יוחזרו יותר שורות בבקשה אחת,
// ואין פרמטר לקוח שמגדיל אותו.
export const LINES_BATCH_SIZE = 10;

// משך ההחכרה הרכה של שורה שנשלחה למשתמש (ראו הערה במודל OcrLine).
export const LINE_LEASE_MS = 10 * 60 * 1000;

// צורת השורה הנשלחת למשתמש — ללא פרטי הספר. סוג הכתב נשלח כדי שהמתמלל
// יוכל להציע החלפה; התיבה והמידות נדרשות לציור ההדגשה בתצוגת "העמוד המלא".
export function publicLineShape(d) {
  return {
    id: String(d._id),
    box: { x: d.x, y: d.y, width: d.width, height: d.height },
    imageWidth: d.imageWidth || 0,
    imageHeight: d.imageHeight || 0,
    scriptType: d.scriptType === 'rashi' ? 'rashi' : 'square',
    prefillText: d.prefillText || '',
  };
}

// דוגם עד count שורות זמינות אקראיות ומחכיר אותן. ההחכרה נתפסת אטומית
// פר-שורה (עדכון מותנה על lease פנוי), כך ששתי בקשות מקבילות לא יקבלו את
// אותה שורה — המפסידה בדגימה פשוט תתפוס מועמדת אחרת בסבב הבא.
// אם המאגר הפנוי קטן מהמבוקש — משלים משורות מוחכרות (עדיף התנגשות אפשרית
// מדף ריק). רשימת ההחרגה מוגבלת בגודל המנה, כך שאי אפשר "לרוקן" את המאגר
// דרך excludeIds מנופח.
// עדיפות תור: שורות אצוות-הגהה (batch) לפני שורות המאגר הכללי — שם יושבות
// שורות אי-ההסכמה שהמודל צריך הכי הרבה. שורות שדוגלו (flagged) לא מוצעות.
export async function sampleAvailableLines(count, excludeIds = []) {
  const exclude = (Array.isArray(excludeIds) ? excludeIds : [])
    .slice(0, LINES_BATCH_SIZE + 2)
    .filter((v) => mongoose.Types.ObjectId.isValid(v))
    .map((v) => new mongoose.Types.ObjectId(v));

  const leaseFree = () => ({ $or: [{ leasedUntil: null }, { leasedUntil: { $lt: new Date() } }] });
  const notFlagged = { flagged: { $exists: false } };
  const claimed = [];
  const seen = new Set(exclude.map(String));

  // מספר סבבים חסום — הפסדים במרוץ מפוצים בדגימת-יתר בסבב הבא.
  // שני מעברים: קודם רק שורות אצווה, ואז המאגר כולו.
  const passes = [{ batch: { $exists: true, $ne: null } }, {}];
  for (const passFilter of passes) {
    for (let round = 0; round < 4 && claimed.length < count; round++) {
      const need = count - claimed.length;
      const candidates = await OcrLine.aggregate([
        {
          $match: {
            status: 'available',
            _id: { $nin: [...exclude, ...claimed.map((d) => d._id)] },
            ...notFlagged,
            ...passFilter,
            ...leaseFree(),
          },
        },
        { $sample: { size: need * 2 } },
        { $project: { _id: 1 } },
      ]);
      if (!candidates.length) break;

      for (const c of candidates) {
        if (claimed.length >= count) break;
        const k = String(c._id);
        if (seen.has(k)) continue;
        seen.add(k);

        // תפיסת ההחכרה — עדכון מותנה יחיד; רק בקשה אחת יכולה לזכות בשורה
        const doc = await OcrLine.findOneAndUpdate(
          { _id: c._id, status: 'available', ...notFlagged, ...leaseFree() },
          { leasedUntil: new Date(Date.now() + LINE_LEASE_MS) },
          { new: true, lean: true }
        );
        if (doc) claimed.push(doc);
      }
    }
    if (claimed.length >= count) break;
  }

  // המאגר הפנוי קטן מהמבוקש — משלימים משורות שמוחכרות לאחרים, בלי לגעת בהחכרתם
  if (claimed.length < count) {
    const taken = [...exclude, ...claimed.map((d) => d._id)];
    const extra = await OcrLine.aggregate([
      { $match: { status: 'available', _id: { $nin: taken }, ...notFlagged } },
      { $sample: { size: count - claimed.length } },
    ]);
    for (const d of extra) {
      const k = String(d._id);
      if (seen.has(k)) continue;
      seen.add(k);
      claimed.push(d);
    }
  }

  return claimed.map(publicLineShape);
}

// בדיקת הרשאה משותפת: רק משתמשים מאומתים (או מנהלי ספרייה) צופים ומתמללים.
export async function requireVerifiedSession() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!session.user.isVerified && !hasBookLibraryAccess(session.user.role)) {
    return {
      error: NextResponse.json(
        { success: false, error: 'רק משתמשים מאומתים יכולים לתמלל שורות' },
        { status: 403 }
      ),
    };
  }
  return { session };
}
