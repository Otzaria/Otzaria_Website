import Message from '@/models/Message';

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
