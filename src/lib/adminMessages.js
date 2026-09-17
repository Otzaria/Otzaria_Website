import dbConnect from '@/lib/db'
import Message from '@/models/Message'

// עיצוב מסמך הודעה בודד לפורמט שהלקוח מצפה לו — זהה בדיוק למיפוי שהיה קודם
// בתוך GET /api/messages, מחולץ לכאן כדי שישמש גם את השאילתה הממוטמנת של
// דף ניהול ההודעות (page.jsx) וגם את ה-API route (רענון ללא מטמון בצד הלקוח).
function formatMessage(msg) {
  return {
    id: msg._id.toString(),
    subject: msg.subject,
    content: msg.content,
    sender: msg.sender,
    recipient: msg.recipient,
    isRead: msg.isRead,
    readBy: (msg.readBy || []).map((id) => id.toString()),
    messageType: msg.messageType || 'user',
    allowReplies: msg.allowReplies !== false,
    // הודעת מערכת מזוהה לפי messageType — populate מחזיר null גם למשתמש שנמחק
    senderName:
      msg.sender?.name || (msg.messageType === 'system' ? msg.senderLabel || 'מערכת אוצריא' : 'משתמש לא ידוע'),
    senderEmail: msg.sender?.email,
    recipientName: msg.recipient?.name || null,
    recipientEmail: msg.recipient?.email || null,
    status: !msg.isRead ? 'unread' : msg.replies?.length > 0 ? 'replied' : 'read',
    createdAt: msg.createdAt,
    replies: (msg.replies || []).map((r) => ({
      id: r._id.toString(),
      sender: r.sender?._id || r.sender,
      senderName: r.sender?.name,
      senderEmail: r.sender?.email,
      senderRole: r.sender?.role,
      content: r.content,
      createdAt: r.createdAt
    }))
  }
}

// תור ההודעות המשותף לניהול — כל ההודעות שאינן הודעת-מערכת (messageType != 'system'),
// ללא סינון לפי זהות הצופה: זהה בדיוק לכל בעל הרשאת ניהול כלשהי (hasAnyAdminAccess),
// בין אם הוא שולח/נמען של הודעה מסוימת ובין אם לא. זו בדיוק אותה שאילתה
// שהייתה בענף ה-admin של GET /api/messages?allMessages=true, מחולצת לכאן כדי
// שתשמש גם את ה-Server Component הממוטמן של דף הניהול (page.jsx) וגם את
// ה-API route (ללא מטמון, לרענון מיידי בצד הלקוח אחרי פעולה).
export async function getAdminMessagesList() {
  await dbConnect()

  const messages = await Message.find({ messageType: { $ne: 'system' } })
    .populate('sender', 'name email role')
    .populate('recipient', 'name email')
    .populate('replies.sender', 'name email role')
    .sort({ createdAt: -1 })
    .lean()

  const formatted = messages.map(formatMessage)

  // JSON round-trip: הופך ObjectId/Date של Mongoose לפלט JSON-רגיל (כפי שכבר
  // קורה בפועל דרך NextResponse.json) — נחוץ גם כדי ש-unstable_cache יוכל
  // לשמור את הערך, וגם כדי להעביר אותו כ-prop מ-Server ל-Client Component.
  return JSON.parse(JSON.stringify(formatted))
}
