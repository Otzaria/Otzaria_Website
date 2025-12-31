import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';

export async function GET(request, { params }) {
  try {
    await connectDB();
    
    const { id } = await params;
    const identifier = decodeURIComponent(id);

    // 1. מציאת הספר - חיפוש גמיש (גם Slug וגם שם)
    const book = await Book.findOne({ 
        $or: [
            { slug: identifier }, 
            { name: identifier }
        ] 
    }).lean();
    
    if (!book) {
      return NextResponse.json({ success: false, error: 'הספר לא נמצא' }, { status: 404 });
    }

    // 2. מציאת כל העמודים של הספר
    const pages = await Page.find({ book: book._id })
      .sort({ pageNumber: 1 })
      .select('pageNumber status imagePath claimedBy claimedAt completedAt') // בחירת שדות אופטימלית
      .populate('claimedBy', 'name email') // שליפת פרטי המשתמש
      .lean();

    // 3. עיבוד הנתונים לפורמט אחיד שמתאים לכל הקומפוננטות
    const formattedPages = pages.map(p => ({
      id: p._id,
      number: p.pageNumber,
      status: p.status,
      // נתיב תמונה: אם הוא שמור כנתיב יחסי ב-DB, נשאיר אותו כך. ה-Client יציג אותו מ-public.
      thumbnail: p.imagePath, 
      claimedBy: p.claimedBy ? p.claimedBy.name : null,
      claimedById: p.claimedBy ? p.claimedBy._id : null, // חשוב לזיהוי בעלות
      claimedAt: p.claimedAt,
      completedAt: p.completedAt
    }));

    return NextResponse.json({
      success: true,
      book: {
        id: book._id,
        name: book.name,
        slug: book.slug, // משמש כ-path ב-Frontend
        path: book.slug, // תאימות לאחור ל-Frontend הישן
        totalPages: book.totalPages,
        completedPages: book.completedPages,
        category: book.category,
        description: book.description
      },
      pages: formattedPages
    });

  } catch (error) {
    console.error('Get Book Error:', error);
    return NextResponse.json({ success: false, error: 'שגיאה בטעינת הספר' }, { status: 500 });
  }
}