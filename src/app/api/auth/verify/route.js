import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const token = searchParams.get('token');

        if (!token) {
            const baseUrl = process.env.NEXTAUTH_URL || request.url;
            return NextResponse.redirect(new URL('/library/auth/login?error=InvalidToken', baseUrl));
        }

        await connectDB();

        const user = await User.findOne({ verificationToken: token });

        if (!user) {
            const baseUrl = process.env.NEXTAUTH_URL || request.url;
            return NextResponse.redirect(new URL('/library/auth/login?error=InvalidToken', baseUrl));
        }

        if (user.verificationTokenExpires && user.verificationTokenExpires < Date.now()) {
            user.verificationToken = undefined;
            user.verificationTokenExpires = undefined;
            await user.save();
            const baseUrl = process.env.NEXTAUTH_URL || request.url;
            return NextResponse.redirect(new URL('/library/auth/login?error=TokenExpired', baseUrl));
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpires = undefined;
        await user.save();

        // הפניה לדף הצלחה
        const baseUrl = process.env.NEXTAUTH_URL || request.url;
        return NextResponse.redirect(new URL('/library/auth/verify-success', baseUrl));

    } catch (error) {
        console.error('Verification Error:', error);
        const baseUrl = process.env.NEXTAUTH_URL || request.url;
        return NextResponse.redirect(new URL('/library/auth/login?error=ServerError', baseUrl));
    }
}