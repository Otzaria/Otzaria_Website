import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import OcrLine from '@/models/OcrLine';
import { requireVerifiedSession } from '@/lib/ocr/linePool';

// POST: דיגול שורה כלא-קריאה/חיתוך-שגוי. גוף: { reason: 'unreadable'|'bad_crop' }.
// השורה נשארת available אך יוצאת מתור ההצעות (linePool מסנן flagged), וחוזרת
// בייצוא כמשוב על הפילוח לפרויקט ה-OCR. פעולה אטומית — רק על שורה זמינה.
export async function POST(request, { params }) {
  const { session, error } = await requireVerifiedSession();
  if (error) return error;

  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'מזהה שורה לא תקין' }, { status: 400 });
    }

    const { reason } = await request.json();
    if (reason !== 'unreadable' && reason !== 'bad_crop') {
      return NextResponse.json({ success: false, error: 'סיבת דיגול לא מוכרת' }, { status: 400 });
    }

    await connectDB();

    const doc = await OcrLine.findOneAndUpdate(
      { _id: id, status: 'available' },
      {
        $set: { flagged: reason, flaggedByName: session.user.name || '' },
        $unset: { leasedUntil: '' },
      },
      { new: true, lean: true }
    );

    if (!doc) {
      const exists = await OcrLine.exists({ _id: id });
      if (!exists) {
        return NextResponse.json({ success: false, error: 'השורה לא נמצאה' }, { status: 404 });
      }
      return NextResponse.json(
        { success: false, error: 'השורה כבר תומללה על ידי משתמש אחר' },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('OCR line flag error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
