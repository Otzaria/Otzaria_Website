'use client'

import { useEffect, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import { pageKey, saveDraft, downloadBackup, readRecord, removeRecord, writeRecord } from '@/lib/offlineBooks/store'
import { parseBackup, restoreBackup } from '@/lib/offlineBooks/backup'
import { preparePage, refreshPreparedScan } from '@/lib/offlineBooks/prepare'

const textOf = data => data.twoColumns
  ? `${data.rightColumnName}\n${data.rightColumn}\n\n${data.leftColumnName}\n${data.leftColumn}` : data.content

export default function OfflineBookControl({ offline, user, bookPath, pageNumber, book, pageData, snapshot, flushOnline, showAlert, showConfirm }) {
  const backupInput = useRef(null)
  const snapshotRef = useRef(snapshot)
  useEffect(() => { snapshotRef.current = snapshot }, [snapshot])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [server, setServer] = useState(null)
  const enabled = offline.enabled
  const run = async action => {
    setBusy(true); setMessage(null)
    try { await action() } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }
  const prepare = () => run(async () => {
    if (!await flushOnline()) throw new Error('השמירה לשרת נכשלה. יש לשמור את העמוד לפני הכנתו לאופליין.')
    const res = await fetch(`/api/page-content?bookPath=${encodeURIComponent(bookPath)}&pageNumber=${pageNumber}`, { cache: 'no-store' })
    const result = await res.json()
    if (!res.ok || !result.success) throw new Error(result.error || 'לא ניתן לטעון את העמוד')
    // The preparation dialog holds focus; verify the baseline still agrees with the editor.
    const expected = snapshot()
    if (textOf(result.data) !== textOf(expected) || result.data.twoColumns !== expected.twoColumns ||
        result.data.content !== expected.content || result.data.leftColumn !== expected.leftColumn || result.data.rightColumn !== expected.rightColumn) {
      throw new Error('העמוד השתנה בשרת. רעננו ובדקו את הטקסט לפני הכנת עותק אופליין.')
    }
    await preparePage({ user, bookPath, pageNumber, book, data: { ...pageData, ...result.data } })
    const current = snapshotRef.current()
    if (JSON.stringify(current) !== JSON.stringify(expected)) {
      saveDraft(pageKey(user.id, bookPath, pageNumber), current)
    }
    offline.refresh()
    setMessage('העמוד והצילום מוכנים לאופליין. שמרו את כתובת העמוד בסימניות.')
  })
  const compare = () => run(async () => {
    const res = await fetch(`/api/page-content?bookPath=${encodeURIComponent(bookPath)}&pageNumber=${pageNumber}`, { cache: 'no-store' })
    const result = await res.json()
    if (!res.ok || !result.success) throw new Error(result.error || 'לא ניתן לטעון את גרסת השרת')
    setServer(result.data)
  })
  const resolve = local => showConfirm('בחירת גרסה לסנכרון', local
    ? 'להחליף את הטקסט בשרת בגרסה המקומית? אם העמוד ישתנה שוב, הסנכרון ייעצר שוב.'
    : 'להשתמש בגרסת השרת? הגרסה המקומית תורד כגיבוי לפני החלפתה.', () => run(async () => {
      const record = readRecord(offline.record.key)
      const cacheName = await refreshPreparedScan(record, server)
      const current = readRecord(record.key)
      const metadata = { ...current.data, ...server }
      const publish = next => {
        try { writeRecord(next) }
        catch (error) { if (cacheName !== record.cacheName) void caches.delete(cacheName); throw error }
      }
      if (local) {
        publish({ ...current, cacheName, data: metadata, baseVersion: server.contentVersion, inFlight: null, problem: null })
        if (cacheName !== record.cacheName) await caches.delete(record.cacheName)
        if (!await offline.saveNow(snapshot())) throw new Error('הסנכרון טרם הושלם. הגרסה המקומית נשמרה במכשיר.')
        setServer(null)
        location.reload()
      } else {
        downloadBackup(offline.backupRecord())
        publish({ ...current, cacheName, data: metadata, baseVersion: server.contentVersion, draft: null, inFlight: null, problem: null })
        if (cacheName !== record.cacheName) await caches.delete(record.cacheName)
        location.reload()
      }
    }))
  const remove = record => showConfirm('הסרת עותק מהמכשיר', 'להסיר את העמוד והצילום מהאחסון המקומי? העותק בשרת יישאר זמין.', () => run(async () => {
    await removeRecord(record.key)
    offline.refresh()
  }))
  const importBackup = event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    void run(async () => {
      if (file.size > 20_000_000) throw new Error('קובץ הגיבוי גדול מדי')
      const imported = parseBackup(await file.text(), { userId: user.id, bookPath, pageNumber })
      showConfirm('שחזור גיבוי לעמוד', 'להחליף את הטיוטה הנוכחית בגיבוי? הטיוטה הנוכחית תורד תחילה כגיבוי נוסף. הסנכרון יבדוק אם גרסת השרת השתנתה.', () => run(async () => {
        downloadBackup(offline.backupRecord())
        restoreBackup(offline.record.key, imported)
        location.reload()
      }))
    })
  }
  const backup = () => {
    try { downloadBackup(offline.backupRecord()) }
    catch (error) { showAlert('הגיבוי נכשל', error.message) }
  }
  return <>
    <Button variant={enabled ? "tonal" : "text"} size="tool" icon="download" title={enabled ? "העמוד זמין אופליין" : "הכנת העמוד לאופליין"} aria-label={enabled ? 'ניהול עמודים אופליין' : 'הכנת העמוד לאופליין'} onClick={() => setOpen(true)}><span className="max-md:sr-only">אופליין</span></Button>
    {open && <Dialog onClose={() => { if (!busy) setOpen(false) }} title="עריכת ספרים אופליין" dismissible={!busy}>
      <div className="space-y-4">
        <p>הכינו מראש את העמוד והצילום, ערכו ללא רשת וסנכרנו כשהחיבור חוזר. העותק נשמר בדפדפן הזה; מומלץ להוריד גיבוי של עבודה חשובה.</p>
        {(message || offline.problem) && <p role="alert" className="text-error">{message || offline.problem}</p>}
        {!enabled ? <Button disabled={busy || !offline.connected} onClick={prepare}>{busy ? 'מוריד את העמוד והצילום…' : 'אפשר עריכה אופליין לעמוד זה'}</Button> : <>
          <p>{offline.record.draft ? 'יש שינויים מקומיים שטרם סונכרנו.' : 'העמוד מוכן לאופליין וכל השינויים סונכרנו.'}</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !offline.connected} onClick={() => run(async () => { if (!await offline.saveNow(snapshot())) throw new Error('הסנכרון טרם הושלם. בדקו התחברות והרשאות.') })}>סנכרן עכשיו</Button>
            <Button variant="outlined" onClick={backup}>הורדת גיבוי</Button>
            <input ref={backupInput} type="file" accept="application/json,.json" hidden onChange={importBackup} />
            <Button variant="outlined" disabled={busy} onClick={() => backupInput.current?.click()}>שחזור מגיבוי</Button>
            {offline.record.problem?.code === 'OFFLINE_CONFLICT' && <Button variant="outlined" disabled={busy || !offline.connected} onClick={compare}>השוואה לגרסת השרת</Button>}
            <a className="inline-flex items-center underline" href={`/auth/login?callbackUrl=${encodeURIComponent(offline.record.href)}`}>התחברות מחדש</a>
          </div>
        </>}
        {server && <div className="space-y-3">
          {server.ocrReviewRevision !== pageData.ocrReviewRevision && <p role="alert">צילום העמוד או נתוני הזיהוי השתנו. בדקו את צילום השרת לפני בחירת גרסה. גם הצילום המקומי יעודכן בבחירה.</p>}
          {server.thumbnail && <a className="underline" href={server.thumbnail} target="_blank" rel="noopener noreferrer">פתיחת צילום השרת</a>}
          <p>השוו גם את הטורים ושמותיהם לפני בחירת גרסה. שום גרסה לא נבחרת אוטומטית.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label>הגרסה המקומית<textarea readOnly value={textOf(snapshot())} className="h-52 w-full border p-2" /></label>
            <label>גרסת השרת<textarea readOnly value={textOf(server)} className="h-52 w-full border p-2" /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => resolve(true)}>השתמש בגרסה המקומית</Button>
            <Button variant="outlined" disabled={busy} onClick={() => resolve(false)}>השתמש בגרסת השרת</Button>
          </div>
        </div>}
        <details className="space-y-3">
          <summary className="cursor-pointer underline">פרטים על שמירה, סנכרון ופרטיות</summary>
        <p>הכינו כל עמוד מראש כשיש חיבור. הטקסט והצילום יישמרו בדפדפן במכשיר הזה. השינויים יסתנכרנו אוטומטית כשהחיבור יחזור ואחד מעמודי העריכה פתוח.</p>
        <p>תפיסה, שחרור וסיום עמוד דורשים חיבור. מומלץ לתפוס את העמוד לפני היציאה לאופליין. כלים התלויים בשרת או שלא נטענו מראש עשויים לדרוש חיבור.</p>
        <p>העותקים המקומיים נגישים למי שמשתמש בדפדפן הזה, גם אחרי יציאה מהחשבון. בגלישה פרטית, בניקוי נתוני האתר או בפינוי אחסון הם עלולים להימחק. הורידו גיבוי של עבודה חשובה.</p>
        </details>
        <h3 className="font-bold">עמודים שהוכנו בחשבון זה</h3>
        <ul className="space-y-2">
          {offline.records().map(record => <li key={record.key} className="flex flex-wrap items-center gap-2">
            <a className="underline" href={record.href}>{record.book?.name || record.bookPath} · עמוד {record.pageNumber}</a>
            <span>{record.draft ? 'ממתין לסנכרון' : 'מסונכרן'}</span>
            <Button size="sm" variant="text" onClick={() => downloadBackup(record)}>גיבוי</Button>
            <Button size="sm" variant="text" disabled={busy || Boolean(record.draft) || (record.key === offline.record?.key && Boolean(offline.problem))} onClick={() => remove(record)}>הסרה מהמכשיר</Button>
          </li>)}
        </ul>
      </div>
    </Dialog>}
  </>
}
