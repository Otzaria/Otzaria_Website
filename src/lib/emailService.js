import nodemailer from 'nodemailer';
import { encryptToken } from '@/app/api/user/unsubscribe/route'; 
import User from '@/models/User'; 
import MailingList from '@/models/MailingList';
import dbConnect from '@/lib/db';
import { formatPluginStatus } from '@/lib/pluginSubmission';

// פונקציה להסרת מספר עמוד משם הספר
function cleanBookName(bookName) {
    if (!bookName) return bookName;
    
    // הסרת פורמטים כמו "שם_ספר - עמוד 5" או "שם_ספר/עמוד 5" או "שם_ספר page 5"
    return bookName
        .replace(/[\s\-\/]+(?:עמוד|page)\s*\d+/gi, '')
        .trim();
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderPluginChanges(changes = []) {
    if (!changes.length) return '';

    const items = changes.map(change => `
        <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin: 10px 0;">
            <p style="margin: 0 0 6px 0;"><strong>${escapeHtml(change.label)}</strong></p>
            <p style="margin: 0; color: #666;"><strong>לפני:</strong> ${escapeHtml(change.before || 'ללא')}</p>
            <p style="margin: 6px 0 0 0; color: #111;"><strong>אחרי:</strong> ${escapeHtml(change.after || 'ללא')}</p>
        </div>
    `).join('');

    return `
        <div style="margin-top: 24px; text-align: right;">
            <h3 style="color: #2c3e50; margin-bottom: 12px;">מה השתנה?</h3>
            ${items}
        </div>
    `;
}

function createTransporter() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
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

// שליחת התראה למנהלים על העלאת תוסף חדש או עדכון
export async function sendPluginUploadNotification(pluginData) {
    try {
        await dbConnect();
        
        // מציאת כל המנהלים שרשומים להתראות על תוספים (לא כולל את המעלה עצמו)
        const admins = await User.find({
            role: 'admin',
            'pluginNotifications.enabled': true,
            isVerified: true,
            email: { $ne: pluginData.uploaderEmail }
        });
        
        if (admins.length === 0) {
            return { sent: false, reason: 'no_subscribers' };
        }

        const transporter = createTransporter();

        const adminUrl = `${process.env.NEXTAUTH_URL}/library/admin/plugins`;
        const logoUrl = `${process.env.NEXTAUTH_URL}/logo.png`;

        const isUpdate = pluginData.submissionType === 'update';
        const title = isUpdate ? '✏️ עדכון לתוסף קיים ממתין לאישור' : '🔌 תוסף חדש הועלה!';
        const subject = isUpdate
            ? `✏️ עדכון תוסף ממתין לאישור: ${pluginData.pluginName}`
            : `🔌 תוסף חדש הועלה: ${pluginData.pluginName}`;
        const introText = isUpdate
            ? 'נשלחה עריכה לתוסף קיים, והיא ממתינה לאישור שלך לפני שתתעדכן בחנות.'
            : 'התוסף ממתין לאישור שלך לפני שיופיע בחנות התוספים.';
        const changesHtml = renderPluginChanges(pluginData.changes);
        const safePluginName = escapeHtml(pluginData.pluginName || 'לא צוין');
        const safeVersion = escapeHtml(pluginData.version || 'לא צוין');
        const safeAuthor = escapeHtml(pluginData.author || 'לא ידוע');
        const safeUploadedBy = escapeHtml(pluginData.uploadedBy || 'אורח');
        const safeShortDescription = pluginData.shortDescription ? escapeHtml(pluginData.shortDescription) : '';

        const sendPromises = admins.map(async (admin) => {
            // יצירת טוקן מאובטח להסרה מהתראות
            const secureToken = encryptToken(admin.email);
            const unsubUrl = `${process.env.NEXTAUTH_URL}/api/user/unsubscribe?t=${secureToken}&action=plugin_notifications`;
            
            const emailHtml = `
            <div dir="rtl" style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 40px; text-align: center;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden;">
                    <div style="background-color: #ffffff; padding: 20px; border-bottom: 3px solid #d4a373;">
                        <img src="${logoUrl}" alt="Otzaria Logo" style="width: 120px; height: auto;">
                        <h2 style="color: #d4a373; font-size: 20px; margin: 5px 0 0 0; font-weight: bold;">ספריית אוצריא</h2>
                    </div>
                    <div style="padding: 30px; color: #333333;">
                        <h1 style="color: #2c3e50; font-size: 24px; margin-bottom: 10px;">${title}</h1>
                        <div style="background-color: #f0f0f0; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: right;">
                            <p style="margin: 8px 0;"><strong>שם התוסף:</strong> ${safePluginName}</p>
                            <p style="margin: 8px 0;"><strong>גרסה:</strong> ${safeVersion}</p>
                            <p style="margin: 8px 0;"><strong>מפתח:</strong> ${safeAuthor}</p>
                            <p style="margin: 8px 0;"><strong>הועלה על ידי:</strong> ${safeUploadedBy}</p>
                            ${safeShortDescription ? `<p style="margin: 8px 0;"><strong>תיאור:</strong> ${safeShortDescription}</p>` : ''}
                        </div>
                        ${changesHtml}
                        <div style="margin: 30px 0;">
                            <a href="${adminUrl}" style="background-color: #d4a373; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                                עבור לניהול תוספים
                            </a>
                        </div>
                        <p style="color: #666; font-size: 14px; margin-top: 20px;">
                            ${introText}
                        </p>
                    </div>
                    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 11px; color: #999; text-align: center;">
                        קיבלת הודעה זו כי נרשמת לעדכונים על העלאות תוספים.
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
                    subject,
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
        
        return { sent: true, count: admins.length, successful, failed };

    } catch (error) {
        console.error('Plugin Upload Notification Error:', error);
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

// תבנית בסיסית למייל תזכורת אוטומטית (עמודי ספר רגיל / ספר דיקטה).
// bodyHtml חייב להיות HTML שכבר עבר escape במקום הקריאה.
function buildStaleReminderHtml({ headingTitle, bodyHtml, ctaUrl, ctaLabel, unsubUrl }) {
    const logoUrl = `${process.env.NEXTAUTH_URL}/logo.png`;
    return `
    <div dir="rtl" style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 40px; text-align: center;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden;">
            <div style="background-color: #ffffff; padding: 20px; border-bottom: 3px solid #d4a373;">
                <img src="${logoUrl}" alt="Otzaria Logo" style="width: 120px; height: auto;">
                <h2 style="color: #d4a373; margin: 5px 0 0 0; font-size: 20px; font-weight: bold;">ספריית אוצריא</h2>
            </div>
            <div style="padding: 30px; color: #333333;">
                <h1 style="color: #2c3e50; font-size: 24px; margin-bottom: 10px;">${escapeHtml(headingTitle)}</h1>
                <div style="font-size: 18px; line-height: 1.6; text-align: right; margin-bottom: 30px;">
                    ${bodyHtml}
                </div>
                <div style="margin: 30px 0; text-align: center;">
                    <a href="${ctaUrl}" style="background-color: #d4a373; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                        ${escapeHtml(ctaLabel)}
                    </a>
                </div>
            </div>
            <div style="margin-top: 0; padding: 20px; border-top: 1px solid #eee; font-size: 11px; color: #999; text-align: center;">
                קיבלת הודעה זו ממערכת אוצריא.
                <br>
                <a href="${unsubUrl}" style="color: #999; text-decoration: underline;">להסרה מקבלת תזכורות במייל<br>שים לב שלא תוכל לערוך עוד באתר כל עוד לא תאשר קבלת מיילים!<br>התזכורות נצרכות לצורך תפעול תקין של המערכת.</a>
            </div>
        </div>
    </div>
    `;
}

// תזכורת אוטומטית על עמודים תקועים בספר רגיל. pages הוא מערך עם { pageNumber, daysSinceEdit }
export async function sendStalePageReminder({ user, book, pages }) {
    if (!user?.email || !book?.slug) return { sent: false, reason: 'missing_data' };
    if (!pages?.length) return { sent: false, reason: 'no_pages' };

    const transporter = createTransporter();
    const siteUrl = process.env.NEXTAUTH_URL || '';
    const bookUrl = `${siteUrl}/library/books/${encodeURIComponent(book.slug)}`;
    const secureToken = encryptToken(user.email);
    const unsubUrl = `${siteUrl}/api/user/unsubscribe?t=${secureToken}&action=reminder`;
    const safeBookName = escapeHtml(book.name || '');

    const pageListText = pages
        .map(p => `• עמוד ${p.pageNumber} (לא נערך כבר ${p.daysSinceEdit} ימים)`)
        .join('\n');
    const pageListHtml = pages
        .map(p => `• עמוד ${p.pageNumber} (לא נערך כבר ${p.daysSinceEdit} ימים)`)
        .join('<br/>');

    const introHtml = `שמנו לב שיש עמודים שתפסת לעריכה בספר "${safeBookName}" שלא נערכו כשבוע ויותר:`;
    const closingHtml =
        'אנא היכנס למערכת והשלם את העריכה, או שחרר את העמודים כדי שאחרים יוכלו להמשיך.<br/>' +
        'שים לב — עמודים שלא ייערכו במהלך השבוע הקרוב ישוחררו אוטומטית.';

    const bodyHtml = `${introHtml}<br/><br/>${pageListHtml}<br/><br/>${closingHtml}`;

    const bodyText =
        `שמנו לב שיש עמודים שתפסת לעריכה בספר "${book.name}" שלא נערכו כשבוע ויותר:\n\n` +
        `${pageListText}\n\n` +
        `אנא היכנס למערכת והשלם את העריכה, או שחרר את העמודים כדי שאחרים יוכלו להמשיך.\n` +
        `שים לב — עמודים שלא ייערכו במהלך השבוע הקרוב ישוחררו אוטומטית.`;

    const html = buildStaleReminderHtml({
        headingTitle: `תזכורת: עמודים תקועים בספר "${book.name}"`,
        bodyHtml,
        ctaUrl: bookUrl,
        ctaLabel: 'מעבר לספר',
        unsubUrl,
    });

    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: user.email,
            subject: `תזכורת אוטומטית: עמודים שלא נערכו בספר "${book.name}"`,
            headers: {
                'List-Unsubscribe': `<${unsubUrl}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
            },
            html,
            text: `${bodyText}\n\nלהסרה: ${unsubUrl}`,
        });
        return { sent: true };
    } catch (error) {
        console.error(`Stale page reminder failed for ${user.email}:`, error.message);
        return { sent: false, error: error.message };
    }
}

// תזכורת אוטומטית על ספרי דיקטה תקועים. books הוא מערך עם { title, daysSinceEdit }
export async function sendStaleDictaReminder({ user, books }) {
    if (!user?.email) return { sent: false, reason: 'missing_data' };
    if (!books?.length) return { sent: false, reason: 'no_books' };

    const transporter = createTransporter();
    const siteUrl = process.env.NEXTAUTH_URL || '';
    const ctaUrl = `${siteUrl}/library/dicta-books?status=my-books`;
    const secureToken = encryptToken(user.email);
    const unsubUrl = `${siteUrl}/api/user/unsubscribe?t=${secureToken}&action=reminder`;

    const bookListText = books
        .map(b => `• ${b.title} (לא נערך כבר ${b.daysSinceEdit} ימים)`)
        .join('\n');
    const bookListHtml = books
        .map(b => `• ${escapeHtml(b.title || '')} (לא נערך כבר ${b.daysSinceEdit} ימים)`)
        .join('<br/>');

    const introHtml = 'שמנו לב שיש ספרי דיקטה שתפסת לעריכה ולא נגעת בהם כשבוע ויותר:';
    const closingHtml =
        'אנא היכנס למערכת והשלם את העריכה, או שחרר את הספר כדי שאחרים יוכלו להמשיך.<br/>' +
        'שים לב — ספר שלא ייערך במהלך השבוע הקרוב ישוחרר אוטומטית.';

    const bodyHtml = `${introHtml}<br/><br/>${bookListHtml}<br/><br/>${closingHtml}`;

    const bodyText =
        `שמנו לב שיש ספרי דיקטה שתפסת לעריכה ולא נגעת בהם כשבוע ויותר:\n\n` +
        `${bookListText}\n\n` +
        `אנא היכנס למערכת והשלם את העריכה, או שחרר את הספר כדי שאחרים יוכלו להמשיך.\n` +
        `שים לב — ספר שלא ייערך במהלך השבוע הקרוב ישוחרר אוטומטית.`;

    const html = buildStaleReminderHtml({
        headingTitle: 'תזכורת: ספרי דיקטה תקועים בעריכה',
        bodyHtml,
        ctaUrl,
        ctaLabel: 'כנס לספרי הדיקטה שלי',
        unsubUrl,
    });

    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: user.email,
            subject: 'תזכורת אוטומטית: ספרי דיקטה שלא נערכו',
            headers: {
                'List-Unsubscribe': `<${unsubUrl}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
            },
            html,
            text: `${bodyText}\n\nלהסרה: ${unsubUrl}`,
        });
        return { sent: true };
    } catch (error) {
        console.error(`Stale dicta reminder failed for ${user.email}:`, error.message);
        return { sent: false, error: error.message };
    }
}

export async function sendPluginApprovalNotification(pluginData) {
    try {
        const recipientEmail = (pluginData.recipientEmail || '').trim();
        if (!recipientEmail) {
            return { sent: false, reason: 'missing_recipient_email' };
        }

        const transporter = createTransporter();
        const logoUrl = `${process.env.NEXTAUTH_URL}/logo.png`;
        const pluginUrl = `${process.env.NEXTAUTH_URL}/plugins/${encodeURIComponent(pluginData.pluginId)}`;
        const safePluginName = escapeHtml(pluginData.pluginName || 'התוסף שלך');
        const safeVersion = escapeHtml(pluginData.version || 'לא צוין');
        const safeStatus = escapeHtml(formatPluginStatus(pluginData.status));
        const safeRecipientName = escapeHtml(pluginData.recipientName || pluginData.recipientEmail);
        const isUpdate = pluginData.submissionType === 'update';
        const title = isUpdate ? 'עדכון התוסף שלך אושר' : 'התוסף שלך אושר';
        const intro = isUpdate
            ? 'העדכון ששלחת אושר על ידי מנהל, והוא זמין כעת בדף התוסף ובחנות התוספים.'
            : 'התוסף ששלחת אושר על ידי מנהל, והוא זמין כעת בדף התוסף ובחנות התוספים.';

        const emailHtml = `
        <div dir="rtl" style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 40px; text-align: center;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden;">
                <div style="background-color: #ffffff; padding: 20px; border-bottom: 3px solid #d4a373;">
                    <img src="${logoUrl}" alt="Otzaria Logo" style="width: 120px; height: auto;">
                    <h2 style="color: #d4a373; font-size: 20px; margin: 5px 0 0 0; font-weight: bold;">ספריית אוצריא</h2>
                </div>
                <div style="padding: 30px; color: #333333; text-align: right;">
                    <h1 style="color: #2c3e50; font-size: 24px; margin-bottom: 10px; text-align: center;">🎉 ${title}</h1>
                    <p style="font-size: 16px; line-height: 1.8; margin: 0 0 20px 0;">
                        שלום ${safeRecipientName},
                    </p>
                    <p style="font-size: 16px; line-height: 1.8; margin: 0 0 20px 0;">
                        ${intro}
                    </p>
                    <div style="background-color: #f0f0f0; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 8px 0;"><strong>שם התוסף:</strong> ${safePluginName}</p>
                        <p style="margin: 8px 0;"><strong>גרסה:</strong> ${safeVersion}</p>
                        <p style="margin: 8px 0;"><strong>סטטוס:</strong> ${safeStatus}</p>
                    </div>
                    <div style="margin: 30px 0; text-align: center;">
                        <a href="${pluginUrl}" style="background-color: #d4a373; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                            מעבר לדף התוסף
                        </a>
                    </div>
                    <p style="color: #666; font-size: 14px; line-height: 1.8; margin-top: 20px;">
                        אפשר לפתוח את התוסף ישירות, לבדוק איך הוא מוצג בחנות, ולשתף את הקישור עם אחרים.
                    </p>
                </div>
            </div>
        </div>
        `;

        await transporter.sendMail({
            from: {
                name: "ספריית אוצריא",
                address: process.env.SMTP_FROM
            },
            to: recipientEmail,
            replyTo: process.env.SMTP_REPLY_TO || process.env.SMTP_FROM,
            subject: isUpdate
                ? `✅ עדכון התוסף אושר: ${pluginData.pluginName}`
                : `✅ התוסף אושר: ${pluginData.pluginName}`,
            html: emailHtml
        });

        return { sent: true, email: recipientEmail };
    } catch (error) {
        console.error('Plugin Approval Notification Error:', error);
        return { sent: false, error: error.message };
    }
}

// תוויות סוגי דיווח על תוסף (חייב להתאים ל-enum ב-PluginReport)
const PLUGIN_REPORT_TYPE_LABELS = {
    bug: 'תקלה',
    crash: 'קריסה',
    content: 'תוכן',
    other: 'אחר'
};

export function formatPluginReportType(type) {
    return PLUGIN_REPORT_TYPE_LABELS[type] || PLUGIN_REPORT_TYPE_LABELS.other;
}

// שליחת התראה למפתח התוסף על דיווח שהתקבל ממשתמש באוצריא
export async function sendPluginReportNotification(reportData) {
    try {
        const recipientEmail = (reportData.recipientEmail || '').trim();
        if (!recipientEmail) {
            return { sent: false, reason: 'missing_recipient_email' };
        }

        const transporter = createTransporter();
        const logoUrl = `${process.env.NEXTAUTH_URL}/logo.png`;
        const pluginUrl = reportData.pluginSlugOrId
            ? `${process.env.NEXTAUTH_URL}/plugins/${encodeURIComponent(reportData.pluginSlugOrId)}`
            : null;
        const reporterEmail = (reportData.reporterEmail || '').trim();

        const safePluginName = escapeHtml(reportData.pluginName || 'לא צוין');
        const safePluginVersion = escapeHtml(reportData.pluginVersion || 'לא צוין');
        const safeReportType = escapeHtml(formatPluginReportType(reportData.reportType));
        const safeDetails = escapeHtml(reportData.details || '');
        const safeRecipientName = escapeHtml(reportData.recipientName || recipientEmail);
        const safeAppVersion = escapeHtml(reportData.appVersion || 'לא צוין');
        const safePlatform = escapeHtml(reportData.platform || 'לא צוין');
        const safeReporterEmail = escapeHtml(reporterEmail);

        const replyToBlock = reporterEmail
            ? `<p style="margin: 8px 0;"><strong>כתובת למענה:</strong> <a href="mailto:${safeReporterEmail}" style="color: #d4a373;">${safeReporterEmail}</a></p>`
            : `<p style="margin: 8px 0; color: #666;">המדווח לא השאיר כתובת למענה.</p>`;

        const pluginLinkBlock = pluginUrl
            ? `<div style="margin: 30px 0; text-align: center;">
                        <a href="${pluginUrl}" style="background-color: #d4a373; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                            מעבר לדף התוסף
                        </a>
                    </div>`
            : '';

        const emailHtml = `
        <div dir="rtl" style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 40px; text-align: center;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden;">
                <div style="background-color: #ffffff; padding: 20px; border-bottom: 3px solid #d4a373;">
                    <img src="${logoUrl}" alt="Otzaria Logo" style="width: 120px; height: auto;">
                    <h2 style="color: #d4a373; font-size: 20px; margin: 5px 0 0 0; font-weight: bold;">ספריית אוצריא</h2>
                </div>
                <div style="padding: 30px; color: #333333; text-align: right;">
                    <h1 style="color: #2c3e50; font-size: 24px; margin-bottom: 10px; text-align: center;">📩 התקבל דיווח על התוסף שלך</h1>
                    <p style="font-size: 16px; line-height: 1.8; margin: 0 0 20px 0;">
                        שלום ${safeRecipientName},
                    </p>
                    <p style="font-size: 16px; line-height: 1.8; margin: 0 0 20px 0;">
                        משתמש בתוסף שלך שלח דיווח דרך תוכנת אוצריא.
                    </p>
                    <div style="background-color: #f0f0f0; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 8px 0;"><strong>שם התוסף:</strong> ${safePluginName}</p>
                        <p style="margin: 8px 0;"><strong>גרסת התוסף:</strong> ${safePluginVersion}</p>
                        <p style="margin: 8px 0;"><strong>סוג הדיווח:</strong> ${safeReportType}</p>
                        <p style="margin: 8px 0;"><strong>גרסת אוצריא:</strong> ${safeAppVersion}</p>
                        <p style="margin: 8px 0;"><strong>מערכת הפעלה:</strong> ${safePlatform}</p>
                        ${replyToBlock}
                    </div>
                    <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 20px 0;">
                        <p style="margin: 0 0 8px 0;"><strong>תוכן הדיווח:</strong></p>
                        <p style="margin: 0; white-space: pre-wrap; line-height: 1.7;">${safeDetails}</p>
                    </div>
                    ${pluginLinkBlock}
                    <p style="color: #666; font-size: 14px; line-height: 1.8; margin-top: 20px;">
                        הדיווח נשלח על ידי משתמש של התוסף דרך אוצריא. עותק ממנו ממתין לך גם בתיבת ההודעות באתר.
                    </p>
                </div>
            </div>
        </div>
        `;

        await transporter.sendMail({
            from: {
                name: "ספריית אוצריא",
                address: process.env.SMTP_FROM
            },
            to: recipientEmail,
            replyTo: reporterEmail || process.env.SMTP_REPLY_TO || process.env.SMTP_FROM,
            subject: `📩 דיווח חדש על התוסף: ${reportData.pluginName || 'ללא שם'}`,
            html: emailHtml
        });

        return { sent: true, email: recipientEmail };
    } catch (error) {
        console.error('Plugin Report Notification Error:', error);
        return { sent: false, error: error.message };
    }
}
