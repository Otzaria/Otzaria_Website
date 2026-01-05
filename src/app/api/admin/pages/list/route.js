import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import Book from '@/models/Book';
import User from '@/models/User';
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
    const bookName = searchParams.get('book');
    const userId = searchParams.get('userId');
    
    // תמיכה בפגינציה
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '5000'); // ברירת מחדל גבוהה כדי להציג הכל
    const skip = (page - 1) * limit;

    await connectDB();

    let query = {};
    if (status) query.status = status;
    if (userId) query.claimedBy = userId;
    
    // אם נבחר ספר, נמצא קודם את ה-ID שלו
    if (bookName) {
        const bookDoc = await Book.findOne({ name: bookName });
        if (bookDoc) {
            query.book = bookDoc._id;
        }
    }
    
    // שליפת הנתונים עם Populating
    const pages = await Page.find(query)
      .sort({ book: 1, pageNumber: 1 }) // מיון לפי ספר ואז לפי מספר עמוד
      .skip(skip)
      .limit(limit)
      .populate('book', 'name')
      .populate('claimedBy', 'name email')
      .lean();

    // ספירת סה"כ רשומות (עבור פגינציה עתידית)
    const total = await Page.countDocuments(query);

    // התאמה לפורמט ה-UI
    const formattedPages = pages.map(p => ({
        id: p._id,
        bookName: p.book?.name || 'ספר לא ידוע',
        number: p.pageNumber,
        status: p.status,
        claimedBy: p.claimedBy ? p.claimedBy.name : null,
        claimedById: p.claimedBy ? p.claimedBy._id : null,
        updatedAt: p.updatedAt,
        completedAt: p.completedAt,
        createdAt: p.createdAt
    }));

    return NextResponse.json({ 
        success: true, 
        pages: formattedPages,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        }
    });

  } catch (error) {
    console.error('Admin pages list error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}