'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildView, validateOp } from '@/lib/pageProof/ops'

// מצב העורך: רשימת הפעולות (החוזה §3) היא מקור-האמת היחיד; התצוגה מחושבת
// ממנה מחדש (buildView). Undo = הסרת הפעולה האחרונה, Redo = החזרתה.
// טיוטה נשמרת בדפדפן לכל עמוד, כדי שרענון/סגירה לא יאבדו עבודה.

const draftKey = (pageId) => `page-proof-draft:${pageId}`

function loadDraft(pageId) {
  try {
    const raw = window.localStorage.getItem(draftKey(pageId))
    const d = raw ? JSON.parse(raw) : null
    return Array.isArray(d?.ops) ? d.ops : null
  } catch {
    return null
  }
}

export function clearDraft(pageId) {
  try {
    window.localStorage.removeItem(draftKey(pageId))
  } catch {
    /* אחסון חסום — אין מה לנקות */
  }
}

export function useProofEditor({ pageId, baseDoc, initialOps = null, readOnly = false, persist = true }) {
  // המצב ההתחלתי נקבע פעם אחת לכל מופע — העורך מקבל key לפי העמוד, כך
  // שעמוד אחר = מופע חדש. טיוטה משוחזרת רק בעריכה, ורק אם לא הגיעו פעולות
  // מבחוץ (הגשה קיימת / סקירת מנהל).
  const [init] = useState(() => {
    if (!readOnly && persist && !initialOps) {
      const d = loadDraft(pageId)
      if (d?.length) return { ops: d, restored: true }
    }
    return { ops: initialOps || [], restored: false }
  })
  const [ops, setOps] = useState(init.ops)
  const [redo, setRedo] = useState([])
  const [restored, setRestored] = useState(init.restored)
  // בחירה: שורות (מזהים) + טווח-מילים בשורה הראשונה + מסגרת
  const [sel, setSel] = useState({ ids: [], words: null, fid: null })
  const [error, setError] = useState(null)

  useEffect(() => {
    if (readOnly || !persist) return
    try {
      if (ops.length) window.localStorage.setItem(draftKey(pageId), JSON.stringify({ ops, at: Date.now() }))
      else window.localStorage.removeItem(draftKey(pageId))
    } catch {
      /* אחסון מלא/חסום — הטיוטה פשוט לא נשמרת */
    }
  }, [ops, pageId, readOnly, persist])

  const view = useMemo(() => buildView(baseDoc, ops), [baseDoc, ops])

  // הוספת פעולה (או כמה, כפעולת-Undo אחת לכל אחת). נבדקת מול העמוד המקורי
  // — אותה בדיקה שהשרת יריץ בהגשה.
  const push = useCallback(
    (...newOps) => {
      if (readOnly) return false
      for (const op of newOps) {
        const e = validateOp(baseDoc, op)
        if (e) {
          setError(e)
          return false
        }
      }
      setError(null)
      // כמה פעולות שנוצרו מלחיצה אחת (למשל "מסגרות מהזיהוי" = frames_set +
      // frame_seq לכל מסגרת) מקבלות קבוצה אחת — Ctrl+Z אחד מבטל את כולן.
      // _g אינו חלק מהחוזה; השרת בונה את הפעולות מחדש בלי שדות פנימיים.
      const g = newOps.length > 1 ? `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` : undefined
      setOps((o) => [...o, ...newOps.map((op) => (g ? { ...op, _g: g } : op))])
      setRedo([])
      return true
    },
    [baseDoc, readOnly]
  )

  // מספר הפעולות בקבוצה האחרונה (1 לפעולה בודדת)
  const tailSize = (list) => {
    const last = list[list.length - 1]
    if (!last?._g) return 1
    let n = 0
    for (let i = list.length - 1; i >= 0 && list[i]._g === last._g; i--) n++
    return n
  }

  // בלי setState בתוך updater של setState אחר (ב-StrictMode הוא רץ פעמיים)
  const undo = useCallback(() => {
    if (readOnly || !ops.length) return
    const n = tailSize(ops)
    setRedo((r) => [...r, ops.slice(-n)])
    setOps(ops.slice(0, -n))
  }, [readOnly, ops])

  const redoOne = useCallback(() => {
    if (readOnly || !redo.length) return
    const group = redo[redo.length - 1]
    setOps((o) => [...o, ...group])
    setRedo(redo.slice(0, -1))
  }, [readOnly, redo])

  const removeAt = useCallback(
    (i) => {
      if (readOnly) return
      setOps((o) => o.filter((_, k) => k !== i))
      setRedo([])
    },
    [readOnly]
  )

  const reset = useCallback(() => {
    setOps([])
    setRedo([])
    setRestored(false)
  }, [])

  return {
    ops,
    view,
    push,
    undo,
    redo: redoOne,
    canUndo: ops.length > 0,
    canRedo: redo.length > 0,
    removeAt,
    reset,
    sel,
    setSel,
    error,
    setError,
    restored,
    readOnly,
  }
}
