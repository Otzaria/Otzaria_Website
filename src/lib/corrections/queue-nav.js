// ניווט בין דיווחים בדף הדיווח, לפי הרשימה שממנה נכנסו (אותו סינון ואותו סדר).
// הרשימה נשמרת ב-sessionStorage (לכל לשונית בנפרד) כשנכנסים לדיווח מהתור.

export const NAV_KEY = 'corrections:navList'
export const FILTERS_KEY = 'corrections:listFilters'
export const HIDDEN_KEY = 'corrections:hiddenBooks'
export const NAV_MAX_AGE_MS = 12 * 60 * 60_000
export const NAV_MAX_IDS = 2000

/** מחרוזת השאילתה של התור (בלי עימוד) — משותפת לדף הרשימה ולניווט. */
export function buildQueueQuery({ view = 'queued', sort = 'version', kind = '', source = '', book = '', reason = '', assignee = '', hidden = [] } = {}) {
  const q = new URLSearchParams({ view: view || 'queued', sort: sort || 'version' })
  if (kind) q.set('kind', kind)
  if (source) q.set('source', source)
  const b = typeof book === 'string' ? book.trim() : ''
  if (b) q.set('book', b)
  if (reason) q.set('reason', reason)
  if (assignee) q.set('assignee', assignee)
  if (Array.isArray(hidden) && hidden.length) q.set('hideBooks', JSON.stringify(hidden))
  return q.toString()
}

/** בודק ומנקה רשימת ניווט שנקראה מהאחסון; null אם אינה תקינה או ישנה מדי. */
export function parseNavList(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.query !== 'string' || !Array.isArray(raw.ids)) return null
  if (!Number.isFinite(raw.at) || now - raw.at > NAV_MAX_AGE_MS) return null
  if (typeof raw.hasMore !== 'boolean' || (raw.nextCursor !== null && typeof raw.nextCursor !== 'string')) return null
  if (raw.hasMore && !raw.nextCursor) return null
  const seen = new Set()
  const ids = raw.ids.filter((id) => typeof id === 'string' && id && !seen.has(id) && seen.add(id)).slice(0, NAV_MAX_IDS)
  const total = Number.isSafeInteger(raw.total) && raw.total >= ids.length ? raw.total : ids.length
  return { query: raw.query, ids, total, at: raw.at, hasMore: raw.hasMore, nextCursor: raw.nextCursor }
}

/** מיקום הדיווח ברשימה והשכנים שלו. index=-1 כשהדיווח אינו ברשימה. */
export function neighbors(nav, id) {
  const index = nav ? nav.ids.indexOf(id) : -1
  if (index === -1) return { index: -1, prevId: null, nextId: null, total: nav?.total ?? 0, needMore: false }
  return {
    index,
    prevId: index > 0 ? nav.ids[index - 1] : null,
    nextId: index + 1 < nav.ids.length ? nav.ids[index + 1] : null,
    total: nav.total,
    // הדיווח האחרון שנטען, ובשרת יש עוד — צריך לטעון את העמוד הבא כדי לדעת מה "הבא"
    needMore: index === nav.ids.length - 1 && Boolean(nav.hasMore) && nav.ids.length < NAV_MAX_IDS,
  }
}

/** מצרף עמוד לרשימת הניווט בלי לשנות את ההיסטוריה או להסיק ממספר הדיווחים החיים שסיימנו. */
export function appendPage(nav, page) {
  const seen = new Set(nav.ids)
  const more = (page?.items || []).map((r) => r?.id).filter((x) => typeof x === 'string' && !seen.has(x) && seen.add(x))
  const ids = [...nav.ids, ...more].slice(0, NAV_MAX_IDS)
  const hasMore = page?.hasMore === true
  const total = hasMore ? Math.max(nav.total, Number.isSafeInteger(page?.total) ? page.total : 0, ids.length + 1) : ids.length
  return { ...nav, ids, total, hasMore, nextCursor: page?.nextCursor ?? null }
}

export function readNavList(storage, now = Date.now()) {
  try {
    return parseNavList(JSON.parse(storage.getItem(NAV_KEY) || 'null'), now)
  } catch {
    return null
  }
}

export function writeNavList(storage, nav) {
  try {
    storage.setItem(NAV_KEY, JSON.stringify({ query: nav.query, ids: nav.ids.slice(0, NAV_MAX_IDS), total: nav.total, at: nav.at ?? Date.now(), hasMore: nav.hasMore, nextCursor: nav.nextCursor }))
  } catch { /* אחסון חסום או מלא — הניווט ייבנה מחדש מהסינון השמור */ }
}

/** שאילתת גיבוי כשנכנסו לדיווח ישירות (קישור, לשונית חדשה): הסינון האחרון שנשמר בתור. */
export function fallbackQuery(session, local) {
  let filters = {}
  let hidden = []
  try { filters = JSON.parse(session?.getItem(FILTERS_KEY) || 'null') || {} } catch { /* ברירת מחדל */ }
  try {
    const h = JSON.parse(local?.getItem(HIDDEN_KEY) || '[]')
    if (Array.isArray(h)) hidden = h.filter((b) => typeof b === 'string')
  } catch { /* ברירת מחדל */ }
  return buildQueueQuery({ ...filters, hidden })
}
