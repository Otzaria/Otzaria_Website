import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import User from '@/models/User';
import DictaBook from '@/models/DictaBook';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await connectDB();
    const userId = session.user.id || session.user._id;

    const user = await User.findById(userId).select('points');
    
    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const stats = await Page.aggregate([
      { $match: { claimedBy: user._id } },
      {
        $lookup: {
          from: 'books',
          localField: 'book',
          foreignField: '_id',
          as: 'bookData'
        }
      },
      { $unwind: '$bookData' },
      {
        $match: {
          $or: [
            { 'bookData.isHidden': { $ne: true } }, 
            { status: 'completed' } 
          ]
        }
      },
      {
        $group: {
          _id: null,
          totalMyPages: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ["$status", "in-progress"] }, 1, 0] } }
        }
      }
    ]);

    const userStats = stats[0] || { totalMyPages: 0, completed: 0, inProgress: 0 };

    const recentActivityRaw = await Page.aggregate([
      { $match: { claimedBy: user._id } },

      { $sort: { status: -1, updatedAt: -1 } },

      {
        $lookup: {
          from: 'books',
          localField: 'book',
          foreignField: '_id',
          as: 'bookData'
        }
      },
      
      { $unwind: '$bookData' },

      { $match: { 'bookData.isHidden': { $ne: true } } },

      {
        $project: {
          _id: 1,
          pageNumber: 1,
          status: 1,
          updatedAt: 1,
          'bookData.name': 1,
          'bookData.slug': 1
        }
      }
    ]);

    const recentActivity = recentActivityRaw.map(page => {
      return {
        id: page._id.toString(),
        bookName: page.bookData.name,
        bookPath: page.bookData.slug || '#',
        pageNumber: page.pageNumber,
        status: page.status,
        date: page.updatedAt ? new Date(page.updatedAt).toLocaleDateString('he-IL') : '-'
      };
    });

    // סטטיסטיקות ספרי דיקטה
    const dictaStats = await DictaBook.aggregate([
      { $match: { claimedBy: user._id } },
      {
        $group: {
          _id: null,
          totalMyDictaBooks: { $sum: 1 },
          completedDictaBooks: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          inProgressDictaBooks: { $sum: { $cond: [{ $eq: ["$status", "in-progress"] }, 1, 0] } }
        }
      }
    ]);

    const userDictaStats = dictaStats[0] || { totalMyDictaBooks: 0, completedDictaBooks: 0, inProgressDictaBooks: 0 };

    // רשימת ספרי דיקטה שלי - ממוינים לפי סטטוס (לא הושלם קודם)
    const recentDictaBooksRaw = await DictaBook.find({ claimedBy: user._id })
      .sort({ status: -1, updatedAt: -1 })
      .select('_id title status updatedAt')
      .lean();

    const recentDictaBooks = recentDictaBooksRaw.map(book => ({
      id: book._id.toString(),
      bookId: book._id.toString(),
      bookName: book.title,
      status: book.status,
      date: book.updatedAt ? new Date(book.updatedAt).toLocaleDateString('he-IL') : '-'
    }));

    return NextResponse.json({
      success: true,
      stats: {
        myPages: userStats.totalMyPages,
        completedPages: userStats.completed,
        inProgressPages: userStats.inProgress,
        myDictaBooks: userDictaStats.totalMyDictaBooks,
        completedDictaBooks: userDictaStats.completedDictaBooks,
        inProgressDictaBooks: userDictaStats.inProgressDictaBooks,
        points: user.points || 0,
        recentActivity,
        recentDictaBooks
      }
    });

  } catch (error) {
    console.error('User Stats API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}