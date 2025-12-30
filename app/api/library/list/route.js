import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';

export const dynamic = 'force-dynamic'; // מונע Cache סטטי

export async function GET() {
  try {
    await connectDB();

    // שליפת כל הספרים
    const books = await Book.find({}).sort({ updatedAt: -1 }).lean();

    // לכל ספר, נחשב סטטיסטיקות (אפשר לייעל בעתיד עם aggregation)
    const booksWithStats = await Promise.all(books.map(async (book) => {
      const completedPages = await Page.countDocuments({ book: book._id, status: 'completed' });
      
      return {
        id: book._id,
        name: book.name,
        slug: book.slug,
        path: book.slug, // לתאימות לאחור עם ה-UI
        thumbnail: `${book.folderPath}/page.1.jpg`, // תמונת כריכה (עמוד 1)
        totalPages: book.totalPages,
        completedPages: completedPages,
        // הוספת מבנה היררכי אם צריך עבור ה-Tree
        type: 'file', 
        status: completedPages === book.totalPages ? 'completed' : 'in-progress'
      };
    }));

    return NextResponse.json({ success: true, books: booksWithStats });

  } catch (error) {
    console.error('Library List Error:', error);
    return NextResponse.json({ success: false, error: 'שגיאה בטעינת הספרייה' }, { status: 500 });
  }
}