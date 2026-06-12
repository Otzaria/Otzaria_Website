import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import Book from '@/models/Book';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';

export async function POST(request) {
  await connectDB();

  const dbSession = await mongoose.startSession();
  
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { pageId } = await request.json();
    const isAdmin = hasBooksAccess(session.user.role);

    dbSession.startTransaction();

    // שלב א: עדכון העמוד — אדמין/admin_books יכול גם על עמוד של אחר
    const pageQuery = isAdmin
      ? { _id: pageId, status: 'completed' }
      : { _id: pageId, claimedBy: session.user._id, status: 'completed' };

    const page = await Page.findOneAndUpdate(
      pageQuery,
      { 
        $set: { status: 'in-progress' }, 
        $unset: { completedAt: 1 }  
      },
      { new: true, session: dbSession }
    ).populate('claimedBy', 'name email');

    if (!page) {
      // אם העמוד לא נמצא, מבטלים הכל
      await dbSession.abortTransaction();
      return NextResponse.json({ error: 'Page update failed or page not found' }, { status: 400 });
    }

    // שלב ב: עדכון הספר (הפחתת מונה)
    await Book.findByIdAndUpdate(
        page.book, 
        { $inc: { completedPages: -1 } }, 
        { session: dbSession }
    );

    // שלב ג: הפחתת ניקוד מהתופס המקורי (לא מהאדמין אם הוא לא התופס)
    const pointsTargetUserId = page.claimedBy?._id || page.claimedBy || session.user._id;
    await User.findByIdAndUpdate(
        pointsTargetUserId, 
        { $inc: { points: -10 } }, 
        { session: dbSession }
    );

    await dbSession.commitTransaction();

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
    if (dbSession.inTransaction()) {
      await dbSession.abortTransaction();
    }
    console.error('Error uncompleting page:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  } finally {
    await dbSession.endSession();
  }
}
