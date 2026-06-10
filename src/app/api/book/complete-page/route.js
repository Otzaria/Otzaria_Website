import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import Book from '@/models/Book';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { pageId } = await request.json();
    await connectDB();

    const isAdmin = hasBooksAccess(session.user.role);

    const query = { _id: pageId };
    if (!isAdmin) {
        query.claimedBy = session.user._id;
    }

    const page = await Page.findOne(query);

    if (!page) {
        return NextResponse.json({ 
            error: isAdmin ? 'Page not found' : 'Page not found or unauthorized' 
        }, { status: 404 });
    }

    if (page.status !== 'in-progress' && page.status !== 'completed') {
         return NextResponse.json({ error: 'Cannot complete page in current status' }, { status: 400 });
    }

    const wasAlreadyCompleted = page.status === 'completed';

    page.status = 'completed';
    page.completedAt = new Date();
    
    if (!page.claimedBy) {
        page.claimedBy = session.user._id;
        page.claimedAt = new Date();
    }
    
    await page.save();
    
    await page.populate('claimedBy', 'name email');

    if (!wasAlreadyCompleted) {
        await Book.findByIdAndUpdate(page.book, { $inc: { completedPages: 1 } });
        
        const userIdToReward = page.claimedBy._id || page.claimedBy; 
        await User.findByIdAndUpdate(userIdToReward, { $inc: { points: 10 } });

        const book = await Book.findById(page.book);
        
        if (book && (book.ownerId || book.isPrivate)) {

            if (book.totalPages > 0 && book.totalPages === book.completedPages) {
                const update = {
                    $unset: { ownerId: 1 },
                    isPrivate: false,
                    isHidden: false
                };
                if (!book.originalOwnerId && book.ownerId) {
                    update.originalOwnerId = book.ownerId;
                }
                await Book.findByIdAndUpdate(book._id, update);
            }
        }
    }

    return NextResponse.json({ 
        success: true, 
        message: 'הושלם בהצלחה!',
        page: { 
            id: page._id,
            number: page.pageNumber,
            status: page.status,
            thumbnail: page.imagePath,
            claimedBy: page.claimedBy ? page.claimedBy.name : null,
            claimedById: page.claimedBy ? page.claimedBy._id : null,
            claimedAt: page.claimedAt,
            completedAt: page.completedAt
        }
    });

  } catch (error) {
    console.error('Complete Page Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }

}
