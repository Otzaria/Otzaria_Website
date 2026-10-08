'use client'

import { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { buildView, recutLineIds, validateOp, withBookOnly, sameLinkSlot, linkOpValue } from '@/lib/pageProof/ops'
import { historyCaret } from '@/lib/pageProof/historyCaret'
import { streamChoices, untouchedLineIds, replaceWord, viewStats } from '@/lib/pageProof/view'
import { isFurnitureStream, isPrintDefect, keepHeading, streamInfo } from '@/lib/pageProof/vocab'
import { BOOK_ONLY_HINTS } from '@/lib/pageProof/helpTexts'
import { streamTabs, paragraphApproval, pageApproval, buildParagraphs, selectionToLineRanges, tokenize, FURNITURE_TAB, FURNITURE_TAB_HE } from '@/lib/pageProof/textModel'
import {
  HINTS,
  caretInfo,
  isCollapsed,
  linkBadge,
  linkEndpoints,
  linkNumber,
  linksInDisplayOrder,
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
import { stageFocus } from '@/lib/pageProof/stages'
import { splitInherited } from '@/lib/pageProof/draftRules'
import { inverseOps } from '@/lib/pageProof/inverseOps'
import { LAYOUT_KEY, SPLIT_MAX, SPLIT_MIN, nudgeSplit, readLayout, splitFromPointer } from '@/lib/pageProof/layout'
import { LINK_ERRORS, linkEnd, planLink, planOtherPageLink, farLabel, tabOfLine, wordStartPos } from '@/lib/pageProof/linkFlow'
import { LINK_HE, unlinkPlan } from '@/lib/pageProof/linkCancel'
import { isKey, isShortcut } from '@/lib/pageProof/keys'
import { useDialog } from '@/components/providers/DialogContext'
import { mapCaretOffset, useProofEditor } from './useProofEditor'
import { useWordPopup } from './useWordPopup'
import ProofToolbar, { DEFAULT_PROOF_FONT, clampFontSize } from './ProofToolbar'
import ScanPanel from './ScanPanel'
import TextPanel from './TextPanel'
import FlowEditor from './FlowEditor'
import StatusBar from './StatusBar'
import DetailsDrawer from './DetailsDrawer'
import ProofHelp, { guideOf, openGuide } from './ProofHelp'
import OtherPagePicker from './OtherPagePicker'
import LinkPopover from './LinkPopover'
import { caretTop, readDomSelection } from './flowDom'

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
// בקצה הסרגל; approval = {approved, total} פסקאות-התוכן בכל העמוד. הכפתורים של האתר —
// "הגשת העמוד" ו"שלח לזיהוי-מחדש" של דף המתנדב (app/library/page-proof) — באים רק מכאן:
// העורך עצמו אינו מציג אותם, ולכן דף עוטף שנותן actions משלו (או בלי) — תוכנת-הספר, שחותכת
// ומזהה מחדש אצלה — לעולם אינו רואה אותם, בלי שום prop נוסף.
//
// נקודות-הרחבה למי שמטמיע את העורך מחוץ לאתר (תוכנת-הספר). כולן רשות, ובלעדיהן
// העורך מתנהג בדיוק כמו באתר:
//   loadOtherPage(gid, n) — טעינת עמוד אחר של הספר לחלון "הצד השני בעמוד אחר"
//     (Promise של {page, lines} כמו GET /api/page-proof/books/[gid]/pages/[n]/lines;
//     שגיאה = Error עם הודעה בעברית). בלעדיו — fetch לכתובת הזו.
//   help — נוסח העזרה לחלקים שתלויים באתר (ProofHelp: texts).
//   onExtraKey(e, {inFlow, inField, inModal}) — מקשים של הדף העוטף: נקרא ראשון במאזין-המקלדת
//     של החלון, לפני כל קיצור של העורך; true = טופל, והעורך לא ממשיך (preventDefault — עליו).
//   onUndoEmpty / onRedoEmpty — ביטול/חזרה (מקלדת או סרגל) כשההיסטוריה של העורך ריקה —
//     למשל צעד שכבר נשמר בשרת. canUndoEmpty / canRedoEmpty — לדף העוטף יש מה לבטל/להחזיר:
//     הכפתור בסרגל נשאר פעיל גם בלי היסטוריה מקומית.
//   גובה הלוחות במסך רחב: 100vh פחות המשתנה --proof-chrome (ברירת-המחדל 12.5rem — כותרת האתר,
//     הסרגל ושורת-המצב). דף עוטף עם מסגרת אחרת קובע אותו על אחד ההורים; הלוחות — data-proof-panes.
//   lockedExtra — מזהי-שורות נוספים שהטקסט שלהם נעול (למשל שורות שממתינות לזיהוי-מחדש אצל הדף העוטף).
//   extraTabs — [{id, label, render(ctx)}]: לשוניות נוספות בלוח הפרטים; ctx = {view, baseDoc, ops,
//     stats, caretLine, caretLocked, linkPending, readOnly, act}.
//   scanOverlay — שכבה על הסריקה במרחב הפיקסלים של התמונה: ReactNode או ({zoom, mode, view}) => ReactNode.
//   textView({flow, view, tabKey, goTo}) — מה שמוצג בלוח-הטקסט במקום העורך הזורם (flow = העורך).
//   onSelectionChange(sel) — הבחירה השתנתה: {from:'text', anchor, focus, lineIds} מהטקסט,
//     או {from:'scan', lineIds, fid} מהסריקה (שורות נבחרות במצב "שורות", המסגרת הנבחרת).
//   charStyleButtons — כפתורי עיצוב-התווים בסרגל (ברירת-המחדל: ProofToolbar.CHAR_STYLE_BUTTONS).
//   paraStyleOptions — הפריטים בתפריט "סגנון פסקה" (ברירת-המחדל: ProofToolbar.PARA_STYLE_OPTIONS).
//   moreMenu — {items, onSelect, label?, title?}: תפריט "⋯" בסרגל (פריטים כמו ב-ToolbarMenu).
//   frameActions(frame) — ReactNode נוסף בחלונית של מסגרת נבחרת.
//   scanOverlay ו-frameActions עוברים ללוח-הסריקה הממוזכר — בזהות קבועה (useMemo/useCallback).
//   ולדף עוטף ששומר בשרת כל צעד (useProofEditor — flushable/rebase):
//   editorRef — ref שמקבל {flushable(opts), rebase(doc, opts), goTo(lineId, word?), say(text), push(...ops),
//     openDetails(tab?), snapshot()}; rebase של העורך מעביר גם את הסמן (והבחירה) דרך מיפוי-המזהים ודרך
//     כיווץ-הרווחים של השרת. push — פעולות-חוזה מהדף העוטף אל רשימת-הפעולות של העורך, כמו לחיצה בסרגל (נבדקות,
//     צעד-ביטול אחד; false = נדחו). openDetails — פתיחת לוח הפרטים (על הלשונית, אם ניתנה — גם של extraTabs).
//     snapshot — {view, locked, tabKey}: מה שהעורך מציג עכשיו (קריאה בלבד). גם בלוח הפרטים: act.push.
//   onOpsChange(allOps) — רשימת-הפעולות השתנתה (הוספה, ביטול, rebase): אחרי הרינדור.
//   preOkFromStatus — שורות ok/fixed בעמוד מאושרות תמיד (useProofEditor).
//   onUnapprovePre({key, lineIds}) — ביטול אישור של פסקה שאושרה לפני העריכה הזו (אישור שכבר נשמר): בלעדיו —
//     כמו באתר ("אושרה בסבב קודם", הכפתור כבוי); איתו — הכפתור פעיל, והדף העוטף מבטל בשרת.
//   helpAutoOpen — פתיחת העזרה לבד בפעם הראשונה (ברירת-המחדל: בעריכה עם טיוטות — persist).
//   help.lockedLine — ההסבר על שורה נעולה (ממתינה לזיהוי-מחדש) במקום הנוסח של האתר.
//   help.bookOnlyTitle — ההסבר על הכפתור "לספר בלבד" (כשהוא כבוי) במקום הנוסח של האתר ("אחרי אישור המנהל").
//   help.guide — דף ההנחיות (כפתור "הנחיות" בסרגל וקישור בחלון העזרה — ProofHelp.guideOf): {href?, open?(href)};
//     null — בלי. בלעדיו — הדף של האתר (GUIDE_PATH) בלשונית חדשה.
//   focus — השלב בדף המתנדב של האתר ('structure' / 'text' — lib/pageProof/stages.stageFocus): "מבנה" — הטקסט לקריאה בלבד
//     ומעומעם ובסרגל רק מה שנוגע למבנה; "טקסט" — הסריקה בלי כלים. בלעדיו (כמו בתוכנת-הספר) — הכול פתוח, כמו תמיד.
//   inherited — {ops, source, label?}: פעולות שהטיוטה קיבלה ממישהו אחר (הבודק השני — ההגשה הקודמת; עמוד שנפתח מחדש — הגרסה
//     שאושרה; מתנדב קודם — draftRules.splitInherited). השורות שלהן מסומנות בטקסט ("תוקן בידי מתנדב קודם", והטקסט המקורי
//     בריחוף), ובלוח הפרטים ← שינויים הן ברשימה נפרדת, כל אחת עם "החזר למקור". בלעדיו — כמו תמיד. label — הנוסח של
//     הסימון במקום "תוקן בידי מתנדב קודם" / "בגרסה שאושרה" (בסקירת-הגשה בתוכנת-הספר — "תוקן בידי המתנדב"); בלעדיו — כמו תמיד.
//
// מצב "לספר בלבד" (כפתור בסרגל): כל עוד הוא דולק, כל תיקון-טקסט בשורה מקורית שעוד אינה מסומנת
// מקבל באותו צעד גם train_text = 0 (ops.withBookOnly) — Ctrl+Z אחד מבטל את שניהם. אישור בלי שינוי
// אינו מסמן, וגם לא ריהוט (לשונית הריהוט). לשורה בודדת — לוח הפרטים ← שורה. המצב כבוי בכל פתיחת
// עמוד: אינו נשמר בדפדפן ואינו עובר לעמוד אחר (החלטת בעל הפרויקט — מי ששכח אותו דולק לא יוציא
// בשקט שורות רבות מהאימון).
// סימון בנוסח הישן ("פגם בדפוס": ודאות "לא בטוח" עם סיבה קבועה — vocab.isPrintDefect) נקרא כ"לספר
// בלבד" ואינו הולך לאיבוד: הסרת "לספר בלבד" מורידה גם אותו, ושינוי-ודאות בשורה כזו מעביר אותו
// ל-train_text = 0 — כל אחד בצעד-ביטול אחד.
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

export default function ProofEditor({
  page,
  initialOps = null,
  readOnly = false,
  persist = true,
  actions = null,
  draftKey = null,
  toolbarClassName,
  loadOtherPage = null,
  help = null,
  onExtraKey = null,
  onUndoEmpty = null,
  onRedoEmpty = null,
  canUndoEmpty = false,
  canRedoEmpty = false,
  lockedExtra = null,
  extraTabs = null,
  scanOverlay = null,
  textView = null,
  onSelectionChange = null,
  charStyleButtons = null,
  paraStyleOptions = null,
  moreMenu = null,
  frameActions = null,
  editorRef = null,
  onOpsChange = null,
  preOkFromStatus = false,
  onUnapprovePre = null,
  helpAutoOpen = null,
  focus = null,
  inherited = null,
}) {
  const storageKey = useMemo(() => draftKey || pageDraftKey(page), [draftKey, page])
  const ed = useProofEditor({ baseDoc: page.doc, initialOps, readOnly, persist, draftKey: storageKey, preOkFromStatus })
  // השלב (focus): textRO — עריכת הטקסט סגורה; scanRO — כלי הסריקה סגורים
  const fx = stageFocus(focus)
  const textRO = readOnly || !!fx?.textReadOnly
  const scanRO = readOnly || !!fx?.scanReadOnly
  // מה שהתקבל ממישהו אחר (inherited) — אילו מהפעולות שבטיוטה, ואילו שורות; בריחוף — הטקסט המקורי
  const inh = useMemo(() => (inherited?.ops?.length ? splitInherited(ed.ops, inherited.ops) : null), [ed.ops, inherited])
  const inhLabel =
    typeof inherited?.label === 'string' && inherited.label.trim()
      ? inherited.label.trim()
      : inherited?.source === 'approved'
        ? 'בגרסה שאושרה'
        : 'תוקן בידי מתנדב קודם'
  const marked = useMemo(() => {
    if (!inh?.lines.size) return null
    const base = new Map((ed.baseDoc?.lines || []).map((l) => [l?.id, String(l?.text ?? l?.text_ocr ?? '')]))
    return new Map([...inh.lines].map((id) => [id, `${inhLabel} · במקור: «${base.get(id) ?? ''}»`]))
  }, [inh, ed.baseDoc, inhLabel])
  // העמוד שמולו עובדים: page.doc, או מה שהשרת החזיר אחרי שמירה (rebase)
  const baseDoc = ed.baseDoc
  const P = baseDoc.page
  const { view, ops } = ed
  const { showAlert, showConfirm } = useDialog()
  // מצב "לספר בלבד": כל תיקון-טקסט בשורה מסמן אותה (train_text = 0) — ראו push למטה. דולק רק בעמוד שבו
  // הודלק (העמוד + מספרו): בפתיחת עמוד — גם אם הדף העוטף מחליף עמוד בלי מופע חדש — הוא כבוי
  const bookOnlyPage = `${page?.id ?? ''}|${P}`
  const [bookOnlyAt, setBookOnlyAt] = useState(null)
  const bookOnly = bookOnlyAt === bookOnlyPage

  const [layout, setLayout] = useState(loadLayout)
  const [scanMode, setScanMode] = useState('frames')
  const [tabPick, setTabPick] = useState(null)
  const [sel, setSel] = useState(null)
  const [request, setRequest] = useState(null)
  const [hint, setHint] = useState(() => (ed.restored ? { text: 'שוחזרה טיוטה שמורה — אפשר להמשיך מאיפה שהפסקתם', n: 0 } : null))
  const [linkPending, setLinkPending] = useState(null)
  // הצד השני של קישור בעמוד אחר: {start: מספר-עמוד | null} — החלון פתוח
  const [otherPage, setOtherPage] = useState(null)
  // חלונית הקישור (לחיצה על המספר שאחרי המילה): {from, to, other, rect} — הקישור לפי שתי השורות שלו
  const [linkPop, setLinkPop] = useState(null)
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
  const locked = useMemo(() => {
    const s = new Set(recutLineIds(baseDoc, ops))
    for (const id of lockedExtra || []) s.add(id)
    return s
  }, [baseDoc, ops, lockedExtra])
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

  // ---- push: כל פעולה עוברת כאן. במצב "לספר בלבד" תיקון-טקסט בשורה שעוד אינה מסומנת מקבל
  // באותו צעד גם train_text = 0 (ops.withBookOnly; צעד-ביטול אחד, צבירת-ההקלדה נשמרת).
  // יציב לאורך חיי המופע — המצב והתצוגה העדכניים דרך ref ----
  const bo = useRef({ on: false, view, P, told: false })
  useLayoutEffect(() => {
    bo.current.on = bookOnly && !textRO
    bo.current.view = view
    bo.current.P = P
  })
  const rawPush = ed.push
  const push = useCallback(
    (...args) => {
      const b = bo.current
      if (!b.on) return rawPush(...args)
      const list = withBookOnly(args, b.view, b.P)
      const marked = list.length > args.length
      const ok = rawPush(...list)
      if (ok && marked && !b.told) {
        b.told = true
        say(BOOK_ONLY_HINTS.firstMark)
      }
      return ok
    },
    [rawPush, say]
  )
  const toggleBookOnly = () => {
    const on = !bookOnly
    setBookOnlyAt(on ? bookOnlyPage : null)
    bo.current.told = false
    say(on ? BOOK_ONLY_HINTS.on : BOOK_ONLY_HINTS.off)
  }

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
  const pop = useWordPopup(view, { onPick: onPickWord, readOnly: textRO, lockedLineIds: locked })
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
  // כמה קישורים לשורת-הערה/פירוש (2026-10-04; כך גם בתוכנת-הספר): קישור הוא (שורת-ההערה, המילים
  // בה — ops.sameLinkSlot). קישור למילים אחרות באותה שורה (הערה שנגמרת ואחריה הבאה, או שתי הערות
  // קצרות) — נוסף לצד הקודם. קישור למילים שכבר מקושרות — מחליף את הקודם, רק אחרי אישור.
  // המספר של הקישור הקיים באותן מילים (0 אם אין) — כמו בטקסט וברשימה, לפי סדר ההופעה בעמוד
  // (flowEdit.linkNumber) — ושאלת ההחלפה. בלי קישור חופף אין המתנה — הפעולה נוספת מיד
  const existingLink = (op) => linkNumber(view, (k) => sameLinkSlot(k, op.ids[0], op.value?.from_words))
  const askReplace = (n) =>
    showConfirm(
      'להחליף את הקישור?',
      `המילים האלה בשורת-ההערה כבר מקושרות — קישור ${linkBadge(n)}. להחליף אותו בקישור החדש? (קישור ממילים אחרות באותה שורה — למשל ההערה הבאה שמתחילה באמצע השורה — נוסף לצדו)`,
      null,
      'החלפה',
      'ביטול'
    )
  const link = async () => {
    if (textRO) return
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
    const n = existingLink(r.op)
    if (n > 0 && !(await askReplace(n))) return say('הקישור הקודם נשאר; הקישור החדש לא נוסף')
    if (push(r.op)) {
      setLinkPending(null)
      say(`${n > 0 ? 'הקישור הוחלף' : 'הקישור נוסף'}: «${from.text}» ↔ «${end.text}»`)
    }
  }
  // הצד השני בעמוד אחר: מילה שנבחרה בחלון העמוד האחר (OtherPagePicker) משלימה את הקישור.
  // מחזיר הודעת-שגיאה לחלון (שנשאר פתוח) או null
  const pickOtherPage = async (pick, fview) => {
    if (textRO || !linkPending) return LINK_ERRORS.gone
    const r = planOtherPageLink(view, linkPending.from, pick, fview)
    if (r.error) return r.error
    const bad = validateOp(baseDoc, r.op)
    if (bad) return bad
    const from = linkPending.from
    const n = existingLink(r.op)
    if (n > 0 && !(await askReplace(n))) return 'הקישור הקודם נשאר; הקישור החדש לא נוסף'
    if (!push(r.op)) return 'הקישור לא נוסף'
    setOtherPage(null)
    setLinkPending(null)
    say(`${n > 0 ? 'הקישור הוחלף' : 'הקישור נוסף'}: «${from.text}» ↔ ${farLabel(pick.page, pick.lineNo, pick.lineId, pick.lineText)}`)
    return null
  }
  const cancelLink = useCallback(() => {
    setOtherPage(null)
    setLinkPending(null)
    say('הקישור בוטל')
  }, [say])
  // העמוד האחר נפתח רק כשהצד הראשון כבר נבחר, ורק כשידוע הספר (gid)
  const gid = page.gid ?? baseDoc.gid ?? null
  const canOtherPage = !textRO && !!gid && !!linkPending
  const openOtherPage = useCallback((n) => setOtherPage({ start: Number.isInteger(n) && n >= 1 ? n : null }), [])
  const closeOtherPage = useCallback(() => setOtherPage(null), [])

  // ---- אישור פסקה-פסקה ----
  const approve = (key) => {
    const plan = planApprove(view, tabKey, key, { locked })
    if (plan.hint) say(plan.hint)
    return plan.ops.length ? push(...plan.ops) : false
  }
  const unapprove = (key) => {
    // פסקה שאושרה בסבב קודם (לפני ההגהה הזו) — אין כאן אישור לבטל; דף עוטף ששומר כל צעד מבטל אותו בשרת
    const info = tabAppr.byKey.get(key)
    if (info?.pre) {
      if (typeof onUnapprovePre === 'function' && !textRO) return onUnapprovePre({ key, lineIds: info.lineIds.slice() })
      return say('הפסקה הזו אושרה כבר בסבב קודם — אין כאן אישור לבטל')
    }
    const pred = unapproveMatcher(view, tabKey, key, { locked })
    if (!pred) return
    ed.removeWhere(pred)
    say('אישור הפסקה בוטל (Ctrl+Z מחזיר אותו)')
  }
  const approveAtCaret = () => {
    if (textRO) return
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
  const joinPara = (key) => !textRO && applyPlan(planJoinPara(view, tabKey, key))

  // ביטול/חזרה: הסמן עובר למקום שבו הטקסט השתנה (ולשונית השורה); שינוי שאינו
  // טקסט (סגנון, פסקה, מסגרת) — הסמן נשאר במקומו, בלי לגנוב את המיקוד מהסריקה
  const history = (which) => {
    const r = which === 'redo' ? ed.redo() : ed.undo()
    if (!r) {
      // אין כאן מה לבטל/להחזיר — לדף העוטף (רשות), למשל צעד שכבר נשמר בשרת
      const empty = which === 'redo' ? onRedoEmpty : onUndoEmpty
      if (!readOnly && typeof empty === 'function') empty()
      return
    }
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

  // ---- שמירה בשרת (דף עוטף — editorRef): העמוד החדש מהשרת, והסמן נשאר במקומו ----
  // הבחירה נלקחת מהדפדפן כשהטקסט במיקוד (עדכנית מ-sel, שמתעדכן אחרי השהיה קצרה); מזהה זמני עובר
  // למזהה שהשרת נתן (idMap), וההיסט — דרך כיווץ-הרווחים של השרת (mapCaretOffset)
  const rebaseKeepCaret = (doc, opts) => {
    const root = textPaneRef.current?.querySelector?.('[data-proof-flow]') || null
    const focused = !!root && root.ownerDocument?.activeElement === root
    const cur = (focused && readDomSelection(root)) || selRef.current
    const r = ed.rebase(doc, opts)
    if (!r || !cur?.focus) return r
    const pos = (p) => {
      if (!p) return null
      const id = r.idMap[p.lineId] ?? p.lineId
      const after = r.textOf(id)
      if (after == null) return null
      const before = lineById.get(p.lineId)
      return { lineId: id, offset: mapCaretOffset(before ? String(before.text ?? '') : after, after, p.offset) }
    }
    const focus = pos(cur.focus)
    if (!focus) return r
    const next = { anchor: pos(cur.anchor) || focus, focus }
    if (focused || !sameSel(next, cur)) moveCaret(next, focused)
    return r
  }

  // ---- ה-callbacks היציבים (לרכיבים ממוזכרים) — תמיד על המצב העדכני ----
  const live = useRef(null)
  useLayoutEffect(() => {
    live.current = { approve, unapprove, goTo, charStyle, joinPara, undo, redo, link, cancelLink, approveAtCaret, goSuspicious, openSuggest, linkPending, readOnly: textRO, P, loadOtherPage, onExtraKey, onSelectionChange, ed, rebaseKeepCaret, onOpsChange, push, view, locked, tabKey }
  })
  useImperativeHandle(
    editorRef,
    () => ({
      flushable: (o) => live.current.ed.flushable(o),
      rebase: (doc, o) => live.current.rebaseKeepCaret(doc, o),
      goTo: (lineId, word = null) => live.current.goTo(lineId, word, { focus: true }),
      say: (text) => say(text),
      push: (...args) => live.current.push(...args),
      openDetails: (tab) => {
        if (typeof tab === 'string' && tab) setDetailsTab(tab)
        setDetailsOpen(true)
      },
      snapshot: () => ({ view: live.current.view, locked: live.current.locked, tabKey: live.current.tabKey }),
    }),
    [say]
  )
  // רשימת-הפעולות השתנתה — לדף העוטף (שמירה אוטומטית), אחרי הרינדור
  useEffect(() => {
    live.current?.onOpsChange?.(ed.allOps)
  }, [ed.allOps])
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
      // לחיצה על מספר-קישור בטקסט ← חלונית הקישור (LinkPopover); לחיצה שנייה על אותו קישור — סוגרת
      onBadge: (ep, rect) => {
        const item = linksInDisplayOrder(live.current.view).find((x) => x.n === ep?.n)
        if (!item) return
        const k = item.link
        setLinkPop((cur) => (cur && cur.from === k.from_line && cur.to === k.to_line ? null : { from: k.from_line, to: k.to_line, other: ep.other, rect }))
      },
      // לחיצה על הסריקה: הסמן עובר לשם, אבל הסריקה עצמה לא זזה (caretY = null)
      onPickLine: (lineId, extra) => live.current.goTo(lineId, extra?.wordIndex ?? null, { focus: false, from: 'scan' }),
      setMode: (m) => setScanMode(m),
      // הטעינה של העמוד האחר דרך הדף העוטף — זהות קבועה, כדי שהחלון לא יטען שוב בכל רינדור
      loadOtherPage: (gid, n) => live.current.loadOtherPage(gid, n),
      // הבחירה בסריקה — לדף העוטף (זהות קבועה: הסריקה ממוזכרת)
      onScanSelection: (s) => live.current.onSelectionChange?.(s),
    }),
    [say, selectFromText]
  )

  // ---- הבחירה בטקסט — לדף העוטף (רשות; הבחירה בסריקה — ScanPanel) ----
  // רק כשהבחירה או הלשונית משתנות, לא בכל שינוי בתצוגה (הקלדה)
  useEffect(() => {
    if (typeof onSelectionChange !== 'function') return
    const ranges = sel && !isCollapsed(sel) ? selectionToLineRanges(view, tabKey, sel.anchor, sel.focus) : sel?.focus ? [{ lineId: sel.focus.lineId }] : []
    onSelectionChange({ from: 'text', anchor: sel?.anchor ?? null, focus: sel?.focus ?? null, lineIds: [...new Set(ranges.map((r) => r.lineId))] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, tabKey])

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
      const inModal = !!t?.closest?.('[aria-modal="true"]')
      const inFlow = !!t?.closest?.('[data-proof-flow]')
      const inField = !!t && !inFlow && isTextField(t)
      // מקשים של הדף העוטף (רשות) — לפני כל קיצור של העורך; true = טופל
      if (typeof H.onExtraKey === 'function' && H.onExtraKey(e, { inFlow, inField, inModal }) === true) return
      if (inModal) return
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
    // k (רשות) — הקישור עצמו: בשורה שיש בה כמה קישורים — רק הוא (from_words), ולא כל קישורי השורה
    linkOk: (src, k) => push({ kind: 'link_ok', page: P, value: linkOpValue(view, src, k, P) }),
    linkDel: (src, k) => push({ kind: 'link_del', page: P, value: linkOpValue(view, src, k, P) }),
    // "בטל קישור" — לכל קישור (linkCancel.unlinkPlan): קישור שנוסף בעריכה הזו (גם בעמוד, גם לעמוד אחר) —
    // הפעולה link_add עצמה יורדת (צעד-ביטול אחד; לא link_del, שהיה נשלח יחד איתה); קישור שהגיע עם העמוד,
    // אוטומטי או ידני — link_del; קישור שהפירוש שלו בעמוד אחר — מבטלים שם
    unlink: (k) => {
      if (textRO) return false
      const plan = unlinkPlan(view, k, P, baseDoc)
      if (plan.action === 'remove') {
        // הקישור החדש החליף קישור שהגיע עם העמוד — גם הוא מבוטל, באותו צעד (plan.add)
        const pred = (op) => plan.match(op)
        pred.add = plan.add
        // קישור שהתקבל ממישהו אחר (inherited — הבודק השני, עמוד שנפתח מחדש): ההגשה הקודמת אולי כבר הוחלה בספר,
        // ולכן במקום הורדה שקטה — "אין קישור" מפורש (revert), כמו ב"החזר למקור"
        if (inh && ed.ops.some((op, i) => inh.idx.has(i) && plan.match(op))) {
          pred.add = [{ kind: 'link_del', page: P, value: linkOpValue(view, k.from_line, k, P), revert: true }]
        }
        ed.removeWhere(pred)
        say(LINK_HE.cancelledAdded)
        return true
      }
      if (plan.action === 'op') {
        if (!push(plan.op)) return false
        say(LINK_HE.cancelled)
        return true
      }
      if (plan.hint) say(plan.hint)
      return false
    },
    // "החזר לאוטומטי" לקישור שבוטל (entry מ-linkCancel.cancelledLinks): בעריכה הזו — פעולת-הביטול יורדת;
    // קודם — link_reset (ובוטלה ההחזרה — הפעולה שלה יורדת)
    restoreLink: (c) => {
      if (textRO || !c?.restore) return
      if (c.restore.action === 'remove') {
        ed.removeWhere(c.restore.match)
        say(c.pending ? LINK_HE.resetUndone : LINK_HE.restored)
      } else if (c.restore.action === 'op' && push(c.restore.op)) {
        say(LINK_HE.resetQueued)
      }
    },
    // השם הקודם (קישור שנוסף בעריכה הזו) — אותו דבר כמו unlink
    removeLink: (k) => drawerAct.unlink(k),
    otherPage: canOtherPage ? openOtherPage : null,
    startLink: textRO ? null : link,
    cancelLink,
    script: (v) => lineOp('script', v),
    mixed: (b) => lineOp('mixed_line', b ? 1 : 0),
    // ודאות; בשורה שסומנה "לספר בלבד" בנוסח הישן (ודאות "פגם בדפוס") — הסימון עובר באותו צעד ל-train_text = 0,
    // כדי שבחירת-ודאות לא תמחק אותו בשקט. תמיד, גם כשהשורה הגיעה כבר עם train_text = 0: תוכנת-הספר מייצאת כך
    // שורה בנוסח הישן (pagedoc), ובמסד שלה הסימון הוא עדיין רק הוודאות שהפעולה הזו מחליפה
    certainty: (v, why) => {
      const value = { v, why: why || null }
      if (!isPrintDefect(caretLine) || !(caretLine.id > 0)) return lineOp('certainty', value)
      const ids = [caretLine.id]
      return push({ kind: 'certainty', page: P, ids, value }, { kind: 'train_text', page: P, ids, value: 0 })
    },
    // "לספר בלבד" לשורה אחת (בלי קשר למצב שבסרגל): on — 0, אחרת 1 (חזרה לאימון). שורה שסומנה בנוסח
    // הישן — ההסרה מורידה גם את ודאות "פגם בדפוס" (חזרה ל"סביר"), באותו צעד
    bookOnly: (on) => {
      const legacy = !on && isPrintDefect(caretLine) && caretLine.id > 0
      const ok = legacy
        ? push(
            { kind: 'train_text', page: P, ids: [caretLine.id], value: 1 },
            { kind: 'certainty', page: P, ids: [caretLine.id], value: { v: 'probable', why: null } }
          )
        : lineOp('train_text', on ? 0 : 1)
      if (ok) say(on ? BOOK_ONLY_HINTS.lineOn : BOOK_ONLY_HINTS.lineOff)
    },
    lineOk: () => lineOp('line_ok'),
    remove: () => {
      if (lineOp('status', 'removed')) say('השורה סומנה "לא-שורה" והוסרה מהטקסט — שחזור בכרטיסיית "עמוד"')
    },
    restoreLine: (id) => push({ kind: 'status', page: P, ids: [id], value: 'restore' }),
    pageType: (v) => push({ kind: 'page_type', page: P, value: v }),
    toLinesMode: () => setScanMode('lines'),
    removeOp: (i) => ed.removeAt(i),
    // "החזר למקור" לפעולה שהתקבלה ממישהו אחר — יורדת מהטיוטה, ובמקומה פעולה הפוכה מפורשת (inverseOps: הערך שבעמוד
    // המקורי), כדי שההחזרה תגיע לספר גם כשההגשה הקודמת כבר הוחלה שם. צעד-ביטול אחד
    revertInherited: (i) => {
      if (readOnly || !inh?.idx.has(i)) return
      const target = ed.ops[i]
      if (!target) return
      const pred = (op) => op === target
      pred.add = inverseOps(ed.baseDoc, target)
      ed.removeWhere(pred)
      say('השינוי הוחזר למקור (Ctrl+Z מחזיר אותו)')
    },
    // לשונית של דף עוטף (extraTabs): פעולות-חוזה אל רשימת-הפעולות, כמו לחיצה בסרגל
    push: (...args) => push(...args),
  }

  // ---- חלונית הקישור: הקישור שנפתח (לפי שתי השורות שלו — המספר עשוי להשתנות) ----
  const popItem = linkPop ? linksInDisplayOrder(view).find((x) => x.link.from_line === linkPop.from && x.link.to_line === linkPop.to) || null : null
  const closeLinkPop = useCallback(() => setLinkPop(null), [])
  // הקישור בוטל או השתנה (גם מלוח הפרטים, או ב-Ctrl+Z) — החלונית נסגרת
  useEffect(() => {
    if (linkPop && !popItem) setLinkPop(null)
  }, [linkPop, popItem])

  // ---- הסרגל ----
  const edit = !readOnly
  const textEdit = !textRO
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
        readOnly={scanRO}
        currentLineId={track.lineId}
        currentWord={track.word}
        caretY={track.y}
        lockedLineIds={locked.size ? locked : EMPTY_SET}
        onPickLine={stable.onPickLine}
        push={push}
        frameStreamDefault={tabKey}
        scanOverlay={scanOverlay}
        frameActions={frameActions}
        onSelectionChange={typeof onSelectionChange === 'function' ? stable.onScanSelection : undefined}
      />
    </div>
  )

  const flow = (
    <FlowEditor
      view={view}
      tabKey={tabKey}
      push={push}
      readOnly={textRO}
      locked={locked}
      recheck={recheck}
      marked={marked}
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
      onBadge={stable.onBadge}
      onJoinPara={textRO ? null : stable.onJoinPara}
      lockTitle={help?.lockedLine}
      unapprovePre={!textRO && typeof onUnapprovePre === 'function'}
    />
  )

  const textPane = (
    <div
      ref={textPaneRef}
      style={{ order: layout.swap ? 1 : 3 }}
      data-focus-dim={fx?.dimText ? '' : undefined}
      className={`h-[70vh] min-h-[360px] min-w-0 flex-1 lg:h-auto lg:min-h-0 ${fx?.dimText ? 'opacity-70' : ''}`}
    >
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
        readOnly={textRO}
        fontSize={layout.fontSize}
        fontFamily={fontFamily}
        className="h-full"
        editorSlot={typeof textView === 'function' ? textView({ flow, view, tabKey, goTo }) : flow}
      />
    </div>
  )

  return (
    <div className="flex flex-col" dir="rtl">
      <ProofToolbar
        canUndo={ed.canUndo || (!!canUndoEmpty && typeof onUndoEmpty === 'function')}
        canRedo={ed.canRedo || (!!canRedoEmpty && typeof onRedoEmpty === 'function')}
        onUndo={undo}
        onRedo={redo}
        paraStyle={paraStyle}
        onParaStyle={textEdit && hasCaret && !furnitureTab ? (style) => applyPlan(planParaStyle(view, tabKey, sel, style)) : null}
        charStyles={ci?.charStyles}
        onCharStyle={textEdit && hasCaret ? charStyle : null}
        onSplitPara={textEdit && hasCaret && !furnitureTab ? () => applyPlan(planEnter(view, tabKey, sel)) : null}
        onJoinPara={textEdit && hasCaret && !furnitureTab && paraIdx > 0 ? () => applyPlan(planJoin(view, tabKey, caret)) : null}
        onLink={textEdit && (hasCaret || linkPending) ? link : null}
        linkPending={linkPending}
        onSuggest={hasCaret && ci.wordIndex >= 0 && hasSuggestions(caretLine, ci.wordIndex) ? openSuggest : null}
        onNextSuspicious={suspectCount > 0 ? goSuspicious : null}
        streams={streams}
        onStreamForLines={edit && hasCaret ? streamForLines : null}
        onBookOnly={textEdit ? toggleBookOnly : null}
        bookOnly={textEdit && bookOnly}
        bookOnlyTitle={typeof help?.bookOnlyTitle === 'string' ? help.bookOnlyTitle : undefined}
        fontSize={layout.fontSize}
        setFontSize={(n) => updateLayout({ fontSize: clampFontSize(n) })}
        fontFamily={fontFamily}
        setFontFamily={(f) => updateLayout({ fontFamily: f })}
        onHelp={() => setHelpOpen(true)}
        onGuide={guideOf(help) ? () => openGuide(guideOf(help)) : null}
        detailsOpen={detailsOpen}
        onToggleDetails={() => setDetailsOpen((o) => !o)}
        actions={actionsNode}
        readOnly={readOnly}
        className={toolbarClassName}
        charStyleButtons={charStyleButtons ?? undefined}
        paraStyleOptions={paraStyleOptions ?? undefined}
        moreMenu={moreMenu}
        hide={fx?.hide}
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
        data-proof-panes=""
        style={{ '--scan-w': `${layout.split}%` }}
        className="mt-2 flex flex-col gap-2 lg:h-[calc(100vh_-_var(--proof-chrome,12.5rem))] lg:min-h-[560px] lg:flex-row lg:gap-0"
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
              extraTabs={extraTabs}
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
              lockTitle={help?.lockedLine}
              inherited={inh ? { idx: inh.idx, label: inhLabel } : null}
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
        bookOnly={textEdit && bookOnly}
      />

      {pop.popup}
      {popItem && (
        <LinkPopover
          view={view}
          link={popItem.link}
          n={popItem.n}
          anchorRect={linkPop.rect}
          readOnly={readOnly}
          onClose={closeLinkPop}
          onJump={() => {
            closeLinkPop()
            stable.onJump(linkPop.other)
          }}
          onOk={(k) => {
            closeLinkPop()
            if (drawerAct.linkOk(k.from_line)) say('הקישור אושר')
          }}
          onUnlink={(k) => {
            closeLinkPop()
            drawerAct.unlink(k)
          }}
        />
      )}
      {otherPage && canOtherPage && (
        <OtherPagePicker
          gid={gid}
          view={view}
          from={linkPending.from}
          startPage={otherPage.start}
          onPick={pickOtherPage}
          onClose={closeOtherPage}
          fetchLines={typeof loadOtherPage === 'function' ? stable.loadOtherPage : undefined}
        />
      )}
      <ProofHelp open={helpOpen} onClose={closeHelp} autoOpen={typeof helpAutoOpen === 'boolean' ? helpAutoOpen : !readOnly && persist} texts={help} />
    </div>
  )
}
