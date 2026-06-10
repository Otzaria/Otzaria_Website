import { NextResponse } from 'next/server';
import crypto from 'crypto';
import connectDB from '@/lib/db';
import User from '@/models/User';
import nodemailer from 'nodemailer';

export async function POST(request) {
  try {
    const { email } = await request.json();
    if (typeof email !== 'string' || !email.trim()) {
        return NextResponse.json({ success: true, message: 'אם המייל קיים במערכת, נשלחה הודעה.' });
    }
    await connectDB();

    // נטרול תווי regex כדי למנוע הזרקת NoSQL / ReDoS דרך שדה המייל
    const escapedEmail = email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const user = await User.findOne({
        email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') }
    });
    
    if (!user) {
      return NextResponse.json({ success: true, message: 'אם המייל קיים במערכת, נשלחה הודעה.' });
    }

    const NOW = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    if (user.lastResetRequest) {
        const timeSinceLastRequest = NOW - new Date(user.lastResetRequest).getTime();
        
        if (timeSinceLastRequest < ONE_HOUR) {
            return NextResponse.json({ 
                success: false, 
                error: 'כבר נשלח מייל בשעה האחרונה. אנא בדוק בתיבת הספאם או נסה שוב מאוחר יותר.' 
            }, { status: 429 });
        }
    }

    const lastRequestDate = user.lastResetRequest ? new Date(user.lastResetRequest) : new Date(0);
    const isSameDay = lastRequestDate.toDateString() === new Date(NOW).toDateString();
    
    if (!isSameDay) {
        user.dailyResetRequestsCount = 0;
    }

    if (user.dailyResetRequestsCount >= 3) {
        return NextResponse.json({ 
            success: false, 
            error: 'הגעת למגבלת הבקשות היומית (3). נסה שוב מחר.' 
        }, { status: 429 });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = Date.now() + ONE_HOUR; // תקף לשעה

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpires;
    user.lastResetRequest = NOW;
    user.dailyResetRequestsCount = (user.dailyResetRequestsCount || 0) + 1;

    await user.save();
    console.log(`Token saved for user with ID: ${user._id}`);

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    const resetUrl = `${process.env.NEXTAUTH_URL}/library/auth/reset-password/${resetToken}`;

    await transporter.sendMail({
        from: `"Otzaria Support" <${process.env.SMTP_FROM}>`,
        to: user.email,
        subject: 'איפוס סיסמה - ספריית אוצריא',
        html: `
            <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>בקשה לאיפוס סיסמה</h2>
                <p>קיבלנו בקשה לאיפוס הסיסמה לחשבון שלך באתר ספריית אוצריא. אם לא ביקשת את הסיסמה - אל דאגה, החשבון שלכם מאובטח, פשוט אל תלחצו על הקישור.</p>
                <p>אם ביקשת את האימות, לחץ על הקישור הבא כדי לבחור סיסמה חדשה:</p>
                <a href="${resetUrl}" style="background-color: #d4a373; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 15px 0;">אפס סיסמה כעת</a>
                <p>הקישור תקף לשעה אחת בלבד.</p>
            </div>
        `
    });

    return NextResponse.json({ success: true, message: 'אם המייל קיים במערכת, נשלחה הודעה.' });

  } catch (error) {
    console.error('Forgot Password Error:', error);
    return NextResponse.json({ error: 'שגיאה בשרת. נסה שוב מאוחר יותר.' }, { status: 500 });
  }
}
