import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import Book from '@/models/Book';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { unauthorized, badRequest, notFound, serverError } from '@/lib/apiResponse';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorized('Unauthorized');

    const { pageId } = await request.json();
    await connectDB();

    const pageBefore = await Page.findOne({ _id: pageId, claimedBy: session.user._id });

    if (!pageBefore) {
        return notFound('העמוד לא נמצא או שאינו משויך אליך');
    }

    const parentBook = await Book.findById(pageBefore.book);

    if (parentBook && (parentBook.isPrivate || parentBook.ownerId)) {
        return badRequest('לא ניתן לשחרר עמודים בספר אישי');
    }

    const wasCompleted = pageBefore.status === 'completed';

    await Page.findByIdAndUpdate(pageId, {
        status: 'available',
        $unset: { claimedBy: "", claimedAt: "", completedAt: "" }
    });

    if (wasCompleted) {
        await Book.findByIdAndUpdate(pageBefore.book, { $inc: { completedPages: -1 } });
    }

    return NextResponse.json({ 
        success: true,
        message: 'העמוד שוחרר בהצלחה'
    });

  } catch (error) {
    console.error('Release Page Error:', error);
    return serverError('Internal Server Error');
  }
}