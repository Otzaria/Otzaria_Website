import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import Page from '@/models/Page';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectDB();

    // 1. שליפת כל המשתמשים (רק שדות נחוצים לציבור)
    const users = await User.find({})
      .select('name email role points createdAt')
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

    // 4. מיזוג הנתונים
    const usersWithStats = users.map(user => {
        const stats = statsMap[user._id.toString()] || { completed: 0, inProgress: 0 };
        return {
            id: user._id.toString(),
            name: user.name,
            email: user.email, // שים לב: זה חושף אימיילים לציבור, אם זה רגיש יש להסיר
            role: user.role,
            createdAt: user.createdAt,
            points: user.points || 0,
            completedPages: stats.completed,
            inProgressPages: stats.inProgress
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