// הדשבורד של פאנל הניהול (/library/admin) — לוגיקה טהורה, בלי React, בלי DB ובלי DOM, כדי
// שתהיה ניתנת לבדיקה בנפרד (adminDashboard.test.mjs). הספירות עצמן נעשות בשרת
// (adminDashboardData.js), והרכיבים ב-src/components/admin/dashboard/ רק מציירים את מה שמחושב כאן.
//
// הרשאות: כל מקום מוצג בדיוק לתפקידים שרואים את המסך שהוא מקשר אליו. מקום שמקשר לפריט בסרגל
// (navItem) יורש את התפקידים של הפריט מ-adminNav.js — מקור אמת אחד, בלי רשימה מקבילה (גם "הצעות
// עריכה" ו"התנגשויות בסנכרון", שהסרגל מציג לפי אותן בדיקות של roles.js שה-API שלהם עושה).
// ההתאמה ל-proxy נבדקת ב-adminDashboard.proxy.test.js.
//
// סדר: לפי דחיפות (החלטת המשתמש), לא לפי קבוצות הסרגל — תקלות קודם, אחר כך מה שמחכה להחלטה,
// הודעות, ובסוף הצברים הגדולים. רשימה אחת, בלי כותרות קבוצה.
//
// בטקסט שהמשתמש רואה או שומע אין את המילה "תור" (משוב המשתמש) — גם לא כאן בתוויות.

import { ADMIN_NAV_ITEMS, UPLOADS_QUEUE_HREF, canSeeNavItem } from './adminNav.js'
import { getRoles, hasBookLibraryAccess, hasRole, isAdmin } from './roles.js'
import { SECTIONS as PROOF_SECTIONS, SECTION_LABELS as PROOF_SECTION_LABELS } from './trainingProof/vocab.js'

/**
 * @typedef {object} QueueResult       מה שהשרת מחזיר למקום אחד
 * @property {'ok' | 'error'} status
 * @property {number} [count]
 * @property {Date | string | null} [oldest]  תאריך הפריט הוותיק (אם זול לחשב)
 * @property {Record<string, number>} [parts] פירוק המספר (למשל חדשים / עדכונים)
 */

/**
 * רמות הדחיפות, בסדר התצוגה:
 *  problem  — תקלה: משהו נשבר ומחכה לך (צבע error)
 *  decision — מחכה לאישור או להחלטה שלך (ותק חריג → הבלטה בצבע warning)
 *  messages — הודעות
 *  backlog  — צברים גדולים שמטופלים לאט (בלי הבלטת ותק: הם תמיד ישנים)
 */
export const URGENCY_TIERS = ['problem', 'decision', 'messages', 'backlog']

/** מאיזה גיל הפריט הוותיק נחשב חריג (רק ב-decision וב-messages) */
export const STALE_AFTER_DAYS = 14

/**
 * @typedef {object} DashboardQueue
 * @property {string} id
 * @property {'problem' | 'decision' | 'messages' | 'backlog'} tier
 * @property {string} [navItem]  פריט הסרגל שהמקום שייך אליו: השם והתפקידים נלקחים ממנו
 * @property {string} [title]    שם למקום שאין לו פריט בסרגל, או שם מבדיל כשלמסך יש שני כרטיסים
 * @property {string} [icon]     אייקון ייעודי — כדי ששני כרטיסים של אותו מסך לא ייראו זהים
 * @property {string[]} [roles]  רק למקום שאין לו פריט בסרגל
 * @property {string} href
 * @property {(parts: Record<string, number>) => string | null} [hrefFor] קישור מדויק יותר לפי הפירוק
 * @property {{ one: string, many: string }} label  מה המספר סופר ("ממתינות לטיפול")
 * @property {string} clear      משפט שלילה מפורש כשאין כלום ("אין הודעות שלא נקראו")
 * @property {'f' | 'm'} [oldestGender]  לשורת "הוותיק/ה מלפני..." — בלי זה אין שורת ותק
 * @property {string} [where]    איפה במסך נמצאים הפריטים, כשהקישור לא יכול לפתוח שם ישירות
 * @property {(parts: Record<string, number>) => string | null} [detail] שורת פירוק במקום שורת הוותק
 * @property {'servicePlugins'} [feature] מוצג רק כשהתכונה פעילה בשרת
 */

const plural = (n, one, many) => (n === 1 ? one : `${formatCount(n)} ${many}`)

/** @type {DashboardQueue[]} — בסדר הדחיפות (נבדק בטסט: הרמות לא יורדות לאורך המערך) */
export const DASHBOARD_QUEUES = [
  // ===== תקלות =====
  {
    id: 'conflicts', tier: 'problem', navItem: 'conflicts', href: '/library/dicta-edit/conflicts',
    label: { one: 'ספר מחכה להכרעה בין שתי גרסאות', many: 'ספרים מחכים להכרעה בין שתי גרסאות' },
    clear: 'אין ספרים שמחכים להכרעה', oldestGender: 'm',
  },
  {
    // הלשונית שבה הם מופיעים לא נפתחת מהכתובת (המסך שומר את הלשונית ב-sessionStorage) — לכן "where"
    id: 'corrections-failed', tier: 'problem', navItem: 'corrections', title: 'דיווחי טעויות · פרסום', icon: 'error', href: '/library/corrections',
    label: { one: 'תיקון שהפרסום שלו נכשל', many: 'תיקונים שהפרסום שלהם נכשל' },
    clear: 'אין תיקונים שהפרסום שלהם נכשל', where: 'בלשונית "אושרו / בפרסום"',
  },
  // ===== מחכה לאישור או להחלטה =====
  {
    // הפריט בסרגל נקרא "לאישור" (תחת "תוספים"); בכרטיס בלוח — השם המלא
    id: 'plugins', tier: 'decision', navItem: 'plugins', title: 'תוספים לאישור', href: '/library/admin/plugins',
    label: { one: 'תוסף ממתין לאישור', many: 'תוספים ממתינים לאישור' },
    clear: 'אין תוספים שממתינים לאישור', oldestGender: 'm',
    // פירוק רק כשיש שני הסוגים; כשכולם מאותו סוג — שורת הוותק אומרת יותר
    detail: ({ created = 0, updates = 0 } = {}) => (created > 0 && updates > 0
      ? `${plural(created, 'תוסף חדש', 'חדשים')} · ${plural(updates, 'עדכון אחד', 'עדכונים')}`
      : null),
  },
  {
    // התצוגה "תוספי שירות" נפתחת מהכתובת (?view=service) — פריט משלה בסרגל
    id: 'service-plugins', tier: 'decision', navItem: 'plugins-service', icon: 'hub', href: '/library/admin/plugins?view=service',
    feature: 'servicePlugins',
    label: { one: 'תוסף שירות מחכה לך', many: 'תוספי שירות מחכים לך' },
    clear: 'אין תוספי שירות שמחכים לך',
    detail: ({ pendingAdmin = 0, needsOperator = 0 } = {}) => {
      const out = []
      if (pendingAdmin > 0) out.push(plural(pendingAdmin, 'אחד מחכה לבדיקה', 'מחכים לבדיקה'))
      if (needsOperator > 0) out.push(plural(needsOperator, 'אחד נתקע', 'נתקעו'))
      return out.length > 0 ? out.join(' · ') : null
    },
  },
  {
    id: 'proof-review', tier: 'decision', navItem: 'page-proof', href: '/library/admin/page-proof?tab=review',
    // המסך קורא ?sec= מהכתובת — פותחים את החלק שיש בו הכי הרבה
    hrefFor: (parts = {}) => {
      const top = [...PROOF_SECTIONS].sort((a, b) => (parts[b] || 0) - (parts[a] || 0))[0]
      return (parts[top] || 0) > 0 ? `/library/admin/page-proof?tab=review&sec=${top}` : null
    },
    label: { one: 'הגהה ממתינה לאישור', many: 'הגהות ממתינות לאישור' },
    clear: 'אין הגהות שממתינות לאישור', oldestGender: 'f',
    detail: (parts = {}) => {
      const used = PROOF_SECTIONS.filter((s) => (parts[s] || 0) > 0)
      return used.length > 1 ? used.map((s) => `${formatCount(parts[s])} ב${PROOF_SECTION_LABELS[s]}`).join(' · ') : null
    },
  },
  {
    id: 'ocr-lines', tier: 'decision', navItem: 'ocr-lines', href: '/library/admin/ocr-lines',
    label: { one: 'שורה ממתינה לאישור', many: 'שורות ממתינות לאישור' },
    clear: 'אין שורות שממתינות לאישור', oldestGender: 'f',
  },
  {
    id: 'ocr-layout', tier: 'decision', navItem: 'ocr-layout', href: '/library/admin/ocr-layout',
    label: { one: 'עמוד ממתין לאישור', many: 'עמודים ממתינים לאישור' },
    clear: 'אין עמודים שממתינים לאישור', oldestGender: 'm',
  },
  {
    id: 'moderation', tier: 'decision', navItem: 'moderation', href: '/library/dicta-edit/moderation',
    label: { one: 'הצעה ממתינה לאישור', many: 'הצעות ממתינות לאישור' },
    clear: 'אין הצעות שממתינות לאישור', oldestGender: 'f',
  },
  {
    id: 'corrections', tier: 'decision', navItem: 'corrections', href: '/library/corrections',
    label: { one: 'דיווח טעות מחכה לבדיקה', many: 'דיווחי טעות מחכים לבדיקה' },
    clear: 'אין דיווחי טעות שמחכים לבדיקה', oldestGender: 'm',
  },
  {
    id: 'tzurat-submissions', tier: 'decision', navItem: 'tzurat-hadaf', href: '/library/admin/tzurat-hadaf#submissions',
    label: { one: 'הגשת עמוד ממתינה', many: 'הגשות עמוד ממתינות' },
    clear: 'אין הגשות עמוד שממתינות', oldestGender: 'f',
  },
  {
    id: 'tzurat-disputes', tier: 'decision', navItem: 'tzurat-hadaf', icon: 'forum', href: '/library/admin/tzurat-hadaf#disputes',
    label: { one: 'מחלוקת פתוחה', many: 'מחלוקות פתוחות' },
    // בלי שורת ותק: אין שדה שאומר מתי נפתחה המחלוקת
    clear: 'אין מחלוקות פתוחות',
  },
  {
    id: 'tzurat-reports', tier: 'decision', navItem: 'tzurat-hadaf', icon: 'flag', href: '/library/admin/tzurat-hadaf#reports',
    label: { one: 'דיווח חדש', many: 'דיווחים חדשים' },
    clear: 'אין דיווחים חדשים', oldestGender: 'm',
  },
  {
    id: 'book-info', tier: 'decision', navItem: 'book-info', href: '/library/admin/book-info',
    label: { one: 'בקשה פתוחה', many: 'בקשות פתוחות' },
    clear: 'אין בקשות פתוחות', oldestGender: 'f',
    detail: ({ conflict = 0, legacy = 0 } = {}) => {
      const out = []
      if (conflict > 0) out.push(plural(conflict, 'אחת נתקעה וצריכה בדיקה', 'נתקעו וצריכות בדיקה'))
      if (legacy > 0) out.push(plural(legacy, 'אחת מהן הצעה ישנה', 'מהן הצעות ישנות'))
      return out.length > 0 ? out.join(' · ') : null
    },
  },
  {
    id: 'proof-volunteers', tier: 'decision', navItem: 'page-proof', icon: 'person_add', href: '/library/admin/page-proof?tab=volunteers',
    label: { one: 'בקשת גישה של מתנדב', many: 'בקשות גישה של מתנדבים' },
    clear: 'אין בקשות גישה של מתנדבים', oldestGender: 'f',
  },
  // ===== הודעות =====
  {
    id: 'messages', tier: 'messages', navItem: 'messages', href: '/library/admin/messages',
    label: { one: 'הודעה שלא נקראה', many: 'הודעות שלא נקראו' },
    clear: 'אין הודעות שלא נקראו', oldestGender: 'f',
  },
  // ===== צברים =====
  {
    // התור "לא נבדק" — אותו תנאי כמו מונה הסרגל (ADMIN_BADGE_FILTERS.pendingUploads) וכמו הסינון
    // במסך, כך שהכרטיס, הסרגל והרשימה מראים אותו מספר. הקישור — מהוותיקה לחדשה (מי שמחכה הכי הרבה).
    id: 'uploads', tier: 'backlog', navItem: 'uploads', href: UPLOADS_QUEUE_HREF,
    label: { one: 'העלאה שלא נבדקה', many: 'העלאות שלא נבדקו' },
    clear: 'אין העלאות שלא נבדקו', oldestGender: 'f',
  },
  {
    id: 'dictionary', tier: 'backlog', navItem: 'dictionary', href: '/library/admin/dictionary',
    label: { one: 'מילה ממתינה לבדיקה', many: 'מילים ממתינות לבדיקה' },
    clear: 'אין מילים שממתינות לבדיקה',
  },
]

const QUEUES_BY_ID = new Map(DASHBOARD_QUEUES.map((q) => [q.id, q]))

export function getDashboardQueue(id) {
  return QUEUES_BY_ID.get(id) || null
}

/** התפקידים שרואים את המקום: של פריט הסרגל, או המפורשים (למקום מחוץ לסרגל) */
export function queueRoles(queue) {
  if (queue.navItem) return ADMIN_NAV_ITEMS[queue.navItem]?.roles || []
  return queue.roles || []
}

// role — נושא בכל צורה שמקבלות פונקציות roles.js (מחרוזת, מערך תפקידים, או session.user)
export function canSeeQueue(queue, role) {
  if (getRoles(role).length === 0) return false
  if (queue.navItem) {
    const item = ADMIN_NAV_ITEMS[queue.navItem]
    return Boolean(item) && canSeeNavItem(item, role)
  }
  return hasRole(role, ...queueRoles(queue))
}

/**
 * המקומות שהתפקיד רואה, בסדר הדחיפות.
 * features — תכונות שפעילות בשרת ({ servicePlugins: true }); מקום של תכונה כבויה לא מוצג.
 * @param {string} role
 * @param {{ servicePlugins?: boolean }} [features]
 */
export function visibleQueues(role, features = {}) {
  return DASHBOARD_QUEUES.filter((queue) => canSeeQueue(queue, role) && (!queue.feature || features[queue.feature] === true))
}

/** השם והאייקון: השם מפריט הסרגל (השמות הנוכחיים בסרגל), האייקון הייעודי קודם לזה של הסרגל */
export function queueIdentity(queue) {
  const item = queue.navItem ? ADMIN_NAV_ITEMS[queue.navItem] : null
  return { title: queue.title ?? item?.label ?? '', icon: queue.icon ?? item?.icon ?? 'inbox' }
}

// ===== פורמט =====

const NUMBER = new Intl.NumberFormat('he-IL')

/** מספר עם מפריד אלפים; כל ערך לא-מספרי → "—" (אף פעם לא "undefined") */
export function formatCount(value) {
  const n = Number(value)
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '—'
  return NUMBER.format(n)
}

/**
 * אחוז ההשלמה (0 עד 100) בספרה אחת אחרי הנקודה, או null כשאין נתון.
 * כל עוד לא הכול הושלם — לא יותר מ-99.9 (בלי עיגול ל-100%); מעל הסך (הסך הוא הערכה) — 100.
 */
export function percentValue(part, total) {
  const p = Number(part)
  const t = Number(total)
  if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return null
  if (p <= 0) return 0
  if (p >= t) return 100
  return Math.min(99.9, Math.round((p / t) * 1000) / 10)
}

/** "19.4%"; חסר → "—" */
export function formatPercent(part, total) {
  const value = percentValue(part, total)
  return value === null ? '—' : `${value}%`
}

const DAY = 24 * 60 * 60 * 1000
/** תאריך עתידי עד כמה דקות — סטיית שעון; מעבר לזה הנתון שגוי ולא מוצג */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000

const JERUSALEM_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' })

/** מספר היום בלוח השנה לפי שעון ירושלים (ימים מאז 1970) */
function calendarDay(time) {
  const [y, m, d] = JERUSALEM_DAY.format(time).split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / DAY)
}

/**
 * כמה זמן עבר, בצורה שמתחברת ל"מ": "מהיום", "מאתמול", "מלפני 3 ימים", "מלפני שבועיים",
 * "מלפני 4 חודשים", "מלפני שנה". הימים נספרים לפי לוח השנה בשעון ירושלים (אתמול ב-23:00 הוא
 * "מאתמול" גם בבוקר). תאריך לא תקין, או עתידי (נתון שגוי) → null, ואז אין שורת ותק.
 */
export function formatSince(date, now = Date.now()) {
  if (date === null || date === undefined || date === '') return null
  const time = date instanceof Date ? date.getTime() : new Date(date).getTime()
  if (!Number.isFinite(time) || time > now + FUTURE_TOLERANCE_MS) return null
  const days = Math.max(0, calendarDay(now) - calendarDay(Math.min(time, now)))
  if (days === 0) return 'מהיום'
  if (days === 1) return 'מאתמול'
  if (days === 2) return 'מלפני יומיים'
  if (days < 7) return `מלפני ${days} ימים`
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return weeks === 1 ? 'מלפני שבוע' : weeks === 2 ? 'מלפני שבועיים' : `מלפני ${weeks} שבועות`
  }
  if (days < 365) {
    const months = Math.min(11, Math.floor(days / 30))
    return months === 1 ? 'מלפני חודש' : months === 2 ? 'מלפני חודשיים' : `מלפני ${months} חודשים`
  }
  const years = Math.floor(days / 365)
  return years === 1 ? 'מלפני שנה' : years === 2 ? 'מלפני שנתיים' : `מלפני ${years} שנים`
}

/** בני כמה ימים (מלאים) הפריט הוותיק; null כשאין תאריך תקין */
export function ageInDays(date, now = Date.now()) {
  if (date === null || date === undefined || date === '') return null
  const time = date instanceof Date ? date.getTime() : new Date(date).getTime()
  if (!Number.isFinite(time) || time > now + FUTURE_TOLERANCE_MS) return null
  return Math.max(0, Math.floor((now - time) / DAY))
}

/** "הוותיקה מלפני 3 ימים" / "הוותיק מאתמול" — או null כשאין תאריך או שאין למקום שורת ותק */
export function oldestLine(queue, oldest, now = Date.now()) {
  if (!queue.oldestGender) return null
  const since = formatSince(oldest, now)
  if (!since) return null
  return `${queue.oldestGender === 'f' ? 'הוותיקה' : 'הוותיק'} ${since}`
}

// ===== תצוגה =====

/**
 * @typedef {object} QueueCardView
 * @property {string} id
 * @property {string} title
 * @property {string} icon
 * @property {string} href
 * @property {'pending' | 'clear' | 'error'} state
 * @property {number} count
 * @property {string} countText
 * @property {string} label        מה המספר סופר; ב-clear — משפט השלילה ("אין הודעות שלא נקראו")
 * @property {string | null} note  שורת המשנה: איפה במסך, פירוק, או ותק הפריט הוותיק
 * @property {'error' | 'warning' | null} attention  תקלה, או פריט שמחכה זמן חריג
 * @property {boolean} noteIsStale  שורת המשנה היא הוותק החריג (מוצגת מודגשת)
 * @property {string} accessibleName  משפט אחד לקורא המסך
 */

/** הטקסט הקבוע בכרטיס שלא נטען (בלי התווית — "לא נטען · לא נקראו" יצר שלילה כפולה) */
export const QUEUE_ERROR_TEXT = 'לא הצלחנו לטעון את המספר'

function toCount(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** @returns {QueueCardView} */
export function buildQueueCard(queue, result, now = Date.now()) {
  const { title, icon } = queueIdentity(queue)
  const base = { id: queue.id, title, icon, href: queue.href, attention: null, noteIsStale: false }
  if (!result || result.status !== 'ok') {
    return { ...base, state: 'error', count: 0, countText: '—', label: QUEUE_ERROR_TEXT, note: null, accessibleName: `${title}: ${QUEUE_ERROR_TEXT}` }
  }
  const count = toCount(result.count)
  if (count === 0) {
    return { ...base, state: 'clear', count, countText: '0', label: queue.clear, note: null, accessibleName: `${title}: ${queue.clear}` }
  }
  const parts = result.parts || {}
  const label = count === 1 ? queue.label.one : queue.label.many
  const age = ageInDays(result.oldest, now)
  const stale = (queue.tier === 'decision' || queue.tier === 'messages') && age !== null && age >= STALE_AFTER_DAYS
  const attention = queue.tier === 'problem' ? 'error' : stale ? 'warning' : null
  // מה שורת המשנה אומרת: איפה במסך (בלעדיו לא ימצאו את הפריטים) > ותק חריג > פירוק > ותק רגיל
  const detail = queue.detail ? queue.detail(parts) : null
  const since = oldestLine(queue, result.oldest, now)
  const note = queue.where ?? (stale ? since : null) ?? detail ?? since
  const href = (queue.hrefFor && queue.hrefFor(parts)) || queue.href
  const countText = formatCount(count)
  return {
    ...base,
    href,
    state: 'pending',
    count,
    countText,
    label,
    note,
    attention,
    noteIsStale: stale && note === since,
    accessibleName: `${title}: ${countText} ${label}${note ? `. ${note}` : ''}`,
  }
}

/**
 * כל מה שהדשבורד מציג על המקומות שממתינים לתפקיד.
 *  cards    — מקומות עם פריטים, ומקומות שלא נטענו (במקומם בסדר הדחיפות)
 *  clear    — מקומות ריקים: "כבר מטופל", עם משפט שלילה לכל אחד
 *  allClear — הכול נטען והכול ריק; allFailed — שום דבר לא נטען (הודעה אחת וכפתור אחד)
 * @param {string} role
 * @param {Record<string, QueueResult>} results
 * @param {number} [now]
 * @param {{ servicePlugins?: boolean }} [features]
 */
export function buildDashboardView(role, results, now = Date.now(), features = {}) {
  const queues = visibleQueues(role, features)
  const all = queues.map((queue) => buildQueueCard(queue, results?.[queue.id], now))
  const cards = all.filter((card) => card.state !== 'clear')
  const clear = all.filter((card) => card.state === 'clear')
  const pendingCount = all.filter((card) => card.state === 'pending').length
  const failedCount = all.filter((card) => card.state === 'error').length
  const allFailed = queues.length > 0 && failedCount === queues.length
  return {
    hasQueues: queues.length > 0,
    total: queues.length,
    cards,
    clear,
    pendingCount,
    failedCount,
    allClear: queues.length > 0 && pendingCount === 0 && failedCount === 0,
    allFailed,
    summary: allFailed ? null : summaryLine(queues.length, pendingCount, failedCount),
  }
}

/**
 * שורת המשנה מתחת ל"ממתין לטיפולך". סופרת מקומות, לא פריטים — ולכן אומרת "מקומות" במפורש
 * ("דבר אחד ממתין לך" ליד 3,949 שורות הטעה). null כשאין מה לומר מעבר למה שעל המסך.
 */
export function summaryLine(total, pendingCount, failedCount) {
  if (total === 0) return null
  const parts = []
  if (pendingCount === 1) parts.push('יש מה לטפל במקום אחד')
  else if (pendingCount > 1) parts.push(`יש מה לטפל ב-${formatCount(pendingCount)} מקומות, הדחוף ראשון`)
  if (failedCount === 1) parts.push('מקום אחד לא נטען')
  else if (failedCount > 1) parts.push(`${formatCount(failedCount)} מקומות לא נטענו`)
  if (parts.length === 0) return null
  if (pendingCount === 0) parts.push('כל השאר מטופל')
  return parts.join(' · ')
}

/** ההודעה לקורא המסך כשהטעינה מסתיימת — תמיד משפט, גם כשהכול מטופל או כשהכול נכשל */
export function dashboardAnnouncement(view) {
  if (!view.hasQueues) return null
  if (view.allFailed) return 'לא הצלחנו לטעון את מה שממתין לך'
  if (view.allClear) return 'הכול מטופל'
  return view.summary
}

// ===== מצב כללי =====

/** המספרים הכלליים רלוונטיים רק למי שאחראי על ספרים (מסך "ספרים") */
export function hasGeneralStats(role) {
  return hasBookLibraryAccess(role)
}

/**
 * @typedef {object} GeneralStatsData
 * @property {number} [users]
 * @property {number} [books]
 * @property {number} [hiddenBooks]
 * @property {number} [totalPages]
 * @property {number} [completedPages]
 * @property {number} [inProgressPages]
 * @property {number} [appReportsWeek]
 */

/** אילו מספרים כלליים לספור לתפקיד — משתמשים ודיווחי תוכנה רק למי שרואה את המסכים שלהם */
export function generalStatsScope(role) {
  const books = hasGeneralStats(role)
  return { books, users: books && isAdmin(role), appReports: books && isAdmin(role) }
}

/**
 * הפריטים בשורת "מצב כללי". ערך חסר → "—".
 * @param {string} role
 * @param {GeneralStatsData} data
 */
export function buildGeneralStats(role, data = {}) {
  const scope = generalStatsScope(role)
  if (!scope.books) return { items: [], progress: null }
  const hidden = toCount(data.hiddenBooks)
  const items = [
    { id: 'books', label: 'ספרים', value: formatCount(data.books), hint: hidden > 0 ? plural(hidden, 'ספר אחד לא מוצג באתר', 'לא מוצגים באתר') : null },
    { id: 'pages', label: 'עמודים', value: formatCount(data.totalPages), hint: null },
    { id: 'completed', label: 'עמודים שהושלמו', value: formatCount(data.completedPages), hint: null },
    { id: 'in-progress', label: 'עמודים בטיפול', value: formatCount(data.inProgressPages), hint: null },
  ]
  if (scope.users) items.push({ id: 'users', label: 'משתמשים', value: formatCount(data.users), hint: null })
  if (scope.appReports) items.push({ id: 'app-reports', label: 'דיווחי תקלות השבוע', value: formatCount(data.appReportsWeek), hint: null })

  const percent = percentValue(data.completedPages, data.totalPages)
  const progress = percent === null || !Number.isFinite(Number(data.completedPages))
    ? null
    : { value: percent, percent: `${percent}%`, text: `${formatCount(data.completedPages)} מתוך ${formatCount(data.totalPages)} עמודים הושלמו` }
  return { items, progress }
}
