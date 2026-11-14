// "הצעות למילון" (/library/admin/dictionary) — קיבוץ המילים, הסינון, המיון והעמוד מהכתובת ואליה.
// לוגיקה טהורה, בלי React ובלי DOM (נבדק ב-dictionaryQuery.test.mjs).
//
// השרת (GET /api/admin/dictionary, בלי שינוי) מחזיר שורה לכל זוג משתמש–מילה (entries) ואת הזוגות שדולגו
// (skipped). המסך מציג מילה אחת לכל מילה, עם המשתמשים שהוסיפו אותה — וכל פעולה על המילה נשלחת לשרת זוג אחר
// זוג, באותו גוף כמו קודם ({ action, userId, word }).

import { paginate as paginateList } from '../adminList/paginate.js'

export const WORDS_PER_PAGE = 50
export const DICTIONARY_VIEWS = ['pending', 'skipped']
export const DICTIONARY_SORTS = ['users', 'word']
export const SORT_LABELS = { users: 'הכי הרבה משתמשים', word: 'לפי האלף-בית' }
const DEFAULT_VIEW = 'pending'
const DEFAULT_SORT = 'users'
const PARAM_ORDER = ['view', 'q', 'sort', 'page']

/** @typedef {{ view: string, q: string, sort: string, page: number }} DictionaryQuery */
/** @typedef {{ userId: string, name: string, email: string, word: string, skipped: boolean }} WordUser */
/** @typedef {{ word: string, users: WordUser[], pending: number, skipped: number }} DictionaryWord */

/**
 * המפתח של זוג משתמש–מילה (כמו במסך הקודם). המילה — בלי רווחים בקצוות, כמו שהשרת שומר דילוג ומסיר (clean): כך
 * מילה " שלום" שדולגה נראית דולגה, ופעולה עליה יוצאת מהנתונים.
 */
export const pairKey = (userId, word) => `${userId}::${String(word ?? '').trim()}`

/** המילה כפי שהשרת שומר אותה (הוא מנקה רווחים בקצוות) — מפתח הקיבוץ */
export const wordKey = (word) => String(word ?? '').trim()

function reader(params) {
  return (name) => {
    if (!params) return ''
    const value = typeof params.get === 'function' ? params.get(name) : params[name]
    return String((Array.isArray(value) ? value[0] : value) ?? '').trim()
  }
}

/**
 * @param {URLSearchParams | Record<string, string | string[] | undefined> | null | undefined} params
 * @returns {DictionaryQuery}
 */
export function parseDictionaryQuery(params) {
  const get = reader(params)
  const view = get('view')
  const sort = get('sort')
  const page = Number.parseInt(get('page'), 10)
  return {
    view: DICTIONARY_VIEWS.includes(view) ? view : DEFAULT_VIEW,
    q: get('q').slice(0, 100),
    sort: DICTIONARY_SORTS.includes(sort) ? sort : DEFAULT_SORT,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

/** הכתובת של שאילתה — בלי ערכי ברירת מחדל ובסדר קבוע; "" כשאין כלום */
export function serializeDictionaryQuery(query) {
  const params = new URLSearchParams()
  for (const name of PARAM_ORDER) {
    const value = query?.[name]
    if (value === undefined || value === null || value === '') continue
    if (name === 'view' && value === DEFAULT_VIEW) continue
    if (name === 'sort' && value === DEFAULT_SORT) continue
    if (name === 'page' && Number(value) <= 1) continue
    params.set(name, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

/** שינוי בסינון / במיון / בלשונית — חוזרים לעמוד הראשון (חוץ משינוי העמוד עצמו) */
export function updateDictionaryQuery(query, patch) {
  return { ...query, ...patch, page: 'page' in patch ? (patch.page ?? query.page) : 1 }
}

/**
 * מילה אחת לכל מילה: מי הוסיף אותה, וכמה מהם עוד לא דולגו. מילה ריקה — בחוץ (כמו filter(Boolean) בשרת).
 * זוג שמופיע פעמיים (אותו משתמש, אותה מילה) — פעם אחת.
 * @param {any[]} entries
 * @param {any[]} skipped
 * @returns {DictionaryWord[]}
 */
export function groupWords(entries, skipped) {
  const skippedSet = new Set((skipped || []).map((s) => pairKey(s?.userId, s?.word)))
  const map = new Map()
  for (const entry of entries || []) {
    const key = wordKey(entry?.word)
    if (!key) continue
    const user = {
      userId: String(entry.userId ?? ''),
      name: entry.name || '',
      email: entry.email || '',
      word: entry.word,
      skipped: skippedSet.has(pairKey(entry.userId, entry.word)),
    }
    const group = map.get(key) || { word: key, users: [], pending: 0, skipped: 0 }
    if (group.users.some((u) => u.userId === user.userId && u.word === user.word)) continue
    group.users.push(user)
    if (user.skipped) group.skipped += 1
    else group.pending += 1
    map.set(key, group)
  }
  return [...map.values()]
}

/** באיזו לשונית המילה: ממתינה — כשיש לפחות משתמש אחד שעוד לא דולג; דולגה — כשכולם דולגו */
export const wordView = (word) => (word.pending > 0 ? 'pending' : 'skipped')

/** כמה מילים בכל לשונית */
export function viewCounts(words) {
  const counts = { pending: 0, skipped: 0 }
  for (const word of words || []) counts[wordView(word)] += 1
  return counts
}

const collator = new Intl.Collator('he')

/** מיון: הכי הרבה משתמשים (ובשוויון — א"ב), או א"ב */
export function sortWords(words, sort = DEFAULT_SORT) {
  const list = [...(words || [])]
  if (sort === 'word') return list.sort((a, b) => collator.compare(a.word, b.word))
  return list.sort((a, b) => b.users.length - a.users.length || collator.compare(a.word, b.word))
}

/** חיפוש במילה, בשם המשתמש ובדואר (כמו במסך הקודם) */
export function matchesSearch(word, q) {
  const term = String(q || '').trim().toLowerCase()
  if (!term) return true
  if (word.word.toLowerCase().includes(term)) return true
  return word.users.some((u) => u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term))
}

/**
 * המילים שמוצגות: הלשונית, החיפוש והמיון. מילה שטופלה במסך (handled) נשארת במקומה — באותה לשונית ועם אותם
 * משתמשים (snapshot), גם כשכבר יצאה מהנתונים — כדי שהשורות לא יזוזו מתחת לעכבר. עד הרענון הבא.
 * @param {DictionaryWord[]} words
 * @param {DictionaryQuery} query
 * @param {Map<string, { view: string, snapshot: DictionaryWord }>} [handled]
 */
export function visibleWords(words, query, handled = new Map()) {
  const present = new Set((words || []).map((w) => w.word))
  const gone = [...handled.values()].map((h) => h.snapshot).filter((w) => w && !present.has(w.word))
  const shown = [...(words || []).map((w) => handled.get(w.word)?.snapshot || w), ...gone]
    .filter((w) => (handled.get(w.word)?.view || wordView(w)) === query.view && matchesSearch(w, query.q))
  return sortWords(shown, query.sort)
}

export function paginate(items, page, size = WORDS_PER_PAGE) {
  return paginateList(items, page, size)
}

/**
 * הבקשות שפעולה על מילה שולחת — זוג אחר זוג, באותו גוף כמו במסך הקודם:
 *   approve (אשר) — add-global לכל מי שהוסיף את המילה (גם מי שדולג): המילה נכנסת למילון הכללי ויוצאת מהמילון
 *     האישי של כל אחד מהם.
 *   skip (דלג) — skip לכל מי שעוד לא דולג.
 *   remove (הסר) — remove-personal לכל מי שהוסיף: המילה יוצאת מהמילון האישי שלהם.
 * @param {DictionaryWord} word
 * @param {'approve' | 'skip' | 'remove'} action
 * @returns {{ action: string, userId: string, word: string }[]}
 */
export function wordRequests(word, action) {
  const apiAction = { approve: 'add-global', skip: 'skip', remove: 'remove-personal' }[action]
  if (!apiAction) return []
  const users = action === 'skip' ? word.users.filter((u) => !u.skipped) : word.users
  return users.map((u) => ({ action: apiAction, userId: u.userId, word: u.word }))
}

/** כמה משתמשים פעולה על המילה נוגעת בהם (דלג — רק מי שעוד לא דולג) */
export const wordRequestCount = (word, action) => wordRequests(word, action).length

/**
 * פעולה על משתמש אחד ברשימה "מי הוסיף" — בקשה אחת, בדיוק כמו שורה במסך הקודם ({ action, userId, word }).
 * @param {WordUser} user @param {'approve' | 'skip' | 'remove'} action
 */
export function userRequest(user, action) {
  const apiAction = { approve: 'add-global', skip: 'skip', remove: 'remove-personal' }[action]
  return apiAction ? { action: apiAction, userId: user.userId, word: user.word } : null
}

/**
 * הנתונים אחרי שבקשה הצליחה — כמו המסך הקודם: add-global ו-remove-personal מוציאים את הזוג מהרשימה ומהדילוגים;
 * skip מוסיף אותו לדילוגים.
 * @param {{ entries: any[], skipped: any[] }} data
 * @param {{ action: string, userId: string, word: string }} request
 */
export function applyRequest(data, request) {
  const key = pairKey(request.userId, request.word)
  const skipped = (data.skipped || []).filter((s) => pairKey(s.userId, s.word) !== key)
  if (request.action === 'skip') return { ...data, skipped: [...skipped, { userId: request.userId, word: request.word }] }
  const entries = (data.entries || []).filter((e) => pairKey(e.userId, e.word) !== key)
  return { entries, skipped }
}
