'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import ListPager from '@/components/admin/list/ListPager'
import { prefersReducedMotion } from '@/lib/reducedMotion'
import {
  NO_CATEGORY, categoryAssignments, clearFilters, countPendingKinds, countStoreStates, emptyKind, filterPending, filterStore,
  hasActiveFilters, paginate, updatePluginsQuery,
} from '@/lib/adminPlugins/pluginsQuery'
import PendingPluginRow from './PendingPluginRow'
import PluginDrawer from './PluginDrawer'
import PluginsFilterBar from './PluginsFilterBar'
import { PendingToolbar, StoreBulkBar } from './PluginsToolbar'
import StorePluginRow from './StorePluginRow'
import { useKeyedSelection } from '@/components/admin/list/useKeyedSelection'
import { useDrawerParam } from '@/components/admin/list/useDrawerParam'

export const LIST_ID = 'plugins-list'

const EMPTY = {
  pending: { icon: 'task_alt', title: 'אין תוספים לאישור', description: 'כל ההגשות טופלו. כשמפתח ישלח תוסף או עדכון — הוא יופיע כאן.' },
  store: { icon: 'extension', title: 'אין תוספים בחנות', description: 'כשתאשר תוסף, הוא יופיע כאן.' },
}

/**
 * הרשימה של "לאישור" או של "בחנות": סינון, שורת כלים, שורות, עימוד ומגירת התוסף.
 * הבחירה (רק ב"בחנות") תמיד תת-קבוצה של מה שמוצג, ומתאפסת כשהסינון / העמוד משתנים.
 *
 * @param {{ mode: 'pending' | 'store', query: any, setQuery: Function, data: any, actions: any, busy: Set<string>,
 *   bulkProgress?: any, onStopBulk?: () => void, toast: any, titleId: string }} props
 */
export default function PluginsListView({ mode, query, setQuery, data, actions, busy, bulkProgress, onStopBulk, toast, titleId }) {
  const store = mode === 'store'
  const items = store ? data.approved : data.pending
  const categories = data.categories
  const assignments = useMemo(() => categoryAssignments(categories), [categories])
  const namesById = useMemo(() => new Map((categories || []).map((c) => [c.id, c.name])), [categories])

  const filtered = useMemo(
    () => (store ? filterStore(items, query, assignments) : filterPending(items, query)),
    [store, items, query, assignments]
  )
  const page = paginate(filtered, query.page)
  const pageIds = page.items.map((p) => p._id)

  // ----- סינון -----
  const changeQuery = useCallback((patch) => setQuery(updatePluginsQuery(query, patch)), [query, setQuery])
  const clearAll = useCallback(() => setQuery(clearFilters(query)), [query, setQuery])
  const goToPage = useCallback((n) => {
    setQuery(updatePluginsQuery(query, { page: n }), { push: true })
    document.getElementById(LIST_ID)?.focus({ preventScroll: true })
    document.getElementById(titleId)?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [query, setQuery, titleId])

  const selects = useMemo(() => {
    if (!store) {
      const counts = countPendingKinds(items)
      return [{ id: 'kind', label: 'סוג', allLabel: 'הכול', options: [
        { value: 'new', label: 'חדש', count: counts.new },
        { value: 'update', label: 'עדכון', count: counts.update },
        ...(counts.returned > 0 ? [{ value: 'returned', label: 'הוחזר להמתנה', count: counts.returned }] : []),
      ] }]
    }
    const states = countStoreStates(items)
    const out = [{ id: 'state', label: 'מצב', allLabel: 'הכול', options: [
      { value: 'active', label: 'מוצג בחנות', count: states.active },
      { value: 'suspended', label: 'מושהה', count: states.suspended },
    ] }]
    if (categories) {
      const unplaced = items.filter((p) => !(assignments.get(p._id)?.length)).length
      out.push({ id: 'cat', label: 'קטגוריה', allLabel: 'הכול', options: [
        // סופרים את מי שברשימה: תוסף שהוחזר להמתנה נשאר משובץ, אבל הוא לא ב"בחנות"
        ...categories.map((c) => ({ value: c.id, label: c.name, count: items.filter((p) => assignments.get(p._id)?.includes(c.id)).length })),
        { value: NO_CATEGORY, label: 'לא משובץ', count: unplaced },
      ] })
    }
    return out
  }, [store, items, categories, assignments])

  // ----- בחירה ("בחנות" בלבד) — מתאפסת כשהסינון או העמוד משתנים (נגזר, בלי effect) -----
  const queryKey = JSON.stringify([mode, query.q, query.state, query.cat, query.sort, page.page])
  const { ids: selectedIds, clearedText, select, clear: clearSelection, keep: keepSelection } = useKeyedSelection(queryKey)
  const shownSet = useMemo(() => new Set(filtered.map((p) => p._id)), [filtered])
  const selected = useMemo(() => new Set([...selectedIds].filter((id) => shownSet.has(id))), [selectedIds, shownSet])

  const [bulkWorking, setBulkWorking] = useState(false)
  const onBulk = useCallback(async (kind, value) => {
    const list = items.filter((p) => selected.has(p._id))
    if (list.length === 0) return
    setBulkWorking(true)
    try {
      const failed = kind === 'assign'
        ? await actions.assign(list, categories.find((c) => c.id === value))
        : await actions[kind](list, { bulk: true })
      // מי שנכשל נשאר מסומן, כדי שאפשר יהיה לנסות שוב רק עליו
      if (failed?.length > 0) keepSelection(failed)
    } finally {
      setBulkWorking(false)
    }
  }, [items, selected, actions, categories, keepSelection])

  // ----- מגירה (בכתובת: plugin + pane). פתיחה — push, כדי ש"אחורה" יסגור אותה -----
  const { openerRef, open: pushDrawer, close: popDrawer } = useDrawerParam(setQuery)
  const openDrawer = useCallback((plugin, pane = '') => {
    pushDrawer(plugin._id, updatePluginsQuery(query, { plugin: plugin._id, pane }))
  }, [query, pushDrawer])
  const closeDrawer = useCallback(() => popDrawer(updatePluginsQuery(query, { plugin: '', pane: '' })), [query, popDrawer])
  const changePane = useCallback((pane) => setQuery(updatePluginsQuery(query, { pane: pane === 'overview' ? '' : pane })), [query, setQuery])
  const returnFocus = useCallback(() => {
    const row = document.querySelector(`#${LIST_ID} [data-row="${CSS.escape(openerRef.current || query.plugin)}"]`)
    return row?.querySelector('[data-row-open]') || document.getElementById(LIST_ID)
  }, [openerRef, query.plugin])
  const drawerPlugin = query.plugin ? items.find((p) => p._id === query.plugin) : null

  // קישור לתוסף שלא ברשימה (נמחק, טופל, או שייך לתצוגה השנייה). רק בקישור שעוד לא נמצא: תוסף שיצא מהרשימה
  // בעקבות פעולה כאן כבר הוסר מהכתובת, והעדכון שלה מגיע רגע אחרי הרשימה.
  const foundPlugin = useRef(null)
  useEffect(() => {
    if (drawerPlugin) foundPlugin.current = drawerPlugin._id
    if (!query.plugin || drawerPlugin || foundPlugin.current === query.plugin) return
    const elsewhere = (store ? data.pending : data.approved).some((p) => p._id === query.plugin)
    if (elsewhere) {
      setQuery({ ...clearFilters(query), view: store ? 'pending' : 'store', sort: '' })
      return
    }
    toast.show({ tone: 'info', message: 'התוסף לא נמצא ברשימה. ייתכן שנמחק או שכבר טופל.' })
    setQuery(updatePluginsQuery(query, { plugin: '', pane: '' }))
  }, [drawerPlugin, query, store, data.pending, data.approved, setQuery, toast])

  // עמוד שכבר לא קיים (?page=999, או שהרשימה התקצרה) — הכתובת מתוקנת למה שמוצג
  useEffect(() => {
    if (query.page !== page.page) setQuery(updatePluginsQuery(query, { page: page.page }))
  }, [query, page.page, setQuery])

  const onCategory = useCallback((category) => data.setCategories((all) => (all || []).map((c) => (c.id === category.id ? category : c))), [data])
  const onAggregate = useCallback((aggregate) => {
    const patch = (all) => all.map((p) => (p._id === query.plugin ? { ...p, ...aggregate } : p))
    data.setApproved(patch)
    data.setPending(patch)
  }, [data, query.plugin])

  const kind = emptyKind({ total: items.length, shown: filtered.length })
  const filtersActive = hasActiveFilters(query)

  return (
    <>
      {kind !== 'all' && <PluginsFilterBar query={query} onChange={changeQuery} onClear={clearAll} active={filtersActive} selects={selects} />}

      <section id={LIST_ID} tabIndex={-1} aria-labelledby={titleId} className="flex flex-col gap-3 outline-none">
        {kind === 'all' && <EmptyState icon={EMPTY[mode].icon} title={EMPTY[mode].title} description={EMPTY[mode].description} />}
        {kind === 'filtered' && (
          <EmptyState
            role="status"
            icon="search_off"
            title="לא נמצאו תוספים"
            description="אין תוסף שמתאים לחיפוש או לסינון."
            actions={<Button variant="tonal" size="sm" icon="filter_alt_off" onClick={clearAll}>נקה סינון</Button>}
          />
        )}

        {!kind && (
          <>
            {store ? (
              <StoreBulkBar
                pageIds={pageIds}
                selected={selected}
                onSelect={select}
                onClear={clearSelection}
                clearedText={clearedText}
                total={filtered.length}
                sort={query.sort}
                onSortChange={(sort) => changeQuery({ sort })}
                categoryOptions={(categories || []).map((c) => ({ value: c.id, label: c.name }))}
                working={bulkWorking}
                onBulk={onBulk}
                progress={bulkProgress}
                onStop={onStopBulk}
              />
            ) : (
              <PendingToolbar total={filtered.length} sort={query.sort} onSortChange={(sort) => changeQuery({ sort })} />
            )}

            <Card as="div" className="@container overflow-hidden">
              <ul aria-label={store ? 'התוספים שבחנות' : 'התוספים שממתינים לאישור'} className="divide-y divide-outline-variant/60">
                {page.items.map((plugin) => (store ? (
                  <StorePluginRow
                    key={plugin._id}
                    plugin={plugin}
                    categoryNames={(assignments.get(plugin._id) || []).map((id) => namesById.get(id)).filter(Boolean)}
                    selected={selected.has(plugin._id)}
                    onSelect={select}
                    onOpen={openDrawer}
                    onAssign={(p) => openDrawer(p, 'assign')}
                    actions={actions}
                    busy={busy.has(plugin._id)}
                  />
                ) : (
                  <PendingPluginRow key={plugin._id} plugin={plugin} onOpen={openDrawer} actions={actions} busy={busy.has(plugin._id)} />
                )))}
              </ul>
            </Card>

            <ListPager page={page} onChange={goToPage} />
          </>
        )}
      </section>

      {drawerPlugin && (
        <PluginDrawer
          key={drawerPlugin._id}
          plugin={drawerPlugin}
          mode={mode}
          pane={query.pane || 'overview'}
          onPane={changePane}
          onClose={closeDrawer}
          actions={actions}
          busy={busy.has(drawerPlugin._id)}
          toast={toast}
          categories={categories}
          onCategory={onCategory}
          onAggregate={onAggregate}
          returnFocus={returnFocus}
        />
      )}
    </>
  )
}
