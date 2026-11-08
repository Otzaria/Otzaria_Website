'use client'

import { useCallback, useState } from 'react'
import Button from '@/components/ui/Button'
import Ltr from '@/components/ui/Ltr'
import { useToast } from '@/components/ui/Toast'
import RelativeTime from '@/components/ui/RelativeTime'
import { errorToast } from '@/components/admin/list/adminRequest'
import { formatNumber } from '@/lib/adminTerms'
import { sortBooks } from '@/lib/adminTzuratScreen/tzuratTerms'
import { apiCall } from './adminApi'
import ChunkedUploadCard from './ChunkedUploadCard'
import EmptyText from '@/components/ui/EmptyText'
import ErrorNotice from '@/components/ui/ErrorNotice'
import ListLoading from '@/components/ui/ListLoading'
import RefreshButton from '@/components/ui/RefreshButton'
import CardSection from '@/components/ui/CardSection'
import { StatusBadge } from './TzuratBits'
import UploadJobInfo from './UploadJobInfo'
import { formatBytes } from './uploadPlan'
import useAdminData from './useAdminData'

// לשונית "חבילות" (לשעבר "העלאת חבילות"): כרטיס ההעלאה, ההעלאות האחרונות (GET uploads, עם "נסה שוב" לעיבוד שנכשל),
// והחבילות שהועלו (GET batches) — השהיה / המשך של מסכת (PATCH batches/[slug] {status}): מסכת מושהית אינה מוצעת
// למתנדבים. אחרי השהיה השורה נשארת במקומה, רק התג והכפתור מתחלפים. אותן בקשות בדיוק כמו קודם.

function RecentUploads({ reloadKey, onChanged }) {
  const { data, error: loadError, loading, reload: load } = useAdminData('uploads', reloadKey)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  const list = data ? data.uploads || [] : null

  const retry = async (u) => {
    if (busy) return
    setBusy(u.id)
    const r = await apiCall(`uploads/${encodeURIComponent(u.id)}/retry`, { method: 'POST', body: {} })
    setBusy(null)
    if (!r.ok) setError(r.error)
    else {
      setError(null)
      load()
      onChanged?.()
    }
  }

  return (
    <CardSection title="העלאות אחרונות" testId="recent-uploads" actions={<RefreshButton onClick={load} busy={loading} />}>
      <ErrorNotice text={error || loadError} />
      {!list ? (loadError ? null : <ListLoading rows={2} />) : !list.length ? (
        <EmptyText>עוד לא הועלו קבצים</EmptyText>
      ) : (
        <ul className="flex flex-col divide-y divide-outline-variant">
          {list.map((u) => (
            <li key={u.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Ltr className="min-w-0 break-all text-title-sm text-on-surface">{u.name}</Ltr>
                <span className="text-body-sm text-on-surface-variant"><Ltr>{formatBytes(u.size)}</Ltr></span>
                {u.status === 'uploading' && (
                  <span className="text-body-sm tabular-nums text-on-surface-variant">
                    {formatNumber((u.received || []).length)} מתוך {formatNumber(u.chunks)} חלקים
                  </span>
                )}
                <span className="text-body-sm text-on-surface-variant"><RelativeTime date={u.startedAt} prefix="התחילה" /></span>
                <span className="flex-1" />
                {u.status === 'failed' && (
                  <Button variant="outlined" size="sm" icon="restart_alt" loading={busy === u.id} onClick={() => retry(u)} aria-label={`נסה שוב את ${u.name}`}>
                    נסה שוב
                  </Button>
                )}
              </div>
              <UploadJobInfo upload={u} />
            </li>
          ))}
        </ul>
      )}
    </CardSection>
  )
}

function BatchesList({ reloadKey }) {
  const toast = useToast()
  const { data, error: loadError, setData } = useAdminData('batches', reloadKey)
  const [busy, setBusy] = useState(null)
  const list = data ? data.batches || [] : null

  const toggle = async (b) => {
    const next = b.status === 'paused' ? 'active' : 'paused'
    const name = b.masechet || b.slug
    if (busy) return
    setBusy(b.slug)
    const r = await apiCall(`batches/${encodeURIComponent(b.slug)}`, { method: 'PATCH', body: { status: next } })
    setBusy(null)
    if (!r.ok) {
      toast.show(errorToast({ message: r.error, sessionExpired: r.sessionExpired }, 'השינוי לא נשמר'))
      return
    }
    const status = r.data?.batch?.status || r.data?.status || next
    setData((cur) => ({ ...cur, batches: (cur?.batches || []).map((x) => (x.slug === b.slug ? { ...x, status } : x)) }))
    toast.show({ message: status === 'paused' ? `${name} הושהתה — לא תוצע למתנדבים` : `${name} חזרה להיות מוצעת למתנדבים` })
  }

  const rows = sortBooks(list)

  return (
    <CardSection title="חבילות שהועלו" testId="batches" description="מסכת מושהית אינה מוצעת למתנדבים. התשובות שכבר ניתנו נשמרות.">
      <ErrorNotice text={loadError} />
      {!list ? (loadError ? null : <ListLoading rows={2} />) : !rows.length ? (
        <EmptyText>עוד לא הועלו חבילות</EmptyText>
      ) : (
        <ul className="flex flex-col divide-y divide-outline-variant">
          {rows.map((b) => {
            const name = b.masechet || b.slug
            const paused = b.status === 'paused'
            return (
              <li key={b.slug} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0" data-testid="batch-row">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-title-sm text-on-surface">{name}</h3>
                    {paused && <StatusBadge kind="batch" status="paused" />}
                  </div>
                  <p className="flex flex-wrap gap-x-3 text-body-sm text-on-surface-variant">
                    <span className="tabular-nums">{formatNumber(b.pages)} עמודים · {formatNumber(b.items)} החלטות</span>
                    <RelativeTime date={b.importedAt} prefix="הועלתה" />
                    {b.buildId && <span>גרסה <Ltr className="font-mono">{b.buildId}</Ltr></span>}
                  </p>
                </div>
                <Button variant="outlined" size="sm" icon={paused ? 'play_circle' : 'pause_circle'} loading={busy === b.slug} onClick={() => toggle(b)}
                  aria-label={`${paused ? 'המשך' : 'השהה'} את ${name}`} className="min-w-24">
                  {paused ? 'המשך' : 'השהה'}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </CardSection>
  )
}

/** @param {{ onDirty?: (dirty: boolean) => void, onChanged?: () => void }} props */
export default function UploadsSection({ onDirty, onChanged }) {
  const [reloadKey, setReloadKey] = useState(0)
  const changed = useCallback(() => {
    setReloadKey((k) => k + 1)
    onChanged?.()
  }, [onChanged])
  return (
    <div className="flex flex-col gap-4">
      <ChunkedUploadCard onChanged={changed} onBusy={onDirty} />
      <RecentUploads reloadKey={reloadKey} onChanged={changed} />
      <BatchesList reloadKey={reloadKey} />
    </div>
  )
}
