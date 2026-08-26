import { NextResponse } from 'next/server';
import sanitizeHtml from 'sanitize-html';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { encryptToken } from '@/app/api/user/unsubscribe/route';
import dbConnect from '@/lib/db';
import ReminderHistory from '@/models/reminderHistory';
import User from '@/models/User';
import { hasBooksAccess } from '@/lib/roles';
import { createSmtpTransport } from '@/lib/smtp-transport';

// מאפשר עיצוב חופשי (תגיות/סגנון בסיסיים) אך חוסם script/iframe/event handlers וכד'.
const EMAIL_HTML_OPTIONS = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'span', 'div', 'style', 'u', 'font']),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    '*': ['style', 'class', 'dir', 'align'],
    img: ['src', 'alt', 'width', 'height'],
    font: ['color', 'face', 'size'],
    a: ['href', 'name', 'target'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'cid'],
};

export async function POST(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !hasBooksAccess(session.user?.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { to, subject, text, html, bcc, cc, bookName, bookPath, isPartial } = body;

        if ((!to && !bcc) || !subject) {
            return NextResponse.json({ error: 'Missing recipients or subject' }, { status: 400 });
        }

        const allRecipients = new Set();
        if (to) (Array.isArray(to) ? to : [to]).forEach(e => allRecipients.add(e.trim()));
        if (bcc) (Array.isArray(bcc) ? bcc : [bcc]).forEach(e => allRecipients.add(e.trim()));
        if (cc) (Array.isArray(cc) ? cc : [cc]).forEach(e => allRecipients.add(e.trim()));

        const rawRecipientsArray = Array.from(allRecipients);

        if (rawRecipientsArray.length === 0) {
            return NextResponse.json({ error: 'No recipients provided' }, { status: 400 });
        }

        await dbConnect();
        const validUsers = await User.find({
            email: { $in: rawRecipientsArray },
            isVerified: true,
            acceptReminders: true
        }).select('email');

        const validEmailsSet = new Set(validUsers.map(u => u.email));

        const filteredRecipients = rawRecipientsArray.filter(email => validEmailsSet.has(email));

        console.log(`[Server Check] Requests: ${rawRecipientsArray.length}, Valid: ${filteredRecipients.length}`);

        if (filteredRecipients.length === 0) {
            return NextResponse.json({ 
                success: false, 
                error: 'לא נמצאו נמענים תקניים (מאומתים ומאשרי תזכורות) ברשימה שנשלחה.' 
            }, { status: 400 });
        }

        // transporter משותף עם אימות TLS מלא (rejectUnauthorized=true כברירת מחדל)
        const transporter = createSmtpTransport();

        // מסננים סקריפטים/event handlers מהתוכן שהאדמין שלח, תוך שמירה על עיצוב חופשי (codeql: js/xss)
        const safeBodyHtml = sanitizeHtml(html || text, EMAIL_HTML_OPTIONS);

        const sendResults = await Promise.allSettled(filteredRecipients.map(async (email) => {
            const secureToken = encryptToken(email);
            const unsubUrl = `${process.env.NEXTAUTH_URL}/api/user/unsubscribe?t=${secureToken}&action=reminder`;

            const individualHtml = safeBodyHtml + `
                <div dir="rtl" style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 11px; color: #999; text-align: center; font-family: sans-serif;">
                    קיבלת הודעה זו ממערכת אוצריא.
                    <br>
                    <a href="${unsubUrl}" style="color: #999; text-decoration: underline;">להסרה מקבלת תזכורות במייל<br>שים לב שלא תוכל לערוך עוד באתר כל עוד לא תאשר קבלת מיילים!<br>התזכורות נצרכות לצורך תפעול תקין של המערכת.</a>
                </div>
            `;

            return transporter.sendMail({
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: email, 
                subject: subject,
                headers: {
                    'List-Unsubscribe': `<${unsubUrl}>`,
                    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
                },
                html: individualHtml,
                text: `${text}\n\nלהסרה: ${unsubUrl}`
            });
        }));

        const successful = sendResults.filter(r => r.status === 'fulfilled').length;
        const failed = sendResults.filter(r => r.status === 'rejected').length;

        console.log(`Email process finished. Success: ${successful}, Failed: ${failed}`);

        if (bookName) {
            try {
                await ReminderHistory.create({
                    adminName: session.user.name || 'Admin',
                    adminEmail: session.user.email,
                    bookName: bookName,
                    bookPath: bookPath || '',
                    recipientCount: successful,
                    isPartial: isPartial || (successful < rawRecipientsArray.length),
                    timestamp: new Date()
                });
                console.log('History saved successfully');
            } catch (historyError) {
                console.error('Failed to save history log:', historyError);
            }
        }

        if (successful === 0 && filteredRecipients.length > 0) {
            return NextResponse.json({ 
                success: false, 
                error: 'כל שליחות המיילים נכשלו. בדוק את הגדרות ה-SMTP בשרת.' 
            }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            details: { successful, failed, filteredOut: rawRecipientsArray.length - filteredRecipients.length }
        });

    } catch (error) {
        console.error('Main Email API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}