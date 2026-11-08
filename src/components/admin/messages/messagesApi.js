// הבקשות של מסך "הודעות" לשרת — אותן כתובות, אותן שיטות ואותו גוף כמו במסכים הקודמים
// (admin/messages/AdminMessagesClient.jsx ו-admin/reminders/page.jsx), דרך העטיפה המשותפת (adminRequest):
// הודעת שגיאה בעברית, התחברות שפגה מזוהה, תקרת זמן.
import { requestJson } from '@/components/admin/list/adminRequest'
import { toAdminMessageListItem } from '@/lib/adminMessagesView'

/** תור ההודעות המשותף (אותה שאילתה כמו בטעינת העמוד), באותה צורה מצומצמת */
export async function loadMessages() {
  const data = await requestJson('/api/messages?allMessages=true', { fallback: 'לא הצלחנו לטעון את ההודעות.' })
  return (data.messages || []).map(toAdminMessageListItem)
}

/** רשימת המשתמשים לבחירת נמען (משתמשים רגילים בלבד — כמו בשרת) */
export async function loadRecipients() {
  const data = await requestJson('/api/admin/users-basic', { fallback: 'לא הצלחנו לטעון את רשימת המשתמשים.' })
  return data.users || []
}

export function reply(messageId, text) {
  return requestJson('/api/messages/reply', {
    method: 'POST',
    body: { messageId, reply: text, fromAdminPanel: true },
    fallback: 'לא הצלחנו לשלוח את התשובה. נסה שוב.',
  })
}

/** @param {string} messageId @param {{ keepalive?: boolean }} [options] keepalive — בסגירת הדף (useDeferredActions) */
export function markRead(messageId, { keepalive = false } = {}) {
  return requestJson('/api/messages/mark-read', { method: 'PUT', body: { messageId }, fallback: 'לא הצלחנו לסמן כנקרא.', keepalive })
}

export function deleteMessage(messageId) {
  return requestJson('/api/messages/delete', { method: 'DELETE', body: { messageId }, fallback: 'לא הצלחנו למחוק את השיחה.' })
}

/**
 * הודעה חדשה: למשתמש אחד (recipientId), או לכל המשתמשים (sendToAll) — אותו גוף כמו קודם.
 * @returns {Promise<{ success: true, message?: string }>} message — ההודעה של השרת ("נשלח בהצלחה ל-40 משתמשים")
 */
export function sendMessage({ recipientId, subject, message, sendToAll }) {
  return requestJson('/api/messages/send-admin', {
    method: 'POST',
    body: { recipientId: sendToAll ? null : recipientId, subject, message, sendToAll },
    fallback: 'לא הצלחנו לשלוח את ההודעה. נסה שוב.',
  })
}

// ----- תזכורות -----

export async function loadBooks() {
  const data = await requestJson('/api/library/list', { fallback: 'לא הצלחנו לטעון את רשימת הספרים.' })
  return Array.isArray(data.books) ? data.books : []
}

export async function loadAllUsers() {
  const data = await requestJson('/api/admin/users', { fallback: 'לא הצלחנו לטעון את רשימת המשתמשים.' })
  return Array.isArray(data.users) ? data.users : []
}

export async function loadHistory() {
  const data = await requestJson('/api/admin/history', { fallback: 'לא הצלחנו לטעון את ההיסטוריה.' })
  return Array.isArray(data.history) ? data.history : []
}

export async function loadBookPages(bookPath) {
  const data = await requestJson(`/api/book/${encodeURIComponent(bookPath)}`, { fallback: 'לא הצלחנו לבדוק מי עובד על הספר.' })
  return Array.isArray(data.pages) ? data.pages : []
}

/** שליחת התזכורת בדואר — הגוף נבנה ב-reminderWizard.sendEmailBody (אותו גוף כמו קודם) */
export function sendReminderEmail(body) {
  return requestJson('/api/admin/send-email', { method: 'POST', body, fallback: 'לא הצלחנו לשלוח את התזכורת.', timeoutMs: 120000 })
}

/** הסרה מההיסטוריה — DELETE /api/admin/history?id=… (בלי גוף), כמו קודם */
export function deleteHistoryItem(id) {
  return requestJson(`/api/admin/history?id=${id}`, { method: 'DELETE', fallback: 'לא הצלחנו להסיר מההיסטוריה.' })
}
