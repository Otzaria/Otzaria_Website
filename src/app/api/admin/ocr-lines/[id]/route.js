import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import OcrLine from '@/models/OcrLine';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasOcrAccess } from '@/lib/roles';
import { normalizeLineText, findForbidden } from '@/lib/ocr/textStandard';

// PATCH: פעולות ניהול על שורה.
// גוף: { action: 'approve' | 'return' | 'set-text' | 'set-script' | 'accept-script' | 'reject-script' | 'unflag', text?, scriptType? }
// approve — אישור תמלול שהוגש (חסום כל עוד יש הצעת שינוי כתב פתוחה);
// return — מחיקת הטקסט והחזרת השורה למאגר הזמינות;
// unflag — ביטול דיגול מתנדב (לא-קריא/חיתוך שגוי) והחזרת השורה לתור;
// set-text — תיקון הטקסט בידי המנהל (בהגשה ובמאושרות), באותם כללי תקן כמו המתמלל;
// set-script — קביעת סוג הכתב ישירות (מבטלת הצעה פתוחה);
// accept-script / reject-script — הכרעה בהצעת שינוי הכתב של המתמלל.
export async function PATCH(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!hasOcrAccess(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { action, scriptType, text } = await request.json();
    await connectDB();

    if (action === 'approve') {
      // suggestedScriptType: null תופס גם מסמכים שבהם השדה לא קיים כלל
      const doc = await OcrLine.findOneAndUpdate(
        { _id: id, status: 'submitted', suggestedScriptType: null },
        { status: 'approved', approvedAt: new Date() },
        { returnDocument: 'after' }
      );
      if (!doc) {
        const existing = await OcrLine.findById(id).select('status suggestedScriptType').lean();
        if (!existing) {
          return NextResponse.json({ success: false, error: 'השורה לא נמצאה' }, { status: 404 });
        }
        if (existing.suggestedScriptType) {
          return NextResponse.json(
            { success: false, error: 'למתמלל יש הצעת שינוי סוג כתב הממתינה להחלטה — קבלו או דחו אותה לפני האישור' },
            { status: 409 }
          );
        }
        return NextResponse.json(
          { success: false, error: 'השורה אינה ממתינה לאישור' },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'return') {
      // שורת-הגהה חוזרת לתור עם הטיוטה המקורית (meta.prefill — השמירה מוחקת
      // את prefillText); שורה ותיקה חוזרת כרגיל
      const doc = await OcrLine.findByIdAndUpdate(
        id,
        [
          {
            $set: {
              status: 'available',
              text: '',
              prefillText: { $ifNull: ['$meta.prefill', '$prefillText', ''] },
            },
          },
          {
            $unset: [
              'transcribedBy',
              'transcribedByName',
              'transcribedAt',
              'approvedAt',
              'suggestedScriptType',
              'leasedUntil',
            ],
          },
        ],
        { returnDocument: 'after', updatePipeline: true }
      );
      if (!doc) {
        return NextResponse.json({ success: false, error: 'השורה לא נמצאה' }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'unflag') {
      const doc = await OcrLine.findOneAndUpdate(
        { _id: id, status: 'available', flagged: { $exists: true } },
        { $unset: { flagged: '', flaggedByName: '' } },
        { returnDocument: 'after' }
      );
      if (!doc) {
        return NextResponse.json(
          { success: false, error: 'השורה לא נמצאה או שאינה מדוגלת' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'set-text') {
      if (typeof text !== 'string') {
        return NextResponse.json({ success: false, error: 'טקסט לא תקין' }, { status: 400 });
      }
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
      // עריכה רק לשורה שכבר תומללה — שורה זמינה מקבלת טקסט דרך זרימת המשתמש
      const doc = await OcrLine.findOneAndUpdate(
        { _id: id, status: { $in: ['submitted', 'approved'] } },
        { text: norm },
        { returnDocument: 'after' }
      );
      if (!doc) {
        const existing = await OcrLine.findById(id).select('_id').lean();
        if (!existing) {
          return NextResponse.json({ success: false, error: 'השורה לא נמצאה' }, { status: 404 });
        }
        return NextResponse.json(
          { success: false, error: 'אפשר לערוך טקסט רק בשורה שהוגשה או אושרה' },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true, text: doc.text });
    }

    if (action === 'set-script') {
      if (scriptType !== 'square' && scriptType !== 'rashi') {
        return NextResponse.json({ success: false, error: 'סוג כתב לא תקין' }, { status: 400 });
      }
      const doc = await OcrLine.findByIdAndUpdate(
        id,
        { scriptType, $unset: { suggestedScriptType: '' } },
        { returnDocument: 'after' }
      );
      if (!doc) {
        return NextResponse.json({ success: false, error: 'השורה לא נמצאה' }, { status: 404 });
      }
      return NextResponse.json({ success: true, scriptType: doc.scriptType });
    }

    if (action === 'accept-script') {
      // העתקת ההצעה אל scriptType והסרתה — בעדכון pipeline אטומי אחד
      const doc = await OcrLine.findOneAndUpdate(
        { _id: id, suggestedScriptType: { $in: ['square', 'rashi'] } },
        [{ $set: { scriptType: '$suggestedScriptType' } }, { $unset: 'suggestedScriptType' }],
        // mongoose 9 דורש הצהרה מפורשת שהעדכון הוא aggregation pipeline
        { returnDocument: 'after', updatePipeline: true }
      );
      if (!doc) {
        const existing = await OcrLine.findById(id).select('_id').lean();
        if (!existing) {
          return NextResponse.json({ success: false, error: 'השורה לא נמצאה' }, { status: 404 });
        }
        return NextResponse.json(
          { success: false, error: 'אין הצעת שינוי כתב פתוחה לשורה זו' },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true, scriptType: doc.scriptType });
    }

    if (action === 'reject-script') {
      const doc = await OcrLine.findByIdAndUpdate(
        id,
        { $unset: { suggestedScriptType: '' } },
        { returnDocument: 'after' }
      );
      if (!doc) {
        return NextResponse.json({ success: false, error: 'השורה לא נמצאה' }, { status: 404 });
      }
      return NextResponse.json({ success: true, scriptType: doc.scriptType });
    }

    return NextResponse.json({ success: false, error: 'פעולה לא מוכרת' }, { status: 400 });
  } catch (err) {
    console.error('Admin OCR line action error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: מחיקת השורה מהמאגר לגמרי (למשל חיתוך פגום).
export async function DELETE(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!hasOcrAccess(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id } = await params;
    await connectDB();
    const res = await OcrLine.deleteOne({ _id: id });
    if (!res.deletedCount) {
      return NextResponse.json({ success: false, error: 'השורה לא נמצאה' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Admin OCR line delete error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
