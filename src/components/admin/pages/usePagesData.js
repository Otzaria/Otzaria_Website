'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLoadedData } from '@/components/admin/list/useListData'
import { parsePagesQuery, PAGES_PER_PAGE, serializePagesQuery } from '@/lib/adminPagesScreen/pagesQuery'
import { listPages, loadFilterOptions } from './pagesApi'

const EMPTY = { key: null, pages: [], total: 0, page: 1 }
const NO_OPTIONS = { books: [], users: [] }

export function usePagesData(query, { onRefreshError } = {}) {
  const key = serializePagesQuery(query)
  const loader = useCallback(async () => {
    const { pages, pagination } = await listPages(parsePagesQuery(new URLSearchParams(key)))
    return { key, pages, total: pagination.total, page: pagination.page }
  }, [key])
  const { data, setData, ...rest } = useLoadedData(loader, { initial: EMPTY, onRefreshError })

  const patch = useCallback((changed) => {
    if (changed.length === 0) return
    const byId = new Map(changed.map((p) => [p.id, p]))
    setData((d) => ({ ...d, pages: d.pages.map((p) => byId.get(p.id) || p) }))
  }, [setData])

  const [options, setOptions] = useState({ ...NO_OPTIONS, ready: false })
  useEffect(() => {
    let alive = true
    loadFilterOptions().then((o) => { if (alive) setOptions({ ...o, ready: true }) }, () => {})
    return () => { alive = false }
  }, [])

  const pageCount = Math.max(1, Math.ceil(data.total / PAGES_PER_PAGE))
  const offset = (data.page - 1) * PAGES_PER_PAGE
  const page = {
    items: data.pages,
    total: data.total,
    page: Math.min(data.page, pageCount),
    pageCount,
    from: data.pages.length ? offset + 1 : 0,
    to: data.pages.length ? offset + data.pages.length : 0,
  }
  return { ...rest, status: rest.status === 'ready' && data.key !== key ? 'loading' : rest.status, page, patch, options }
}
