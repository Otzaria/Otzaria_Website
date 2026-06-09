import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import LibraryBook from '@/models/LibraryBook';
import { requireModerator } from '@/lib/dicta/require-moderator';

// רשימת ספרים בקונפליקט סנכרון — מטא-דאטה בלבד. ה-diff המלא נטען לפי דרישה
// לכל ספר בנפרד דרך /api/library/books/[id]/conflict-diff, כדי לא להריץ diff
// על תוכן מלא של כל הספרים בבקשה אחת (חסימת event loop / צריכת זיכרון).
export async function GET() {
  try {
    const auth = await requireModerator('sync');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    await connectDB();
    const books = await LibraryBook.find(
      { syncStatus: 'conflict' },
      'path title category conflict.conflictCount conflict.detectedAt'
    )
      .sort({ 'conflict.detectedAt': -1 })
      .lean();

    return NextResponse.json(books.map((b) => ({
      _id: b._id,
      path: b.path,
      title: b.title,
      category: b.category,
      conflictCount: b.conflict?.conflictCount || 0,
      detectedAt: b.conflict?.detectedAt || null,
    })));
  } catch (error) {
    console.error('Failed to list conflicts:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
