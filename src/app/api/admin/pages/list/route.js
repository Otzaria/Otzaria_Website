import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import Book from '@/models/Book'; // חובה לייבא כדי ש-populate('book') יעבוד
import User from '@/models/User'; // חובה לייבא כדי ש-populate('claimedBy') יעבוד
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const bookName = searchParams.get('book'); // ה-UI שולח שם ספר
    const userId = searchParams.get('userId');

    await connectDB();

    let query = {};
    if (status) query.status = status;
    if (userId) query.claimedBy = userId;
    
    // שאילתה בסיסית
    let pageQuery = Page.find(query)
      .sort({ updatedAt: -1 })
      .limit(100)
      .populate('book', 'name') // דורש שהמודל Book יהיה רשום
      .populate('claimedBy', 'name email'); // דורש שהמודל User יהיה רשום

    let pages = await pageQuery;

    // סינון ידני אם נשלח שם ספר (כי זה שדה בטבלה המקושרת ולא ב-Page עצמו)
    if (bookName) {
        pages = pages.filter(p => p.book?.name === bookName);
    }

    // התאמה לפורמט ה-UI
    const formattedPages = pages.map(p => ({
        id: p._id, // הוספתי ID למקרה הצורך
        bookName: p.book?.name || 'לא ידוע', // הגנה למקרה שהספר נמחק
        number: p.pageNumber,
        status: p.status,
        claimedBy: p.claimedBy ? p.claimedBy.name : null,
        claimedById: p.claimedBy ? p.claimedBy._id : null,
        updatedAt: p.updatedAt,
        completedAt: p.completedAt,
        createdAt: p.createdAt
    }));

    return NextResponse.json({ success: true, pages: formattedPages });

  } catch (error) {
    console.error('Admin pages list error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}