// "הודעות" (/library/admin/messages) — הלשונית, החיפוש, "רק חדשות", העמוד והשיחה הפתוחה: מהכתובת ואליה.
// לוגיקה טהורה, בלי React ובלי DOM (נבדק ב-messagesQuery.test.mjs).
//
// ?view=reminders — הלשונית "תזכורות" (גם היעד של /library/admin/reminders הישן); בלי view — "נכנסות".

import { paginate as paginateList } from '../adminList/paginate.js'

export const MESSAGES_PER_PAGE = 25
export const MESSAGE_VIEWS = ['inbox', 'sent', 'reminders']
export const DEFAULT_VIEW = 'inbox'
const PARAM_ORDER = ['view', 'q', 'new', 'page', 'message']

/** @typedef {{ view: string, q: string, onlyNew: boolean, page: number, message: string }} MessagesQuery */

function reader(params) {
  return (name) => {
    if (!params) return ''
    const value = typeof params.get === 'function' ? params.get(name) : params[name]
    return String((Array.isArray(value) ? value[0] : value) ?? '').trim()
  }
}

/** הלשונית מהכתובת (גם מ-searchParams של עמוד השרת); ערך לא מוכר — "נכנסות" */
export function viewFromParams(params) {
  const view = reader(params)('view')
  return MESSAGE_VIEWS.includes(view) ? view : DEFAULT_VIEW
}

/**
 * @param {URLSearchParams | Record<string, string | string[] | undefined> | null | undefined} params
 * @returns {MessagesQuery}
 */
export function parseMessagesQuery(params) {
  const get = reader(params)
  const page = Number.parseInt(get('page'), 10)
  return {
    view: viewFromParams(params),
    q: get('q').slice(0, 100),
    onlyNew: get('new') === '1',
    page: Number.isInteger(page) && page > 1 ? page : 1,
    message: /^[A-Za-z0-9_-]{1,64}$/.test(get('message')) ? get('message') : '',
  }
}

/** הכתובת של שאילתה — בלי ערכי ברירת מחדל ובסדר קבוע; "" כשאין כלום */
export function serializeMessagesQuery(query) {
  const params = new URLSearchParams()
  for (const name of PARAM_ORDER) {
    if (name === 'view') {
      if (query?.view && query.view !== DEFAULT_VIEW && MESSAGE_VIEWS.includes(query.view)) params.set('view', query.view)
      continue
    }
    if (name === 'new') {
      if (query?.onlyNew) params.set('new', '1')
      continue
    }
    const value = query?.[name]
    if (value === undefined || value === null || value === '') continue
    if (name === 'page' && Number(value) <= 1) continue
    params.set(name, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

/**
 * שינוי בשאילתה: שינוי סינון / לשונית מחזיר לעמוד הראשון; מעבר לשונית — החיפוש נשמר (שיחה יכולה לעבור בין
 * נכנסות לנשלחו, ומי שמחפש "השיחה שלי עם X" מוצא אותה בכל לשונית), בלי "רק חדשות" ובלי שיחה פתוחה.
 * @param {MessagesQuery} query
 * @param {Partial<MessagesQuery>} patch
 */
export function updateMessagesQuery(query, patch) {
  const next = { ...query, ...patch }
  if (patch.view !== undefined && patch.view !== query.view) return { ...next, onlyNew: false, page: 1, message: '' }
  if (('q' in patch && patch.q !== query.q) || ('onlyNew' in patch && patch.onlyNew !== query.onlyNew)) next.page = 1
  return next
}

/** הכתובת של לשונית (לקישורי הלשוניות ולסרגל). q — החיפוש עובר איתה (לא לתזכורות, שאין בהן חיפוש) */
export function viewHref(view, q = '') {
  const keep = view === 'inbox' || view === 'sent' ? q : ''
  return `/library/admin/messages${serializeMessagesQuery({ view, q: keep })}`
}

export function paginate(items, page, size = MESSAGES_PER_PAGE) {
  return paginateList(items, page, size)
}
