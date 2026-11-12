'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { refreshAdminBadgeCounts } from '@/components/admin/shell/useAdminBadgeCounts'
import { bookScope } from '@/lib/adminUploads/uploadGroups'
import {
  bookStatusView,
  deletedForeverText,
  emptyTrashDialog,
  filesCountText,
  formatNumber,
  movedToTrashText,
  partialText,
  permanentDeleteDialog,
  restoredText,
  statusChangedText,
  statusRevertedText,
} from '@/lib/adminUploads/uploadTerms'
import { loginHref } from '@/components/admin/list/adminRequest'
import * as api from './uploadsApi'
import { combinedFilename } from './uploadRowActions'
import { announceUploadsChanged } from './useUploadsData'

const idsOf = (uploads) => uploads.map((u) => u.id)
const QUEUE = 'not_checked'

/** השרת שינה פחות ממה שנשלח (מישהו אחר כבר מחק / שינה) — רק כשהוא מחזיר את המספר */
function partial(data, field, sent) {
  const done = data?.[field]
  return typeof done === 'number' && done < sent ? done : null
}

/**
 * כל הפעולות של המסך מול השרת, עם המשוב שלהן:
 *   מחק (= העבר לאשפה) — מיד, והודעה '"חוות דעת" הועבר לאשפה · בטל' (בטל = שחזור אמיתי מהאשפה);
 *   שחזר (באשפה) — מיד, והודעה עם "בטל" (= חזרה לאשפה);
 *   מחק לצמיתות / רוקן אשפה — רק אחרי דיאלוג אישור מפורש;
 *   שינוי מצב — מיד (רק להעלאות שהמצב שלהן באמת משתנה), עם "בטל" שמחזיר לכל העלאה את המצב שהיה לה.
 *
 * צבירה: כמה מחיקות רצופות (או שחזורים, או שינויי מצב) מצטברות להודעה אחת ("3 ספרים הועברו
 * לאשפה · בטל") שה"בטל" שלה מחזיר את כולן — הודעות לא נבלעות, ו"בטל" של שינוי מצב לא דורס שינוי
 * מאוחר יותר באותו ספר (המצב שנשמר לחזרה הוא זה שלפני השינוי הראשון).
 *
 * נעילה לפי העלאה: מזהים שיש עליהם בקשה פתוחה (pending) — פעולה נוספת עליהם לא נשלחת (לחיצה כפולה,
 * שני שינויי מצב מהירים), והשורה שלהם מושבתת. working — מונה בקשות פתוחות (> 0), לא דגל אחד.
 *
 * כשל — הודעת שגיאה (role="alert") ושום דבר ברשימה לא משתנה; התחברות שפגה — עם "התחבר". כשל
 * חלקי (השרת שינה פחות ממה שנשלח) — מדווח כחלקי, והרשימה נטענת מחדש מהשרת.
 * אחרי כל שינוי — מוני הסרגל מתרעננים (refreshAdminBadgeCounts).
 *
 * onRemoved(ids) / onRestored(uploads) — להעברת הפוקוס (ההורה מחליט לאן). refresh — טעינה שקטה.
 */
export function useUploadActions({ setItems, setCounts, statuses, toast, confirm, router, onRemoved, onRestored, onMessage, refresh }) {
  const [downloading, setDownloading] = useState(() => new Set())
  const [pending, setPending] = useState(() => new Set())
  const [inFlight, setInFlight] = useState(0)
  const pendingRef = useRef(new Set())
  const batches = useRef({ trash: null, restore: null, status: null })
  // המסך שיצר הודעה עם "בטל" עלול לרדת (מעבר ללשונית אחרת) לפני שלוחצים — אז המסך הפתוח נטען מחדש
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const fail = useCallback((error) => {
    toast.show({
      tone: 'error',
      message: error?.message || 'משהו השתבש. נסה שוב.',
      action: error?.sessionExpired ? { label: 'התחבר', href: loginHref('/library/admin/uploads') } : undefined,
    })
  }, [toast])

  /**
   * מריץ בקשה על מזהים: אם על אחד מהם כבר יש בקשה — לא שולח (מחזיר { skipped: true }).
   * כשל — הודעה, ומחזיר { failed: true }.
   */
  const run = useCallback(async (ids, fn) => {
    if (ids.some((id) => pendingRef.current.has(id))) return { skipped: true }
    for (const id of ids) pendingRef.current.add(id)
    setPending(new Set(pendingRef.current))
    setInFlight((n) => n + 1)
    try {
      return { data: await fn() }
    } catch (error) {
      fail(error)
      return { failed: true }
    } finally {
      for (const id of ids) pendingRef.current.delete(id)
      setPending(new Set(pendingRef.current))
      setInFlight((n) => n - 1)
    }
  }, [fail])

  const changed = useCallback(() => {
    refreshAdminBadgeCounts()
    if (!mounted.current) announceUploadsChanged()
  }, [])

  const reportPartial = useCallback((kind, done, total) => {
    toast.show({ tone: 'error', message: partialText(kind, done, total) })
    refresh?.()
  }, [toast, refresh])

  const removeLocal = useCallback((uploads) => {
    const ids = new Set(idsOf(uploads))
    setItems((list) => list.filter((u) => !ids.has(u.id)))
  }, [setItems])

  const addLocal = useCallback((uploads) => {
    setItems((list) => {
      const have = new Set(list.map((u) => u.id))
      return [...list, ...uploads.filter((u) => !have.has(u.id))]
    })
  }, [setItems])

  // מונה שלא ידוע (null) נשאר לא ידוע
  const shift = useCallback((from, to, n) => {
    setCounts((c) => ({
      ...c,
      [from]: c[from] === null ? null : Math.max(0, c[from] - n),
      [to]: c[to] === null ? null : c[to] + n,
    }))
  }, [setCounts])

  /** הודעה מצטברת לסוג פעולה: מוסיף לצבירה הפתוחה (אם ההודעה שלה עוד על המסך) ומעדכן אותה במקום */
  const showBatch = useCallback((kind, add, render) => {
    const current = batches.current[kind]
    const batch = add(current ?? { toastId: undefined, uploads: [] })
    batches.current[kind] = batch
    batch.toastId = toast.show({
      id: batch.toastId,
      ...render(batch),
      onDismiss: () => { if (batches.current[kind] === batch) batches.current[kind] = null },
    })
  }, [toast])

  // ----- מחק (העבר לאשפה) ושחזר — כל אחד הוא ה"בטל" של השני -----

  const moveBetween = useCallback(async (uploads, { kind, call, field, from, to, sentence, undoSentence, undoCall }) => {
    const moved = uploads.map((u) => ({ ...u }))
    const ids = idsOf(moved)
    const result = await run(ids, () => call(ids))
    if (!result.data) return
    onRemoved?.(ids)
    removeLocal(moved)
    shift(from, to, moved.length)
    changed()
    const done = partial(result.data, field, ids.length)
    if (done !== null) {
      reportPartial(kind, done, ids.length)
      return
    }
    showBatch(kind, (batch) => ({ ...batch, uploads: [...batch.uploads, ...moved] }), (batch) => ({
      message: sentence(bookScope(batch.uploads)),
      action: {
        label: 'בטל',
        undo: true,
        onClick: async () => {
          const back = batch.uploads
          const undo = await run(idsOf(back), () => undoCall(idsOf(back)))
          if (!undo.data) return
          // שחזור לאשפה מקבל תאריך מחיקה חדש בשרת — כך גם כאן, כדי שהשורה תמוין ותוצג נכון
          addLocal(kind === 'restore' ? back.map((u) => ({ ...u, deletedAt: new Date().toISOString() })) : back)
          shift(to, from, back.length)
          onRestored?.(back)
          changed()
          toast.show({ message: undoSentence(bookScope(back)) })
        },
      },
    }))
  }, [run, onRemoved, removeLocal, shift, changed, reportPartial, showBatch, addLocal, onRestored, toast])

  const trash = useCallback((uploads) => moveBetween(uploads, {
    kind: 'trash', call: api.moveToTrash, field: 'modifiedCount', from: 'uploads', to: 'trash',
    sentence: movedToTrashText, undoSentence: restoredText, undoCall: api.restoreFromTrash,
  }), [moveBetween])

  const restore = useCallback((uploads) => moveBetween(uploads, {
    kind: 'restore', call: api.restoreFromTrash, field: 'modifiedCount', from: 'trash', to: 'uploads',
    sentence: restoredText, undoSentence: movedToTrashText, undoCall: api.moveToTrash,
  }), [moveBetween])

  // ----- מחיקה לצמיתות — רק אחרי אישור -----

  const deleteForever = useCallback(async (uploads) => {
    const scope = bookScope(uploads)
    if (!(await confirm({ ...permanentDeleteDialog(scope), tone: 'danger' }))) return
    const ids = idsOf(uploads)
    const result = await run(ids, () => api.deleteForever(ids))
    if (!result.data) return
    onRemoved?.(ids)
    removeLocal(uploads)
    setCounts((c) => ({ ...c, trash: c.trash === null ? null : Math.max(0, c.trash - uploads.length) }))
    changed()
    const done = partial(result.data, 'deletedCount', ids.length)
    if (done !== null) reportPartial('deleteForever', done, ids.length)
    else toast.show({ message: deletedForeverText(scope) })
  }, [confirm, run, onRemoved, removeLocal, setCounts, changed, reportPartial, toast])

  const emptyTrash = useCallback(async (all, { filtered = false } = {}) => {
    if (!(await confirm({ ...emptyTrashDialog(all.length, { filtered }), tone: 'danger' }))) return
    const result = await run(idsOf(all), () => api.emptyTrash())
    if (!result.data) return
    const deleted = typeof result.data.deletedCount === 'number' ? result.data.deletedCount : all.length
    onRemoved?.(idsOf(all))
    setItems([])
    setCounts((c) => ({ ...c, trash: 0 }))
    changed()
    toast.show({ message: deletedForeverText({ books: 0, uploads: deleted }) })
  }, [confirm, run, onRemoved, setItems, setCounts, changed, toast])

  // ----- מצב הספר -----

  const setStatus = useCallback(async (uploads, value) => {
    // רק מה שבאמת משתנה: השרת סופר שינויים, ו"בטל" מחזיר רק אותם
    const target = uploads.filter((u) => (u.bookStatus || QUEUE) !== value)
    if (target.length === 0) return
    const ids = idsOf(target)
    const result = await run(ids, () => api.setBookStatus(ids, value))
    if (!result.data) return
    const idSet = new Set(ids)
    setItems((list) => list.map((u) => (idSet.has(u.id) ? { ...u, bookStatus: value } : u)))
    changed()
    const done = partial(result.data, 'modifiedCount', ids.length)
    if (done !== null) {
      reportPartial('status', done, ids.length)
      return
    }
    showBatch('status', (batch) => {
      // המצב לחזרה — זה שלפני השינוי הראשון בצבירה
      const before = new Map(batch.before || [])
      for (const u of target) if (!before.has(u.id)) before.set(u.id, u.bookStatus || QUEUE)
      const values = new Set(batch.values || [])
      values.add(value)
      return { ...batch, before, values, uploads: [...batch.uploads.filter((u) => !idSet.has(u.id)), ...target] }
    }, (batch) => {
      const label = batch.values.size === 1 ? bookStatusView(value, statuses).label : null
      return {
        message: statusChangedText(label, bookScope(batch.uploads)),
        action: {
          label: 'בטל',
          undo: true,
          onClick: async () => {
            // כל העלאה חוזרת למצב שהיה לה — קריאה אחת לכל מצב קודם
            const byStatus = new Map()
            for (const [id, prev] of batch.before) byStatus.set(prev, [...(byStatus.get(prev) || []), id])
            const all = [...batch.before.keys()]
            const undo = await run(all, () => Promise.all([...byStatus].map(([prev, list]) => api.setBookStatus(list, prev))))
            if (!undo.data) return
            setItems((list) => list.map((u) => (batch.before.has(u.id) ? { ...u, bookStatus: batch.before.get(u.id) } : u)))
            changed()
            toast.show({ message: statusRevertedText(bookScope(batch.uploads)) })
          },
        },
      }
    })
  }, [run, setItems, changed, reportPartial, showBatch, statuses, toast])

  // ----- הורדה -----

  const download = useCallback((upload) => api.downloadUpload(upload), [])

  const downloadCombined = useCallback(async (uploads, group, key = group?.key || 'selection') => {
    setDownloading((s) => new Set(s).add(key))
    try {
      await api.downloadCombined(idsOf(uploads), combinedFilename(group?.title || `${filesCountText(uploads.length)} מההעלאות`))
    } catch (e) {
      fail(e)
    } finally {
      setDownloading((s) => {
        const next = new Set(s)
        next.delete(key)
        return next
      })
    }
  }, [fail])

  // ----- עותק עריכה -----

  const openEditCopy = useCallback((id) => router.push(`/library/admin/uploads/edit/${id}`), [router])

  const createEditCopy = useCallback(async (group) => {
    const ok = await confirm({
      title: 'ליצור עותק עריכה?',
      body: `העותק של "${group.title}" נוצר ${group.uploads.length === 1 ? 'מהקובץ של הספר' : `מכל ${formatNumber(group.uploads.length)} הקבצים של הספר`}, ואפשר לערוך אותו בעורך. הוא לא מתעדכן כשמגיעות העלאות חדשות לספר.`,
      confirmLabel: 'צור עותק',
    })
    if (!ok) return
    const ids = idsOf(group.uploads)
    const result = await run(ids, () => api.createEditCopy(ids, group.base))
    if (!result.data) return
    const editCopyId = result.data
    const idSet = new Set(ids)
    setItems((list) => list.map((u) => (idSet.has(u.id) ? { ...u, editCopy: editCopyId, editCopyCreatedAt: new Date().toISOString() } : u)))
    toast.show({
      message: `נוצר עותק עריכה של "${group.title}"`,
      action: editCopyId ? { label: 'ערוך עותק', onClick: () => openEditCopy(editCopyId) } : undefined,
    })
  }, [confirm, run, setItems, toast, openEditCopy])

  const actions = useMemo(() => ({
    trash, restore, deleteForever, emptyTrash, setStatus, download, downloadCombined, openEditCopy, createEditCopy,
    message: onMessage,
    isDownloading: (key) => downloading.has(key),
  }), [trash, restore, deleteForever, emptyTrash, setStatus, download, downloadCombined, openEditCopy, createEditCopy, onMessage, downloading])

  return { actions, working: inFlight > 0, pending }
}
