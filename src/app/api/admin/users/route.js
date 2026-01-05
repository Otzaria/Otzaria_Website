import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import Page from '@/models/Page';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (session?.user?.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        await connectDB();

        // 1. שליפת כל המשתמשים
        const users = await User.find({}).select('-password').sort({ createdAt: -1 }).lean();

        // 2. חישוב סטטיסטיקות מתקדם (Aggregation)
        // סופר גם Completed וגם In-Progress
        const pagesStats = await Page.aggregate([
            {
                $match: { 
                    claimedBy: { $ne: null } // רק עמודים שיש להם משתמש משויך
                }
            },
            {
                $group: {
                    _id: '$claimedBy',
                    completedCount: { 
                        $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } 
                    },
                    inProgressCount: { 
                        $sum: { $cond: [{ $eq: ["$status", "in-progress"] }, 1, 0] } 
                    },
                    totalCount: { $sum: 1 }
                }
            }
        ]);

        // 3. יצירת מפה לגישה מהירה
        const statsMap = {};
        pagesStats.forEach(stat => {
            if (stat._id) {
                statsMap[stat._id.toString()] = {
                    completed: stat.completedCount,
                    inProgress: stat.inProgressCount,
                    total: stat.totalCount
                };
            }
        });

        // 4. מיזוג הנתונים למשתמשים
        const usersWithStats = users.map(user => {
            const stats = statsMap[user._id.toString()] || { completed: 0, inProgress: 0, total: 0 };
            return {
                ...user,
                completedPages: stats.completed, // עמודים גמורים
                inProgressPages: stats.inProgress, // עמודים בטיפול
                totalPages: stats.total // סה"כ עמודים משויכים
            };
        });

        return NextResponse.json({ success: true, users: usersWithStats });
    } catch (e) {
        console.error('Admin users error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

export async function PUT(request) {
    try {
        const session = await getServerSession(authOptions);
        if (session?.user?.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { userId, role, points, name } = await request.json();
        await connectDB();
        
        const updatedUser = await User.findByIdAndUpdate(
            userId, 
            { role, points, name },
            { new: true }
        ).select('-password');

        if (!updatedUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, user: updatedUser });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const session = await getServerSession(authOptions);
        if (session?.user?.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { userId } = await request.json();
        await connectDB();
        
        // מחיקת המשתמש
        await User.findByIdAndDelete(userId);
        
        // שחרור העמודים שהיו תפוסים על ידי המשתמש (הופכים לזמינים)
        await Page.updateMany(
            { claimedBy: userId }, 
            { 
                $set: { status: 'available' },
                $unset: { claimedBy: "", claimedAt: "", completedAt: "" }
            }
        );

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}