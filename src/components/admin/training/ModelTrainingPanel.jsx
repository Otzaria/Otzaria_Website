'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import { requestJson } from '@/components/admin/list/adminRequest'
import { CHECKBOX, FIELD_LABEL } from '@/components/ui/fieldStyles'

const labels = { preparing: 'מכין את חמשת העמודים', queued: 'ממתין לאימון', running: 'אימון בתהליך',
  paused_runner: 'מושהה בזמן עבודת תחנה אחרת', pausing: 'ממתין לעצירה בטוחה', delivery_pending: 'שולח סיכום',
  completed: 'מודל הספר מוכן לזיהוי יתר העמודים', failed: 'המודל הקודם נשאר פעיל', needs_attention: 'נדרשת בדיקה במחשב המקומי', cancelled: 'בוטל' }
const phases = { waiting_gpu: 'ממתין לכרטיס', snapshot_before: 'שומר את המודל הקודם', aligning_corrected_pages: 'מתאים את הטקסט המוגה לתמונות השורות', training: 'מאמן ובודק את מודל הספר', publish_after: 'שומר את המודל החדש', activate: 'מפעיל את מודל הספר' }

export default function ModelTrainingPanel({ book = null }) {
  const [books, setBooks] = useState([]), [bookId, setBookId] = useState(book?.id || '')
  const [pageNumbers, setPageNumbers] = useState('1,2,3,4,5')
  const [script, setScript] = useState('square'), [epochs, setEpochs] = useState(4)
  const [approved, setApproved] = useState(false), [jobs, setJobs] = useState([])
  const [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [note, setNote] = useState('')
  const request = useRef(null)
  const load = useCallback(async () => {
    const data = await requestJson(`/api/admin/model-training${book ? `?bookId=${book.id}` : ''}`)
    setJobs(data.jobs); setEnabled(data.enabled)
  }, [book])
  useEffect(() => {
    let live = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- עדכון רק לאחר תשובת השרת
    load().catch(e => { if (live) setError(e.message) })
    if (!book) requestJson('/api/admin/ocr-training/books').then(data => { if (live) setBooks(data.books) }).catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [book, load])
  useEffect(() => {
    if (!jobs.some(j => j.active)) return
    const timer = setInterval(() => load().catch(e => setError(e.message)), 30000)
    return () => clearInterval(timer)
  }, [jobs, load])
  const post = async params => {
    setBusy(true); setError(''); setNote('')
    try {
      const data = await requestJson('/api/admin/model-training', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) })
      setNote(data.preparing ? 'הכנת החומר עדיין בתהליך. אפשר להמשיך אותה מהרשימה אם נקטעה.' : 'בקשת האימון נשמרה. אפשר לצאת מהמסך.')
      await load()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  const send = async () => {
    const pages = pageNumbers.split(/[,\s]+/).filter(Boolean).map(Number)
    if (pages.length !== 5 || new Set(pages).size !== 5 || pages.some(n => !Number.isSafeInteger(n) || n < 1)) { setError('בחרו בדיוק חמישה מספרי עמודים שונים'); return }
    const params = { bookId, script, epochs: Number(epochs), pageNumbers: pages.sort((a,b) => a-b), approved }
    const key = JSON.stringify(params)
    let saved
    try { saved = JSON.parse(sessionStorage.getItem('model-training-request') || 'null') } catch { /* unavailable */ }
    if (request.current?.key !== key) request.current = saved?.key === key ? saved : { key, id: crypto.randomUUID().replaceAll('-', '') }
    try { sessionStorage.setItem('model-training-request', JSON.stringify(request.current)) } catch { /* unavailable */ }
    await post({ ...params, requestId: request.current.id })
  }
  return <section className="rounded-(--radius-card) border border-outline-variant p-4 flex flex-col gap-3" aria-label="אימון מודל הספר">
    <h2 className="text-title-md">אימון על חמישה עמודים שהקהילה הגיהה</h2>
    <p className="text-body-sm text-on-surface-variant">בחרו חמישה עמודים שכבר סומנו כהושלמו בעורך הספר. התמונות והטקסט המתוקן שלהם יישלחו לאימון. אין צורך לתייג או לתמלל שוב שורות בנפרד.</p>
    {!book && <label className={FIELD_LABEL}>ספר<select value={bookId} onChange={e => setBookId(e.target.value)} disabled={busy} className="border rounded p-2"><option value="">בחרו ספר</option>{books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
    <label className={FIELD_LABEL}>חמישה מספרי עמודים<input value={pageNumbers} onChange={e => setPageNumbers(e.target.value)} disabled={busy} dir="ltr" className="border rounded p-2" /></label>
    <div className="flex gap-3"><label className={FIELD_LABEL}>כתב<select value={script} onChange={e => setScript(e.target.value)} disabled={busy} className="border rounded p-2"><option value="square">מרובע</option><option value="rashi">רש״י</option></select></label>
    <label className={FIELD_LABEL}>סבבי אימון<input type="number" min="1" max="20" value={epochs} onChange={e => setEpochs(e.target.value)} disabled={busy} className="border rounded p-2 w-24" /></label></div>
    <p className="text-body-sm">שלושה עמודים ישמשו ללמידה ושניים לבדיקות נפרדות, כדי לוודא שיפור גם בעמוד שהמודל לא למד. המודל החדש יופעל לספר הזה בלבד. בזמן האימון עבודות ה־OCR במחשב המקומי ממתינות, כולל ספרים אישיים.</p>
    <label className="flex gap-2 items-start text-body-sm"><input type="checkbox" className={CHECKBOX} checked={approved} onChange={e => setApproved(e.target.checked)} disabled={busy} />בדקתי שהטקסט בחמשת העמודים תואם לסריקות, ואני מאשר/ת אימון והמתנה של עבודות הזיהוי</label>
    <Button onClick={send} disabled={!enabled || busy || !bookId || !approved || jobs.some(j => j.active)}>{busy ? 'שומר…' : 'שלח את חמשת העמודים והטקסט לאימון'}</Button>
    {jobs.length > 0 && !jobs.some(j => j.active) && <Button variant="text" onClick={() => { request.current = null; try { sessionStorage.removeItem('model-training-request') } catch { /* unavailable */ } setNote('אפשר לשלוח בקשת אימון חדשה') }}>הכן בקשת אימון חדשה</Button>}
    {!enabled && <p role="status" className="text-body-sm">האימון האוטומטי ממתין להתקנת מסלול האימון במחשב המקומי.</p>}
    {error && <p role="alert">{error}</p>}{note && <p role="status">{note}</p>}
    <ul className="flex flex-col gap-2">{jobs.map(j => <li key={j.id} className="text-body-sm">
      <span>{j.script === 'rashi' ? 'רש״י' : 'מרובע'} · {labels[j.status] || j.status}</span>
      {j.active && phases[j.phase] && <p>{phases[j.phase]}</p>}
      {j.status === 'preparing' && <Button variant="text" onClick={() => post({ bookId: j.bookId, requestId: j.requestId, script: j.script, epochs: j.epochs, ...j.selection })} disabled={busy}>המשך הכנת חומר האימון</Button>}
      {j.message && <p>{j.message}</p>}{j.error && <p>{j.error}</p>}
      {j.before && <a className="underline me-3" href={j.before.url} target="_blank" rel="noopener noreferrer">מודל לפני האימון</a>}
      {j.after && <a className="underline me-3" href={j.after.url} target="_blank" rel="noopener noreferrer">מודל אחרי האימון</a>}
      {j.activated && <a className="underline" href={`/library/admin/books?book=${j.bookId}&view=ocr`}>לזיהוי יתר העמודים — בחרו דילוג על עמודים שכבר נערכו</a>}
    </li>)}</ul>
  </section>
}
