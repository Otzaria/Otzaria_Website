import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import OcrLine from '@/models/OcrLine';
import { LINES_BATCH_SIZE, sampleAvailableLines, requireVerifiedSession } from '@/lib/ocr/linePool';

// GET: מנה של עד 10 שורות זמינות, אקראיות ומוחכרות זמנית למבקש — כדי שמשתמשים
// שונים לא יעבדו על אותן שורות בו-זמנית. מצורפת סטטיסטיקה: כמה שורות כבר
// נעשו (הוגשו או אושרו), וכמה מהן על ידי המשתמש הנוכחי. גודל המאגר הכולל
// אינו נחשף למתנדב (לא בתצוגה ולא בתשובת ה-API).
export async function GET() {
  const { session, error } = await requireVerifiedSession();
  if (error) return error;

  try {
    await connectDB();
    const lines = await sampleAvailableLines(LINES_BATCH_SIZE);

    const userId = session.user.id || session.user._id;
    const [done, mine] = await Promise.all([
      OcrLine.countDocuments({ status: { $in: ['submitted', 'approved'] } }),
      mongoose.Types.ObjectId.isValid(userId)
        ? OcrLine.countDocuments({
            transcribedBy: new mongoose.Types.ObjectId(userId),
            status: { $in: ['submitted', 'approved'] },
          })
        : 0,
    ]);

    return NextResponse.json({ success: true, lines, stats: { done, mine } });
  } catch (err) {
    console.error('OCR lines batch error:', err, 'user:', session?.user?.id);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
