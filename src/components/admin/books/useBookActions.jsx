'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loginHref } from '@/components/admin/list/adminRequest'
import { useBulkRun } from '@/components/admin/list/useBulkRun'
import { withStopReason } from '@/lib/adminList/bulkText'
import { isAccessLost } from '@/lib/adminList/requestErrors'
import { DEFAULT_CATEGORY, bulkPlan, bulkResultText, bulkUndoText, deleteBookDialog, downloadFileName } from '@/lib/adminBooks/bookTerms'
import { deleteBook, downloadBookPdf, downloadBookText, updateBook } from './booksApi'
import { libraryHref } from './bookRowActions'
import QuotedName from './QuotedName'

/**
 * הפעולות על ספרים — מקום אחד לכל הקריאות לשרת, למשוב (הודעה קופצת) ולנעילה לפי ספר.
 *
 * נעילה: pending — מזהי הספרים שיש עליהם בקשה פתוחה; השורה שלהם מושבתת, ופעולה שנייה על אותו ספר
 * לא יוצאת (לחיצה כפולה) — ואומרת את זה (לא נבלעת בשקט). working — פעולה מרובה רצה (הסרגל מושבת);
 * bulkProgress — { action, done, total } בזמן הריצה, ו-stopBulk עוצר אותה (גם יציאה מהמסך עוצרת — useBulkRun).
 * התחברות שפגה — הודעה עם "התחבר" (חוזרים לאותו מקום), והרשימה לא משתנה.
 * הסתר — מיד, עם "בטל" בהודעה. הצג — דרך דיאלוג (האם לשלוח הודעה למנויים): onDialog('show', book).
 *
 * @param {{ setBooks: Function, toast: any, confirm: Function, router: any, refresh: () => void,
 *   onDialog: (kind: string, payload: any) => void, onOpenDrawer: (book: any, view?: string) => void }} options
 */
export function useBookActions({ setBooks, toast, confirm, router, refresh, onDialog, onOpenDrawer }) {
  const [pending, setPending] = useState(() => new Set())
  const pendingRef = useRef(new Set())
  const [working, setWorking] = useState(false)
  const workingRef = useRef(false)
  // יציאה מהמסך באמצע פעולה מרובה — לא נשלחות עוד בקשות
  const { run: runAll, progress: bulkProgress, stopping, stop: stopBulk } = useBulkRun()

  const lock = useCallback((ids) => {
    if (ids.some((id) => pendingRef.current.has(id))) return false
    for (const id of ids) pendingRef.current.add(id)
    setPending(new Set(pendingRef.current))
    return true
  }, [])
  const unlock = useCallback((ids) => {
    for (const id of ids) pendingRef.current.delete(id)
    setPending(new Set(pendingRef.current))
  }, [])

  const fail = useCallback((e, fallback) => {
    if (e?.sessionExpired) {
      toast.show({ tone: 'error', message: e.message, action: { label: 'התחבר', href: loginHref('/library/admin/books') } })
      return
    }
    toast.show({ tone: 'error', message: e?.message || fallback })
  }, [toast])

  const patchLocal = useCallback((ids, patch) => {
    const set = new Set(ids)
    setBooks((list) => list.map((b) => (set.has(b.id) ? { ...b, ...patch } : b)))
  }, [setBooks])

  // "בטל" קורא שוב לאותה פונקציה — דרך ref, כי בתוך ה-callback היא עוד לא מוגדרת
  const setHiddenRef = useRef(null)
  /** עדכון הנראות של ספר אחד (בלי דיאלוג). מחזיר true בהצלחה. */
  const setHidden = useCallback(async (book, isHidden, { sendNotification = false, undo = true } = {}) => {
    if (!lock([book.id])) return false
    try {
      await updateBook(book.id, { isHidden, sendNotification }, isHidden ? 'לא הצלחנו להסתיר את הספר.' : 'לא הצלחנו להציג את הספר.')
      patchLocal([book.id], { isHidden })
      const tail = isHidden ? ' הוסתר' : sendNotification ? ' מוצג עכשיו לכולם, והמנויים קיבלו הודעה' : ' מוצג עכשיו לכולם'
      const message = <><QuotedName name={book.name} />{tail}</>
      // "בטל" — רק כשאין מה שאי אפשר להחזיר (הודעה שכבר נשלחה למנויים)
      const action = undo && !sendNotification
        ? { label: 'בטל', undo: true, onClick: () => { setHiddenRef.current(book, !isHidden, { undo: false }) } }
        : undefined
      toast.show({ message, action })
      return true
    } catch (e) {
      fail(e, 'לא הצלחנו לעדכן את הספר.')
      return false
    } finally {
      unlock([book.id])
    }
  }, [lock, unlock, patchLocal, toast, fail])
  useEffect(() => { setHiddenRef.current = setHidden }, [setHidden])

  /** שינוי שם וקטגוריה (מהדיאלוג). זורק בכשל — הדיאלוג מציג את השגיאה בתוכו (גם כשכבר רצה פעולה על הספר). */
  const saveDetails = useCallback(async (book, { name, category }) => {
    if (!lock([book.id])) throw new Error('יש כבר פעולה על הספר הזה. נסה שוב בעוד רגע.')
    try {
      const patch = { name }
      if (category !== undefined) patch.category = category
      await updateBook(book.id, patch, 'לא הצלחנו לשמור את השינויים.')
      patchLocal([book.id], patch)
      toast.show({ message: name !== book.name ? <>השם עודכן ל<QuotedName name={name} /></> : 'הקטגוריה עודכנה' })
    } finally {
      unlock([book.id])
    }
  }, [lock, unlock, patchLocal, toast])

  const remove = useCallback(async (book) => {
    if (pendingRef.current.has(book.id)) return
    const { bodyAfterName, ...dialog } = deleteBookDialog(book)
    const ok = await confirm({ ...dialog, body: <><QuotedName name={book.name} />{bodyAfterName}</>, tone: 'danger' })
    if (!ok || !lock([book.id])) return
    try {
      await deleteBook(book.id)
      setBooks((list) => list.filter((b) => b.id !== book.id))
      toast.show({ message: <><QuotedName name={book.name} /> נמחק</> })
    } catch (e) {
      fail(e, 'לא הצלחנו למחוק את הספר.')
    } finally {
      unlock([book.id])
    }
  }, [confirm, lock, unlock, setBooks, toast, fail])

  const download = useCallback(async (book, kind) => {
    const key = `${book.id}:${kind}`
    if (!lock([key])) return
    const id = toast.show({ tone: 'info', message: kind === 'pdf' ? <>מכין PDF של <QuotedName name={book.name} />…</> : <>מכין את הטקסט של <QuotedName name={book.name} />…</>, duration: null })
    try {
      if (kind === 'pdf') await downloadBookPdf(book, downloadFileName(book.name, '', 'pdf'))
      else await downloadBookText(book, downloadFileName(book.name, 'טקסט', 'txt'))
      toast.dismiss(id)
    } catch (e) {
      toast.dismiss(id)
      fail(e, 'לא הצלחנו להוריד את הקובץ.')
    } finally {
      unlock([key])
    }
  }, [lock, unlock, toast, fail])

  /** הרצה מרובה משותפת לפעולה ול"בטל" שלה: 4 בקשות במקביל, התקדמות, עצירה, ונעילה של הספרים */
  const runBulk = useCallback(async (action, jobs) => {
    workingRef.current = true
    setWorking(true)
    const ids = jobs.map((j) => j.book.id)
    try {
      return await runAll(jobs, async ({ book, patch }) => {
        await updateBook(book.id, patch)
        patchLocal([book.id], patch)
      }, { meta: { action } })
    } finally {
      unlock(ids)
      workingRef.current = false
      setWorking(false)
    }
  }, [runAll, patchLocal, unlock])

  /**
   * פעולה מרובה: הסתר / הצג / קטגוריה. רק על הספרים שהפעולה חלה עליהם (bulkPlan); ספר שכבר רצה עליו
   * פעולה אחרת — מדלגים עליו ואומרים. 4 בקשות במקביל (אין נקודת קצה מרובה), "X מתוך Y" ו"עצור", ובסוף
   * הודעה אחת שאומרת מה נעשה, מה דולג ולמה — עם "בטל" שמחזיר בדיוק את מה שהשתנה (גם קטגוריה קודמת של
   * כל ספר). הצגה מרובה — בלי הודעה למנויים, ולכן אפשר לבטל גם אותה.
   */
  const bulk = useCallback(async (books, action, value) => {
    if (workingRef.current || books.length === 0) return
    const plan = bulkPlan(books, action, value)
    const free = plan.targets.filter((b) => !pendingRef.current.has(b.id))
    const busy = plan.targets.length - free.length
    if (free.length > 0) lock(free.map((b) => b.id))
    const patchFor = () => (action === 'category' ? { category: value } : { isHidden: action === 'hide' })
    const run = free.length > 0
      ? await runBulk(action, free.map((book) => ({ book, patch: patchFor() })))
      : { done: [], failed: [], fatal: null, notAttempted: [] }
    // ההרשאה אבדה — ההסבר (עם "התחבר"). תקלה בשרת (נעצר) — הסיכום הרגיל ("נעצר — N לא עודכנו"), ואחריו הסיבה
    if (isAccessLost(run.fatal)) {
      fail(run.fatal)
      return
    }
    const done = run.done.map((j) => j.book)
    const result = bulkResultText(action, {
      done: done.length, failed: run.failed.length, personal: plan.personal, unchanged: plan.unchanged,
      stopped: run.notAttempted.length, busy, category: value,
    })
    // "בטל": כל ספר חוזר למה שהיה לפני הפעולה
    const undo = done.length > 0 ? {
      label: 'בטל',
      undo: true,
      onClick: async () => {
        if (workingRef.current) {
          toast.show({ tone: 'error', message: 'פעולה אחרת עוד רצה. נסה שוב כשתסתיים.' })
          return
        }
        const back = done.filter((b) => !pendingRef.current.has(b.id))
        lock(back.map((b) => b.id))
        const reverse = await runBulk('undo', back.map((book) => ({
          book,
          patch: action === 'category' ? { category: book.category || DEFAULT_CATEGORY } : { isHidden: Boolean(book.isHidden) },
        })))
        if (reverse.fatal) fail(reverse.fatal)
        else toast.show(bulkUndoText({ done: reverse.done.length, failed: reverse.failed.length + reverse.notAttempted.length }))
      },
    } : undefined
    toast.show({ tone: run.fatal ? 'error' : result.tone, message: run.fatal ? withStopReason(result.message, run.fatal) : result.message, action: undo })
    if (run.failed.length > 0) refresh()
  }, [lock, runBulk, toast, fail, refresh])

  const actions = useMemo(() => ({
    openDrawer: (book, view) => onOpenDrawer(book, view),
    openLibrary: (book) => router.push(libraryHref(book)),
    rename: (book) => onDialog('rename', book),
    changeCategory: (book) => onDialog('category', book),
    hide: (book) => setHidden(book, true),
    show: (book) => onDialog('show', book),
    remove,
    downloadText: (book) => download(book, 'text'),
    downloadPdf: (book) => download(book, 'pdf'),
    merge: (books) => onDialog('merge', books),
  }), [onOpenDrawer, router, onDialog, setHidden, remove, download])

  return { actions, setHidden, saveDetails, bulk, pending, working, bulkProgress, stopping, stopBulk, fail }
}
