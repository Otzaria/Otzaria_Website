import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import OcrLayoutPage from '@/models/OcrLayoutPage';
import { requireVerifiedSession } from '@/lib/ocr/layoutPool';
import {
  validateAnswer,
  cleanAnswer,
  confirmedAnswerFromPrefill,
  TASK_LABELS,
} from '@/lib/ocr/layoutValidation';

// POST: הגשת הכרעות המתנדב לכל משימות העמוד. גוף:
//   { answers: [{ confirmed: bool, answer: <לפי סוג המשימה> }, ...] }
// באורך זהה ל-tasks של העמוד. confirmed=true ("המכונה צדקה") — השרת ממחיש
// את התשובה מה-prefill, כך שהייצוא קורא תמיד מ-answer.
// השמירה אטומית first-wins (הראשון ששומר זוכה), וההגשה עוברת תמיד לסטטוס
// 'submitted' — שום דבר אינו מאושר בלי מנהל.
export async function POST(request, { params }) {
  const { session, error } = await requireVerifiedSession();
  if (error) return error;

  try {
    const { id } = await params;
    const userId = session.user.id || session.user._id;

    // אימות מזהים מוקדם — מזהה פסול היה זורק CastError ומחזיר 500
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'מזהה עמוד לא תקין' }, { status: 400 });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ success: false, error: 'מזהה משתמש לא תקין' }, { status: 401 });
    }

    const { answers } = await request.json();

    await connectDB();
    const doc = await OcrLayoutPage.findById(id).lean();
    if (!doc) {
      return NextResponse.json({ success: false, error: 'העמוד לא נמצא' }, { status: 404 });
    }

    if (!Array.isArray(answers) || answers.length !== (doc.tasks || []).length) {
      return NextResponse.json(
        { success: false, error: 'יש לענות על כל שאלות העמוד יחד' },
        { status: 400 }
      );
    }

    // ולידציה מול ה-prefill ומידות התמונה — אותם כללים כמו בלקוח
    const tasks = [];
    for (let i = 0; i < doc.tasks.length; i++) {
      const task = doc.tasks[i];
      const a = answers[i];
      if (!a || typeof a !== 'object') {
        return NextResponse.json({ success: false, error: 'תשובה חסרה' }, { status: 400 });
      }
      let answer;
      if (a.confirmed === true) {
        answer = confirmedAnswerFromPrefill(task.kind, task.prefill);
      } else {
        const msg = validateAnswer(task.kind, a.answer, task.prefill, doc.imageWidth, doc.imageHeight);
        if (msg) {
          return NextResponse.json(
            { success: false, error: `${TASK_LABELS[task.kind]}: ${msg}` },
            { status: 400 }
          );
        }
        answer = cleanAnswer(task.kind, a.answer);
      }
      tasks.push({
        kind: task.kind,
        prefill: task.prefill,
        answer,
        confirmed: a.confirmed === true,
      });
    }

    // תפיסה אטומית: מצליחה רק אם העמוד עדיין זמין — הראשון ששומר זוכה
    const updated = await OcrLayoutPage.findOneAndUpdate(
      { _id: id, status: 'available' },
      {
        $set: {
          status: 'submitted',
          tasks,
          answeredBy: new mongoose.Types.ObjectId(userId),
          answeredByName: session.user.name || '',
          answeredAt: new Date(),
        },
        $unset: { leasedUntil: '' },
      },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'העמוד כבר תויג על ידי משתמש אחר' },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('OCR layout save error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
