import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectDB();

    // 1. שליפת כל הספרים
    // אנחנו משתמשים ב-lean() לביצועים מהירים יותר
    const books = await Book.find({})
      .select('name slug totalPages category updatedAt')
      .sort({ updatedAt: -1 })
      .lean();

    // 2. ביצוע אגרגציה לספירת סטטוסים מתוך טבלת העמודים
    // זה נותן לנו תמונת מצב מדויקת בזמן אמת לכל ספר
    const stats = await Page.aggregate([
      {
        $group: {
          _id: '$book', // מקבצים לפי ID של הספר
          completed: { 
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } 
          },
          inProgress: { 
            $sum: { $cond: [{ $eq: ["$status", "in-progress"] }, 1, 0] } 
          }
        }
      }
    ]);

    // המרת מערך הסטטיסטיקות למילון (Map) לגישה מהירה לפי ID
    const statsMap = stats.reduce((acc, curr) => {
      acc[curr._id.toString()] = curr;
      return acc;
    }, {});

    // 3. מיזוג הנתונים
    const formattedBooks = books.map(book => {
      const bookStats = statsMap[book._id.toString()] || { completed: 0, inProgress: 0 };
      
      return {
        id: book._id,
        name: book.name,
        path: book.slug,
        thumbnail: `/uploads/books/${book.slug}/page.1.jpg`,
        totalPages: book.totalPages,
        // שימוש בנתונים מהאגרגציה
        completedPages: bookStats.completed,
        inProgressPages: bookStats.inProgress,
        // חישוב הפנויים
        availablePages: Math.max(0, book.totalPages - bookStats.completed - bookStats.inProgress),
        category: book.category || 'כללי',
        // חישוב סטטוס כללי של הספר
        status: bookStats.completed === book.totalPages ? 'completed' : 'in-progress',
        lastUpdated: book.updatedAt
      };
    });

    return NextResponse.json({ success: true, books: formattedBooks });

  } catch (error) {
    console.error('Library List Error:', error);
    return NextResponse.json({ success: false, error: 'שגיאה בטעינת הספרייה' }, { status: 500 });
  }
}