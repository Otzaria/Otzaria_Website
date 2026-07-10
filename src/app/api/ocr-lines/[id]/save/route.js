import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import OcrLine from '@/models/OcrLine';
import { normalizeLineText, findForbidden } from '@/lib/ocr/textStandard';
import { sampleAvailableLines, requireVerifiedSession } from '@/lib/ocr/linePool';

// שולף שורה זמינה אקראית אחת כתחליף לשורה שנשמרה, למעט השורות שכבר מוצגות
// אצל המשתמש.
async function sampleReplacement(excludeIds) {
  const lines = await sampleAvailableLines(1, excludeIds);
  return lines[0] || null;
}

// POST: שמירת תמלול של שורה. גוף: { text, scriptType?, excludeIds? }.
// השמירה אטומית — מצליחה רק אם השורה עדיין זמינה (הראשון ששומר זוכה).
// scriptType שונה מהשמור נרשם כהצעת שינוי הממתינה להכרעת מנהל.
// בהצלחה (וגם בהתנגשות) מוחזרת שורה חלופית אקראית כדי שבדף יישארו תמיד 10.
export async function POST(request, { params }) {
  const { session, error } = await requireVerifiedSession();
  if (error) return error;

  try {
    const { id } = await params;
    const { text, scriptType, excludeIds } = await request.json();
    const userId = session.user.id || session.user._id;
    // קלט לקוח — פריסה של לא-מערך זורקת TypeError
    const exclude = Array.isArray(excludeIds) ? excludeIds : [];

    // אימות הטקסט מול תקן האלפבית — אותם כללים כמו בייצוא לאימון
    const norm = normalizeLineText(text);
    if (!norm) {
      return NextResponse.json({ success: false, error: 'הטקסט ריק' }, { status: 400 });
    }
    const forbidden = findForbidden(text);
    if (forbidden.length) {
      return NextResponse.json(
        {
          success: false,
          error: `הטקסט מכיל תווים שאינם מותרים: ${forbidden.map((c) => `"${c}"`).join(' ')}`,
          forbidden,
        },
        { status: 400 }
      );
    }

    await connectDB();

    const requested = scriptType === 'rashi' || scriptType === 'square' ? scriptType : null;

    // עדכון pipeline אטומי יחיד: התפיסה, הטקסט והצעת שינוי הכתב יחד — אחרת יש
    // חלון שבו השורה כבר 'submitted' אך ההצעה טרם נרשמה, ומנהל יספיק לאשר בלי לראותה.
    // $literal מגן מפירוש מחרוזות המתחילות ב-$ כנתיב שדה.
    const doc = await OcrLine.findOneAndUpdate(
      { _id: id, status: 'available' },
      [
        {
          $set: {
            status: 'submitted',
            text: { $literal: norm },
            transcribedBy: new mongoose.Types.ObjectId(userId),
            transcribedByName: { $literal: session.user.name || '' },
            transcribedAt: '$$NOW',
            suggestedScriptType: requested
              ? { $cond: [{ $ne: ['$scriptType', requested] }, requested, null] }
              : null,
          },
        },
        { $unset: 'leasedUntil' },
      ],
      // mongoose 9 דורש הצהרה מפורשת שהעדכון הוא aggregation pipeline
      { new: true, updatePipeline: true }
    );

    if (!doc) {
      const exists = await OcrLine.exists({ _id: id });
      if (!exists) {
        return NextResponse.json({ success: false, error: 'השורה לא נמצאה' }, { status: 404 });
      }
      // מישהו הקדים — מחזירים תחליף כדי שהדף יתמלא בכל זאת
      const next = await sampleReplacement([...exclude, id]);
      return NextResponse.json(
        { success: false, error: 'השורה כבר תומללה על ידי משתמש אחר', next },
        { status: 409 }
      );
    }

    const next = await sampleReplacement([...exclude, id]);
    return NextResponse.json({ success: true, next });
  } catch (err) {
    console.error('OCR line save error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
