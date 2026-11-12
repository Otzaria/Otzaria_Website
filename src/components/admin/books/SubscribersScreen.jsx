'use client'

import { useMemo, useState } from 'react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Pager from '@/components/ui/Pager'
import SearchField from '@/components/ui/SearchField'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { loginHref } from '@/components/admin/list/adminRequest'
import { formatNumber } from '@/lib/adminBooks/bookTerms'
import { paginate } from '@/lib/adminBooks/booksQuery'
import BooksHeader from './BooksHeader'
import { deleteSubscriber } from './booksApi'

/**
 * לשונית "מנויים" (היה "רשומים להתראות", בחלון): מי שביקש הודעה במייל כשספר חדש מוצג לכולם. רשימה
 * אחת לכל הספרים (לא לספר מסוים) — לכן לשונית של המסך, ולא חלק ממגירת ספר.
 * חיפוש בשם ובכתובת, ועימוד (מאות מנויים). "הסר" — אחרי אישור; בזמן ההסרה השורה מושבתת.
 *
 * כתובת שאין לה משתמש באתר — תג "אין חשבון באתר" (ולא "בלי שם", שנראה כמו תקלה).
 * @param {{ initialSubscribers: { name: string, email: string, hasAccount?: boolean }[], initialError?: boolean }} props
 */
export default function SubscribersScreen({ initialSubscribers, initialError = false }) {
  const toast = useToast()
  const [confirm, confirmElement] = useConfirm()
  const [list, setList] = useState(initialSubscribers || [])
  const [removing, setRemoving] = useState(() => new Set())
  const [q, setQ] = useState('')
  const [pageNo, setPageNo] = useState(1)
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return term ? list.filter((s) => s.name.toLowerCase().includes(term) || s.email.toLowerCase().includes(term)) : list
  }, [list, q])
  const page = paginate(shown, pageNo)

  const remove = async (sub) => {
    if (removing.has(sub.email)) return
    const ok = await confirm({
      title: 'להסיר את המנוי?',
      body: <>{sub.name || 'המנוי'} (<bdi dir="ltr">{sub.email}</bdi>) לא יקבל יותר הודעות על ספרים חדשים.</>,
      confirmLabel: 'הסר',
    })
    if (!ok) return
    setRemoving((s) => new Set(s).add(sub.email))
    try {
      await deleteSubscriber(sub.email)
      setList((l) => l.filter((s) => s.email !== sub.email))
      toast.show({ message: `${sub.name || sub.email} הוסר מהמנויים` })
    } catch (e) {
      toast.show(e?.sessionExpired
        ? { tone: 'error', message: e.message, action: { label: 'התחבר', href: loginHref('/library/admin/books/subscribers') } }
        : { tone: 'error', message: e?.message || 'לא הצלחנו להסיר את המנוי.' })
    } finally {
      setRemoving((s) => {
        const next = new Set(s)
        next.delete(sub.email)
        return next
      })
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <BooksHeader tab="subscribers" />
      {initialError ? (
        <ErrorState title="לא הצלחנו לטעון את המנויים" description="נסה שוב בעוד רגע." onRetry={() => window.location.reload()} />
      ) : list.length === 0 ? (
        <EmptyState icon="notifications_active" title="אין מנויים" description="כשמשתמש יבקש לקבל הודעה על ספרים חדשים, הוא יופיע כאן." />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <SearchField label="חיפוש מנוי" placeholder="חפש שם או כתובת" value={q} onSearch={(v) => { setQ(v); setPageNo(1) }} />
            <p className="text-body-sm text-on-surface-variant tabular-nums">
              {q.trim() ? `${formatNumber(shown.length)} מתוך ${formatNumber(list.length)} מנויים` : list.length === 1 ? 'מנוי אחד' : `${formatNumber(list.length)} מנויים`}
            </p>
          </div>
          {shown.length === 0 ? (
            <EmptyState role="status" icon="search_off" title="אין מנוי שמתאים לחיפוש" actions={<Button variant="outlined" size="sm" onClick={() => setQ('')}>נקה חיפוש</Button>} />
          ) : (
            <Card as="div" className="overflow-hidden">
              <ul aria-label="המנויים" className="divide-y divide-outline-variant/60">
                {page.items.map((sub) => (
                  <li key={sub.email} className="flex min-h-14 items-center gap-3 px-3 py-2 sm:px-4">
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-body-md text-on-surface">
                        {sub.name && <span className="truncate">{sub.name}</span>}
                        {sub.hasAccount === false && <Badge>אין חשבון באתר</Badge>}
                        {!sub.name && sub.hasAccount !== false && <span className="text-on-surface-variant">בלי שם</span>}
                      </span>
                      <span className="block truncate text-body-sm text-on-surface-variant"><bdi dir="ltr">{sub.email}</bdi></span>
                    </span>
                    <Button
                      variant="text"
                      size="sm"
                      iconOnly
                      icon="unsubscribe"
                      onClick={() => remove(sub)}
                      loading={removing.has(sub.email)}
                      aria-label={`הסר את ${sub.name || sub.email} מהמנויים`}
                      title="הסר מהמנויים"
                      className="[--button-text-fg:var(--color-on-surface-variant)]"
                    />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <div className="flex flex-col items-center gap-1">
            <Pager page={page.page} pageCount={page.pageCount} onChange={setPageNo} label="מעבר בין עמודי המנויים" />
          </div>
        </>
      )}
      {confirmElement}
    </div>
  )
}
