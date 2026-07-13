import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import OcrLayoutPage from '@/models/OcrLayoutPage';
import { sampleAvailablePage, requireVerifiedSession } from '@/lib/ocr/layoutPool';

// GET: עמוד זמין אחד, אקראי ומוחכר זמנית למבקש (היחידה כאן היא עמוד —
// כל השאלות שלו נענות יחד). ?exclude=<id,id> — עמודים שהמתנדב דילג עליהם
// ולא יוצעו לו שוב בדף הנוכחי. מצורפת סטטיסטיקת התקדמות כמו ב-ocr-lines.
export async function GET(request) {
  const { session, error } = await requireVerifiedSession();
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const exclude = (searchParams.get('exclude') || '').split(',').filter(Boolean);
    const page = await sampleAvailablePage(exclude);

    // ספירות יעילות: total מהמטא-דאטה של האוסף (O(1), מקורב), done על אינדקס status
    const userId = session.user.id || session.user._id;
    const [total, done, mine] = await Promise.all([
      OcrLayoutPage.estimatedDocumentCount(),
      OcrLayoutPage.countDocuments({ status: { $in: ['submitted', 'approved'] } }),
      mongoose.Types.ObjectId.isValid(userId)
        ? OcrLayoutPage.countDocuments({
            answeredBy: new mongoose.Types.ObjectId(userId),
            status: { $in: ['submitted', 'approved'] },
          })
        : 0,
    ]);

    return NextResponse.json({ success: true, page, stats: { total, done, mine } });
  } catch (err) {
    console.error('OCR layout page fetch error:', err, 'user:', session?.user?.id);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
