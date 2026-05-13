import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {

    const session = await getServerSession(authOptions);
    const isAdmin = hasBooksAccess(session?.user?.role);

    await connectDB();

    const query = isAdmin ? {} : { isHidden: { $ne: true } };

    const books = await Book.find(query)
      .select('name slug totalPages category updatedAt isHidden editingInfo ownerId originalOwnerId isPrivate')
      .populate('ownerId', 'name')
      .populate('originalOwnerId', 'name')
      .sort({ updatedAt: -1 })
      .lean();

    const stats = await Page.aggregate([
      {
        $group: {
          _id: '$book',
          completed: { 
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } 
          },
          inProgress: { 
            $sum: { $cond: [{ $eq: ["$status", "in-progress"] }, 1, 0] } 
          }
        }
      }
    ]);

    const statsMap = stats.reduce((acc, curr) => {
      acc[curr._id.toString()] = curr;
      return acc;
    }, {});

    const formattedBooks = books.map(book => {
      const bookStats = statsMap[book._id.toString()] || { completed: 0, inProgress: 0 };
      
      return {
        id: book._id,
        name: book.name,
        path: book.slug,
        thumbnail: `/uploads/books/${book.slug}/page.1.jpg`,
        totalPages: book.totalPages,
        completedPages: bookStats.completed,
        inProgressPages: bookStats.inProgress,
        availablePages: Math.max(0, book.totalPages - bookStats.completed - bookStats.inProgress),
        category: book.category || 'כללי',
        status: bookStats.completed === book.totalPages ? 'completed' : 'in-progress',
        lastUpdated: book.updatedAt,
        isHidden: book.isHidden || false,
        editingInfo: book.editingInfo || null,
        
        ownerId: book.ownerId,
        ownerName: book.ownerId?.name || null,
        originalOwnerId: book.originalOwnerId?._id || book.originalOwnerId || null,
        originalOwnerName: book.originalOwnerId?.name || null,
        isPrivate: book.isPrivate || false
      };
    });

    return NextResponse.json({ success: true, books: formattedBooks });

  } catch (error) {
    console.error('Library List Error:', error);
    return NextResponse.json({ success: false, error: 'שגיאה בטעינת הספרייה' }, { status: 500 });
  }
}