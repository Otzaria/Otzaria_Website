'use client'

import { useState } from 'react'

export default function PrivateBookUpload({ onSuccess }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function upload(event) {
    event.preventDefault()
    const form = event.currentTarget
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/user/upload?privateOcr=1', { method: 'POST', body: new FormData(form) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'ההעלאה נכשלה')
      form.reset()
      await onSuccess()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <form onSubmit={upload} className="rounded-xl border border-outline-variant p-5 flex flex-wrap items-end gap-4">
    <label>שם הספר<input name="bookName" required maxLength={200} className="block border rounded p-2" /></label>
    <label>PDF עד 50MB<input name="pdf" type="file" required accept="application/pdf" className="block" /></label>
    <button disabled={busy} className="border rounded px-4 py-2">{busy ? 'מעלה וממיר…' : 'העלה ספר פרטי'}</button>
    {error && <p role="alert" className="text-error">{error}</p>}
  </form>
}
