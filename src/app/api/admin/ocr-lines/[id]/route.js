import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import OcrLine from '@/models/OcrLine';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { isAdmin } from '@/lib/roles';

// PATCH: פעולות ניהול על שורה.
// גוף: { action: 'approve' | 'return' | 'set-script' | 'accept-script' | 'reject-script', scriptType? }
// approve — אישור תמלול שהוגש (חסום כל עוד יש הצעת שינוי כתב פתוחה);
// return — מחיקת הטקסט והחזרת השורה למאגר הזמינות;
// set-script — קביעת סוג הכתב ישירות (מבטלת הצעה פתוחה);
// accept-script / reject-script — הכרעה בהצעת שינוי הכתב של המתמלל.
export async function PATCH(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { action, scriptType } = await request.json();
    await connectDB();

    if (action === 'approve') {
      // suggestedScriptType: null תופס גם מסמכים שבהם השדה לא קיים כלל
      const doc = await OcrLine.findOneAndUpdate(
        { _id: id, status: 'submitted', suggestedScriptType: null },
        { status: 'approved', approvedAt: new Date() },
        { new: true }
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
      const doc = await OcrLine.findByIdAndUpdate(
        id,
        {
          status: 'available',
          text: '',
          $unset: {
            transcribedBy: '',
            transcribedByName: '',
            transcribedAt: '',
            approvedAt: '',
            suggestedScriptType: '',
            leasedUntil: '',
          },
        },
        { new: true }
      );
      if (!doc) {
        return NextResponse.json({ success: false, error: 'השורה לא נמצאה' }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'set-script') {
      if (scriptType !== 'square' && scriptType !== 'rashi') {
        return NextResponse.json({ success: false, error: 'סוג כתב לא תקין' }, { status: 400 });
      }
      const doc = await OcrLine.findByIdAndUpdate(
        id,
        { scriptType, $unset: { suggestedScriptType: '' } },
        { new: true }
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
        { new: true }
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
        { new: true }
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
  if (!isAdmin(session?.user?.role)) {
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
