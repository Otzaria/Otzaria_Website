'use client'

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { buildView, recutLineIds, validateOp } from '@/lib/pageProof/ops'
import { historyCaret } from '@/lib/pageProof/historyCaret'
import { streamChoices, untouchedLineIds, replaceWord, viewStats } from '@/lib/pageProof/view'
import { isFurnitureStream, keepHeading, streamInfo } from '@/lib/pageProof/vocab'
import { streamTabs, paragraphApproval, pageApproval, buildParagraphs, selectionToLineRanges, tokenize, FURNITURE_TAB, FURNITURE_TAB_HE } from '@/lib/pageProof/textModel'
import {
  HINTS,
  caretInfo,
  isCollapsed,
  linkBadge,
  linkEndpoints,
  nextAfterApprove,
  nextSuspicious,
  paragraphIndexAt,
  planApprove,
  planCharStyle,
  planEnter,
  planJoin,
  planJoinPara,
  planParaStyle,
  samePos,
  suspiciousWords,
  unapproveMatcher,
} from '@/lib/pageProof/flowEdit'
import { hasSuggestions } from '@/lib/pageProof/wordPopup'
import { recheckLineIds } from '@/lib/pageProof/submitPlan'
import { pageDraftKey } from '@/lib/pageProof/drafts'
import { LAYOUT_KEY, SPLIT_MAX, SPLIT_MIN, nudgeSplit, readLayout, splitFromPointer } from '@/lib/pageProof/layout'
import { LINK_ERRORS, linkEnd, planLink, planOtherPageLink, farLabel, tabOfLine, wordStartPos } from '@/lib/pageProof/linkFlow'
import { isKey, isShortcut } from '@/lib/pageProof/keys'
import { useDialog } from '@/components/providers/DialogContext'
import { useProofEditor } from './useProofEditor'
import { useWordPopup } from './useWordPopup'
import ProofToolbar, { DEFAULT_PROOF_FONT, clampFontSize } from './ProofToolbar'
import ScanPanel from './ScanPanel'
import TextPanel from './TextPanel'
import FlowEditor from './FlowEditor'
import StatusBar from './StatusBar'
import DetailsDrawer from './DetailsDrawer'
import ProofHelp from './ProofHelp'
import OtherPagePicker from './OtherPagePicker'
import { caretTop } from './flowDom'

// עורך הגהת-עמוד — המעטפת: סרגל-כלים (בנוסח העורך הישן של האתר), הסריקה
// (מסגרות / שורות) והטקסט הזורם זה לצד זה עם מפריד נגרר וצדדים מתחלפים,
// שורת-מצב, ולוח "פרטים" נפתח. כל שינוי = פעולת-חוזה (useProofEditor); העורך
// משמש את המתנדב (עריכה) ואת המנהל (סקירה, ועריכה לפני אישור).
//
// Props: page ({id, page, gid?, doc, imageUrl, revision?} — gid (או doc.gid) מאפשר
// קישור שהצד השני שלו בעמוד אחר של הספר: OtherPagePicker), initialOps (הגשה קיימת),
// readOnly, persist (טיוטה בדפדפן), draftKey (lib/pageProof/drafts — ברירת-
// המחדל לפי העמוד והגרסה), toolbarClassName (בתוך חלון: 'sticky top-0 z-30'),
// actions({ops, view, stats, untouched, approval, reset}) — כפתורי הדף העוטף
// בקצה הסרגל; approval = {approved, total} פסקאות-התוכן בכל העמוד.
//
// הסמן משותף לטקסט ולסריקה: השורה שבה הסמן מסומנת על הסריקה, ולחיצה על
// הסריקה מעבירה את הסמן לשורה שם (ולשונית הזרם שלה).
//
// הסריקה עוקבת אחרי הסמן (track — ל-ScanPanel): currentLineId, currentWord (המילה
// שבסמן — אינדקס ב-words[] של השורה; מינוס 1 כשאין) ו-caretY (ה-clientY של ראש
// השורה של הסמן בלוח-הטקסט — הסריקה מעמידה את השורה שלה מולו). caretY הוא null
// כשהסמן זז מלחיצה על הסריקה (שלא תזוז מתחת לעכבר), כשהסמן אינו גלוי בלוח-הטקסט,
// וכשהלוחות זה מעל זה (מסך צר — אין "מול"). השלושה יוצאים יחד, נמדדים בפריים שאחרי
// הרינדור — מדידה אחת לפריים (trackFrame) — ומתעדכנים רק כשמשהו מהם השתנה: הקלדה
// בתוך מילה, באותה שורה נראית, אינה מרנדרת מחדש.

const MemoScanPanel = memo(ScanPanel)
const EMPTY_SET = new Set()
const HINT_MS = 6000
const NO_TRACK = Object.freeze({ lineId: null, word: -1, y: null })
const sameTrack = (a, b) => a.lineId === b.lineId && a.word === b.word && a.y === b.y
const sameSel = (a, b) => (!a && !b) || (!!a && !!b && samePos(a.anchor, b.anchor) && samePos(a.focus, b.focus))

// הפריים הבא (בסביבה בלי requestAnimationFrame — טיימר)
const hasRaf = () => typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
const nextFrame = (fn) => (hasRaf() ? window.requestAnimationFrame(fn) : setTimeout(fn, 16))
const cancelFrame = (id) => (hasRaf() ? window.cancelAnimationFrame(id) : clearTimeout(id))

// הלוחות זה לצד זה (מסך רחב)? בפריסה הצרה הם זה מעל זה, ואין שורה "מול" שורה
function sideBySide(a, b) {
  const r1 = typeof a?.getBoundingClientRect === 'function' ? a.getBoundingClientRect() : null
  const r2 = typeof b?.getBoundingClientRect === 'function' ? b.getBoundingClientRect() : null
  if (!r1 || !r2) return false
  return r1.right <= r2.left + 1 || r2.right <= r1.left + 1
}

// שדות שבהם Ctrl+Z הוא ביטול-ההקלדה של הדפדפן עצמו: תיבת-טקסט וקלט-טקסט.
// תיבת-סימון, רשימה נפתחת או כפתור — לא: שם Ctrl+Z הוא ביטול בעורך (אחרת
// אחרי סימון "כותרת" או בחירת סוג-עמוד Ctrl+Z "לא עבד").
const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'])
function isTextField(t) {
  if (!t) return false
  if (t.tagName === 'TEXTAREA') return true
  if (t.tagName === 'INPUT') return !NON_TEXT_INPUTS.has(String(t.type || 'text').toLowerCase())
  return !!t.isContentEditable
}

function loadLayout() {
  try {
    return readLayout(window.localStorage.getItem(LAYOUT_KEY))
  } catch {
    return readLayout(null)
  }
}

function saveLayout(v) {
  try {
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(v))
  } catch {
    /* אחסון חסום — הפריסה פשוט לא נזכרת */
  }
}

// המפריד בין הסריקה לטקסט: גרירה משנה את הרוחב (נשמר בשחרור), ← → מהמקלדת,
// וכפתור עגול להחלפת הצדדים (כמו בעורך הישן)
function Splitter({ split, swap, containerRef, onDrag, onCommit, onSwap }) {
  const onPointerDown = (e) => {
    if (e.button !== 0 || !containerRef.current) return
    e.preventDefault()
    let last = split
    const move = (ev) => {
      const v = splitFromPointer(containerRef.current?.getBoundingClientRect(), ev.clientX, swap)
      if (v != null) {
        last = v
        onDrag(v)
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      onCommit(last)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="רוחב הסריקה (גרירה או חיצים)"
      aria-valuemin={SPLIT_MIN}
      aria-valuemax={SPLIT_MAX}
      aria-valuenow={Math.round(split)}
      tabIndex={0}
      title="גרירה — שינוי הרוחב של הסריקה והטקסט"
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        const v = nudgeSplit(split, e.key, swap)
        if (v == null) return
        e.preventDefault()
        onCommit(v)
      }}
      style={{ order: 2 }}
      className="group relative hidden w-3 shrink-0 cursor-col-resize justify-center outline-none focus-visible:bg-primary/10 lg:flex"
    >
      <span className="h-full w-px bg-surface-variant transition-colors group-hover:bg-primary/50" />
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onSwap}
        aria-label="החלפת צדדים — הסריקה והטקסט"
        title="החלפת צדדים — הסריקה והטקסט"
        className="absolute top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-surface-variant bg-white text-neutral-600 shadow-sm transition-colors hover:text-primary"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-base">swap_horiz</span>
      </button>
    </div>
  )
}

export default function ProofEditor({ page, initialOps = null, readOnly = false, persist = true, actions = null, draftKey = null, toolbarClassName }) {
  const baseDoc = page.doc
  const P = baseDoc.page
  const storageKey = useMemo(() => draftKey || pageDraftKey(page), [draftKey, page])
  const ed = useProofEditor({ baseDoc, initialOps, readOnly, persist, draftKey: storageKey })
  const { view, ops, push } = ed
  const { showAlert, showConfirm } = useDialog()

  const [layout, setLayout] = useState(loadLayout)
  const [scanMode, setScanMode] = useState('frames')
  const [tabPick, setTabPick] = useState(null)
  const [sel, setSel] = useState(null)
  const [request, setRequest] = useState(null)
  const [hint, setHint] = useState(() => (ed.restored ? { text: 'שוחזרה טיוטה שמורה מהדפדפן — אפשר להמשיך מאיפה שהפסקתם', n: 0 } : null))
  const [linkPending, setLinkPending] = useState(null)
  // הצד השני של קישור בעמוד אחר: {start: מספר-עמוד | null} — החלון פתוח
  const [otherPage, setOtherPage] = useState(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsTab, setDetailsTab] = useState('links')
  const [helpOpen, setHelpOpen] = useState(false)
  const [track, setTrack] = useState(NO_TRACK)
  const splitRef = useRef(null)
  const scanPaneRef = useRef(null)
  const textPaneRef = useRef(null)
  const reqSeq = useRef(0)
  // הבחירה האחרונה שנקבעה (סינכרונית — setSel מתעדכן רק ברינדור הבא), ומאיפה בא
  // המהלך האחרון של הסמן: 'scan' — לחיצה על הסריקה; 'text' — כל השאר (מקלדת ועכבר
  // בטקסט, הסרגל, F8, ביטול, לוח הפרטים)
  const selRef = useRef(null)
  const caretFrom = useRef('text')
  const trackIn = useRef(null)
  const trackShown = useRef(NO_TRACK)
  const trackFrame = useRef({ id: 0 })
  const closeHelp = useCallback(() => setHelpOpen(false), [])

  // ---- נגזרות ----
  const lineById = useMemo(() => new Map(view.lines.map((l) => [l.id, l])), [view])
  const locked = useMemo(() => new Set(recutLineIds(baseDoc, ops)), [baseDoc, ops])
  const recheck = useMemo(() => new Set(recheckLineIds(baseDoc)), [baseDoc])
  const recheckCount = useMemo(() => view.lines.filter((l) => recheck.has(l.id) && l.status !== 'removed').length, [view, recheck])
  const endpoints = useMemo(() => linkEndpoints(view), [view])
  const streams = useMemo(() => streamChoices(baseDoc), [baseDoc])
  const untouched = useMemo(() => untouchedLineIds(view), [view])
  const stats = useMemo(() => viewStats(view, ops), [view, ops])
  const pageAppr = useMemo(() => pageApproval(view, { locked }), [view, locked])
  const approvalSummary = useMemo(() => ({ approved: pageAppr.approved, total: pageAppr.total }), [pageAppr])

  const rawTabs = useMemo(() => streamTabs(view), [view])
  const defaultTab = (rawTabs.find((t) => t.key === 'main') || rawTabs.find((t) => !t.furniture) || rawTabs[0])?.key ?? 'main'
  const tabKey = rawTabs.some((t) => t.key === tabPick) ? tabPick : defaultTab
  const tabs = useMemo(() => rawTabs.map((t) => (t.furniture ? t : { ...t, approval: pageAppr.byTab.get(t.key) })), [rawTabs, pageAppr])
  const activeTab = tabs.find((t) => t.key === tabKey) || null
  const furnitureTab = tabKey === FURNITURE_TAB
  const tabAppr = useMemo(() => paragraphApproval(view, tabKey, { locked }), [view, tabKey, locked])
  const tabSummary = useMemo(() => ({ approved: tabAppr.approved, total: tabAppr.total }), [tabAppr])
  const paras = useMemo(() => buildParagraphs(view, tabKey), [view, tabKey])
  const suspectCount = useMemo(() => suspiciousWords(view, tabKey).length, [view, tabKey])

  const caret = sel?.focus || null
  const ci = useMemo(() => (caret ? caretInfo(view, tabKey, caret) : null), [view, tabKey, caret])
  const caretLine = ci?.lineId != null ? lineById.get(ci.lineId) || null : null
  const hasCaret = !!caretLine
  const paraIdx = hasCaret ? paragraphIndexAt(paras, caret) : -1

  // ---- רמזים (שורת-המצב) ----
  const say = useCallback((text) => {
    if (text) setHint({ text, n: Date.now() })
  }, [])
  useEffect(() => {
    if (!hint) return undefined
    const t = setTimeout(() => setHint(null), HINT_MS)
    return () => clearTimeout(t)
  }, [hint])

  // ---- פריסה: רוחב, צדדים, גודל וגופן (נשמרים בדפדפן) ----
  const updateLayout = useCallback((patch, save = true) => {
    setLayout((l) => {
      const next = readLayout({ ...l, ...patch })
      if (save) saveLayout(next)
      return next
    })
  }, [])

  // ---- הסמן ----
  // from = מאיפה בא המהלך ('scan' — לחיצה על הסריקה). הצבה-מחדש של אותה בחירה
  // (ביטול שינוי שאינו טקסט, למשל) אינה מהלך — המקור הקודם נשאר, והסריקה לא זזה
  const moveCaret = useCallback((s, focus = true, from = 'text') => {
    if (!sameSel(s, selRef.current)) caretFrom.current = from
    selRef.current = s
    setSel(s)
    reqSeq.current += 1
    setRequest({ sel: s, focus, n: reqSeq.current })
  }, [])

  // בחירה חדשה מהדפדפן (מקלדת/עכבר בטקסט). כשהעורך רק מציב בחירה שכבר נקבעה
  // (למשל אחרי לחיצה על הסריקה, כשהוא מקבל מיקוד) — אותה בחירה, והמקור לא משתנה
  const selectFromText = useCallback((s) => {
    if (!sameSel(s, selRef.current)) caretFrom.current = 'text'
    selRef.current = s
    setSel(s)
  }, [])

  // מעבר לשורה (ולמילה בה): הלשונית של השורה, והסמן בתחילת המילה
  const goTo = useCallback(
    (lineId, wordIndex = null, { focus = true, selectWord = false, from = 'text' } = {}) => {
      const line = lineById.get(lineId)
      if (!line || line.status === 'removed') return false
      let s = null
      if (selectWord && Number.isInteger(wordIndex)) {
        const w = tokenize(line.text).filter((t) => t.w === 'word')[wordIndex]
        if (w) s = { anchor: { lineId, offset: w.start }, focus: { lineId, offset: w.end } }
      }
      if (!s) {
        const p = wordStartPos(line, wordIndex)
        s = { anchor: p, focus: p }
      }
      setTabPick(tabOfLine(line))
      moveCaret(s, focus, from)
      return true
    },
    [lineById, moveCaret]
  )

  // תוכנית מ-flowEdit ← push, רמז, והבחירה אחריה
  const applyPlan = useCallback(
    (plan) => {
      if (!plan) return false
      if (plan.hint) say(plan.hint)
      let ok = true
      if (plan.ops?.length) ok = push(...plan.ops, plan.coalesceKey ? { coalesceKey: plan.coalesceKey } : null)
      const target = plan.sel || (plan.caret ? { anchor: plan.caret, focus: plan.caret } : null)
      if (ok && target) moveCaret(target, true)
      return ok
    },
    [push, say, moveCaret]
  )

  // ---- חלונית ההצעות למילה ----
  // אחרי בחירת הצעה הסמן עומד בסוף המילה שהוחלפה (ולא בתחילתה — אחרת ההקלדה
  // הבאה נכנסת לפני המילה)
  const onPickWord = useCallback(
    (id, i, w) => {
      const l = lineById.get(id)
      if (!l) return
      const value = replaceWord(l.text, i, w)
      if (!push({ kind: 'text', page: P, ids: [id], value })) return
      const word = tokenize(value).filter((t) => t.w === 'word')[i]
      if (word) {
        const pos = { lineId: id, offset: word.end }
        moveCaret({ anchor: pos, focus: pos }, true)
      }
    },
    [lineById, push, P, moveCaret]
  )
  const pop = useWordPopup(view, { onPick: onPickWord, readOnly, lockedLineIds: locked })
  const { onCaretMove, closeNow } = pop
  useEffect(() => {
    onCaretMove(ci?.lineId ?? null, ci?.wordIndex ?? -1)
  }, [ci?.lineId, ci?.wordIndex, onCaretMove])

  const switchTab = useCallback(
    (k) => {
      if (k === tabKey) return
      closeNow()
      setTabPick(k)
      selRef.current = null
      setSel(null)
    },
    [tabKey, closeNow]
  )

  // ---- קישור בין שני זרמים ----
  // לכל שורת-הערה/פירוש קישור אחד (כך גם בתוכנת-הספר): קישור שני מאותה שורה
  // מחליף את הקודם — רק אחרי אישור, ולא בשקט.
  // המקום של קישור קיים מאותה שורת-הערה (-1 אם אין), ושאלת ההחלפה. בלי קישור קיים אין
  // המתנה — הפעולה נוספת מיד, באותו אירוע-מקלדת
  const existingLink = (op) => (view.links || []).findIndex((k) => k.from_line === op.ids[0])
  const askReplace = (idx) =>
    showConfirm(
      'להחליף את הקישור?',
      `לשורה הזו כבר יש קישור ${linkBadge(idx + 1)} — אפשר קישור אחד לכל שורת-הערה או פירוש. להחליף אותו בקישור החדש?`,
      null,
      'החלפה',
      'ביטול'
    )
  const link = async () => {
    if (readOnly) return
    const end = linkEnd(view, tabKey, sel)
    if (end.error) return say(end.error)
    if (!linkPending) {
      setLinkPending({ from: end })
      say(end.hint || `נבחר «${end.text}». עכשיו עברו ללשונית של הזרם השני, סמנו את המילה המקבילה ולחצו שוב "קישור" — או, אם היא בעמוד אחר, בחרו אותו בפס הכחול`)
      return
    }
    const r = planLink(view, linkPending.from, end)
    if (r.error) {
      if (r.error === LINK_ERRORS.sameStream) showAlert('קישור', r.error)
      say(r.error)
      return
    }
    const from = linkPending.from
    const idx = existingLink(r.op)
    if (idx >= 0 && !(await askReplace(idx))) return say('הקישור הקודם נשאר; הקישור החדש לא נוסף')
    if (push(r.op)) {
      setLinkPending(null)
      say(`${idx >= 0 ? 'הקישור הוחלף' : 'הקישור נוסף'}: «${from.text}» ↔ «${end.text}»`)
    }
  }
  // הצד השני בעמוד אחר: מילה שנבחרה בחלון העמוד האחר (OtherPagePicker) משלימה את הקישור.
  // מחזיר הודעת-שגיאה לחלון (שנשאר פתוח) או null
  const pickOtherPage = async (pick, fview) => {
    if (readOnly || !linkPending) return LINK_ERRORS.gone
    const r = planOtherPageLink(view, linkPending.from, pick, fview)
    if (r.error) return r.error
    const bad = validateOp(baseDoc, r.op)
    if (bad) return bad
    const from = linkPending.from
    const idx = existingLink(r.op)
    if (idx >= 0 && !(await askReplace(idx))) return 'הקישור הקודם נשאר; הקישור החדש לא נוסף'
    if (!push(r.op)) return 'הקישור לא נוסף'
    setOtherPage(null)
    setLinkPending(null)
    say(`${idx >= 0 ? 'הקישור הוחלף' : 'הקישור נוסף'}: «${from.text}» ↔ ${farLabel(pick.page, pick.lineNo, pick.lineId, pick.lineText)}`)
    return null
  }
  const cancelLink = useCallback(() => {
    setOtherPage(null)
    setLinkPending(null)
    say('הקישור בוטל')
  }, [say])
  // העמוד האחר נפתח רק כשהצד הראשון כבר נבחר, ורק כשידוע הספר (gid)
  const gid = page.gid ?? baseDoc.gid ?? null
  const canOtherPage = !readOnly && !!gid && !!linkPending
  const openOtherPage = useCallback((n) => setOtherPage({ start: Number.isInteger(n) && n >= 1 ? n : null }), [])
  const closeOtherPage = useCallback(() => setOtherPage(null), [])

  // ---- אישור פסקה-פסקה ----
  const approve = (key) => {
    const plan = planApprove(view, tabKey, key, { locked })
    if (plan.hint) say(plan.hint)
    return plan.ops.length ? push(...plan.ops) : false
  }
  const unapprove = (key) => {
    // פסקה שאושרה בסבב קודם (לפני ההגהה הזו) — אין כאן אישור לבטל
    if (tabAppr.byKey.get(key)?.pre) return say('הפסקה הזו אושרה כבר בסבב קודם — אין כאן אישור לבטל')
    const pred = unapproveMatcher(view, tabKey, key, { locked })
    if (!pred) return
    ed.removeWhere(pred)
    say('אישור הפסקה בוטל (Ctrl+Z מחזיר אותו)')
  }
  const approveAtCaret = () => {
    if (readOnly) return
    // ריהוט הדף אינו טקסט של הספר — אין בו פסקאות לאישור (בלי line_ok נסתר)
    if (furnitureTab) return say(HINTS.furnitureApprove)
    const key = ci?.paraKey
    if (!key) return say('הציבו את הסמן בתוך פסקה ואז Ctrl+Enter')
    const info = tabAppr.byKey.get(key)
    if (info && !info.approvable) return say(HINTS.notApprovable)
    if (info && !info.approved && !approve(key)) return
    const nx = nextAfterApprove(view, tabKey, key, { locked })
    if (nx.hint) say(nx.hint)
    if (nx.caret) moveCaret({ anchor: nx.caret, focus: nx.caret }, true)
  }

  // ---- זרם לשורות שבבחירה (לשורה בודדת שנכנסה לזרם הלא-נכון) ----
  const streamForLines = (key) => {
    const ranges = sel && !isCollapsed(sel) ? selectionToLineRanges(view, tabKey, sel.anchor, sel.focus) : caret ? [{ lineId: caret.lineId }] : []
    const byValue = new Map()
    let skipped = false
    for (const r of ranges) {
      const l = lineById.get(r.lineId)
      if (!l) continue
      if (!(l.id > 0) || l._new) {
        skipped = true
        continue
      }
      // שורת-כותרת נשארת כותרת של הזרם החדש — אם יש לו כזו (לשוליים ולריהוט אין)
      const value = keepHeading(key, l.stream)
      if (!byValue.has(value)) byValue.set(value, [])
      if (!byValue.get(value).includes(l.id)) byValue.get(value).push(l.id)
    }
    if (!byValue.size) return say(skipped ? 'שורה שנוצרה בתיקון החיתוך — הזרם שלה ייקבע אחרי הזיהוי מחדש' : HINTS.noWord)
    const opsToPush = [...byValue].map(([value, ids]) => ({ kind: 'stream', page: P, ids, value }))
    if (push(...opsToPush)) {
      const n = [...byValue.values()].reduce((a, ids) => a + ids.length, 0)
      const moved = n === 1 ? 'השורה עברה' : `${n} שורות עברו`
      const shown = n === 1 ? 'היא מופיעה' : 'הן מופיעות'
      const he = streamInfo(view, key).he
      // הריהוט (כותרת עמוד, תחתית, מפריד) — לשונית אחת, "ריהוט הדף"
      say(
        isFurnitureStream(key)
          ? `${moved} לריהוט הדף («${he}» — לא נכנס לספר); ${shown} עכשיו בלשונית «${FURNITURE_TAB_HE}»`
          : `${moved} לזרם «${he}» — ${shown} עכשיו בלשונית שלו`
      )
    }
  }

  const goSuspicious = (dir) => {
    const r = nextSuspicious(view, tabKey, sel, dir)
    if (r.hint) say(r.hint)
    if (r.sel) moveCaret(r.sel, true)
  }

  const openSuggest = () => {
    if (!caretLine || !(ci?.wordIndex >= 0)) return say(HINTS.noWord)
    if (!pop.openKeyboard(caretLine.id, ci.wordIndex)) say('אין הצעות למילה הזו')
  }

  const charStyle = (style, on) => applyPlan(planCharStyle(view, tabKey, sel, style, on, { locked }))
  // "חיבור לפסקה הקודמת" מהכפתור שליד הפסקה — כמו Backspace בתחילתה
  const joinPara = (key) => !readOnly && applyPlan(planJoinPara(view, tabKey, key))

  // ביטול/חזרה: הסמן עובר למקום שבו הטקסט השתנה (ולשונית השורה); שינוי שאינו
  // טקסט (סגנון, פסקה, מסגרת) — הסמן נשאר במקומו, בלי לגנוב את המיקוד מהסריקה
  const history = (which) => {
    const r = which === 'redo' ? ed.redo() : ed.undo()
    if (!r) return
    const after = buildView(baseDoc, r.all.filter((o) => !o._local))
    const pos = historyCaret(view, after, r.ops)
    const line = pos ? after.lines.find((l) => l.id === pos.lineId) : null
    if (line) {
      setTabPick(tabOfLine(line))
      moveCaret({ anchor: pos, focus: pos }, true)
    } else if (sel) {
      moveCaret(sel, false)
    }
  }
  const undo = () => history('undo')
  const redo = () => history('redo')

  const lineOp = (kind, value) => {
    if (!caretLine || !(caretLine.id > 0)) return false
    const op = { kind, page: P, ids: [caretLine.id] }
    if (value !== undefined) op.value = value
    return push(op)
  }

  // ---- ה-callbacks היציבים (לרכיבים ממוזכרים) — תמיד על המצב העדכני ----
  const live = useRef(null)
  useLayoutEffect(() => {
    live.current = { approve, unapprove, goTo, charStyle, joinPara, undo, redo, link, cancelLink, approveAtCaret, goSuspicious, openSuggest, linkPending, readOnly, P }
  })
  const stable = useMemo(
    () => ({
      onSelect: selectFromText,
      onApprove: (k) => live.current.approve(k),
      onUnapprove: (k) => live.current.unapprove(k),
      onUndo: () => live.current.undo(),
      onRedo: () => live.current.redo(),
      onFormat: (style) => live.current.charStyle(style),
      onJoinPara: (key) => live.current.joinPara(key),
      onJump: (other) => {
        if (!other) return
        if (other.page != null && other.page !== live.current.P) {
          say(`הצד השני של הקישור: ${other.label || `עמוד ${other.page}`}`)
          return
        }
        live.current.goTo(other.lineId, other.i, { focus: true })
      },
      // לחיצה על הסריקה: הסמן עובר לשם, אבל הסריקה עצמה לא זזה (caretY = null)
      onPickLine: (lineId, extra) => live.current.goTo(lineId, extra?.wordIndex ?? null, { focus: false, from: 'scan' }),
      setMode: (m) => setScanMode(m),
    }),
    [say, selectFromText]
  )

  // ---- הסריקה עוקבת אחרי הסמן (track) ----
  // המדידה: בפריים שאחרי הרינדור (העורך כבר הציב את הסמן וגלל אליו), מהמקום של הסמן
  // במודל. בלי ref ל-FlowEditor: שורש-העורך נמצא בתוך לוח-הטקסט
  const measureTrack = useCallback(() => {
    const inp = trackIn.current
    let next = NO_TRACK
    if (inp && inp.lineId != null) {
      let y = null
      const pane = textPaneRef.current
      if (caretFrom.current !== 'scan' && inp.caret && sideBySide(scanPaneRef.current, pane)) {
        const root = pane?.querySelector?.('[data-proof-flow]') || null
        y = root ? caretTop(root, inp.caret) : null
      }
      next = { lineId: inp.lineId, word: inp.word, y }
    }
    if (sameTrack(next, trackShown.current)) return
    trackShown.current = next
    setTrack(next)
  }, [])

  // אחרי כל רינדור: מדידה אחת בפריים הבא — כמה רינדורים באותו פריים (הקלדה, גרירת-
  // בחירה) = מדידה אחת. שלושת הערכים יוצאים יחד, ולכן הסריקה לא רואה שורה חדשה עם
  // גובה של השורה הקודמת
  useLayoutEffect(() => {
    trackIn.current = { lineId: caretLine?.id ?? null, word: caretLine ? (ci?.wordIndex ?? -1) : -1, caret }
    const f = trackFrame.current
    if (!f.id) {
      f.id = nextFrame(() => {
        f.id = 0
        measureTrack()
      })
    }
  })
  useEffect(() => {
    const f = trackFrame.current
    return () => {
      if (f.id) cancelFrame(f.id)
      f.id = 0
    }
  }, [])

  // ---- מקלדת: קיצורים (גם כשהמיקוד בסרגל, בסריקה, בחלונית-המסגרת או בלוח הפרטים) ----
  // מדלגים רק על חלון מודאלי (עזרה, הגשה — aria-modal), לא על כל מה שמסומן
  // dialog/group; ורק שדה-טקסט נחשב "שדה" (isTextField).
  useEffect(() => {
    const onKey = (e) => {
      const H = live.current
      if (!H || e.defaultPrevented || e.isComposing) return
      const t = e.target instanceof Element ? e.target : null
      if (t?.closest?.('[aria-modal="true"]')) return
      const inFlow = !!t?.closest?.('[data-proof-flow]')
      const inField = !!t && !inFlow && isTextField(t)
      const ctrl = e.ctrlKey || e.metaKey
      // האות של הקיצור בכל פריסה (lib/pageProof/keys): בפריסה עברית Ctrl+Z נותן
      // e.key === 'ז' — המקש הפיזי (e.code 'KeyZ') קובע, וגם בלעדיו 'ז' ← 'z'
      if (isShortcut(e, 'z', { shift: null })) {
        if (inField) return
        e.preventDefault()
        if (e.shiftKey) H.redo()
        else H.undo()
        return
      }
      if (isShortcut(e, 'y')) {
        if (inField) return
        e.preventDefault()
        H.redo()
        return
      }
      if (inField) return
      if (isKey(e, 'Escape') && H.linkPending) {
        e.preventDefault()
        H.cancelLink()
        return
      }
      if (isKey(e, 'F8') && !ctrl && !e.altKey) {
        e.preventDefault()
        H.goSuspicious(e.shiftKey ? -1 : 1)
        return
      }
      if (isShortcut(e, 'k')) {
        e.preventDefault()
        H.link()
        return
      }
      if (!inFlow) return
      if (isShortcut(e, 'b') || isShortcut(e, 'i')) {
        e.preventDefault()
        if (!H.readOnly) H.charStyle(isShortcut(e, 'b') ? 'b' : 'i')
        return
      }
      if (ctrl && !e.altKey && !e.shiftKey && isKey(e, 'Enter')) {
        e.preventDefault()
        H.approveAtCaret()
        return
      }
      if ((e.altKey && !ctrl && isKey(e, 'ArrowDown')) || (ctrl && !e.altKey && !e.shiftKey && isKey(e, 'Space'))) {
        e.preventDefault()
        H.openSuggest()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---- פעולות לוח הפרטים ----
  const drawerAct = {
    jumpToLine: (id, i) => goTo(id, Number.isInteger(i) ? i : null, { focus: true }),
    linkOk: (src) => push({ kind: 'link_ok', page: P, value: { src_line: src, page: P } }),
    linkDel: (src) => push({ kind: 'link_del', page: P, value: { src_line: src, page: P } }),
    // קישור לעמוד אחר שנוסף בעריכה הזו: ביטול = הסרת פעולת-הקישור עצמה (צעד-ביטול אחד;
    // Ctrl+Z מחזיר) — לא link_del, שהיה נשלח לתוכנת-הספר
    removeLink: (k) => {
      if (readOnly) return
      ed.removeWhere((op) => op?.kind === 'link_add' && op.ids?.[0] === k.from_line && op.ids?.[1] === k.to_line)
      say('הקישור בוטל (Ctrl+Z מחזיר אותו)')
    },
    otherPage: canOtherPage ? openOtherPage : null,
    startLink: readOnly ? null : link,
    cancelLink,
    script: (v) => lineOp('script', v),
    mixed: (b) => lineOp('mixed_line', b ? 1 : 0),
    certainty: (v, why) => lineOp('certainty', { v, why: why || null }),
    lineOk: () => lineOp('line_ok'),
    remove: () => {
      if (lineOp('status', 'removed')) say('השורה סומנה "לא-שורה" והוסרה מהטקסט — שחזור בכרטיסיית "עמוד"')
    },
    restoreLine: (id) => push({ kind: 'status', page: P, ids: [id], value: 'restore' }),
    pageType: (v) => push({ kind: 'page_type', page: P, value: v }),
    cutOk: () => push({ kind: 'cut_ok', page: P, value: true }),
    toLinesMode: () => setScanMode('lines'),
    removeOp: (i) => ed.removeAt(i),
  }

  // ---- הסרגל ----
  const edit = !readOnly
  const paraStyle = ci ? (ci.heading && !['h1', 'h2', 'h3'].includes(ci.paraStyle) ? null : ci.paraStyle) : null
  const actionsNode = actions ? actions({ ops, view, stats, untouched, approval: approvalSummary, reset: ed.reset }) : null
  const fontFamily = layout.fontFamily || DEFAULT_PROOF_FONT

  const scanPane = (
    <div ref={scanPaneRef} style={{ order: layout.swap ? 3 : 1 }} className="h-[60vh] min-h-[360px] min-w-0 shrink-0 lg:h-auto lg:min-h-0 lg:w-[var(--scan-w)]">
      <MemoScanPanel
        view={view}
        imageUrl={page.imageUrl}
        mode={scanMode}
        setMode={stable.setMode}
        readOnly={readOnly}
        currentLineId={track.lineId}
        currentWord={track.word}
        caretY={track.y}
        lockedLineIds={locked.size ? locked : EMPTY_SET}
        onPickLine={stable.onPickLine}
        push={push}
        frameStreamDefault={tabKey}
      />
    </div>
  )

  const textPane = (
    <div ref={textPaneRef} style={{ order: layout.swap ? 1 : 3 }} className="h-[70vh] min-h-[360px] min-w-0 flex-1 lg:h-auto lg:min-h-0">
      <TextPanel
        view={view}
        tabs={tabs}
        tabKey={tabKey}
        setTabKey={switchTab}
        linkPending={linkPending}
        onCancelLink={cancelLink}
        onOtherPage={canOtherPage ? openOtherPage : null}
        recheckCount={recheckCount}
        approval={furnitureTab ? null : tabSummary}
        readOnly={readOnly}
        fontSize={layout.fontSize}
        fontFamily={fontFamily}
        className="h-full"
        editorSlot={
          <FlowEditor
            view={view}
            tabKey={tabKey}
            push={push}
            readOnly={readOnly}
            locked={locked}
            recheck={recheck}
            approval={furnitureTab ? null : tabAppr}
            endpoints={endpoints}
            caretLineId={caretLine?.id ?? null}
            request={request}
            onSelect={stable.onSelect}
            onHint={say}
            onApprove={stable.onApprove}
            onUnapprove={stable.onUnapprove}
            onUndo={stable.onUndo}
            onRedo={stable.onRedo}
            onFormat={stable.onFormat}
            onWordEnter={pop.onWordEnter}
            onWordLeave={pop.onWordLeave}
            onJump={stable.onJump}
            onJoinPara={readOnly ? null : stable.onJoinPara}
          />
        }
      />
    </div>
  )

  return (
    <div className="flex flex-col" dir="rtl">
      <ProofToolbar
        canUndo={ed.canUndo}
        canRedo={ed.canRedo}
        onUndo={undo}
        onRedo={redo}
        paraStyle={paraStyle}
        onParaStyle={edit && hasCaret && !furnitureTab ? (style) => applyPlan(planParaStyle(view, tabKey, sel, style)) : null}
        charStyles={ci?.charStyles}
        onCharStyle={edit && hasCaret ? charStyle : null}
        onSplitPara={edit && hasCaret && !furnitureTab ? () => applyPlan(planEnter(view, tabKey, sel)) : null}
        onJoinPara={edit && hasCaret && !furnitureTab && paraIdx > 0 ? () => applyPlan(planJoin(view, tabKey, caret)) : null}
        onLink={edit && (hasCaret || linkPending) ? link : null}
        linkPending={linkPending}
        onSuggest={hasCaret && ci.wordIndex >= 0 && hasSuggestions(caretLine, ci.wordIndex) ? openSuggest : null}
        onNextSuspicious={suspectCount > 0 ? goSuspicious : null}
        streams={streams}
        onStreamForLines={edit && hasCaret ? streamForLines : null}
        fontSize={layout.fontSize}
        setFontSize={(n) => updateLayout({ fontSize: clampFontSize(n) })}
        fontFamily={fontFamily}
        setFontFamily={(f) => updateLayout({ fontFamily: f })}
        onHelp={() => setHelpOpen(true)}
        detailsOpen={detailsOpen}
        onToggleDetails={() => setDetailsOpen((o) => !o)}
        actions={actionsNode}
        readOnly={readOnly}
        className={toolbarClassName}
      />

      {ed.error && (
        <div role="alert" className="mt-2 flex items-center justify-between gap-2 rounded-md bg-danger-100 px-3 py-1 text-sm text-danger-700">
          <span>{ed.error}</span>
          <button type="button" onClick={() => ed.setError(null)} aria-label="סגירת ההודעה" className="rounded px-1 text-xs hover:bg-danger-200">
            ✗
          </button>
        </div>
      )}

      <div
        ref={splitRef}
        style={{ '--scan-w': `${layout.split}%` }}
        className="mt-2 flex flex-col gap-2 lg:h-[calc(100vh-12.5rem)] lg:min-h-[560px] lg:flex-row lg:gap-0"
      >
        {scanPane}
        <Splitter
          split={layout.split}
          swap={layout.swap}
          containerRef={splitRef}
          onDrag={(v) => updateLayout({ split: v }, false)}
          onCommit={(v) => updateLayout({ split: v })}
          onSwap={() => updateLayout({ swap: !layout.swap })}
        />
        {textPane}
        {detailsOpen && (
          <div style={{ order: 4 }} className="h-[70vh] min-h-[360px] min-w-0 lg:ms-2 lg:h-auto lg:min-h-0 lg:w-80 lg:shrink-0">
            <DetailsDrawer
              className="h-full"
              tab={detailsTab}
              setTab={setDetailsTab}
              onClose={() => setDetailsOpen(false)}
              view={view}
              baseDoc={baseDoc}
              ops={ops}
              stats={stats}
              caretLine={caretLine}
              caretLocked={!!caretLine && locked.has(caretLine.id)}
              linkPending={linkPending}
              readOnly={readOnly}
              act={drawerAct}
            />
          </div>
        )}
      </div>

      <StatusBar
        className="mt-2 rounded-xl border"
        lineNo={caretLine ? (caretLine.id > 0 ? (caretLine.line_no ?? 0) + 1 : 'חדשה') : null}
        streamHe={hasCaret ? activeTab?.he : null}
        wordIndex={ci?.wordIndex ?? null}
        opsCount={ops.length}
        approval={approvalSummary}
        hint={hint?.text ?? null}
      />

      {pop.popup}
      {otherPage && canOtherPage && (
        <OtherPagePicker gid={gid} view={view} from={linkPending.from} startPage={otherPage.start} onPick={pickOtherPage} onClose={closeOtherPage} />
      )}
      <ProofHelp open={helpOpen} onClose={closeHelp} autoOpen={!readOnly && persist} />
    </div>
  )
}
