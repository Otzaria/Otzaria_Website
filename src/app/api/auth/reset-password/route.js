import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import bcrypt from 'bcryptjs';

export async function GET(request) {
    try {

        const { searchParams } = new URL(request.url);
        const token = searchParams.get('token');


        if (!token) {
            return NextResponse.json({ valid: false, message: 'חסר טוקן' }, { status: 400 });
        }

        if (!token || typeof token !== 'string') {
            return NextResponse.json({ error: 'טוקן לא חוקי' }, { status: 400 });
        }

        await connectDB();

        const userExists = await User.findOne({ resetPasswordToken: token });

        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return NextResponse.json({ valid: false, message: 'קישור לא תקין או שפג תוקפו' }, { status: 400 });
        }

        return NextResponse.json({ valid: true });

    } catch (error) {
        return NextResponse.json({ valid: false, message: 'שגיאת שרת' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const { token, password } = await request.json();

        if (!token || typeof token !== 'string') {
            return NextResponse.json({ error: 'טוקן לא חוקי' }, { status: 400 });
        }
        if (!password || password.length < 6) {
            return NextResponse.json({ error: 'הסיסמה חייבת להכיל לפחות 6 תווים.' }, { status: 400 });
        }

        await connectDB();

        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return NextResponse.json({ error: 'קישור לא תקין או שפג תוקפו' }, { status: 400 });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        user.password = hashedPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        return NextResponse.json({ success: true, message: 'Password updated' });

    } catch (error) {
        console.error('Reset Password Error:', error);
        return NextResponse.json({ error: 'שגיאה בשרת' }, { status: 500 });
    }
}
