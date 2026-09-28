// צמצום רשומת הודעה לשדות שדף ניהול ההודעות (AdminMessagesClient) מציג בפועל —
// לוגיקה טהורה עם טסט (adminMessagesView.test.mjs).
//
// getAdminMessagesList מחזיר את הצורה המלאה של GET /api/messages (כולל אובייקטי
// sender/recipient מאוכלסים, readBy, ולכל תגובה גם sender/email/role). כשהרשימה
// עוברת כ-prop מה-Server Component היא נכנסת כולה ל-HTML של הדף, ולכן כאן
// משאירים רק את מה שהלקוח קורא. ה-API עצמו לא משתנה.
export function toAdminMessageListItem(msg) {
  return {
    id: msg.id,
    subject: msg.subject,
    content: msg.content,
    status: msg.status,
    allowReplies: msg.allowReplies,
    senderName: msg.senderName,
    senderEmail: msg.senderEmail,
    recipientName: msg.recipientName,
    recipientEmail: msg.recipientEmail,
    createdAt: msg.createdAt,
    replies: (msg.replies || []).map((r) => ({
      id: r.id,
      senderName: r.senderName,
      content: r.content,
      createdAt: r.createdAt,
    })),
  }
}
