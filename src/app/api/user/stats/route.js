import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import User from '@/models/User'; // כדי לשלוף ניקוד עדכני
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await connectDB();
    const userId = session.user._id;

    // 1. שליפת ניקוד עדכני
    const user = await User.findById(userId).select('points');

    // 2. סטטיסטיקות עמודים (Aggregation)
    const stats = await Page.aggregate([
      { $match: { claimedBy: user._id } }, // רק דפים של המשתמש
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

    // 3. פעילות אחרונה (10 העמודים האחרונים שנגע בהם)
    const recentActivityRaw = await Page.find({ claimedBy: userId })
      .sort({ updatedAt: -1 }) // לפי זמן עדכון אחרון
      .limit(10)
      .populate('book', 'name slug')
      .lean();

    const recentActivity = recentActivityRaw.map(page => ({
      bookName: page.book.name,
      bookPath: page.book.slug,
      pageNumber: page.pageNumber,
      status: page.status,
      date: page.updatedAt.toLocaleDateString('he-IL')
    }));

    return NextResponse.json({
      success: true,
      stats: {
        myPages: userStats.totalMyPages,
        completedPages: userStats.completed,
        inProgressPages: userStats.inProgress,
        points: user.points || 0,
        recentActivity
      }
    });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}