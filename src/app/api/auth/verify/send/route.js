import { NextResponse } from 'next/server';
import crypto from 'crypto';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createSmtpTransport } from '@/lib/smtp-transport';
import { apiError, unauthorized, badRequest, serverError } from '@/lib/apiResponse';
export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return unauthorized();

        await connectDB();
        const user = await User.findOne({ email: session.user.email });

        if (user.isVerified) {
            return badRequest('המשתמש כבר מאומת');
        }

        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        let history = user.verificationRequestHistory || [];
        history = history.filter(date => new Date(date) > twentyFourHoursAgo);

        if (history.length >= 3) {
            return apiError(429, 'הגעת למגבלת השליחות היומית (3). אנא נסה שוב מחר.');
        }

        const lastRequestTime = history.length > 0 ? new Date(history[history.length - 1]) : null;

        if (lastRequestTime && lastRequestTime > oneHourAgo) {
            const minutesLeft = Math.ceil((lastRequestTime.getTime() + 3600000 - now.getTime()) / 60000);
            return apiError(429, `ניתן לשלוח מייל אימות אחת לשעה. אנא נסה שוב בעוד ${minutesLeft} דקות.`);
        }

        // יצירת טוקן אימות חדש
        const token = crypto.randomBytes(32).toString('hex');
        
        user.verificationToken = token;
        user.verificationTokenExpires = new Date(Date.now() + 60 * 60 * 1000);
        user.verificationRequestHistory = [...history, now];
        
        await user.save();

        // הגדרת שליחת המייל — transporter משותף עם אימות TLS מלא
        const transporter = createSmtpTransport();

        const verifyUrl = `${process.env.NEXTAUTH_URL}/api/auth/verify?token=${token}`;

        await transporter.sendMail({
            from: `"Otzaria Security" <${process.env.SMTP_FROM}>`,
            to: user.email,
            subject: 'אמת את כתובת המייל שלך - ספריית אוצריא',
            html: `
                <div dir="rtl" style="font-family: sans-serif; padding: 20px; text-align: center;">
                    <h2>אימות כתובת מייל</h2>
                    <p>שלום ${user.name || 'משתמש יקר'},</p>
                    <p>כדי להשלים את הרישום ולאמת את חשבונך, אנא לחץ על הקישור הבא:</p>
                    <a href="${verifyUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0;">אמת את המייל שלי</a>
                    <p>הקישור תקף לשעה אחת.</p>
                    <p>אם לא ביקשת זאת, אנא התעלם מהודעה זו.</p>
                </div>
            `
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Verify Send Error:', error);
        return serverError('שגיאה בשליחת המייל');
    }
}
