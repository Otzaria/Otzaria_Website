import { AdminApiError, requestBlob, requestJson, saveBlob, startDownload } from '@/components/admin/list/adminRequest'
import { batchDownloadUrl, serializePagesQuery } from '@/lib/adminPagesScreen/pagesQuery'
import { pageFilename } from '@/lib/adminPagesScreen/pageTerms'

const LIST_FALLBACK = 'לא הצלחנו לטעון את העמודים.'
const UPDATE_URL = '/api/admin/pages/update'
const DOWNLOAD_BATCH = '/api/admin/pages/download-batch'

function listUrl(query, extras) {
  const params = new URLSearchParams(serializePagesQuery(query))
  params.set('view', 'management')
  for (const [key, value] of Object.entries(extras || {})) params.set(key, String(value))
  return `/api/admin/pages/list?${params}`
}

export function listPages(query) {
  return requestJson(listUrl(query), { fallback: LIST_FALLBACK })
}

export async function locatePage(query, number) {
  const data = await requestJson(listUrl(query, { number }), { fallback: LIST_FALLBACK })
  return data.target
}

export async function listMatchingPages(query) {
  const pages = []
  let after = null
  do {
    const part = await requestJson(listUrl(query, after ? { view: 'selection', after } : { view: 'selection' }), { fallback: LIST_FALLBACK })
    pages.push(...part.pages)
    after = part.next
  } while (after)
  return pages
}

/** @returns {Promise<{ books: string[], users: { id: string, name: string }[] }>} */
export async function loadFilterOptions() {
  const data = await requestJson('/api/admin/pages/filter-options', { fallback: 'לא הצלחנו לטעון את רשימות הספרים והמשתמשים.' })
  return { books: Array.isArray(data.books) ? data.books : [], users: Array.isArray(data.users) ? data.users : [] }
}

function updatePage(page, action, fallback, keepalive = false) {
  return requestJson(UPDATE_URL, {
    method: 'PUT',
    keepalive,
    fallback,
    body: {
      id: page.id,
      expected: { status: page.status, claimedById: page.claimedById ?? null, claimedAt: page.claimedAt ?? null, updatedAt: page.updatedAt ?? null },
      ...action,
    },
  })
}

export function releasePage(page, { keepalive = false } = {}) {
  return updatePage(page, { release: true }, 'לא הצלחנו לשחרר את העמוד.', keepalive)
}

export function setPageStatus(page, status) {
  return updatePage(page, { status }, 'לא הצלחנו לשנות את המצב.')
}

async function pageText(page) {
  try {
    const blob = await requestBlob(`/api/admin/pages/download/${encodeURIComponent(page.id)}`, { fallback: 'לא הצלחנו להוריד את הטקסט של העמוד.' })
    return await blob.text()
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) throw new AdminApiError('העמוד כבר לא קיים.', 404)
    throw error
  }
}

export async function selectedPageTexts(pages) {
  const result = await requestJson(DOWNLOAD_BATCH, {
    method: 'POST',
    body: { ids: pages.map((page) => page.id) },
    fallback: 'לא הצלחנו להוריד את הטקסט של העמודים.',
  })
  return result.pages
}

export async function downloadPage(page) {
  const text = await pageText(page)
  saveBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), pageFilename(page))
}

export function downloadAllFiltered(query) {
  startDownload(batchDownloadUrl(query), 'all-pages.txt')
}
