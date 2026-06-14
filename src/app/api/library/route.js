import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';

export async function GET() {
  try {
    await connectDB();

    // שליפת כל הספרים עם הקטגוריה שלהם
    const books = await Book.find({}).select('name slug category totalPages').lean();

    // המרה למבנה עץ שה-UI מכיר
    const tree = buildTree(books);

    return NextResponse.json({
      success: true,
      data: tree,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// פונקציית עזר לבניית העץ
function buildTree(books) {
  const root = [];
  const categories = {};

  books.forEach(book => {
    // אם אין קטגוריה, שים בתיקייה כללית או בחוץ
    const category = book.category || 'כללי';
    
    // אם הקטגוריה לא קיימת, צור אותה
    if (!categories[category]) {
      categories[category] = {
        id: `cat-${category}`,
        name: category,
        type: 'folder',
        children: []
      };
      root.push(categories[category]);
    }

    // הוסף את הספר לקטגוריה
    categories[category].children.push({
      id: book._id.toString(),
      name: book.name,
      type: 'file',
      path: book.slug,
      totalPages: book.totalPages
      // אפשר להוסיף כאן סטטוס אם רוצים (דורש שאילתה נוספת או Aggregation)
    });
  });

  return root;
}