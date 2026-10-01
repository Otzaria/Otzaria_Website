import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import Book from '@/models/Book';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';
import { sortBookNames, sortFilterUsers } from '@/lib/adminPagesFilterOptions';

// GET /api/admin/pages/filter-options — רשימות הבחירה של מסנני "ספר" ו"משתמש"
// בדף ניהול העמודים (/library/admin/pages-management).
//
// קודם הדף הוריד /api/admin/pages/list?limit=10000 (כ-2.5MB, כ-1.6 שניות בשרת
// על 28 אלף עמודים) רק כדי לחלץ ממנו שמות ספרים ומשתמשים ייחודיים — ואף
// קיבל רשימה חלקית כשהיו יותר מ-10,000 עמודים. כאן אותן רשימות נבנות
// ב-distinct בצד ה-DB: ספרים שיש להם עמודים (וקיימים — כמו populate שמסנן
// עמודים יתומים), ומשתמשים שתפסו עמוד באחד הספרים האלה.
//
// אותה בדיקת הרשאה ואותה צורת 403 כמו ב-/api/admin/pages/list.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!hasBooksAccess(session?.user?.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();

    const bookIds = await Page.distinct('book');
    const books = await Book.find({ _id: { $in: bookIds } }).select('name').lean();
    const existingBookIds = books.map((b) => b._id);

    const claimerIds = await Page.distinct('claimedBy', {
      book: { $in: existingBookIds },
      claimedBy: { $ne: null },
    });
    const users = await User.find({ _id: { $in: claimerIds } }).select('name').lean();

    return NextResponse.json(
      {
        success: true,
        books: sortBookNames(books.map((b) => b.name || 'ספר לא ידוע')),
        users: sortFilterUsers(users.map((u) => ({ id: String(u._id), name: u.name || '' }))),
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('Admin pages filter options error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
