import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import User from '@/models/User';
import Book from '@/models/Book'; // הוספת ייבוא הספר - קריטי ל-populate
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await connectDB();
    const userId = session.user.id || session.user._id;

    // 1. שליפת המשתמש וניקוד עדכני (וגם כדי לקבל אובייקט ObjectId תקין)
    const user = await User.findById(userId).select('points');
    
    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 2. סטטיסטיקות עמודים (Aggregation)
    // משתמשים ב-user._id (אובייקט) כדי להבטיח התאמה מדוייקת
    const stats = await Page.aggregate([
      { $match: { claimedBy: user._id } },
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

    // 3. פעילות אחרונה
    const recentActivityRaw = await Page.find({ claimedBy: user._id })
      .sort({ updatedAt: -1 })
      .limit(10)
      .populate('book', 'name slug')
      .lean();

    // מיפוי בטוח - בודק אם הספר קיים לפני שמנסה לגשת לשם שלו
    const recentActivity = recentActivityRaw.map(page => {
      // אם הספר נמחק או שה-populate נכשל, נציג טקסט חלופי
      const bookName = page.book?.name || 'ספר לא ידוע';
      const bookPath = page.book?.slug || '#';

      return {
        id: page._id.toString(), // הוספת ID ייחודי
        bookName: bookName,
        bookPath: bookPath,
        pageNumber: page.pageNumber,
        status: page.status,
        date: page.updatedAt ? new Date(page.updatedAt).toLocaleDateString('he-IL') : '-'
      };
    });

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
    console.error('User Stats API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}