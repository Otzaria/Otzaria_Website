'use client'

import { useCallback, useEffect, useState } from 'react'
import { STATUS_LABELS_HE, TERMINAL_STATUSES } from '@/lib/ocr/localJobState'

export default function PrivateBookCard({ book }) {
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [method, setMethod] = useState('local')
  const [requestId, setRequestId] = useState(null)
  const active = job && !TERMINAL_STATUSES.includes(job.status)

  const refresh = useCallback(() => {
    return fetch(`/api/user/books/ocr/status?bookId=${book.id}`, { cache: 'no-store' })
      .then(async res => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'טעינת הסטטוס נכשלה')
        return data
      })
      .then(data => {
        setJob(data.job)
        setError('')
      })
  }, [book.id])

  useEffect(() => {
    refresh().catch(e => setError(e.message))
  }, [refresh])

  useEffect(() => {
    if (!active) return
    const poll = () => refresh().catch(e => setError(e.message))
    const timer = setInterval(poll, 5000)
    return () => clearInterval(timer)
  }, [active, refresh])

  async function act(action) {
    setBusy(true)
    setError('')
    try {
      const id = job?.preparingStale ? job.requestId : requestId || crypto.randomUUID()
      setRequestId(id)
      const res = await fetch(`/api/user/books/ocr/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'cancel' ? { bookId: book.id } : {
          bookId: book.id, method: job?.preparingStale ? job.method : method,
          existingTextMode: job?.preparingStale ? job.existingTextMode : 'overwrite', requestId: id,
          ...(job?.preparingStale ? { options: job.options, pageRange: job.pageRange } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'הפעולה נכשלה')
      setRequestId(null)
      await refresh()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function download() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/user/books/ocr/result?bookId=${book.id}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'ההורדה נכשלה')
      const url = URL.createObjectURL(new Blob([data.combinedText], { type: 'text/plain;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${book.name}.txt`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return <article className="rounded-xl border border-outline-variant p-5 space-y-3">
    <h2 className="text-xl font-bold">{book.name}</h2>
    <p>{book.totalPages} עמודים · פרטי</p>
    <>
      <p role="status">{job ? `${STATUS_LABELS_HE[job.status] || 'מצב לא ידוע'} · ${job.processedPages || 0}/${job.totalPages || 0}` : 'טרם הופעל OCR'}</p>
      {job?.error && <p>{job.error}</p>}
      {!active && <label className="block">שיטת OCR <select value={method} onChange={e => setMethod(e.target.value)} className="border rounded p-1">
        <option value="local">מחשב מקומי</option><option value="ocrwin">OCRWin</option>
      </select></label>}
      <div className="flex flex-wrap gap-3">
        <button disabled={busy} onClick={() => refresh().catch(e => setError(e.message))} className="underline">רענן מצב</button>
        {(!active || job?.preparingStale) && <button disabled={busy} onClick={() => act('start')} className="underline">{job?.preparingStale ? 'המשך הכנה' : 'הפעל OCR'}</button>}
        {active && <button disabled={busy} onClick={() => act('cancel')} className="underline">בטל OCR</button>}
        <button disabled={busy} onClick={download} className="underline">הורד טקסט</button>
      </div>
    </>
    {error && <p role="alert" className="text-error">{error}</p>}
  </article>
}
