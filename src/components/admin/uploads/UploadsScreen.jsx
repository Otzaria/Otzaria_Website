'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import ErrorState from '@/components/ui/ErrorState'
import Pager from '@/components/ui/Pager'
import TabLinks from '@/components/ui/TabLinks'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import MessageUploaderDialog from '@/components/admin/MessageUploaderDialog'
import StatusConfigModal from '@/components/status/StatusConfigModal'
import UploadNotificationSettings from '@/components/notifications/UploadNotificationSettings'
import { isAdmin } from '@/lib/roles'
import { bookGroupKey, bookScope, groupUploadsByBook, parseUploadName } from '@/lib/adminUploads/uploadGroups'
import {
  clearFilters,
  countByBookStatus,
  filterUploadGroups,
  hasActiveFilters,
  paginate,
  sanitizeUploadsQuery,
  serializeUploadsQuery,
  sortUploadGroups,
  updateUploadsQuery,
  uploaderOptions,
} from '@/lib/adminUploads/uploadsQuery'
import { DEFAULT_BOOK_STATUSES, bookStatusOptions, emptyStateKind } from '@/lib/adminUploads/uploadTerms'
import { loginHref } from '@/components/admin/list/adminRequest'
import { saveBookStatuses } from './uploadsApi'
import { useUploadsQuery } from './useUploadsQuery'
import { useUploadsData } from './useUploadsData'
import { useUploadActions } from './useUploadActions'
import UploadsFilterBar from './UploadsFilterBar'
import UploadsBulkBar from './UploadsBulkBar'
import UploadGroupRow from './UploadGroupRow'
import UploadsEmptyState from './UploadsEmptyState'
import { UploadsListSkeleton } from './UploadsSkeleton'
import { useKeyedSelection } from '@/components/admin/list/useKeyedSelection'
import { useFocusAfterRemove } from '@/components/admin/list/useFocusAfterRemove'
import { adminScreenTitle } from '@/lib/adminNav'

const TITLE_ID = 'uploads-title'
const LIST_ID = 'uploads-list'

/**
 * מסך ההעלאות (/library/admin/uploads) והאשפה שלו (/library/admin/trash) — אותו מסך, בשתי לשוניות.
 * ההודעות הקופצות (useToast) מגיעות מהמעטפת (AdminShell), כך שהודעה עם "בטל" שורדת מעבר ללשונית.
 *
 * tab — uploads / trash (לפי הנתיב). initialItems / initialError — ההעלאות מהשרת (בלשונית העלאות).
 * initialStatuses — הגדרות המצבים מהשרת. counts — { uploads, trash } ללשוניות.
 * role — התפקידים של הצופה (מערך, roles.js). הורדה מאוחדת ושליחת הודעה — למנהל כללי בלבד (isAdmin, כמו נקודות
 * הקצה שלהן); למנהל ספרים — שורת הסבר אחת.
 *
 * הבחירה תמיד תת-קבוצה של מה שמוצג: היא נגזרת מהחיתוך עם ההעלאות שמתאימות לסינון, כך שאחרי שינוי
 * מצב (שמוציא שורות מהסינון), מחיקה או סינון — אין "בחירת רפאים" שפעולה מרובה תחול עליה.
 */
export default function UploadsScreen({ tab, initialItems, initialError = false, initialStatuses = null, counts: initialCounts, role }) {
  const router = useRouter()
  const toast = useToast()
  const [confirm, confirmElement] = useConfirm()
  const [rawQuery, setQuery] = useUploadsQuery()
  const { items, setItems, status: loadState, error, retry, refresh, statuses, setStatuses } = useUploadsData({ tab, initialItems, initialError, initialStatuses })
  // מונה שלא נטען (כשל בשרת) — בלי מספר בלשונית, ולא 0 מטעה
  const [counts, setCounts] = useState(() => ({
    uploads: typeof initialCounts?.uploads === 'number' ? initialCounts.uploads : null,
    trash: typeof initialCounts?.trash === 'number' ? initialCounts.trash : null,
  }))
  const permissions = useMemo(() => ({ batchDownload: isAdmin(role), message: isAdmin(role) }), [role])
  const isTrash = tab === 'trash'
  const dateField = isTrash ? 'deletedAt' : 'uploadedAt'
  const ready = loadState === 'ready'

  // ----- דיאלוגים -----
  const [dialog, setDialog] = useState(null) // 'statuses' | 'notifications' | null
  const [messageTarget, setMessageTarget] = useState(null)

  // ----- אפשרויות הסינון, והשאילתה כפי שהיא חלה בפועל (ערכים לא קיימים נזרקים) -----
  const statusOptions = useMemo(() => bookStatusOptions(statuses, countByBookStatus(items)), [statuses, items])
  const rowStatusOptions = useMemo(() => bookStatusOptions(statuses, countByBookStatus(items)).map(({ count: _, ...o }) => o), [statuses, items])
  const userOptions = useMemo(() => uploaderOptions(items), [items])
  const query = useMemo(() => sanitizeUploadsQuery(rawQuery, {
    tab,
    statusKeys: ready && (statuses || initialStatuses) ? statusOptions.map((o) => o.value) : null,
    userKeys: ready ? userOptions.map((o) => o.value) : null,
  }), [rawQuery, tab, ready, statuses, initialStatuses, statusOptions, userOptions])
  const filtersActive = hasActiveFilters(query)

  // ----- רשימה: קיבוץ, סינון, מיון, עימוד -----
  const groups = useMemo(() => groupUploadsByBook(items, { dateField }), [items, dateField])
  const filtered = useMemo(() => sortUploadGroups(filterUploadGroups(groups, query, { dateField }), query.sort), [groups, query, dateField])
  const page = paginate(filtered, query.page)
  const matchingIds = useMemo(() => filtered.flatMap((g) => g.visible.map((u) => u.id)), [filtered])
  const pageIds = page.items.flatMap((g) => g.visible.map((u) => u.id))

  // הכתובת אומרת מה מוצג באמת: ערך שנזרק (?status=xyz) או עמוד שלא קיים (?page=999) — מתוקנים בה
  useEffect(() => {
    if (!ready) return
    const shown = { ...query, page: page.page }
    if (serializeUploadsQuery(shown) !== serializeUploadsQuery(rawQuery)) setQuery(shown)
  }, [ready, query, page.page, rawQuery, setQuery])

  // ----- בחירה: מתאפסת כשהסינון / העמוד משתנים (נגזר, בלי effect), ותמיד חתוכה למה שמוצג -----
  const queryKey = JSON.stringify([tab, query.q, query.type, query.user, query.status, query.sort, page.page])
  const { ids: selectedIds, clearedText, select, clear: clearSelection } = useKeyedSelection(queryKey)
  const matchingSet = useMemo(() => new Set(matchingIds), [matchingIds])
  const selected = useMemo(() => {
    const out = new Set()
    for (const id of selectedIds) if (matchingSet.has(id)) out.add(id)
    return out
  }, [selectedIds, matchingSet])

  // ספרים פתוחים — לפי מפתח הספר; נשארים פתוחים גם במעבר עמוד וסינון
  const [expanded, setExpanded] = useState(() => new Set())
  const toggleExpand = useCallback((key) => {
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // ----- פוקוס: כשהאלמנט הממוקד ירד מהרשימה (מחיקה, שינוי מצב שמוציא מהסינון, ⋮ של שורה שנעלמה) —
  // לשורה שבאה במקומה, ולא ל-body. ספר ששוחזר ב"בטל" — לשורה שלו.
  const { listRef, onListFocus, focusAfterRender } = useFocusAfterRemove({ focusIn: '[data-row-focus]', fallbackId: LIST_ID })
  const onRestored = useCallback((uploads) => {
    focusAfterRender(bookGroupKey(parseUploadName(uploads[0]?.bookName).base))
  }, [focusAfterRender])

  const onMessage = useCallback((target) => setMessageTarget(target), [])
  const { actions, working, pending } = useUploadActions({
    setItems, setCounts, statuses, toast, confirm, router, onRestored, onMessage, refresh,
  })

  // ----- סינון ועימוד -----
  const changeQuery = useCallback((patch) => setQuery(updateUploadsQuery(query, patch)), [query, setQuery])
  const clearAll = useCallback(() => setQuery(clearFilters(query)), [query, setQuery])
  const goToPage = useCallback((n) => {
    setQuery(updateUploadsQuery(query, { page: n }), { push: true })
    document.getElementById(LIST_ID)?.focus({ preventScroll: true })
    document.getElementById(TITLE_ID)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [query, setQuery])
  const retryLoad = useCallback(() => {
    // השגיאה מוחלפת בשלד — הפוקוס לאזור הרשימה, ולא נופל ל-body
    document.getElementById(LIST_ID)?.focus({ preventScroll: true })
    retry()
  }, [retry])

  // ----- פעולות מרובות — רק על מה שמוצג ונבחר -----
  const selectedUploads = useMemo(() => items.filter((u) => selected.has(u.id)), [items, selected])
  const selectedScope = useMemo(() => bookScope(selectedUploads), [selectedUploads])
  const onBulk = useCallback((kind, value) => {
    const list = selectedUploads
    if (list.length === 0) return
    if (kind === 'trash') actions.trash(list)
    else if (kind === 'restore') actions.restore(list)
    else if (kind === 'deleteForever') actions.deleteForever(list)
    else if (kind === 'download') actions.downloadCombined(list, null, 'selection')
    else if (kind === 'status') actions.setStatus(list, value)
  }, [selectedUploads, actions])

  // ----- הגדרות מצבים -----
  const saveStatusConfig = useCallback(async (next) => {
    try {
      const data = await saveBookStatuses(next)
      setStatuses({ ...(data.statuses || next) })
      setDialog(null)
      toast.show({ message: 'הגדרות המצבים נשמרו' })
    } catch (e) {
      toast.show({ tone: 'error', message: e?.message || 'לא הצלחנו לשמור את הגדרות המצבים.' })
    }
  }, [setStatuses, toast])

  const kind = ready ? emptyStateKind({ tab, total: items.length, shown: filtered.length, query }) : null

  // הלשונית הפתוחה — לפי מה שנטען בפועל; השנייה — מהשרת, ומתעדכנת בכל מחיקה ושחזור
  const tabCount = (id) => (id === tab && ready ? items.length : counts[id])

  const menuItems = isTrash ? [] : [
    { id: 'statuses', icon: 'settings', label: 'הגדרות מצבים', onSelect: () => setDialog('statuses') },
    { id: 'notifications', icon: 'notifications', label: 'הגדרות התראות', onSelect: () => setDialog('notifications') },
  ]

  return (
    <div className="flex flex-col gap-5">
      <AdminScreenHeader
        id={TITLE_ID}
        title={adminScreenTitle('uploads')}
        description={isTrash
          ? 'העלאות שנמחקו. אפשר לשחזר אותן, או למחוק אותן לצמיתות.'
          : 'ספרים ועמודים שמשתמשים שלחו. בדוק, הורד, ועדכן את המצב של כל ספר.'}
        menuItems={menuItems}
        menuLabel="הגדרות ההעלאות"
      />

      <TabLinks
        label="העלאות ואשפה"
        activeId={tab}
        items={[
          { id: 'uploads', href: '/library/admin/uploads', label: 'העלאות', icon: 'upload_file', count: tabCount('uploads') ?? undefined },
          { id: 'trash', href: '/library/admin/trash', label: 'אשפה', icon: 'delete', count: tabCount('trash') ?? undefined },
        ]}
      />

      <UploadsFilterBar
        query={query}
        onChange={changeQuery}
        onClear={clearAll}
        active={filtersActive}
        statusOptions={isTrash ? null : statusOptions}
        userOptions={userOptions}
      />

      {!isTrash && !permissions.batchDownload && (
        <p className="-mt-2 flex items-start gap-1.5 text-body-sm text-on-surface-variant">
          הורדה של כמה קבצים יחד ושליחת הודעה למעלה — למנהל כללי בלבד. אפשר להוריד כל קובץ בנפרד מתוך הספר.
        </p>
      )}

      <section
        id={LIST_ID}
        tabIndex={-1}
        aria-labelledby={TITLE_ID}
        aria-busy={loadState === 'loading' || undefined}
        className="flex flex-col gap-3 outline-none"
      >
        {loadState === 'loading' && (
          <>
            <p role="status" className="sr-only">{isTrash ? 'טוען את האשפה…' : 'טוען את ההעלאות…'}</p>
            <UploadsListSkeleton variant={isTrash ? 'trash' : 'uploads'} />
          </>
        )}

        {loadState === 'error' && (error.sessionExpired ? (
          <ErrorState
            title="פג תוקף ההתחברות"
            description="התחבר מחדש כדי לראות את הרשימה. אחרי ההתחברות תחזור לכאן."
            action={<Button href={loginHref('/library/admin/uploads')} variant="filled" size="sm" icon="login">התחבר</Button>}
          />
        ) : (
          <ErrorState
            title={isTrash ? 'לא הצלחנו לטעון את האשפה' : 'לא הצלחנו לטעון את ההעלאות'}
            description={error.message}
            onRetry={retryLoad}
          />
        ))}

        {ready && kind && (
          <UploadsEmptyState
            kind={kind}
            total={items.length}
            hasStatusFilter={query.status.length > 0}
            onClearFilters={clearAll}
          />
        )}

        {ready && !kind && (
          <>
            <UploadsBulkBar
              tab={tab}
              selectedScope={selectedScope}
              selected={selected}
              pageIds={pageIds}
              matchingIds={matchingIds}
              onSelect={select}
              onSelectAll={() => select(matchingIds, true)}
              onClear={clearSelection}
              clearedText={clearedText}
              groupCount={filtered.length}
              uploadCount={matchingIds.length}
              sort={query.sort}
              onSortChange={(sort) => changeQuery({ sort })}
              statusOptions={rowStatusOptions}
              permissions={permissions}
              working={working}
              onBulk={onBulk}
              trashTotal={items.length}
              onEmptyTrash={() => actions.emptyTrash(items, { filtered: filtersActive })}
            />

            <Card as="div" className="@container overflow-hidden">
              <ul ref={listRef} onFocus={onListFocus} aria-label={isTrash ? 'ההעלאות שבאשפה' : 'ההעלאות, לפי ספר'} className="divide-y divide-outline-variant/60">
                {page.items.map((group) => (
                  <UploadGroupRow
                    key={group.key}
                    group={group}
                    variant={isTrash ? 'trash' : 'uploads'}
                    selected={selected}
                    onSelect={select}
                    expanded={expanded.has(group.key)}
                    onToggleExpand={toggleExpand}
                    statusOptions={rowStatusOptions}
                    permissions={permissions}
                    actions={actions}
                    pending={pending}
                    sort={query.sort}
                  />
                ))}
              </ul>
            </Card>

            <div className="flex flex-col items-center gap-1">
              <Pager page={page.page} pageCount={page.pageCount} onChange={goToPage} label="מעבר בין עמודי הרשימה" />
              {page.pageCount > 1 && (
                <p className="text-body-sm text-on-surface-variant tabular-nums">
                  ספרים {page.from.toLocaleString('he-IL')}–{page.to.toLocaleString('he-IL')} מתוך {page.total.toLocaleString('he-IL')}
                </p>
              )}
            </div>
          </>
        )}
      </section>

      {confirmElement}

      {dialog === 'statuses' && (
        <StatusConfigModal
          statuses={statuses || DEFAULT_BOOK_STATUSES}
          uploads={items}
          title="הגדרות מצבים"
          itemNoun="מצב"
          itemNounPlural="מצבים"
          deleteConfirmBody={'אם תמחק את המצב, ההעלאות האלה יישארו עם מצב שלא קיים בהגדרות.\n\nכדאי לשנות קודם את המצב של ההעלאות האלה.'}
          deleteConfirmQuestion="למחוק את המצב?"
          onSave={saveStatusConfig}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'notifications' && <UploadNotificationSettings onClose={() => setDialog(null)} />}
      {messageTarget && (
        <MessageUploaderDialog
          recipient={messageTarget}
          initialSubject={messageTarget.subject}
          onClose={() => setMessageTarget(null)}
        />
      )}
    </div>
  )
}
