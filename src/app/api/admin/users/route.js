import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import Page from '@/models/Page';
import DictaBook from '@/models/DictaBook';
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
        const users = await User.find({})
            .select('-password -resetPasswordToken -resetPasswordExpires -verificationToken -verificationTokenExpires -verificationRequestHistory -lastResetRequest -dailyResetRequestsCount')
            .sort({ createdAt: -1 })
            .lean();

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

        // 2.5. חישוב סטטיסטיקות ספרי דיקטה - רק ספרים שהושלמו
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

        // 3.5. יצירת מפה לספרי דיקטה
        const dictaBooksMap = {};
        dictaBooksStats.forEach(stat => {
            if (stat._id) {
                dictaBooksMap[stat._id.toString()] = stat.dictaBooksCount;
            }
        });

        // 4. מיזוג הנתונים למשתמשים
        const usersWithStats = users.map(user => {
            const stats = statsMap[user._id.toString()] || { completed: 0, inProgress: 0, total: 0 };
            const dictaBooksCount = dictaBooksMap[user._id.toString()] || 0;
            return {
                ...user,
                completedPages: stats.completed, // עמודים גמורים
                inProgressPages: stats.inProgress, // עמודים בטיפול
                totalPages: stats.total, // סה"כ עמודים משויכים
                dictaBooks: dictaBooksCount // ספרי דיקטה
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

        const { userId, role, points, name, email } = await request.json();
        
        await connectDB();
        
        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
            }

            const existingUser = await User.findOne({ email: email, _id: { $ne: userId } });
            if (existingUser) {
                return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
            }
        }

        const updateData = {
            role,
            points,
            name,
        };

        if (email) {
            updateData.email = email;
            updateData.isVerified = false;
            updateData.verificationToken = null;
            updateData.verificationTokenExpiry = null;
            updateData.acceptReminders = false;
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId, 
            updateData,
            { new: true }
        ).select('-password -resetPasswordToken -resetPasswordExpires -verificationToken -verificationTokenExpires -verificationRequestHistory -lastResetRequest -dailyResetRequestsCount');

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
