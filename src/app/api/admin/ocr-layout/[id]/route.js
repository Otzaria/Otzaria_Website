import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import OcrLayoutPage from '@/models/OcrLayoutPage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { isAdmin } from '@/lib/roles';
import { validateAnswer, cleanAnswer, TASK_LABELS } from '@/lib/ocr/layoutValidation';

// PATCH: פעולות ניהול על עמוד תיוג-מבנה.
// גוף: { action: 'approve' | 'return' | 'set-answers', answers? }
// approve — אישור הגשה (רק submitted; שום דבר לא מאושר בלי מנהל);
// return — איפוס ההכרעות והחזרת העמוד למאגר הזמינים;
// set-answers — תיקון תשובות בידי המנהל לפני אישור (בהגשה ובמאושרות),
//   באותם כללי ולידציה כמו המתנדב. answers באורך tasks, כל איבר
//   { answer } (או { confirmed:true } נשמר כמו שהוא — אין צורך לשלוח).
export async function PATCH(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id } = await params;
    // מזהה לא-תקין → CastError שנתפס ב-catch ומחזיר 500; מסננים מראש ל-400
    if (!/^[0-9a-fA-F]{24}$/.test(String(id))) {
      return NextResponse.json({ success: false, error: 'מזהה עמוד לא תקין' }, { status: 400 });
    }
    const { action, answers } = await request.json();
    await connectDB();

    if (action === 'approve') {
      const doc = await OcrLayoutPage.findOneAndUpdate(
        { _id: id, status: 'submitted' },
        { status: 'approved', approvedAt: new Date() },
        { new: true }
      );
      if (!doc) {
        const exists = await OcrLayoutPage.exists({ _id: id });
        if (!exists) {
          return NextResponse.json({ success: false, error: 'העמוד לא נמצא' }, { status: 404 });
        }
        return NextResponse.json(
          { success: false, error: 'העמוד אינו ממתין לאישור' },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'return') {
      // איפוס ההכרעות: התשובות נמחקות וה-prefill נשאר — העמוד חוזר לזמינים
      const doc = await OcrLayoutPage.findById(id);
      if (!doc) {
        return NextResponse.json({ success: false, error: 'העמוד לא נמצא' }, { status: 404 });
      }
      doc.status = 'available';
      doc.tasks = doc.tasks.map((t) => ({ kind: t.kind, prefill: t.prefill, answer: null, confirmed: false }));
      doc.answeredBy = undefined;
      doc.answeredByName = undefined;
      doc.answeredAt = undefined;
      doc.approvedAt = undefined;
      doc.leasedUntil = undefined;
      await doc.save();
      return NextResponse.json({ success: true });
    }

    if (action === 'set-answers') {
      const doc = await OcrLayoutPage.findById(id);
      if (!doc) {
        return NextResponse.json({ success: false, error: 'העמוד לא נמצא' }, { status: 404 });
      }
      // עריכה רק לעמוד שכבר תויג — עמוד זמין מקבל תשובות דרך זרימת המתנדב
      if (doc.status === 'available') {
        return NextResponse.json(
          { success: false, error: 'אפשר לערוך תשובות רק בעמוד שהוגש או אושר' },
          { status: 409 }
        );
      }
      if (!Array.isArray(answers) || answers.length !== doc.tasks.length) {
        return NextResponse.json(
          { success: false, error: 'נדרשות תשובות לכל משימות העמוד' },
          { status: 400 }
        );
      }

      const tasks = [];
      for (let i = 0; i < doc.tasks.length; i++) {
        const task = doc.tasks[i];
        const a = answers[i];
        // איבר בלי answer = השארת התשובה הקיימת כפי שהיא
        if (!a || a.answer === undefined) {
          tasks.push({ kind: task.kind, prefill: task.prefill, answer: task.answer, confirmed: task.confirmed });
          continue;
        }
        const msg = validateAnswer(task.kind, a.answer, task.prefill, doc.imageWidth, doc.imageHeight);
        if (msg) {
          return NextResponse.json(
            { success: false, error: `${TASK_LABELS[task.kind]}: ${msg}` },
            { status: 400 }
          );
        }
        // תיקון מנהל מבטל את דגל "המכונה צדקה" — התשובה כבר אינה ה-prefill
        tasks.push({
          kind: task.kind,
          prefill: task.prefill,
          answer: cleanAnswer(task.kind, a.answer),
          confirmed: false,
        });
      }
      doc.tasks = tasks;
      await doc.save();
      return NextResponse.json({
        success: true,
        tasks: doc.tasks.map((t) => ({
          kind: t.kind,
          prefill: t.prefill,
          answer: t.answer ?? null,
          confirmed: !!t.confirmed,
        })),
      });
    }

    return NextResponse.json({ success: false, error: 'פעולה לא מוכרת' }, { status: 400 });
  } catch (err) {
    console.error('Admin OCR layout action error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: מחיקת העמוד מהמאגר לגמרי (למשל עמוד פגום באצווה).
// התמונה בדיסק נשארת בתיקיית האצווה — ניקוי אצוות נעשה ידנית.
export async function DELETE(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id } = await params;
    if (!/^[0-9a-fA-F]{24}$/.test(String(id))) {
      return NextResponse.json({ success: false, error: 'מזהה עמוד לא תקין' }, { status: 400 });
    }
    await connectDB();
    const res = await OcrLayoutPage.deleteOne({ _id: id });
    if (!res.deletedCount) {
      return NextResponse.json({ success: false, error: 'העמוד לא נמצא' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Admin OCR layout delete error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
