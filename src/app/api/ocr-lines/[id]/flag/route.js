import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import OcrLine from '@/models/OcrLine';
import { requireVerifiedSession } from '@/lib/ocr/linePool';
import { badRequest, notFound, serverError } from '@/lib/apiResponse';

// POST: דיגול שורה כלא-קריאה/חיתוך-שגוי. גוף: { reason: 'unreadable'|'bad_crop' }.
// השורה נשארת available אך יוצאת מתור ההצעות (linePool מסנן flagged), וחוזרת
// בייצוא כמשוב על הפילוח לפרויקט ה-OCR. פעולה אטומית — רק על שורה זמינה.
export async function POST(request, { params }) {
  const { session, error } = await requireVerifiedSession();
  if (error) return error;

  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return badRequest('מזהה שורה לא תקין');
    }

    const { reason } = await request.json();
    if (reason !== 'unreadable' && reason !== 'bad_crop') {
      return badRequest('סיבת דיגול לא מוכרת');
    }

    await connectDB();

    const doc = await OcrLine.findOneAndUpdate(
      { _id: id, status: 'available' },
      {
        $set: { flagged: reason, flaggedByName: session.user.name || '' },
        $unset: { leasedUntil: '' },
      },
      { returnDocument: 'after', lean: true }
    );

    if (!doc) {
      const exists = await OcrLine.exists({ _id: id });
      if (!exists) {
        return notFound('השורה לא נמצאה');
      }
      return NextResponse.json(
        { success: false, error: 'השורה כבר תומללה על ידי משתמש אחר' },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('OCR line flag error:', err);
    return serverError();
  }
}
