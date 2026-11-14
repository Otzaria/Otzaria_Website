'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useDialog } from '@/components/providers/DialogContext'
import FramesGuide from './FramesGuide'
import GuideBox from '../common/GuideBox'
import { framesApi, formatUntil } from './api'

// רשימת הספרים בגלאי האזורים: מצב לכל ספר — פנוי / אצלך / בעבודה אצל … / הופסק באמצע — N עמ' בידי … /
// הושלם. "קח את הספר" שומר את כל הספר למתנדב ל-48 שעות; "המשך מהעבודה הקודמת" — אותו דבר, עם מה שכבר סומן.

const HOME = '/library/page-proof'
const bookHref = (b) => `/library/page-proof/frames/${encodeURIComponent(b)}`

function StateBadge({ b }) {
  if (b.state === 'free') return <Badge tone="success">פנוי</Badge>
  if (b.state === 'mine') return <Badge tone="info" icon="schedule">אצלך · עד {formatUntil(b.claimedUntil)}</Badge>
  if (b.state === 'taken') return <Badge tone="warning">בעבודה אצל {b.who} · עד {formatUntil(b.claimedUntil)}</Badge>
  if (b.state === 'partial') {
    const by = b.workedBy === 'you' ? 'בידיך' : `בידי ${b.workedBy}`
    return (
      <Badge tone="info">
        הופסק באמצע — {b.worked} עמ' {by}
      </Badge>
    )
  }
  return <Badge tone="neutral">הושלם — ממתין לאישור</Badge>
}

export default function BookList() {
  const router = useRouter()
  const { showAlert } = useDialog()
  const [books, setBooks] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    const r = await framesApi.books()
    if (!r.ok) return setErr({ status: r.status, error: r.data.error || 'הטעינה נכשלה' })
    setBooks(r.data.books)
  }, [])

  useEffect(() => {
    let alive = true
    framesApi.books().then((r) => {
      if (!alive) return
      if (!r.ok) return setErr({ status: r.status, error: r.data.error || 'הטעינה נכשלה' })
      setBooks(r.data.books)
    })
    return () => {
      alive = false
    }
  }, [])

  const take = async (b) => {
    if (b.state === 'mine') return router.push(bookHref(b.book))
    setBusy(b.book)
    const r = await framesApi.claim(b.book)
    setBusy(null)
    if (!r.ok) {
      showAlert('הספר לא נלקח', r.data.error || 'נסו שוב')
      return load()
    }
    router.push(bookHref(b.book))
  }

  if (err) {
    const noAccess = err.status === 403
    return (
      <div className="flex flex-col items-start gap-3 rounded-card bg-surface p-6 shadow-raised" data-testid="list-error">
        <p className="text-body-lg">{noAccess ? 'אין לך הרשאת גישה לדף זה' : err.error}</p>
        <Button href={HOME} variant="tonal" icon="arrow_forward">
          {noAccess ? 'בקשת גישה' : 'לדף הבית של ההגהה'}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4" data-testid="book-list">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-headline-md text-on-surface">גלאי אזורי-טקסט — בחירת ספר</h1>
        <Button href={HOME} size="sm" variant="text" icon="arrow_forward">
          לדף הבית
        </Button>
      </div>
      <p className="max-w-3xl text-body-md text-on-surface-variant">
        העבודה כאן היא לפי ספר, כי המסגרות והזרמים צריכים להיות עקביים לאורך הספר. כשלוקחים ספר — כל העמודים שלו שמורים לך
        ל-48 שעות. אם לא סיימת, הספר חוזר לרשימה, ומי שימשיך יראה את כל מה שכבר סימנת.
      </p>
      <GuideBox section="frames" />
      <FramesGuide />
      {!books ? (
        <LoadingSpinner message="טוען את הספרים…" />
      ) : !books.length ? (
        <p className="rounded-card bg-surface p-6 text-body-md shadow-raised">אין כרגע ספרים לסימון. כשהמנהל יעלה ספרים חדשים — הם יופיעו כאן.</p>
      ) : (
        <div className="overflow-x-auto rounded-card bg-surface shadow-raised">
          <table className="w-full border-collapse text-body-sm">
            <thead>
              <tr className="border-b border-outline-variant text-start text-label-md text-on-surface-variant">
                <th className="px-3 py-2 text-start">ספר</th>
                <th className="px-3 py-2 text-start">סוג</th>
                <th className="px-3 py-2 text-start">עמודים</th>
                <th className="px-3 py-2 text-start">מצב</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {books.map((b) => (
                <tr key={b.book} className="border-b border-outline-subtle last:border-0" data-testid="book-row" data-state={b.state}>
                  <td className="px-3 py-2.5 font-bold">{b.alias}</td>
                  <td className="px-3 py-2.5 text-on-surface-variant">{b.kind === 'digital' ? 'דיגיטלי' : 'סרוק'}</td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {b.done ? `${b.done}/${b.pages}` : b.pages}
                  </td>
                  <td className="px-3 py-2.5">
                    <StateBadge b={b} />
                  </td>
                  <td className="px-3 py-2.5 text-end">
                    {b.state === 'free' && (
                      <Button size="sm" variant="filled" loading={busy === b.book} onClick={() => take(b)}>
                        קח את הספר
                      </Button>
                    )}
                    {b.state === 'partial' && (
                      <Button size="sm" variant="tonal" loading={busy === b.book} onClick={() => take(b)}>
                        המשך מהעבודה הקודמת
                      </Button>
                    )}
                    {b.state === 'mine' && (
                      <Button size="sm" variant="filled" iconEnd="arrow_back" onClick={() => take(b)}>
                        המשך לעבוד
                      </Button>
                    )}
                    {(b.state === 'taken' || b.state === 'done') && <span className="text-label-md text-on-surface-variant">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
