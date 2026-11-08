'use client'

import { useCallback, useState } from 'react'
import ErrorState from '@/components/ui/ErrorState'
import Pager from '@/components/ui/Pager'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { useToast } from '@/components/ui/Toast'
import OpenChip from '@/components/admin/list/OpenChip'
import RelativeTime from '@/components/ui/RelativeTime'
import { roundText, statusLabel, statusOptions, submissionCountsText, totalAfterChange, totalText } from '@/lib/adminTzuratScreen/tzuratTerms'
import { pageCount, query } from './adminApi'
import SubmissionReviewDrawer from './SubmissionReviewDrawer'
import EmptyText from '@/components/ui/EmptyText'
import ErrorNotice from '@/components/ui/ErrorNotice'
import ListLoading from '@/components/ui/ListLoading'
import RefreshButton from '@/components/ui/RefreshButton'
import { StatusBadge } from './TzuratBits'
import useAdminData from './useAdminData'

// לשונית "הגשות" (לשעבר "הגשות עמוד"): התור לפי מצב — אותה בקשה כמו קודם: GET submissions?status=&page= →
// {submissions, total}. "פתח" — מגירת הסקירה (SubmissionReviewDrawer). אחרי אישור / דחייה השורה נשארת במקומה עם
// התג החדש (לא נעלמת ולא מזיזה את השאר); "רענן" או מעבר מצב מסדרים מחדש. הסה"כ ("3 הגשות") והמונה בלשונית
// יורדים יחד, מקומית (onChanged('submission', מצב קודם, מצב חדש)) — בלי בקשה לשרת.

const STATUSES = statusOptions('submission', ['submitted', 'approved', 'rejected'])

function SubmissionRow({ s, status, onOpen }) {
  const name = `${s.masechet || s.slug} ${s.daf || ''}`.trim()
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 [overflow-wrap:anywhere] first:pt-0 last:pb-0" data-testid="submission-row">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-title-sm text-on-surface">{name}</h3>
          {s.status && s.status !== status && <StatusBadge kind="submission" status={s.status} />}
        </div>
        <p className="flex flex-wrap gap-x-3 text-body-sm text-on-surface-variant">
          <span className="min-w-0">{s.userName} · {roundText(s.round)}</span>
          <span className="tabular-nums">{submissionCountsText(s.counts)}</span>
          {s.at && <RelativeTime date={s.at} prefix="הוגשה" />}
        </p>
      </div>
      <OpenChip onClick={() => onOpen(s.id)} label={`פתח את ההגשה ${name}`} />
    </li>
  )
}

/** @param {{ onChanged?: (kind: 'submission', from: string, to: string) => void }} props */
export default function SubmissionsSection({ onChanged }) {
  const toast = useToast()
  const [status, setStatus] = useState('submitted')
  const [page, setPage] = useState(1)
  const { data, error, loading, reload: load, setData } = useAdminData(`submissions${query({ status, page })}`)
  const [openId, setOpenId] = useState(null)
  // גודל הדף — לפי הדף הראשון, אם השרת אינו מחזיר pages
  const [firstSize, setFirstSize] = useState(0)
  if (page === 1 && data?.submissions && data.submissions.length !== firstSize) setFirstSize(data.submissions.length)

  const close = useCallback(() => setOpenId(null), [])
  const done = useCallback(
    (id, next) => {
      setOpenId(null)
      const from = (data?.submissions || []).find((s) => s.id === id)?.status || status
      setData((d) => (d ? {
        ...d,
        total: totalAfterChange(d.total, status, from, next),
        submissions: (d.submissions || []).map((s) => (s.id === id ? { ...s, status: next } : s)),
      } : d))
      toast.show({ message: `ההגשה ${next === 'approved' ? 'אושרה' : 'נדחתה, והעמוד נפתח שוב לבדיקה'}` })
      onChanged?.('submission', from, next)
    },
    [data, status, setData, toast, onChanged]
  )

  const list = data?.submissions || []
  const pages = pageCount(data, firstSize)

  return (
    <div className="flex flex-col gap-4" data-testid="submissions">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="מצב ההגשות" options={STATUSES} value={status} onChange={(v) => { setStatus(v); setPage(1) }} />
        <span className="flex-1" />
        {data && <span className="text-body-sm text-on-surface-variant" role="status">{totalText(data.total ?? list.length, 'הגשה אחת', 'הגשות')}</span>}
        <RefreshButton onClick={load} busy={loading} />
      </div>
      {error && data && <ErrorNotice text={error} />}
      {error && !data ? (
        <ErrorState title="לא הצלחנו לטעון את ההגשות" description={error} onRetry={load} />
      ) : !data ? (
        <ListLoading />
      ) : !list.length ? (
        <EmptyText>{status === 'submitted' ? 'אין הגשות שממתינות לאישור' : `אין הגשות במצב "${statusLabel('submission', status)}"`}</EmptyText>
      ) : (
        <ul className="flex flex-col divide-y divide-outline-variant rounded-(--card-radius) bg-(--card-bg) p-4 sm:p-5">
          {list.map((s) => <SubmissionRow key={s.id} s={s} status={status} onOpen={setOpenId} />)}
        </ul>
      )}
      {pages > 1 && <Pager page={page} pageCount={pages} onChange={setPage} label="מעבר בין עמודי ההגשות" className="self-center" />}
      {openId && <SubmissionReviewDrawer id={openId} onClose={close} onDone={done} />}
    </div>
  )
}
