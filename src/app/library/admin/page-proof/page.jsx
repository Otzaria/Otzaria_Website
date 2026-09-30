'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useDialog } from '@/components/providers/DialogContext'
import { hasOcrAccess } from '@/lib/roles'
import ImportCard from '@/components/pageProof/admin/ImportCard'
import BooksTable from '@/components/pageProof/admin/BooksTable'
import SubmissionsQueue from '@/components/pageProof/admin/SubmissionsQueue'
import ReviewModal from '@/components/pageProof/admin/ReviewModal'
import AdminBookPages from '@/components/pageProof/admin/AdminBookPages'

// ניהול הגהת-העמודים: ייבוא חבילות מתוכנת-הספר של פרויקט ה-OCR, מעקב
// התקדמות לכל ספר, רשת-העמודים של ספר (מצב כל עמוד, פתוח/סגור למתנדבים,
// שחרור תפיסות), תור אישור ההגשות, והורדת תיקונים.json לבעל הפרויקט.

export default function PageProofAdmin() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { showAlert, showConfirm } = useDialog()
  const [books, setBooks] = useState(null)
  const [busy, setBusy] = useState(false)
  const [qStatus, setQStatus] = useState('submitted')
  const [qGid, setQGid] = useState(null)
  const [qPage, setQPage] = useState(1)
  const [queue, setQueue] = useState(null)
  const [reviewId, setReviewId] = useState(null)
  // הספר שרשת-העמודים שלו פתוחה ({gid, title}) או null
  const [gridBook, setGridBook] = useState(null)

  const allowed = hasOcrAccess(session?.user?.role)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/login?callbackUrl=/library/admin/page-proof')
    else if (status === 'authenticated' && !allowed) router.push('/library/admin')
  }, [status, allowed, router])

  const loadBooks = useCallback(async () => {
    const d = await fetch('/api/admin/page-proof').then((r) => r.json()).catch(() => null)
    if (d?.success) setBooks(d.books)
    else setBooks([])
  }, [])

  const loadQueue = useCallback(async () => {
    const qs = new URLSearchParams({ status: qStatus, page: String(qPage) })
    if (qGid) qs.set('gid', qGid)
    const d = await fetch(`/api/admin/page-proof/submissions?${qs}`).then((r) => r.json()).catch(() => null)
    if (d?.success) setQueue(d)
  }, [qStatus, qPage, qGid])

  useEffect(() => {
    if (allowed) loadBooks()
  }, [allowed, loadBooks])
  useEffect(() => {
    if (allowed) loadQueue()
  }, [allowed, loadQueue])

  const download = async (book, { set, onlyNew = false, mark = false }) => {
    setBusy(true)
    try {
      const qs = new URLSearchParams({ set })
      if (onlyNew) qs.set('only', 'new')
      if (mark) qs.set('mark', '1')
      const res = await fetch(`/api/admin/page-proof/books/${book.gid}/fixes?${qs}`)
      if (!res.ok) throw new Error('ההורדה נכשלה')
      const n = Number(res.headers.get('X-Submission-Count') || 0)
      // מעל 5,000 פעולות (התקרה של תוכנת-הספר לקובץ אחד) השרת מחזיר ZIP של כמה קבצים
      const zip = String(res.headers.get('Content-Type') || '').includes('zip')
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `תיקונים${set === 'double' ? '-כפולים' : ''}-${book.title}.${zip ? 'zip' : 'json'}`
      a.click()
      URL.revokeObjectURL(a.href)
      if (zip) showAlert('כמה קבצים', 'יש יותר מ-5,000 תיקונים, ולכן הם הורדו כ-ZIP של כמה קבצי-תיקונים. יבאו אותם בתוכנה אחד-אחד, לפי הסדר.')
      if (mark && n) setBooks((bs) => bs.map((b) => (b.gid === book.gid ? { ...b, unexported: Math.max(0, b.unexported - n) } : b)))
    } catch (e) {
      showAlert('שגיאה', e.message)
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (book) => {
    const next = book.status === 'paused' ? 'active' : 'paused'
    const d = await fetch(`/api/admin/page-proof/books/${book.gid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    }).then((r) => r.json())
    if (d.success) setBooks((bs) => bs.map((b) => (b.gid === book.gid ? { ...b, status: d.status } : b)))
    else showAlert('שגיאה', d.error || 'הפעולה נכשלה')
  }

  const remove = async (book) => {
    const warn = book.unexported ? ` ${book.unexported} הגשות מאושרות עוד לא יצאו בקובץ-תיקונים ויאבדו!` : ''
    const ok = await showConfirm('מחיקת ספר', `למחוק את "${book.title}" עם כל העמודים, ההגשות והתמונות?${warn} אין דרך לשחזר.`)
    if (!ok) return
    const d = await fetch(`/api/admin/page-proof/books/${book.gid}`, { method: 'DELETE' }).then((r) => r.json())
    if (d.success) {
      setBooks((bs) => bs.filter((b) => b.gid !== book.gid))
      setGridBook((cur) => (cur?.gid === book.gid ? null : cur))
      loadQueue()
    } else showAlert('שגיאה', d.error || 'המחיקה נכשלה')
  }

  // אחרי אישור/דחייה: עדכון מקומי של התור והמונים. מצב העמוד (ממתין לזיהוי-
  // מחדש, הושלם) נקבע בשרת — מוני-הספרים נטענים מחדש כדי שיהיו מדויקים
  const onReviewed = (id, newStatus) => {
    const item = queue?.items.find((s) => s.id === id)
    setReviewId(null)
    loadBooks()
    if (!item) return loadQueue()
    setQueue((q) => ({
      ...q,
      total: q.total - 1,
      items: q.items.filter((s) => s.id !== id),
      counts: { ...q.counts, [item.status]: (q.counts[item.status] || 1) - 1, [newStatus]: (q.counts[newStatus] || 0) + 1 },
    }))
    setBooks((bs) =>
      bs?.map((b) => {
        if (b.gid !== item.gid) return b
        const nb = { ...b }
        if (item.status === 'submitted') nb.submitted--
        if (item.status === 'approved') {
          nb.approved--
          if (!item.exportedAt) nb.unexported--
        }
        if (newStatus === 'approved') {
          nb.approved++
          nb.unexported++
        }
        return nb
      })
    )
  }

  const closeReview = useCallback(() => setReviewId(null), [])

  if (status === 'loading' || !allowed) return <LoadingSpinner message="טוען..." />

  return (
    <div className="flex flex-col gap-4">
      <div className="glass-strong rounded-xl p-4">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-on-surface">
          <span className="material-symbols-outlined text-primary">fact_check</span>
          הגהת עמודים (חוזה-העמוד)
        </h2>
        <p className="mt-1 text-sm text-on-surface/60">
          עמודים מתוכנת-הספר של פרויקט ה-OCR. מתנדבים בוחרים עמודים (או רצף של 5 עוקבים) ברשת-העמודים ומגישים תיקונים; כל הגשה ממתינה לאישור כאן, ורק המאושרות יוצאות בקובץ תיקונים.json לבעל הפרויקט (שם הן עוברות אישור נוסף לפני שנכנסות לאימון). ב&quot;עמודים&quot; שבטבלה: אילו עמודים פתוחים למתנדבים, ושחרור תפיסות. דף המתנדבים: <Link href="/library/page-proof/books" className="text-primary underline">/library/page-proof/books</Link>
        </p>
      </div>

      <ImportCard onImported={loadBooks} />

      {books === null ? <LoadingSpinner message="טוען ספרים..." /> : (
        <BooksTable
          books={books}
          busy={busy}
          onDownload={download}
          onToggle={toggle}
          onDelete={remove}
          onFilter={(gid) => {
            setQGid(gid)
            setQStatus('submitted')
            setQPage(1)
          }}
          openGid={gridBook?.gid || null}
          onPages={(book) => setGridBook((cur) => (cur?.gid === book.gid ? null : { gid: book.gid, title: book.title }))}
        />
      )}

      {gridBook && <AdminBookPages key={gridBook.gid} gid={gridBook.gid} title={gridBook.title} onClose={() => setGridBook(null)} onChanged={loadBooks} />}

      <SubmissionsQueue
        status={qStatus}
        setStatus={(s) => {
          setQStatus(s)
          setQPage(1)
        }}
        gid={qGid}
        clearGid={() => setQGid(null)}
        data={queue}
        page={qPage}
        setPage={setQPage}
        onOpen={setReviewId}
      />

      {reviewId && <ReviewModal id={reviewId} onClose={closeReview} onDone={onReviewed} onPageChanged={loadBooks} />}
    </div>
  )
}
