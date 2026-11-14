import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBookLibraryAccess } from '@/lib/roles';
import { unauthorized, serverError } from '@/lib/apiResponse';
import { uncompleteBookPage } from '@/lib/bookPageClaims';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorized('Unauthorized');
    const { pageId } = await request.json();
    const userId = session.user._id || session.user.id;
    const isAdmin = hasBookLibraryAccess(session.user);
    await connectDB();
    const result = await uncompleteBookPage({ userId, isAdmin, pageId });
    if (result.status !== 200) return NextResponse.json(result.body, { status: result.status });
    const page = result.page;
    await page.populate('claimedBy', 'name email');

    // שלב ב: עדכון הספר (הפחתת מונה)
    await Book.findByIdAndUpdate(
        page.book, 
        { $inc: { completedPages: -1 } }
    );

    // שלב ג: הפחתת ניקוד מהתופס המקורי (לא מהאדמין אם הוא לא התופס)
    const pointsTargetUserId = page.claimedBy?._id || page.claimedBy || session.user._id;
    await User.findByIdAndUpdate(
        pointsTargetUserId, 
        { $inc: { points: -10 } }
    );

    return NextResponse.json({ 
        success: true, 
        message: 'הסימון בוטל בהצלחה',
        page: { 
            id: page._id,
            number: page.pageNumber,
            status: page.status,
            thumbnail: page.imagePath,
            claimedBy: page.claimedBy ? page.claimedBy.name : null,
            claimedById: page.claimedBy ? page.claimedBy._id : null,
            claimedAt: page.claimedAt,
            completedAt: null 
        }
    });

  } catch (error) {
    console.error('Error uncompleting page:', error);
    return serverError('Internal Server Error');
  }
}
