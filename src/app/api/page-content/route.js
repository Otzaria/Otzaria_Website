import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import Book from '@/models/Book';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

// שמירת תוכן (Auto-save)
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { 
        pageNumber, 
        content, 
        leftColumn, 
        rightColumn, 
        twoColumns,
        rightColumnName, 
        leftColumnName 
    } = body;

    await connectDB();

    let query = {};
    
    // ניסיון למצוא את העמוד לפי ID ישיר אם סופק
    if (body.pageId) {
        query = { _id: body.pageId };
    } 
    // אחרת, חיפוש לפי נתיב הספר ומספר העמוד
    else if (body.bookPath) {
        const decodedPath = decodeURIComponent(body.bookPath);
        
        // חיפוש גמיש: או לפי ה-slug או לפי השם המדויק
        const book = await Book.findOne({ 
            $or: [{ slug: decodedPath }, { name: decodedPath }] 
        });
        
        if (!book) throw new Error(`Book not found: ${decodedPath}`);
        query = { book: book._id, pageNumber: pageNumber };
    } else {
        throw new Error('Missing book identifier');
    }

    // עדכון העמוד (upsert=false כי העמוד חייב להיות קיים כבר מהעלאת ה-PDF)
    const updatedPage = await Page.findOneAndUpdate(
      query,
      {
        content,
        isTwoColumns: twoColumns,
        rightColumn,
        leftColumn,
        rightColumnName,
        leftColumnName,
        // מעדכן את תאריך העדכון האחרון אוטומטית בגלל timestamps: true במודל
      },
      { new: true }
    );

    if (!updatedPage) {
        return NextResponse.json({ success: false, error: 'Page not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'נשמר בהצלחה' });
  } catch (error) {
    console.error('Save Content Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// שליפת תוכן (טעינה בעת פתיחת העורך)
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const bookPath = searchParams.get('bookPath');
        const pageNumber = searchParams.get('pageNumber');

        if (!bookPath || !pageNumber) {
            return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 });
        }

        await connectDB();

        // פענוח ה-URL (למשל %D7%97%D7%95%D7%95%D7%AA -> חוות)
        const decodedPath = decodeURIComponent(bookPath);

        // 1. מציאת הספר
        const book = await Book.findOne({ 
            $or: [{ slug: decodedPath }, { name: decodedPath }] 
        });

        if (!book) {
            return NextResponse.json({ success: false, error: 'Book not found' }, { status: 404 });
        }

        // 2. מציאת העמוד
        const page = await Page.findOne({ 
            book: book._id, 
            pageNumber: parseInt(pageNumber) 
        });

        if (!page) {
            return NextResponse.json({ success: false, error: 'Page not found' }, { status: 404 });
        }

        // 3. החזרת הנתונים ללקוח
        return NextResponse.json({ 
            success: true, 
            data: {
                content: page.content || '',
                isTwoColumns: page.isTwoColumns || false,
                twoColumns: page.isTwoColumns || false, // תאימות לשמות משתנים בקלאיינט
                rightColumn: page.rightColumn || '',
                leftColumn: page.leftColumn || '',
                rightColumnName: page.rightColumnName || 'חלק 1',
                leftColumnName: page.leftColumnName || 'חלק 2'
            }
        });

    } catch (error) {
        console.error('Get Content Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}