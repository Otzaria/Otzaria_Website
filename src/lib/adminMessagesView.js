// צמצום רשומת הודעה לשדות שדף ניהול ההודעות (AdminMessagesClient) מציג בפועל —
// לוגיקה טהורה עם טסט (adminMessagesView.test.mjs).
//
// getAdminMessagesList מחזיר את הצורה המלאה של GET /api/messages (כולל אובייקטי
// sender/recipient מאוכלסים, readBy, ולכל תגובה גם sender/email/role). כשהרשימה
// עוברת כ-prop מה-Server Component היא נכנסת כולה ל-HTML של הדף, ולכן כאן
// משאירים רק את מה שהלקוח קורא. ה-API עצמו לא משתנה.
//
// senderRole (של ההודעה ושל כל תשובה) — התפקיד של הכותב, מתוך sender המאוכלס: המסך מפריד לפיו בין
// "נכנסות" (מישהו שאינו מנהל כתב בשיחה) ל"נשלחו" (ראו adminMessagesScreen/conversations.js). כותב שנמחק — null.
// senderId / recipientId — מזהי הכותב והנמען (null כשאין, או כשהחשבון נמחק): לקיבוץ "לכל המשתמשים" לפי השולח
// עצמו (לא לפי השם), ולהבחנה בין הודעה למשתמש לבין פנייה לצוות (בלי נמען).
// הפונקציה מקבלת גם את הצורה המלאה של ה-API (רענון בדפדפן) — כך לשני המקורות אותה צורה.
const idOf = (doc) => (doc?._id ? String(doc._id) : null)

export function toAdminMessageListItem(msg) {
  return {
    id: msg.id,
    subject: msg.subject,
    content: msg.content,
    status: msg.status,
    allowReplies: msg.allowReplies,
    senderName: msg.senderName,
    senderEmail: msg.senderEmail,
    senderRole: msg.senderRole ?? msg.sender?.role ?? null,
    senderId: msg.senderId ?? idOf(msg.sender),
    recipientName: msg.recipientName,
    recipientEmail: msg.recipientEmail,
    recipientId: msg.recipientId ?? idOf(msg.recipient),
    createdAt: msg.createdAt,
    replies: (msg.replies || []).map((r) => ({
      id: r.id,
      senderName: r.senderName,
      senderRole: r.senderRole ?? null,
      content: r.content,
      createdAt: r.createdAt,
    })),
  }
}
