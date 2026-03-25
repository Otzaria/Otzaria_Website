import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import Page from '@/models/Page';
import DictaBook from '@/models/DictaBook';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // בדיקת התחברות
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    // 1. שליפת כל המשתמשים (רק שדות נחוצים לציבור)
    const users = await User.find({})
      .select('name role points createdAt')
      .sort({ points: -1 })
      .lean();

    // 2. חישוב כמות עמודים שהושלמו לכל משתמש (Aggregation)
    // סופר גם עמודים שהושלמו וגם שבטיפול
    const pagesStats = await Page.aggregate([
      {
        $group: {
          _id: '$claimedBy', // קיבוץ לפי ID של המשתמש
          completedPages: { 
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } 
          },
          inProgressPages: { 
            $sum: { $cond: [{ $eq: ["$status", "in-progress"] }, 1, 0] } 
          }
        }
      }
    ]);

    // 2.5. חישוב כמות ספרי דיקטה לכל משתמש - רק ספרים שהושלמו
    const dictaBooksStats = await DictaBook.aggregate([
      {
        $match: { 
          claimedBy: { $ne: null },
          status: 'completed' // רק ספרים שהושלמו
        }
      },
      {
        $group: {
          _id: '$claimedBy',
          dictaBooksCount: { $sum: 1 }
        }
      }
    ]);

    // 3. המרת המערך למילון (Map) לגישה מהירה
    const statsMap = {};
    pagesStats.forEach(stat => {
      if (stat._id) {
        statsMap[stat._id.toString()] = {
          completed: stat.completedPages,
          inProgress: stat.inProgressPages
        };
      }
    });

    // 3.5. המרת ספרי דיקטה למילון
    const dictaBooksMap = {};
    dictaBooksStats.forEach(stat => {
      if (stat._id) {
        dictaBooksMap[stat._id.toString()] = stat.dictaBooksCount;
      }
    });

    // 4. מיזוג הנתונים
    const usersWithStats = users.map(user => {
        const stats = statsMap[user._id.toString()] || { completed: 0, inProgress: 0 };
        const dictaBooksCount = dictaBooksMap[user._id.toString()] || 0;
        return {
            name: user.name,
            role: user.role,
            createdAt: user.createdAt,
            points: user.points || 0,
            completedPages: stats.completed,
            inProgressPages: stats.inProgress,
            dictaBooks: dictaBooksCount
        };
    });

    return NextResponse.json({
      success: true,
      users: usersWithStats
    });

  } catch (error) {
    console.error('Error loading users list:', error);
    return NextResponse.json(
      { success: false, error: 'שגיאה בטעינת המשתמשים' },
      { status: 500 }
    );
  }
}