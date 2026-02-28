import nodemailer from 'nodemailer';
import { encryptToken } from '@/app/api/user/unsubscribe/route'; 
import User from '@/models/User'; 
import MailingList from '@/models/MailingList';
import dbConnect from '@/lib/db';

// פונקציה להסרת מספר עמוד משם הספר
function cleanBookName(bookName) {
    if (!bookName) return bookName;
    
    // הסרת פורמטים כמו "שם_ספר - עמוד 5" או "שם_ספר/עמוד 5" או "שם_ספר page 5"
    return bookName
        .replace(/[\s\-\/]+(?:עמוד|page)\s*\d+/gi, '')
        .trim();
}

// שליחת התראה למנהלים על העלאה חדשה של משתמש
export async function sendUploadNotification(uploadData) {
    try {
        await dbConnect();
        
        // מציאת כל המנהלים שרשומים להתראות (לא כולל את המעלה עצמו)
        const admins = await User.find({
            role: 'admin',
            'uploadNotifications.enabled': true,
            isVerified: true,
            email: { $ne: uploadData.uploaderEmail }
        });
        
        if (admins.length === 0) {
            return { sent: false, reason: 'no_subscribers' };
        }

        // סינון מנהלים לפי סוג ההעלאה
        const uploadType = uploadData.uploadType || 'single_page';
        
        const subscribedAdmins = admins.filter(admin => {
            const prefs = admin.uploadNotifications;
            if (uploadType === 'dicta') return prefs.dicta;
            if (uploadType === 'full_book') return prefs.fullBook;
            if (uploadType === 'single_page') return prefs.singlePage;
            return false;
        });

        if (subscribedAdmins.length === 0) {
            return { sent: false, reason: 'no_matching_subscribers' };
        }

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            secure: process.env.SMTP_SECURE === 'true',
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });

        const uploadTypeLabels = {
            dicta: 'דיקטה',
            full_book: 'ספר שלם',
            single_page: 'עמוד אחרון בספר'
        };

        const uploadTypeLabel = uploadTypeLabels[uploadType] || 'העלאה';
        const adminUrl = `${process.env.NEXTAUTH_URL}/library/admin/uploads`;
        const logoUrl = `${process.env.NEXTAUTH_URL}/logo.png`;
        
        // ניקוי שם הספר ממספר עמוד
        const cleanedBookName = cleanBookName(uploadData.bookName);

        const sendPromises = subscribedAdmins.map(async (admin) => {
            // יצירת טוקן מאובטח להסרה מהתראות
            const secureToken = encryptToken(admin.email);
            const unsubUrl = `${process.env.NEXTAUTH_URL}/api/user/unsubscribe?t=${secureToken}&action=upload_notifications`;
            
            const emailHtml = `
            <div dir="rtl" style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 40px; text-align: center;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden;">
                    <div style="background-color: #ffffff; padding: 20px; border-bottom: 3px solid #d4a373;">
                        <img src="${logoUrl}" alt="Otzaria Logo" style="width: 120px; height: auto;">
                        <h2 style="color: #d4a373; font-size: 20px; margin: 5px 0 0 0; font-weight: bold;">ספריית אוצריא</h2>
                    </div>
                    <div style="padding: 30px; color: #333333;">
                        <h1 style="color: #2c3e50; font-size: 24px; margin-bottom: 10px;">העלאה חדשה התקבלה!</h1>
                        <div style="background-color: #f0f0f0; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: right;">
                            <p style="margin: 8px 0;"><strong>סוג:</strong> ${uploadTypeLabel}</p>
                            <p style="margin: 8px 0;"><strong>שם הספר:</strong> ${cleanedBookName || 'לא צוין'}</p>
                            <p style="margin: 8px 0;"><strong>הועלה על ידי:</strong> ${uploadData.uploadedBy || 'אורח'}</p>
                            <p style="margin: 8px 0;"><strong>שם הקובץ:</strong> ${uploadData.originalFileName || 'לא ידוע'}</p>
                        </div>
                        <div style="margin: 30px 0;">
                            <a href="${adminUrl}" style="background-color: #d4a373; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                                עבור לניהול העלאות
                            </a>
                        </div>
                    </div>
                    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 11px; color: #999; text-align: center;">
                        קיבלת הודעה זו כי נרשמת לעדכונים על העלאות משתמשים.
                        <br>
                        <a href="${unsubUrl}" style="color: #999; text-decoration: underline;">הסרה מרשימת התפוצה<br>שים לב שלא תקבל עוד עדכונים על העלאות!</a>
                    </div>
                </div>
            </div>
            `;
            
            try {
                await transporter.sendMail({
                    from: {
                        name: "ספריית אוצריא - ניהול",
                        address: process.env.SMTP_FROM
                    },
                    to: admin.email,
                    replyTo: process.env.SMTP_REPLY_TO || process.env.SMTP_FROM,
                    subject: `📤 העלאה חדשה: ${uploadTypeLabel} - ${cleanedBookName}`,
                    headers: {
                        'List-Unsubscribe': `<${unsubUrl}>`,
                        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
                    },
                    html: emailHtml
                });
                return { success: true, email: admin.email };
            } catch (error) {
                console.error(`Failed to send email to ${admin.email}:`, error);
                return { success: false, email: admin.email, error: error.message };
            }
        });

        const results = await Promise.allSettled(sendPromises);
        
        const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;
        
        return { sent: true, count: subscribedAdmins.length, successful, failed };

    } catch (error) {
        console.error('Upload Notification Error:', error);
        return { sent: false, error: error.message };
    }
}

export async function sendBookNotification(bookName, bookSlug) {
    try {
        await dbConnect();
        
        const list = await MailingList.findOne({ listName: 'new_books_subscribers' });

        if (!list || !list.emails || list.emails.length === 0) {
            return { sent: false, reason: 'empty_list' };
        }

        const validUsers = await User.find({
            email: { $in: list.emails },
            isVerified: true 
        }).select('email');

        if (validUsers.length === 0) {
            return { sent: false, error: 'No valid verified users found' };
        }

        const validEmails = validUsers.map(u => u.email);

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            secure: process.env.SMTP_SECURE === 'true',
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });

        const logoUrl = `${process.env.NEXTAUTH_URL}/logo.png`;

        const sendPromises = validEmails.map(async (email) => {
            const secureToken = encryptToken(email);
            
            const unsubUrl = `${process.env.NEXTAUTH_URL}/api/user/unsubscribe?t=${secureToken}&action=new_books`;
            
            const safeSlug = bookSlug ? encodeURIComponent(bookSlug) : ''; 
            const bookLink = safeSlug 
                ? `${process.env.NEXTAUTH_URL}/library/books/${safeSlug}`
                : `${process.env.NEXTAUTH_URL}/library`;

            const emailHtml = `
            <div dir="rtl" style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 40px; text-align: center;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden;">
                    <div style="background-color: #ffffff; padding: 20px; border-bottom: 3px solid #d4a373;">
                        <img src="${logoUrl}" alt="Otzaria Logo" style="width: 120px; height: auto;">
                        <h2 style="color: #d4a373; font-size: 20px; margin: 5px 0 0 0; font-weight: bold;">ספריית אוצריא</h2>
                    </div>
                    <div style="padding: 30px; color: #333333;">
                        <h1 style="color: #2c3e50; font-size: 24px; margin-bottom: 10px;">ספר חדש עלה לספריה!</h1>
                        <p style="font-size: 18px; line-height: 1.6;">
                            אנו שמחים לעדכן כי הספר 
                            <strong style="color: #d4a373;">"${bookName}"</strong>
                            נוסף כעת לספרייה וזמין לעריכה.
                        </p>
                        <div style="margin: 30px 0;">
                            <a href="${bookLink}" style="background-color: #d4a373; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                                כנס לספרייה לעריכה
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
                subject: `📚 ספר חדש בספרייה: ${bookName}`,
                headers: {
                    'List-Unsubscribe': `<${unsubUrl}>`,
                    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
                },
                html: emailHtml
            });
        });

        await Promise.allSettled(sendPromises);
        return { sent: true, count: validEmails.length };

    } catch (error) {
        console.error('Email Service Error:', error);
        return { sent: false, error: error.message };
    }
}