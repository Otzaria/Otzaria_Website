// "הודעות" (/library/admin/messages) — מה רואים מתור ההודעות המשותף: מה נכנס ומה נשלח, הסדר, השרשור, הצד השני
// בשיחה, הקטע שבשורה וההודעות "לכל המשתמשים". לוגיקה טהורה, בלי React ובלי DOM (נבדק ב-conversations.test.mjs).
//
// מקור הנתונים — אותו תור כמו קודם (GET /api/messages?allMessages=true, או ישר מהשרת ב-page.jsx): כל הודעה שאינה
// הודעת מערכת, בלי הפרדה בין נכנס ליוצא. ההפרדה כאן.
//
// "צוות" = מי שמטפל בהודעות, כלומר מי שרואה את המסך הזה: admin, admin_plugins, admin_books (STAFF_ROLES — אותה רשימה
// כמו פריט "הודעות" בסרגל, ובדיוק מי שה-proxy מכניס). מנהל OCR, מאמן מודלים ומנהל ספרים-בלבד לא רואים את המסך,
// ופונים לצוות כמו כל משתמש — ולכן הם "לא צוות".
//
// נכנסות — כל שיחה ש:
//   (1) יש בה משהו שהצוות עוד לא קרא (status 'unread'). השרת מסמן "לא נקראה" כשכותבים מחוץ לממשק הניהול, ולכן
//       זה הסימן האמין ביותר — בלי קשר לתפקיד הכותב. כך המונה בסרגל (כל מה שלא נקרא) והמונה בלשונית תמיד שווים.
//   (2) או שמישהו שאינו צוות (תפקיד ידוע) כתב בה — השולח או אחת התשובות.
//   (3) או שהשולח נמחק ואין לה נמען — פנייה לצוות של משתמש שכבר אינו קיים.
// נשלחו — כל השאר: רק הצוות כתב בה (הודעה למשתמש, הודעה לכל המשתמשים, תשובות נוספות של הצוות). הודעה עם נמען
//   ששולחה נמחק (למשל "לכל המשתמשים" ממנהל שנמחק) — כאן, ולא כעשרות שורות בנכנסות.
// הסיווג משתמש בתפקיד הנוכחי של הכותב (השרת לא שומר את התפקיד בזמן הכתיבה) — אבל (1) מבטיח שדבר חדש לא ייעלם.

import { ADMIN_NAV_ITEMS } from '../adminNav.js'

/** מי שמטפל בהודעות — מי שרואה את המסך (כמו פריט "הודעות" בסרגל) */
export const STAFF_ROLES = Object.freeze([...ADMIN_NAV_ITEMS.messages.roles])

/** האם התפקיד הוא של הצוות שמטפל בהודעות */
export function isStaff(role) {
  return STAFF_ROLES.includes(role)
}

/** תפקיד ידוע שאינו צוות (משתמש, מנהל OCR וכו'). תפקיד חסר (כותב שנמחק) — לא ידוע, לא זה ולא זה */
const isKnownNonStaff = (role) => typeof role === 'string' && role !== '' && !isStaff(role)

const time = (date) => {
  const ms = new Date(date ?? NaN).getTime()
  return Number.isFinite(ms) ? ms : 0
}

/** מתי הייתה הפעילות האחרונה: התשובה האחרונה, ואם אין — מתי נשלחה ההודעה (הערך כמו שהגיע, לתצוגה) */
export function lastActivityDate(message) {
  const replies = message?.replies || []
  return replies.length > 0 ? replies[replies.length - 1].createdAt : message?.createdAt
}

/** הפעילות האחרונה במ"ש (למיון) — אותו זמן שמוצג בשורה */
export function lastActivity(message) {
  return time(lastActivityDate(message))
}

/** מהפעילות האחרונה לראשונה — אותו מיון כמו במסך הקודם */
export function sortByActivity(messages) {
  return [...(messages || [])].sort((a, b) => lastActivity(b) - lastActivity(a))
}

export const isUnread = (message) => message?.status === 'unread'

/** יש להודעה נמען (משתמש קיים). בלי נמען — פנייה לצוות, או שהנמען נמחק */
const hasRecipient = (message) => Boolean(message?.recipientId || message?.recipientName || message?.recipientEmail)

/** השולח הוא "הצד השני" (לא הצוות): תפקיד ידוע שאינו צוות, או שולח שנמחק בלי נמען (פנייה לצוות) */
function senderIsOtherSide(message) {
  if (isKnownNonStaff(message?.senderRole)) return true
  return !isStaff(message?.senderRole) && !hasRecipient(message)
}

/** האם השיחה שייכת ל"נכנסות" — ראו ההגדרה בראש הקובץ */
export function isIncoming(message) {
  if (!message) return false
  if (isUnread(message)) return true
  if (senderIsOtherSide(message)) return true
  return (message.replies || []).some((reply) => isKnownNonStaff(reply?.senderRole))
}

/**
 * הצד שאינו צוות בשיחה — מי שמופיע בשורה ובכותרת, ומי שבאמת יקבל את התשובה: השרת שומר את התשובה בשיחה, והיא
 * מופיעה באזור האישי של השולח ושל הנמען (GET /api/messages — sender או recipient). כשהשולח מהצוות — הנמען.
 * בלי נמען (פנייה לצוות, גם של איש צוות שכתב מהאזור האישי) — השולח.
 * gone — החשבון נמחק: אין למי להשיב.
 * @returns {{ name: string, email: string | null, side: 'sender' | 'recipient', gone: boolean }}
 */
export function counterpart(message) {
  if (senderIsOtherSide(message) || !hasRecipient(message)) {
    const gone = !message?.senderId && !message?.senderEmail
    return { name: message?.senderName || 'משתמש לא ידוע', email: message?.senderEmail || null, side: 'sender', gone }
  }
  const gone = !hasRecipient(message)
  return { name: message?.recipientName || 'משתמש שנמחק', email: message?.recipientEmail || null, side: 'recipient', gone }
}

/** הנמען של הודעה שהצוות שלח ("נשלחו") — ומי שיקבל תשובה עליה. נמען שנמחק — gone */
export function recipientSide(message) {
  return { name: message?.recipientName || 'משתמש שנמחק', email: message?.recipientEmail || null, side: 'recipient', gone: !hasRecipient(message) }
}

/**
 * פיצול התור: { inbox, sent }, כל אחד מהפעילות האחרונה לראשונה.
 * @param {any[]} messages
 */
export function splitBoxes(messages) {
  const inbox = []
  const sent = []
  for (const message of sortByActivity(messages)) (isIncoming(message) ? inbox : sent).push(message)
  return { inbox, sent }
}

/** כמה שיחות חדשות (לא נקראו) */
export function unreadCount(messages) {
  return (messages || []).filter(isUnread).length
}

/**
 * "סמן כנקרא" שעוד לא אושר בשרת (ממתין ל"בטל", או בדרך): רענון שמגיע באמצע מחזיר מהשרת "לא נקראה" — כאן
 * ההודעות האלה נשארות "נקראה" במסך, עד שהשרת מאשר.
 * @param {any[]} messages @param {Set<string>} ids
 */
export function withLocalRead(messages, ids) {
  if (!ids || ids.size === 0) return messages
  return (messages || []).map((m) => (ids.has(m.id) && isUnread(m) ? { ...m, status: 'read' } : m))
}

/**
 * השרשור לתצוגה: ההודעה עצמה ואחריה התשובות, כל אחת עם הכותב והאם הוא מהצוות.
 * @returns {{ id: string, author: string, fromTeam: boolean, content: string, createdAt: any }[]}
 */
export function threadOf(message) {
  if (!message) return []
  const first = {
    id: `${message.id}-0`,
    author: message.senderName || 'משתמש לא ידוע',
    fromTeam: isStaff(message.senderRole),
    content: message.content || '',
    createdAt: message.createdAt,
  }
  const replies = (message.replies || []).map((reply, i) => ({
    id: reply.id || `${message.id}-${i + 1}`,
    // כותב שנמחק — לא יודעים אם היה מהצוות או לא
    author: reply.senderName || 'חשבון שנמחק',
    fromTeam: isStaff(reply.senderRole),
    content: reply.content || '',
    createdAt: reply.createdAt,
  }))
  return [first, ...replies]
}

/** יש בשרשור גם הצוות וגם הצד השני (רק אז מזיחים את הבועות לשני הצדדים) */
export function hasBothSides(thread) {
  return thread.some((t) => t.fromTeam) && thread.some((t) => !t.fromTeam)
}

/** קטע קצר מהמילים האחרונות בשיחה — שורה אחת (רווחים ושורות מתכווצים) */
export function snippet(message, max = 140) {
  const thread = threadOf(message)
  const last = thread[thread.length - 1]
  const text = String(last?.content || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/** מי כתב אחרון — לשורה ("השבת" כשזה הצוות, אחרת השם) */
export function lastAuthor(message) {
  const thread = threadOf(message)
  return thread[thread.length - 1] || null
}

/** הנושא לתצוגה ולשמות נגישים — "בלי נושא" כשאין */
export const subjectText = (subject) => String(subject || '').trim() || 'בלי נושא'

/** כמה זמן לכל היותר בין ההודעה הראשונה לאחרונה של שידור אחד (send-admin יוצר את כולן בבת אחת, insertMany) */
export const BROADCAST_WINDOW_MS = 3000

/** המפתח של שידור: אותו שולח (המזהה; כשאין — השם), אותו נושא ואותו תוכן במלואם */
export function broadcastKey(message) {
  return JSON.stringify([message?.senderId || message?.senderName || '', message?.subject || '', message?.content || ''])
}

/**
 * "נשלחו": הודעה ל"כל המשתמשים" נשמרת בשרת כהודעה נפרדת לכל נמען (send-admin, sendToAll), בלי מזהה שידור. כאן הן
 * מקובצות לשורה אחת רק כשברור שזה שידור אחד: אותו שולח, אותו נושא ואותו תוכן במלואם, וכולן נשמרו בתוך
 * BROADCAST_WINDOW_MS (insertMany — באותה בקשה). שתי הודעות זהות שמנהל שלח בנפרד לשני משתמשים (בחירת נמען,
 * הקלדה, שליחה — שניות רבות) נשארות שתי שורות, ואפשר להשיב לכל אחת.
 * רק הודעות שלא נענו מתקבצות; נמען שהשיב — השיחה שלו בנכנסות, והיא נספרת בקבוצה כ"השיבו" (repliedCount), אם
 * העברתם את הנכנסות (inbox).
 * כל קבוצה: { id, messages, recipients: [{ id, name, email }], subject, content, senderName, createdAt,
 *   lastActivity, lastActivityDate, repliedCount }. הודעה בודדת היא קבוצה של אחת. הסדר — מהפעילות האחרונה.
 * @param {any[]} messages  ההודעות של "נשלחו"
 * @param {{ inbox?: any[], windowMs?: number }} [options]
 */
export function groupSent(messages, { inbox = [], windowMs = BROADCAST_WINDOW_MS } = {}) {
  const groups = []
  const open = new Map() // מפתח → הקבוצה האחרונה עם המפתח הזה
  const ordered = [...(messages || [])].sort((a, b) => time(b.createdAt) - time(a.createdAt))
  for (const message of ordered) {
    const groupable = (message.replies || []).length === 0 && hasRecipient(message)
    const key = groupable ? broadcastKey(message) : null
    const current = key ? open.get(key) : null
    const recipient = { id: message.id, name: message.recipientName || null, email: message.recipientEmail || null }
    if (current && current.newest - time(message.createdAt) <= windowMs) {
      current.messages.push(message)
      current.recipients.push(recipient)
      current.oldest = time(message.createdAt)
      continue
    }
    const group = {
      id: message.id,
      messages: [message],
      recipients: [recipient],
      subject: message.subject,
      content: message.content,
      senderName: message.senderName,
      createdAt: message.createdAt,
      lastActivity: lastActivity(message),
      lastActivityDate: lastActivityDate(message),
      repliedCount: 0,
      key,
      newest: time(message.createdAt),
      oldest: time(message.createdAt),
    }
    groups.push(group)
    if (key) open.set(key, group)
  }
  // נמענים של שידור שהשיבו (השיחה שלהם בנכנסות)
  const broadcasts = groups.filter((g) => g.messages.length > 1)
  if (broadcasts.length > 0) {
    for (const m of inbox || []) {
      const key = broadcastKey(m)
      const t = time(m.createdAt)
      const hit = broadcasts.find((g) => g.key === key && t <= g.newest + windowMs && t >= g.newest - windowMs)
      if (hit) hit.repliedCount += 1
    }
  }
  return groups
    .map(({ oldest, newest, key, ...group }) => group)
    .sort((a, b) => b.lastActivity - a.lastActivity)
}

/** הנמען בשורה של "נשלחו": שם, "משתמש שנמחק", או "N נמענים" */
export function audienceText(group) {
  const n = group?.recipients?.length || 0
  if (n > 1) return `${n.toLocaleString('he-IL')} נמענים`
  const only = group?.recipients?.[0]
  return only?.name || 'משתמש שנמחק'
}

const fold = (text) => String(text || '').toLowerCase()

/**
 * חיפוש בשיחה: כל המילים מופיעות בשם השולח, בדואר, בנמען, בנושא או בטקסט (כולל התשובות).
 * @param {any} message
 * @param {string} q
 */
export function matchesSearch(message, q) {
  const terms = fold(q).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const text = fold([
    message?.senderName, message?.senderEmail, message?.recipientName, message?.recipientEmail, message?.subject, message?.content,
    ...(message?.replies || []).map((r) => `${r.senderName || ''} ${r.content || ''}`),
  ].join(' '))
  return terms.every((term) => text.includes(term))
}

/** חיפוש בקבוצה של "נשלחו" — גם בשמות כל הנמענים */
export function groupMatchesSearch(group, q) {
  const first = group?.messages?.[0] || {}
  return matchesSearch({ ...first, recipientName: (group?.recipients || []).map((r) => r.name).join(' ') }, q)
}
