import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { encryptToken } from '@/app/api/user/unsubscribe/route';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import MailingList from '@/models/MailingList';

export async function POST(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { addedCount } = body;

        if (!addedCount || addedCount <= 0) {
            return NextResponse.json({ error: 'Invalid addedCount' }, { status: 400 });
        }

        await dbConnect();

        // שליפת רשימת המנויים
        const list = await MailingList.findOne({ listName: 'new_books_subscribers' });

        if (!list || !list.emails || list.emails.length === 0) {
            return NextResponse.json({ 
                success: false, 
                error: 'לא נמצאו מנויים ברשימת התפוצה' 
            }, { status: 400 });
        }

        // סינון משתמשים מאומתים בלבד
        const validUsers = await User.find({
            email: { $in: list.emails },
            isVerified: true
        }).select('email');

        if (validUsers.length === 0) {
            return NextResponse.json({ 
                success: false, 
                error: 'לא נמצאו משתמשים מאומתים ברשימת התפוצה' 
            }, { status: 400 });
        }

        const validEmails = validUsers.map(u => u.email);

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
            tls: { rejectUnauthorized: false }
        });

        const sendResults = await Promise.allSettled(validEmails.map(async (email) => {
            const secureToken = encryptToken(email);
            const unsubUrl = `${process.env.NEXTAUTH_URL}/api/user/unsubscribe?t=${secureToken}&action=new_books`;
            const dictaBooksUrl = `${process.env.NEXTAUTH_URL}/library/admin/dicta-books`;

            const emailHtml = `
            <div dir="rtl" style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 40px; text-align: center;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden;">
                    <div style="background-color: #ffffff; padding: 20px; border-bottom: 3px solid #d4a373;">
                        <img src="${process.env.NEXTAUTH_URL}/logo.png" alt="Otzaria Logo" style="width: 120px; height: auto;">
                        <h2 style="color: #d4a373; font-size: 20px; margin: 5px 0 0 0; font-weight: bold;">ספריית אוצריא</h2>
                    </div>
                    <div style="padding: 30px; color: #333333;">
                        <h1 style="color: #2c3e50; font-size: 24px; margin-bottom: 10px;">ספרי דיקטה חדשים נוספו לספרייה!</h1>
                        <p style="font-size: 18px; line-height: 1.6;">
                            אנו שמחים לעדכן כי 
                            <strong style="color: #d4a373;">${addedCount} ספרים חדשים</strong>
                            מדיקטה נוספו כעת לספרייה וזמינים לעריכה.
                        </p>
                        <p style="font-size: 16px; line-height: 1.6; color: #666;">
                            הספרים החדשים ממתינים לעריכה ותיקון על ידי מתנדבי הקהילה.
                        </p>
                        <div style="margin: 30px 0;">
                            <a href="${dictaBooksUrl}" style="background-color: #d4a373; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                                צפה בספרי דיקטה
                            </a>
                        </div>
                    </div>
                    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 11px; color: #999; text-align: center;">
                        קיבלת הודעה זו כי נרשמת לעדכונים מאוצריא. 
                        <br>
                        <a href="${unsubUrl}" style="color: #999; text-decoration: underline;">הסרה מרשימת התפוצה<br>שים לב שלא תקבל עוד עדכונים על ספרים חדשים!</a>
                    </div>
                </div>
            </div>
            `;

            return transporter.sendMail({
                from: {
                    name: "ספריית אוצריא",
                    address: process.env.SMTP_FROM
                },
                to: email,
                replyTo: process.env.SMTP_REPLY_TO || process.env.SMTP_FROM,
                subject: `📚 ${addedCount} ספרי דיקטה חדשים בספרייה!`,
                headers: {
                    'List-Unsubscribe': `<${unsubUrl}>`,
                    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
                },
                html: emailHtml
            });
        }));

        const successful = sendResults.filter(r => r.status === 'fulfilled').length;
        const failed = sendResults.filter(r => r.status === 'rejected').length;

        console.log(`Dicta sync notification sent. Success: ${successful}, Failed: ${failed}`);

        if (successful === 0) {
            return NextResponse.json({ 
                success: false, 
                error: 'כל שליחות המיילים נכשלו. בדוק את הגדרות ה-SMTP בשרת.' 
            }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            details: { successful, failed }
        });

    } catch (error) {
        console.error('Dicta Sync Notification Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
