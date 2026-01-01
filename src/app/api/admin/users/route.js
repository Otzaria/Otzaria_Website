import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import Page from '@/models/Page'; // ייבוא המודל לחישוב סטטיסטיקות
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

        // 2. חישוב כמות עמודים שהושלמו לכל משתמש (Aggregation)
        const pagesStats = await Page.aggregate([
            { 
                $match: { status: 'completed' } // רק עמודים שהושלמו
            },
            {
                $group: {
                    _id: '$claimedBy', // קיבוץ לפי ID של המשתמש
                    count: { $sum: 1 }
                }
            }
        ]);

        // 3. המרת המערך למילון (Map) לגישה מהירה
        const statsMap = {};
        pagesStats.forEach(stat => {
            if (stat._id) {
                statsMap[stat._id.toString()] = stat.count;
            }
        });

        // 4. מיזוג הנתונים
        const usersWithStats = users.map(user => ({
            ...user,
            completedPages: statsMap[user._id.toString()] || 0
        }));

        return NextResponse.json({ success: true, users: usersWithStats });
    } catch (e) {
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

        // במקרה של עדכון, נחזיר את המשתמש. ה-Client יצטרך לרענן או שנחזיר גם פה את הסטטיסטיקה,
        // אבל לרוב ה-Client מרענן את הרשימה כולה אחרי עדכון.
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
        
        await User.findByIdAndDelete(userId);
        
        // אופציונלי: לשחרר עמודים שתפוסים ע"י המשתמש שנמחק
        // await Page.updateMany({ claimedBy: userId }, { status: 'available', claimedBy: null });

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}