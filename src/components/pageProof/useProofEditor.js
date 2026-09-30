'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { buildView, tempLineId, validateOp } from '@/lib/pageProof/ops'
import { segOkState } from '@/lib/pageProof/textModel'

// מצב העורך: רשימת הפעולות (החוזה §3) היא מקור-האמת היחיד; התצוגה מחושבת
// ממנה מחדש (buildView).
//
// • ביטול/חזרה: כל צעד (push, removeWhere, removeAt) שומר צילום של הרשימה
//   שלפניו; Ctrl+Z חוזר לצילום האחרון, Ctrl+Y קדימה. כך גם ביטול-אישור של
//   פסקה (removeWhere) חוזר ב-Ctrl+Z — ולא מבטל במקומו תיקון ישן שלא קשור.
//   בלי צילומים (טיוטה ששוחזרה, הגשה שנפתחה לעריכה) — Ctrl+Z מסיר את הפעולה
//   (או הקבוצה) האחרונה ברשימה.
// • קבוצות: כמה פעולות שנשלחות ב-push אחד (למשל אישור פסקה = line_ok לכל
//   שורה) מקבלות _g משותף — צעד-ביטול אחד.
// • צבירת-הקלדה: push(op, {coalesceKey}) — הקלדה רצופה באותה שורה (פחות מ-2
//   שניות בין הקשות) *מחליפה* את פעולת-הטקסט הקודמת במקום להוסיף עוד אחת,
//   כך ש-Ctrl+Z מבטל "משפט" ולא אות. פרץ שחזר בדיוק לטקסט שלפניו (הקלדה
//   ומחיקה מיד) — יורד כולו, עם צעד-הביטול שלו: הוא לא שינה דבר.
//   _c/_t/_from הם שדות פנימיים.
// • פעולות מקומיות (_local: true — חצי-אישור של שורה שמתחלקת בין שתי פסקאות,
//   textModel.SEG_OK): נשמרות ברשימה (בשביל Undo והטיוטה) אבל אינן בתצוגה
//   ואינן יוצאות מהדפדפן — ops (ההגשה, רשימת השינויים) הוא בלעדיהן.
// • removeWhere(pred) — הסרה בעדכון-מצב אחד (ביטול אישור פסקה): pred מחזיר
//   true (להסיר), false (להשאיר) או מערך מזהי-שורות להוצאה מהפעולה. pred.add
//   (רשות) — פעולות שנוספות באותו צעד (flowEdit.unapproveMatcher: חצי-אישור
//   לפסקה השכנה שנשארת מאושרת).
// • טיוטה נשמרת בדפדפן במפתח draftKey (lib/pageProof/drafts.js — לפי העמוד
//   והגרסה שלו), כדי שרענון/סגירה לא יאבדו עבודה.
// • שדות-עזר בתצוגה: _segOk/_segOkOf (חצאי-האישור), _preOk (במעבר שני: שורות
//   שאושרו בסבב הקודם — status ok/fixed בעמוד שיובא, בלי recheck), ו-
//   _textEdited יורד משורה שהטקסט שלה חזר בדיוק לזה שיובא.
//
// לדף עוטף ששומר בשרת כל צעד בנפרד (תוכנת-הספר) — רשות, ובלעדיהן הכול כמו באתר:
// • מזהה-צעד (_s): כל push (וכל צעד של removeWhere שמוסיף פעולות) מקבל מזהה משלו,
//   משותף לכל הפעולות שבו. גם הקלדה מצטברת מקבלת מזהה חדש בכל הקשה (הפרץ הוא
//   פעולה אחת, שמתחלפת).
// • flushable({all, skip}) — מה שעוד לא נשלח: הפעולות שאינן מקומיות, בצעדים לפי
//   הסדר ({sid, ops, tmp} — tmp = המזהים הזמניים שכל פעולת-חיתוך יוצרת בתצוגה).
//   פרץ-הקלדה פתוח (ההקשה האחרונה לפני פחות מ-COALESCE_MS) נשאר בחוץ, אלא אם all;
//   skip = מזהי-צעדים שכבר בדרך לשרת.
// • rebase(doc, {drop, idMap}) — השרת החיל צעדים והחזיר את העמוד מחדש: doc הוא
//   העמוד החדש שמולו העורך עובד (baseDoc נשמר במצב; prop חדש גובר); drop = מזהי-
//   הצעדים (או הפעולות עצמן) שנשלחו — יורדים מהרשימה. מה שנוסף בזמן השליחה נשאר
//   ונבדק שוב מול העמוד החדש (פעולה שכבר אינה תקינה יורדת ומדווחת — dropped);
//   פעולות מקומיות נשארות אם השורות שלהן עוד בעמוד; ההיסטוריה המקומית מתאפסת.
//   מחזיר {dropped, idMap, textOf}: idMap = מזהה-שורה ישן ← חדש (הזמניים שהשרת
//   מיפה, ומזהים זמניים של חיתוך שנשאר מקומי ומקומו ברשימה זז), textOf(id) = הטקסט
//   של השורה בתצוגה החדשה — בשביל הסמן (ProofEditor).
// • preOkFromStatus — שורות ok/fixed בעמוד נחשבות מאושרות תמיד (לא רק במעבר שני):
//   אחרי שמירה העמוד חוזר מהשרת עם האישורים כמצב, בלי פעולת line_ok מקומית.
//
// כל השדות שמתחילים ב-_ אינם חלק מהחוזה; ההגשה והשרת מנקים אותם (cleanOps).

export const COALESCE_MS = 2000
// מספר צעדי-הביטול שנשמרים (צילום = מערך של הפניות לאותן פעולות — זול)
export const HISTORY_LIMIT = 300
// כמה שורות זמניות יוצרת כל פעולת-חיתוך בתצוגה (ops.applyOp: tempLineId(i, k))
export const TMP_LINES = Object.freeze({ line_split: 2, line_merge: 1, line_add: 1 })

function loadDraft(key) {
  try {
    const raw = window.localStorage.getItem(key)
    const d = raw ? JSON.parse(raw) : null
    return Array.isArray(d?.ops) ? d.ops.filter((o) => o && typeof o === 'object') : null
  } catch {
    return null
  }
}

// האם הארגומנט האחרון של push הוא אפשרויות ולא פעולה
const isOptions = (x) => !!x && typeof x === 'object' && !Array.isArray(x) && !('kind' in x)

let groupSeq = 0
const newGroup = () => `g${Date.now().toString(36)}${(groupSeq++).toString(36)}`
let stepSeq = 0
const newStep = () => `s${Date.now().toString(36)}${(stepSeq++).toString(36)}`

const lineTextOf = (l) => String(l?.text ?? l?.text_ocr ?? '')

// הרשימה אחרי שהשרת החיל חלק ממנה (rebase) — טהור. drop = Set של מזהי-צעדים ו/או
// פעולות שנשלחו. מחזיר {kept, dropped: [{op, error}], shift: {מזהה-זמני-ישן: חדש}}:
// • מה שנשלח — יורד; פעולה מקומית — נשארת אם השורות שלה עוד בעמוד;
// • כל השאר נבדק מול העמוד החדש: לא תקינה — יורדת ומדווחת; תיקון-טקסט שכבר זהה
//   לטקסט בעמוד — יורד בשקט (אין מה לשמור);
// • פעולת-חיתוך שנשארת ומקומה ברשימה זז — המזהים הזמניים של שורותיה זזים איתה.
export function rebaseOps(doc, all, drop) {
  const gone = drop instanceof Set ? drop : new Set(drop || [])
  const ids = new Set((doc?.lines || []).map((l) => l?.id))
  const text = new Map((doc?.lines || []).map((l) => [l?.id, lineTextOf(l)]))
  const kept = []
  const dropped = []
  const shift = {}
  let oldIdx = -1
  let newIdx = -1
  for (const op of all || []) {
    if (!op || typeof op !== 'object') continue
    if (!op._local) oldIdx++
    if (gone.has(op) || (op._s && gone.has(op._s))) continue
    if (op._local) {
      if ((op.ids || []).every((id) => ids.has(id))) kept.push(op)
      continue
    }
    const e = validateOp(doc, op)
    if (e) {
      dropped.push({ op, error: e })
      continue
    }
    if (op.kind === 'text' && Array.isArray(op.ids) && op.ids.length === 1 && text.get(op.ids[0]) === op.value) continue
    newIdx++
    const n = TMP_LINES[op.kind] || 0
    for (let k = 0; k < n && oldIdx !== newIdx; k++) shift[tempLineId(oldIdx, k)] = tempLineId(newIdx, k)
    kept.push(op)
  }
  return { kept, dropped, shift }
}

// היסט-הסמן בשורה שהטקסט שלה השתנה רק ברווחים (השרת מכווץ רווחים ומסיר רווח בקצוות):
// אותו מספר תווים שאינם רווח לפני הסמן, ואחרי רווח — גם אחרי הרווח שנשאר (אם נשאר)
export function mapCaretOffset(oldText, newText, offset) {
  const a = String(oldText ?? '')
  const b = String(newText ?? '')
  const off = Math.max(0, Math.min(Number(offset) || 0, a.length))
  if (a === b) return off
  let n = 0
  for (let i = 0; i < off; i++) if (!/\s/.test(a[i])) n++
  let j = 0
  for (let m = 0; j < b.length && m < n; j++) if (!/\s/.test(b[j])) m++
  if (off > 0 && /\s/.test(a[off - 1]) && j < b.length && /\s/.test(b[j])) j++
  return Math.min(j, b.length)
}

// מספר הפעולות בקבוצה האחרונה (1 לפעולה בודדת)
function tailSize(list) {
  const last = list[list.length - 1]
  if (!last?._g) return 1
  let n = 0
  for (let i = list.length - 1; i >= 0 && list[i]._g === last._g; i--) n++
  return n
}

const trimPast = (past) => (past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past)

// הפעולות שנוספו או ירדו בין שני מצבים (לפי זהות) — לאן הסמן עובר אחרי ביטול/חזרה
function changedOps(a, b) {
  const inA = new Set(a)
  const inB = new Set(b)
  return [...a.filter((o) => !inB.has(o)), ...b.filter((o) => !inA.has(o))]
}

const lineTextIn = (view, id) => {
  const l = (view?.lines || []).find((x) => x?.id === id)
  return l ? String(l.text ?? '') : null
}

const PRE_OK_STATUS = new Set(['ok', 'fixed'])

export function useProofEditor({ baseDoc, initialOps = null, readOnly = false, persist = true, draftKey = null, preOkFromStatus = false }) {
  const storageKey = !readOnly && persist && draftKey ? draftKey : null
  // העמוד שמולו העורך עובד: ה-prop, או — אחרי rebase — העמוד שהשרת החזיר. prop חדש גובר (from)
  const [rebased, setRebased] = useState(null)
  const base = rebased && rebased.from === baseDoc ? rebased.doc : baseDoc

  // המצב ההתחלתי נקבע פעם אחת לכל מופע — העורך מקבל key לפי העמוד והגרסה,
  // כך שעמוד אחר = מופע חדש. טיוטה משוחזרת רק בעריכה, ורק אם לא הגיעו
  // פעולות מבחוץ (הגשה קיימת / סקירת מנהל).
  const [init] = useState(() => {
    if (storageKey && !initialOps) {
      const d = loadDraft(storageKey)
      if (d?.length) return { ops: d, restored: true }
    }
    return { ops: Array.isArray(initialOps) ? initialOps : [], restored: false }
  })
  // h.all — הרשימה; h.past / h.future — צילומים לביטול ולחזרה; h.burst — מפתח
  // פרץ-ההקלדה הפתוח (null: הצעד הבא אינו ממשיך צבירה — אחרי ביטול, חזרה,
  // הסרה או פעולה אחרת)
  const [h, setH] = useState(() => ({ all: init.ops, past: [], future: [], burst: null }))
  const all = h.all
  // המצב האחרון שהוצג — ל-flushable/rebase, שנקראים מבחוץ (טיימר, תשובת-שרת) ולא מתוך רינדור
  const hRef = useRef(h)
  useLayoutEffect(() => {
    hRef.current = h
  }, [h])
  const [restored, setRestored] = useState(init.restored)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!storageKey) return
    try {
      if (all.length) window.localStorage.setItem(storageKey, JSON.stringify({ ops: all, at: Date.now() }))
      else window.localStorage.removeItem(storageKey)
    } catch {
      /* אחסון מלא/חסום — הטיוטה פשוט לא נשמרת */
    }
  }, [all, storageKey])

  const ops = useMemo(() => all.filter((o) => !o._local), [all])

  const baseText = useMemo(() => new Map((base?.lines || []).map((l) => [l?.id, lineTextOf(l)])), [base])
  // מעבר שני (בעמוד יש שורות שזוהו מחדש — recheck): השורות שאושרו בסבב הראשון
  // חוזרות מתוכנת-הספר עם status ok/fixed (= טקסט שאדם בדק), והן כבר מאושרות —
  // רק השורות שזוהו מחדש מחכות לבדיקה. במעבר ראשון לא: שם אין שום "שארית"
  // שהמתנדב אמור לבדוק, ועמוד שכולו "מאושר" לא היה ניתן להגשה בלי שינוי.
  // preOkFromStatus (דף עוטף ששומר כל צעד) — תמיד: אישור שכבר נשמר חוזר כמצב של השורה.
  const preOk = useMemo(() => {
    const lines = (base?.lines || []).filter(Boolean)
    if (!preOkFromStatus && !lines.some((l) => l.recheck === true && l.status !== 'removed')) return new Set()
    return new Set(lines.filter((l) => PRE_OK_STATUS.has(l.status) && l.recheck !== true).map((l) => l.id))
  }, [base, preOkFromStatus])

  const view = useMemo(() => {
    const v = buildView(base, ops)
    const s = segOkState(base, all)
    // שורה שהטקסט שלה חזר בדיוק לזה שיובא (תיקון ומחיקתו) אינה "מתוקנת": בהגשה
    // התיקונים שלה נדחסים לכלום, והיא צריכה להישאר בין השורות שעוד לא נבדקו
    const lines = v.lines.map((l) => (l._textEdited && baseText.get(l.id) === String(l.text ?? '') ? { ...l, _textEdited: false } : l))
    return { ...v, lines, _segOk: s.keys, _segOkOf: s.byOp, _preOk: preOk }
  }, [base, ops, all, baseText, preOk])

  // התצוגה העדכנית בשביל push (הטקסט שלפני פרץ-הקלדה)
  const viewRef = useRef(view)
  useLayoutEffect(() => {
    viewRef.current = view
  }, [view])

  // הוספת פעולה או כמה (צעד-ביטול אחד). נבדקות מול העמוד המקורי — אותה
  // בדיקה שהשרת יריץ בהגשה. הארגומנט האחרון יכול להיות {coalesceKey}.
  const push = useCallback(
    (...args) => {
      if (readOnly) return false
      const list = args.filter((a) => a != null)
      const opts = list.length && isOptions(list[list.length - 1]) ? list.pop() : null
      if (!list.length) return false
      for (const op of list) {
        if (op._local) continue
        const e = validateOp(base, op)
        if (e) {
          setError(e)
          return false
        }
      }
      setError(null)
      const key = typeof opts?.coalesceKey === 'string' ? opts.coalesceKey : null
      const now = Date.now()
      const g = list.length > 1 ? newGroup() : null
      const s = newStep()
      const single = key && list.length === 1 ? list[0] : null
      // הטקסט של השורה לפני הפעולה — אם זו תחילת פרץ, הפרץ "חוזר לכלום" כשהוא שווה לו
      const from = single?.kind === 'text' ? lineTextIn(viewRef.current, single.ids?.[0]) : null
      const tagged = list.map((op) => {
        let o = g ? { ...op, _g: g, _s: s } : { ...op, _s: s }
        if (key) o = { ...o, _c: key, _t: now }
        return o
      })
      setH((cur) => {
        const last = cur.all[cur.all.length - 1]
        if (single && cur.burst === key && last && !last._g && last._c === key && now - (last._t || 0) < COALESCE_MS) {
          const merged = last._from !== undefined ? { ...tagged[0], _from: last._from } : tagged[0]
          if (merged.kind === 'text' && typeof merged._from === 'string' && merged.value === merged._from) {
            // הפרץ חזר לטקסט שלפניו — יורד כולו, עם צעד-הביטול שלו
            const prev = cur.past.length ? cur.past[cur.past.length - 1] : cur.all.slice(0, -1)
            return { all: prev, past: cur.past.slice(0, -1), future: [], burst: null }
          }
          return { ...cur, all: [...cur.all.slice(0, -1), merged], future: [] }
        }
        const added = single && typeof from === 'string' ? [{ ...tagged[0], _from: from }] : tagged
        return { all: [...cur.all, ...added], past: trimPast([...cur.past, cur.all]), future: [], burst: single ? key : null }
      })
      return true
    },
    [base, readOnly]
  )

  // בלי setState בתוך updater של setState אחר (ב-StrictMode הוא רץ פעמיים).
  // מחזירים {ops: הפעולות שבוטלו/חזרו, all: הרשימה המלאה אחרי} — העורך מציב
  // לפיהם את הסמן במקום שהשתנה (או null כשאין מה לבטל).
  const undo = useCallback(() => {
    if (readOnly) return null
    let prev
    let past
    if (h.past.length) {
      prev = h.past[h.past.length - 1]
      past = h.past.slice(0, -1)
    } else if (h.all.length) {
      prev = h.all.slice(0, -tailSize(h.all))
      past = []
    } else {
      return null
    }
    setH({ all: prev, past, future: [...h.future, h.all], burst: null })
    return { ops: changedOps(h.all, prev), all: prev }
  }, [readOnly, h])

  const redo = useCallback(() => {
    if (readOnly || !h.future.length) return null
    const next = h.future[h.future.length - 1]
    setH({ all: next, past: trimPast([...h.past, h.all]), future: h.future.slice(0, -1), burst: null })
    return { ops: changedOps(h.all, next), all: next }
  }, [readOnly, h])

  // הסרת הפעולה ה-i ברשימת השינויים (ops — בלי המקומיות); צעד-ביטול משלה
  const removeAt = useCallback(
    (i) => {
      if (readOnly) return
      const target = ops[i]
      if (!target) return
      setH((cur) => (cur.all.includes(target) ? { all: cur.all.filter((x) => x !== target), past: trimPast([...cur.past, cur.all]), future: [], burst: null } : cur))
    },
    [readOnly, ops]
  )

  const removeWhere = useCallback(
    (pred) => {
      if (readOnly || typeof pred !== 'function') return
      // פעולות שנוספות באותו צעד: מקומיות, או תקינות מול העמוד — עם מזהה-צעד משותף
      const s = newStep()
      const add = (Array.isArray(pred.add) ? pred.add : [])
        .filter((o) => o && typeof o === 'object' && (o._local || !validateOp(base, o)))
        .map((o) => ({ ...o, _s: s }))
      setH((cur) => {
        let changed = false
        const out = []
        for (const op of cur.all) {
          const r = pred(op)
          if (r === true) {
            changed = true
            continue
          }
          if (Array.isArray(r) && r.length && Array.isArray(op.ids)) {
            const drop = new Set(r)
            const ids = op.ids.filter((id) => !drop.has(id))
            changed = true
            if (ids.length) out.push({ ...op, ids })
            continue
          }
          out.push(op)
        }
        if (!changed && !add.length) return cur
        return { all: add.length ? [...out, ...add] : out, past: trimPast([...cur.past, cur.all]), future: [], burst: null }
      })
    },
    [readOnly, base]
  )

  // אחרי הגשה: הכול מתאפס (בלי ביטול)
  const reset = useCallback(() => {
    setH({ all: [], past: [], future: [], burst: null })
    setRestored(false)
  }, [])

  // מה שעוד לא נשלח לשרת, בצעדים (ראו למעלה). פעולה בלי מזהה-צעד (טיוטה, initialOps) — צעד משלה
  const flushable = useCallback(({ all: everything = false, skip = null } = {}) => {
    const cur = hRef.current
    const last = cur.all[cur.all.length - 1]
    const open =
      !everything && cur.burst && last && !last._local && !last._g && last._c === cur.burst && Date.now() - (last._t || 0) < COALESCE_MS ? last : null
    const steps = []
    let i = -1
    for (const op of cur.all) {
      if (!op || op._local) continue
      i++
      if (op === open) continue
      const sid = op._s || `op${i}`
      if (skip && typeof skip.has === 'function' && skip.has(sid)) continue
      const n = TMP_LINES[op.kind] || 0
      const tmp = n ? Array.from({ length: n }, (_, k) => tempLineId(i, k)) : null
      const prev = steps[steps.length - 1]
      if (prev && prev.sid === sid) {
        prev.ops.push(op)
        prev.tmp.push(tmp)
      } else {
        steps.push({ sid, ops: [op], tmp: [tmp] })
      }
    }
    return { steps, held: open ? 1 : 0 }
  }, [])

  // השרת החיל צעדים והחזיר את העמוד — ראו למעלה. עדכון-מצב אחד (העמוד והרשימה יחד)
  const rebase = useCallback(
    (doc, { drop = [], idMap = null } = {}) => {
      if (readOnly || !doc || !Array.isArray(doc.lines)) return null
      const gone = new Set(drop || [])
      const cur = hRef.current
      const plan = rebaseOps(doc, cur.all, gone)
      const next = { all: plan.kept, past: [], future: [], burst: null }
      setRebased({ from: baseDoc, doc })
      // בין הקריאה לרינדור נוספה פעולה (אירוע באותו פריים) — מחשבים שוב על הרשימה העדכנית
      setH((x) => (x === cur ? next : { all: rebaseOps(doc, x.all, gone).kept, past: [], future: [], burst: null }))
      // flushable מיד אחרי rebase (לפני הרינדור) כבר לא רואה את מה שנשלח
      hRef.current = next
      const map = {}
      for (const [k, v] of Object.entries(idMap || {})) {
        const a = Number(k)
        const b = Number(v)
        if (Number.isInteger(a) && Number.isInteger(b)) map[a] = b
      }
      for (const [k, v] of Object.entries(plan.shift)) map[Number(k)] = v
      let after = null
      const textOf = (id) => {
        if (!after) after = buildView(doc, plan.kept.filter((o) => !o._local))
        const l = after.lines.find((x) => x.id === id)
        return l ? String(l.text ?? '') : null
      }
      return { dropped: plan.dropped, idMap: map, textOf, kept: plan.kept.length }
    },
    [readOnly, baseDoc]
  )

  // push יציב לאורך חיי המופע (לרכיבים ממוזכרים — הסריקה, העורך)
  const pushRef = useRef(push)
  useEffect(() => {
    pushRef.current = push
  }, [push])
  const stablePush = useCallback((...args) => pushRef.current(...args), [])

  return {
    ops,
    allOps: all,
    view,
    // העמוד שמולו העורך עובד (ה-prop, או מה שהשרת החזיר ב-rebase)
    baseDoc: base,
    push: stablePush,
    undo,
    redo,
    canUndo: h.past.length > 0 || all.length > 0,
    canRedo: h.future.length > 0,
    removeAt,
    removeWhere,
    reset,
    flushable,
    rebase,
    error,
    setError,
    restored,
    readOnly,
  }
}
