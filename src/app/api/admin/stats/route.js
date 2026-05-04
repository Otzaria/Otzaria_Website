import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasAnyAdminAccess } from '@/lib/roles';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!hasAnyAdminAccess(session?.user?.role)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await connectDB();

    // שאילתות מקבילות ליעילות
    const [usersCount, booksCount, pagesStats] = await Promise.all([
        User.countDocuments(),
        Book.countDocuments(),
        Page.aggregate([
            {
                $group: {
                    _id: null,
                    totalPages: { $sum: 1 },
                    completedPages: { 
                        $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } 
                    },
                    inProgressPages: { 
                        $sum: { $cond: [{ $eq: ["$status", "in-progress"] }, 1, 0] } 
                    }
                }
            }
        ])
    ]);

    const stats = pagesStats[0] || { totalPages: 0, completedPages: 0, inProgressPages: 0 };

    return NextResponse.json({
        success: true,
        stats: {
            users: { total: usersCount },
            books: { total: booksCount },
            totalPages: stats.totalPages,
            completedPages: stats.completedPages,
            inProgressPages: stats.inProgressPages,
            completionRate: stats.totalPages > 0 ? (stats.completedPages / stats.totalPages * 100).toFixed(1) : 0
        }
    });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}