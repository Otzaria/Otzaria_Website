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
import { unauthorized, badRequest, notFound, serverError } from '@/lib/apiResponse';

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
      return badRequest('מזהה עמוד לא תקין');
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return unauthorized('מזהה משתמש לא תקין');
    }

    const { answers } = await request.json();

    await connectDB();
    const doc = await OcrLayoutPage.findById(id).lean();
    if (!doc) {
      return notFound('העמוד לא נמצא');
    }

    if (!Array.isArray(answers) || answers.length !== (doc.tasks || []).length) {
      return badRequest('יש לענות על כל שאלות העמוד יחד');
    }

    // ולידציה מול ה-prefill ומידות התמונה — אותם כללים כמו בלקוח
    const tasks = [];
    for (let i = 0; i < doc.tasks.length; i++) {
      const task = doc.tasks[i];
      const a = answers[i];
      if (!a || typeof a !== 'object') {
        return badRequest('תשובה חסרה');
      }
      let answer;
      if (a.confirmed === true) {
        answer = confirmedAnswerFromPrefill(task.kind, task.prefill);
      } else {
        const msg = validateAnswer(task.kind, a.answer, task.prefill, doc.imageWidth, doc.imageHeight);
        if (msg) {
          return badRequest(`${TASK_LABELS[task.kind]}: ${msg}`);
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
    return serverError();
  }
}
