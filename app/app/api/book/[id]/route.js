import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { id } = params; // זה יהיה ה-slug של הספר

    // 1. מציאת הספר
    const book = await Book.findOne({ slug: id }).lean();
    
    if (!book) {
      return NextResponse.json({ success: false, error: 'הספר לא נמצא' }, { status: 404 });
    }

    // 2. מציאת כל העמודים של הספר
    // lean() חשוב לביצועים כי הוא מחזיר אובייקט JS רגיל ולא אובייקט Mongoose כבד
    const pages = await Page.find({ book: book._id })
      .sort({ pageNumber: 1 })
      .select('pageNumber status imagePath claimedBy')
      .populate('claimedBy', 'name') // הבאת שם המשתמש שתפס את הדף
      .lean();

    // התאמת מבנה הנתונים למה שה-UI מצפה (במידת הצורך)
    const formattedPages = pages.map(p => ({
      number: p.pageNumber,
      status: p.status,
      thumbnail: p.imagePath, // הנתיב בשרת
      claimedBy: p.claimedBy ? p.claimedBy.name : null,
      id: p._id
    }));

    return NextResponse.json({
      success: true,
      book: {
        name: book.name,
        path: book.slug,
        totalPages: book.totalPages,
        id: book._id
      },
      pages: formattedPages
    });

  } catch (error) {
    console.error('Get Book Error:', error);
    return NextResponse.json({ success: false, error: 'שגיאה בטעינת הספר' }, { status: 500 });
  }
}