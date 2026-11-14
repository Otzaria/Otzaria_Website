'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import ListPager from '@/components/admin/list/ListPager'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import LoadError from '@/components/admin/list/LoadError'
import { unsavedConfirm } from '@/hooks/useUnsavedChangesGuard'
import { prefersReducedMotion } from '@/lib/reducedMotion'
import { BLOCKED, displayName } from '@/lib/adminUsersScreen/userTerms'
import {
  activeFilterCount, clearFilters, filterOptions, filterSummary, filterUsers, paginate, updateUsersQuery,
} from '@/lib/adminUsersScreen/usersQuery'
import UserDrawer from './UserDrawer'
import UserRow, { UserColumnsHeader } from './UserRow'
import UsersFilterBar, { UsersToolbar } from './UsersFilterBar'
import { UsersListSkeleton } from './UsersSkeleton'
import { USERS_DESCRIPTION, USERS_TITLE } from './usersScreenText'
import { useUserDialogs } from './useUserDialogs'
import { useUsersData } from './useUsersData'
import { useUsersQuery } from './useUsersQuery'
import { useUserWrites } from './useUserWrites'
import { useFocusAfterRemove } from '@/components/admin/list/useFocusAfterRemove'
import { useDrawerParam } from '@/components/admin/list/useDrawerParam'
import { neighborAfterRemove } from '@/lib/adminList/selection'
import { USER_GONE_MESSAGE } from './usersApi'

const TITLE_ID = 'users-title'
const LIST_ID = 'users-list'

/** כפתור השם בשורה של משתמש (היעד של הפוקוס: חזרה מהמגירה, ואחרי מחיקה) */
const rowButton = (id) => (id ? document.querySelector(`#${LIST_ID} [data-row="${CSS.escape(id)}"] [data-row-open]`) : null)

/**
 * "משתמשים" (/library/admin/users) — למנהל כללי בלבד, כמו קודם. הרשימה מגיעה מוכנה מהשרת (page.jsx), והסינון
 * (חיפוש · תפקיד · צוות), המיון, העמוד והמגירה הפתוחה — בכתובת. במקום עריכה בתוך השורה: מגירת משתמש
 * (UserDrawer — פרטים, תפקיד, צוותים, הגבלות, פעילות, שלח הודעה, מחק לצמיתות). במקום window.confirm — חלון
 * שבו מקלידים את כתובת הדואר. אותן בקשות לשרת כמו קודם (usersApi), כולן בתור אחד (useUserWrites).
 * ⋮ בשורה: שלח הודעה, חסום מעריכה / בטל חסימה (עם "בטל" לפני שליחה — הלחיצה המהירה של הטבלה הקודמת),
 * ומחק לצמיתות.
 *
 * @param {{ initialUsers?: any[], initialError?: boolean, viewerId?: string }} props
 */
export default function UsersScreen({ initialUsers, initialError = false, viewerId }) {
  const toast = useToast()
  const [confirm, confirmElement] = useConfirm()
  const [query, setQuery] = useUsersQuery()
  const refreshFailed = useCallback((error, retry) => {
    toast.show({ tone: 'error', message: 'לא הצלחנו לרענן את הרשימה.', action: { label: 'נסה שוב', onClick: retry } })
  }, [toast])
  const data = useUsersData({ initialUsers, initialError, onRefreshError: refreshFailed })
  const ready = data.status === 'ready'
  const users = data.users

  const filtered = useMemo(() => filterUsers(users, query), [users, query])
  const page = paginate(filtered, query.page)
  const options = useMemo(() => filterOptions(users), [users])

  const changeQuery = useCallback((patch) => setQuery(updateUsersQuery(query, patch)), [query, setQuery])
  const clearAll = useCallback(() => setQuery(clearFilters(query)), [query, setQuery])
  const goToPage = useCallback((n) => {
    setQuery(updateUsersQuery(query, { page: n }), { push: true })
    document.getElementById(LIST_ID)?.focus({ preventScroll: true })
    document.getElementById(TITLE_ID)?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [query, setQuery])

  // עמוד שכבר לא קיים (?page=99, או שהרשימה התקצרה) — הכתובת מתוקנת למה שמוצג
  useEffect(() => {
    if (ready && query.page !== page.page) setQuery(updateUsersQuery(query, { page: page.page }))
  }, [ready, query, page.page, setQuery])

  // ----- מגירה (בכתובת: ?user=). פתיחה — push, כדי ש"אחורה" יסגור אותה -----
  const { openerRef, setOpener, open: pushDrawer, close: popDrawer, markPushed } = useDrawerParam(setQuery)
  const openDrawer = useCallback((user) => pushDrawer(user._id, updateUsersQuery(query, { user: user._id })), [query, pushDrawer])
  const [closing, setClosing] = useState(false)
  const closeDrawer = useCallback(() => {
    setClosing(true)
    popDrawer(updateUsersQuery(query, { user: '' }))
  }, [query, popDrawer])
  const returnFocus = useCallback(() => rowButton(openerRef.current || query.user) || document.getElementById(LIST_ID), [openerRef, query.user])

  // "אחורה" בדפדפן כשבמגירה יש שינוי שלא נשמר: הכתובת כבר בלי המשתמש, אבל המגירה נשארת פתוחה (held) —
  // אותו רכיב, כך שהטיוטה לא נמחקת — ונשאלים. "הישאר" — הכתובת חוזרת למגירה; "צא" — המגירה נסגרת.
  const [drawerDirty, setDrawerDirty] = useState(false)
  const [held, setHeld] = useState(null)
  const [shown, setShown] = useState(query.user)
  if (shown !== query.user) {
    if (shown && drawerDirty && !closing && !held) setHeld(shown)
    if (!query.user && closing) setClosing(false)
    setShown(query.user)
  }
  if (held && query.user === held) setHeld(null)
  const askedFor = useRef(null)
  const latest = useRef({ query, setQuery, confirm })
  useEffect(() => { latest.current = { query, setQuery, confirm } })
  useEffect(() => {
    if (!held || askedFor.current === held) return
    askedFor.current = held
    latest.current.confirm(unsavedConfirm('השינויים בפרטים או בתפקיד לא נשמרו.')).then((leave) => {
      askedFor.current = null
      if (leave) {
        setDrawerDirty(false)
        setHeld(null)
        return
      }
      markPushed()
      const { query: q, setQuery: set } = latest.current
      set(updateUsersQuery(q, { user: held }), { push: true })
    })
  }, [held, markPushed])
  const drawerId = held || query.user
  const drawerUser = drawerId && ready ? users.find((u) => u._id === drawerId) : null

  // קישור למשתמש שלא ברשימה (נמחק, או כתובת שגויה)
  const foundUser = useRef(null)
  useEffect(() => {
    if (drawerUser) foundUser.current = drawerUser._id
    if (!ready || !query.user || drawerUser || foundUser.current === query.user) return
    // מסומן לפני ההודעה: הרצה שנייה של ה-effect (StrictMode בפיתוח) לא מציגה אותה שוב
    foundUser.current = query.user
    toast.show({ tone: 'info', message: 'המשתמש לא נמצא ברשימה. ייתכן שנמחק.' })
    setQuery(updateUsersQuery(query, { user: '' }))
  }, [ready, drawerUser, query, setQuery, toast])

  // ----- משתמש שיוצא מהרשימה: נמחק כאן, או שהשרת אומר שהוא כבר לא קיים -----
  // writes נוצר אחרי (הוא צריך את onGone) — ולכן דרך ref
  const writesRef = useRef(null)
  const pageIds = page.items.map((u) => u._id).join(',')
  const { beforeRemove } = useFocusAfterRemove({ focusIn: '[data-row-open]', fallbackId: LIST_ID, rootId: LIST_ID, preventScroll: true })
  const dropUser = useCallback((user) => {
    // הפוקוס עובר לשורה הבאה (או לקודמת, אם זו האחרונה) — לא לראש הדף. גם כשחלון / מגירה שנסגרים מחזירים אותו
    // לשורה שנמחקה (always)
    setOpener(neighborAfterRemove(pageIds.split(','), [user._id]))
    writesRef.current?.cancelUser(user._id)
    if (query.user === user._id || held === user._id) {
      foundUser.current = user._id
      setDrawerDirty(false)
      setHeld(null)
      if (query.user === user._id) closeDrawer()
    }
    data.remove(user._id)
    // השורה עוד בדף (הרינדור עוד לא קרה) — השכנה נקבעת לפיה; הפוקוס עובר אחרי רגע, אחרי סגירת החלון / המגירה
    beforeRemove([user._id], { always: true })
  }, [pageIds, setOpener, beforeRemove, query.user, held, closeDrawer, data])

  const onGone = useCallback((user) => {
    dropUser(user)
    toast.show({ tone: 'info', message: `${displayName(user)}: ${USER_GONE_MESSAGE}` })
    data.refresh()
  }, [dropUser, toast, data])
  const writes = useUserWrites({ data, toast, onGone })
  useEffect(() => { writesRef.current = writes })
  const { teams } = writes

  // ----- חלונות (שלח הודעה, מחק לצמיתות) — מהשורה ומהמגירה -----
  const onDeleted = useCallback((user) => {
    dropUser(user)
    toast.show({ message: `${displayName(user)} נמחק` })
    data.refresh()
  }, [dropUser, data, toast])
  const dialogs = useUserDialogs({ onDeleted, remove: writes.remove })

  const menuFor = useCallback((user) => {
    const self = Boolean(viewerId) && String(viewerId) === String(user._id)
    const blocked = teams.value(user, BLOCKED)
    return [
      { id: 'message', icon: 'mail', label: 'שלח הודעה', onSelect: () => dialogs.openMessage(user) },
      {
        id: 'block',
        icon: blocked ? 'lock_open' : 'block',
        label: blocked ? 'בטל חסימה' : 'חסום מעריכה',
        onSelect: () => teams.toggle(user, BLOCKED, !blocked),
      },
      { separator: true, id: 'sep' },
      { id: 'delete', icon: 'delete_forever', label: self ? 'מחק לצמיתות (החשבון שלך)' : 'מחק לצמיתות', danger: true, disabled: self, onSelect: () => dialogs.openDelete(user) },
    ]
  }, [viewerId, dialogs, teams])

  // כשל — onRefreshError (הודעה עם "נסה שוב")
  const refreshAll = async () => {
    if (await data.refresh()) toast.show({ message: 'הרשימה עודכנה' })
  }

  const empty = !ready ? null : users.length === 0 ? 'all' : filtered.length === 0 ? 'filtered' : null

  return (
    <div className="flex flex-col gap-5">
      <AdminScreenHeader
        id={TITLE_ID}
        title={USERS_TITLE}
        description={USERS_DESCRIPTION}
        menuItems={[{ id: 'refresh', icon: 'refresh', label: 'רענן', onSelect: refreshAll }]}
      />

      {data.status === 'loading' && (
        <div aria-busy="true" className="flex flex-col gap-5">
          <p role="status" className="sr-only">טוען את רשימת המשתמשים…</p>
          <UsersListSkeleton />
        </div>
      )}
      {data.status === 'error' && (
        <LoadError
          error={data.error}
          title="לא הצלחנו לטעון את רשימת המשתמשים"
          sessionText="התחבר מחדש כדי לראות את המשתמשים. אחרי ההתחברות תחזור לכאן."
          onRetry={data.retry}
        />
      )}

      {ready && empty !== 'all' && (
        <UsersFilterBar query={query} options={options} onChange={changeQuery} onClear={clearAll} />
      )}

      {ready && (
        <section id={LIST_ID} tabIndex={-1} aria-labelledby={TITLE_ID} className="flex min-w-0 flex-col gap-3 outline-none">
          {empty === 'all' && <EmptyState icon="group" title="אין משתמשים" description="כשמישהו יירשם לאתר, הוא יופיע כאן." />}
          {empty === 'filtered' && (
            <EmptyState
              role="status"
              icon="search_off"
              title="לא נמצאו משתמשים"
              description={`אין משתמש שמתאים לסינון: ${filterSummary(query).join(' · ')}`}
              actions={<Button variant="tonal" size="sm" icon="filter_alt_off" onClick={clearAll}>נקה סינון</Button>}
            />
          )}
          {!empty && (
            <>
              <UsersToolbar total={filtered.length} sort={query.sort} onSortChange={(sort) => changeQuery({ sort })} />
              <Card as="div" className="@container overflow-hidden">
                <UserColumnsHeader />
                <ul aria-label={activeFilterCount(query) > 0 ? 'המשתמשים שמתאימים לסינון' : 'המשתמשים'} className="divide-y divide-outline-variant/60">
                  {page.items.map((saved) => {
                    const user = teams.shown(saved)
                    return <UserRow key={user._id} user={user} onOpen={openDrawer} menuItems={menuFor(user)} />
                  })}
                </ul>
              </Card>
              <ListPager page={page} onChange={goToPage} />
            </>
          )}
        </section>
      )}

      {drawerUser && (
        <UserDrawer
          key={drawerUser._id}
          user={drawerUser}
          viewerId={viewerId}
          onClose={closeDrawer}
          writes={writes}
          onSaved={data.patch}
          onGone={onGone}
          onReopen={openDrawer}
          onMessage={dialogs.openMessage}
          onDelete={dialogs.openDelete}
          toast={toast}
          returnFocus={returnFocus}
          onDirtyChange={setDrawerDirty}
        />
      )}
      {dialogs.element}
      {confirmElement}
    </div>
  )
}
