// פונקציות טהורות של עיצוב/תבניות HTML למיילים, מופרדות מ-emailService.js
// כדי שאפשר יהיה לבדוק אותן ביחידה בלי לגעת ב-DB/SMTP.

// פונקציה להסרת מספר עמוד משם הספר
export function cleanBookName(bookName) {
    if (!bookName) return bookName;

    // הסרת פורמטים כמו "שם_ספר - עמוד 5" או "שם_ספר/עמוד 5" או "שם_ספר page 5"
    return bookName
        .replace(/[\s\-\/]+(?:עמוד|page)\s*\d+/gi, '')
        .trim();
}

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function renderPluginChanges(changes = []) {
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

// תבנית בסיסית למייל תזכורת אוטומטית (עמודי ספר רגיל / ספר דיקטה).
// bodyHtml חייב להיות HTML שכבר עבר escape במקום הקריאה.
export function buildStaleReminderHtml({ headingTitle, bodyHtml, ctaUrl, ctaLabel, unsubUrl }) {
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
