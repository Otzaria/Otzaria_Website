import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import OcrLine from '@/models/OcrLine';
import { LINES_BATCH_SIZE, sampleAvailableLines, requireVerifiedSession } from '@/lib/ocr/linePool';

// GET: מנה של עד 10 שורות זמינות, אקראיות ומוחכרות זמנית למבקש — כדי שמשתמשים
// שונים לא יעבדו על אותן שורות בו-זמנית. מצורפת סטטיסטיקה: כמה שורות כבר
// נעשו (הוגשו או אושרו) מתוך המאגר, וכמה מהן על ידי המשתמש הנוכחי.
export async function GET() {
  const { session, error } = await requireVerifiedSession();
  if (error) return error;

  try {
    await connectDB();
    const lines = await sampleAvailableLines(LINES_BATCH_SIZE);

    const userId = session.user.id || session.user._id;
    const [statusRows, mine] = await Promise.all([
      OcrLine.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      mongoose.Types.ObjectId.isValid(userId)
        ? OcrLine.countDocuments({
            transcribedBy: new mongoose.Types.ObjectId(userId),
            status: { $in: ['submitted', 'approved'] },
          })
        : 0,
    ]);

    let total = 0;
    let done = 0;
    for (const row of statusRows) {
      total += row.n;
      if (row._id === 'submitted' || row._id === 'approved') done += row.n;
    }

    return NextResponse.json({ success: true, lines, stats: { total, done, mine } });
  } catch (err) {
    console.error('OCR lines batch error:', err, 'user:', session?.user?.id);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
