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

    // ספירות יעילות: total מהמטא-דאטה של האוסף (O(1), מקורב), done על אינדקס status
    const userId = session.user.id || session.user._id;
    const [total, done, mine] = await Promise.all([
      OcrLine.estimatedDocumentCount(),
      OcrLine.countDocuments({ status: { $in: ['submitted', 'approved'] } }),
      mongoose.Types.ObjectId.isValid(userId)
        ? OcrLine.countDocuments({
            transcribedBy: new mongoose.Types.ObjectId(userId),
            status: { $in: ['submitted', 'approved'] },
          })
        : 0,
    ]);

    return NextResponse.json({ success: true, lines, stats: { total, done, mine } });
  } catch (err) {
    console.error('OCR lines batch error:', err, 'user:', session?.user?.id);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
