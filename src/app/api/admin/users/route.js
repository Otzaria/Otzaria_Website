import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import Page from '@/models/Page';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getAdminUsersWithStats } from '@/lib/adminUsers';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';
import { isAdmin } from '@/lib/roles';
import { requireAccess, badRequest, notFound, serverError, apiError } from '@/lib/apiResponse';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        const denied = requireAccess(session, isAdmin);
        if (denied) return denied;

        // ללא מטמון בכוונה: ה-route הזה משמש גם לרענון מיידי בצד הלקוח אחרי
        // עדכון/מחיקת משתמש (ראו page.jsx) — השאילתה עצמה זהה לזו שמוזנת
        // ל-unstable_cache בדף (getAdminUsersWithStats, ראו src/lib/adminUsers.js).
        const usersWithStats = await getAdminUsersWithStats();

        return NextResponse.json({ success: true, users: usersWithStats });
    } catch (e) {
        console.error('Admin users error:', e);
        return serverError();
    }
}

export async function PUT(request) {
    try {
        const session = await getServerSession(authOptions);
        const denied = requireAccess(session, isAdmin);
        if (denied) return denied;

        const { userId, role, points, name, email, isSupervisor, dictaEditBlocked } = await request.json();

        await connectDB();

        const currentUser = await User.findById(userId).select('email');
        if (!currentUser) {
            return notFound('User not found');
        }

        const emailChanged = email && email !== currentUser.email;

        if (emailChanged) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            // codeql[js/polynomial-redos]: bound input length before testing.
            if (email.length > 254 || !emailRegex.test(email)) {
                return badRequest('Invalid email address');
            }

            const existingUser = await User.findOne({ email, _id: { $ne: userId } });
            if (existingUser) {
                return apiError(409, 'Email already in use');
            }
        }

        const updateData = {
            role,
            points,
            name,
        };

        // מרחב עריכת הספרים הערוכים — הסמכת מפקח / ביטול חסימה
        if (typeof isSupervisor === 'boolean') updateData.isSupervisor = isSupervisor;
        if (typeof dictaEditBlocked === 'boolean') {
            updateData.dictaEditBlocked = dictaEditBlocked;
            if (dictaEditBlocked) {
                updateData.dictaEditBlockedBy = session.user.id;
                updateData.dictaEditBlockedAt = new Date();
                updateData.dictaEditBlockedReason = 'נחסם דרך ממשק ניהול המשתמשים';
            } else {
                updateData.dictaEditBlockedReason = '';
                updateData.dictaEditBlockedBy = null;
                updateData.dictaEditBlockedAt = null;
            }
        }

        if (emailChanged) {
            updateData.email = email;
            updateData.isVerified = false;
            updateData.verificationToken = null;
            updateData.verificationTokenExpiry = null;
            updateData.acceptReminders = false;
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId, 
            updateData,
            { returnDocument: 'after' }
        ).select('-password -resetPasswordToken -resetPasswordExpires -verificationToken -verificationTokenExpires -verificationRequestHistory -lastResetRequest -dailyResetRequestsCount');

        if (!updatedUser) {
            return notFound('User not found');
        }

        revalidateNow(CACHE_TAGS.USERS_ADMIN_LIST);

        return NextResponse.json({ success: true, user: updatedUser });
    } catch (error) {
        return serverError();
    }
}

export async function DELETE(request) {
    try {
        const session = await getServerSession(authOptions);
        const denied = requireAccess(session, isAdmin);
        if (denied) return denied;

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

        revalidateNow(CACHE_TAGS.USERS_ADMIN_LIST);

        return NextResponse.json({ success: true });
    } catch (e) {
        return serverError();
    }
}
