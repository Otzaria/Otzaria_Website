import Message from '@/models/Message';
import User from '@/models/User';

// תווית השולח המוצגת למקבל הודעת מערכת (אין שולח-משתמש מאחוריה)
export const SYSTEM_SENDER_LABEL = 'מערכת אוצריא';

/**
 * יצירת הודעת מערכת לתיבת ההודעות של משתמש.
 * הודעת מערכת אינה ניתנת למענה (allowReplies=false) ואין לה שולח.
 * @param {Object} params
 * @param {string|Object} params.recipientId - מזהה המשתמש הנמען
 * @param {string} params.subject - נושא ההודעה
 * @param {string} params.content - תוכן ההודעה
 * @param {string} [params.source] - מקור ההודעה במערכת (למשל 'plugin-report')
 * @returns {Promise<Object>} מסמך ההודעה שנוצר
 */
export async function createSystemMessage({ recipientId, subject, content, source = null }) {
  return Message.create({
    sender: null,
    recipient: recipientId,
    subject,
    content,
    messageType: 'system',
    allowReplies: false,
    senderLabel: SYSTEM_SENDER_LABEL,
    systemSource: source,
    isRead: false,
    readBy: []
  });
}

/**
 * הודעת מערכת חד-פעמית למפתח שהעלה לראשונה תוסף שמשתמש ב-feedback.report:
 * דיווחי משתמשים על תוספיו יישלחו לכתובת המייל הרשומה שלו.
 * תפיסת הדגל אטומית — העלאות מקבילות לא יוצרות הודעה כפולה. לא זורקת:
 * כשל נרשם ללוג בלבד כדי לא להפיל העלאת תוסף תקינה.
 * @param {Object} params
 * @param {string|Object} params.userId - מזהה המפתח
 * @param {string[]} [params.usedApiMethods] - קריאות ה-API שאותרו בקוד התוסף
 */
export async function sendPluginReportNoticeIfNeeded({ userId, usedApiMethods }) {
  try {
    if (!Array.isArray(usedApiMethods) || !usedApiMethods.includes('feedback.report')) return;

    const claimed = await User.findOneAndUpdate(
      { _id: userId, pluginReportNoticeSent: { $ne: true } },
      { $set: { pluginReportNoticeSent: true } }
    ).select('email').lean();
    if (!claimed) return;

    await createSystemMessage({
      recipientId: userId,
      subject: 'דיווחי משתמשים על התוסף שלך',
      content: [
        'התוסף שהעלית משתמש ביכולת קבלת דיווחים ממשתמשים (feedback.report).',
        '',
        `דיווחים שמשתמשים ישלחו על התוסף שלך מתוך תוכנת אוצריא יגיעו לכתובת המייל הרשומה שלך באתר: ${claimed.email}`,
        '',
        'אם ברצונך לקבל את הדיווחים לכתובת אחרת, ניתן לעדכן בכל עת את כתובת המייל של החשבון דרך לוח הבקרה (כפתור "עדכון כתובת מייל").'
      ].join('\n'),
      source: 'plugin-report-notice'
    });
  } catch (error) {
    console.error('Failed to send plugin-report notice:', error);
  }
}
