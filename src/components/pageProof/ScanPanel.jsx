'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import ProofScan from './ProofScan'
import FramePopover, { StreamPicker } from './FramePopover'
import { snapFrame } from '@/lib/pageProof/ops'
import { linesInRect, newFid, straddlingLineIds } from '@/lib/pageProof/view'
import { isKey } from '@/lib/pageProof/keys'
import {
  pageSize,
  clampZoom,
  zoomStep,
  fitZoom,
  clampBox,
  MIN_LINE_BOX,
  lineBoxOk,
  framesState,
  seqInStream,
  streamFrameCount,
  frameEditOps,
  insertFrame,
  patchFrame,
  removeFrame,
  moveInOrder,
  reorderInStream,
  suggestedFrames,
  isObjectFrame,
  streamChips,
  choiceInfo,
  resolveFrameStream,
  drawStreamFor,
  nearestLine,
  wordAtPoint,
  selectionInfo,
  toggleSelection,
  outsideLineIds,
  recutSet,
  straddleClaim,
  frameLabel,
} from '@/lib/pageProof/scanGeometry'

// לוח-הסריקה של עורך הגהת-העמודים: כותרת (מצב "מסגרות"/"שורות", זום, הכלים
// של המצב והסבר של שורה אחת) + הסריקה (ProofScan) + חלונית המסגרת הנבחרת
// (FramePopover). כל עריכה = פעולות-חוזה דרך push; שום דבר לא נשמר כאן חוץ
// מהעדפת הזום (localStorage 'pageProof.scanZoom').
//
// Props (החוזה מול ProofEditor):
//   view                התצוגה (buildView) — size, page, lines, frames, frames_confirmed, cut_ok, streams
//   imageUrl            תמונת-העמוד
//   mode, setMode       'frames' (ברירת-המחדל) | 'lines'. בלי setMode — הלוח מחזיק את המצב בעצמו
//   readOnly            תצוגה בלבד: בלי כלים ובלי פעולות; לחיצה עדיין מזיזה את הסמן
//   currentLineId       השורה של הסמן בטקסט — פס שקוף + חץ; הסריקה נגללת אליה כשאינה בחלון
//   currentWord         מספר המילה של הסמן בשורה (אינדקס ב-words[] של השורה; אין = -1):
//                       מודגשת על הסריקה (words[i].bbox), בשני המצבים
//   caretY              ה-clientY של ראש השורה של הסמן בלוח-הטקסט — רק כשהסמן זז מהטקסט
//                       (מקלדת/עכבר שם); null כשהוא זז מלחיצה על הסריקה. כשהוא משתנה הסריקה
//                       נגללת כך שראש תיבת-השורה עומד מולו (ProofScan)
//   lockedLineIds       Set (או מערך) — שורות שממתינות לזיהוי מחדש (recutLineIds), נוסף על
//                       השורות שפעולות-חיתוך יצרו או שינו (_recut בתצוגה)
//   onPickLine(lineId, extra?)  לחיצה על טקסט בסריקה: הסמן עובר לשורה (והלשונית, אם צריך).
//                       extra = {wordIndex} כשידועה המילה שמתחת לעכבר (לפי תיבות-המילים)
//   push(...ops)        הוספת פעולות כקבוצת-Undo אחת; מחזיר true אם התקבלו
//   frameStreamDefault  הלשונית הפעילה בטקסט — הזרם ההתחלתי של "מסגרת חדשה"
//
// מסגרות: כשאין בעמוד מסגרות מוצגת "הצעת המחשב" (autoFrames — מקווקוות, "הצעה").
// העריכה הראשונה (או "✓ המסגרות נכונות") שומרת את *כל* ההצעות: frames_set +
// frame_seq לכל מסגרת, כקבוצה אחת. המספר-בזרם נגזר מסדר-הקריאה (כמו בתוכנת-הספר).
// מסגרת מתהדקת לטקסט שבתוכה (snapFrame, כיווץ בלבד) — כשמציירים אותה, מזיזים אותה או
// משנים את גודלה. הזרם: זרם-תוכן, הכותרת שלו ("כותרת הערות"), או "ריהוט הדף".
// החלונית של מסגרת נבחרת נפתחת בלחיצה עליה (לא בציור מסגרת חדשה — זו רק נבחרת, עם הידיות),
// יושבת מחוץ למסגרת ונעלמת בזמן גרירה;
// "סגירה" סוגרת רק אותה — המסגרת נשארת בחורה (Esc / לחיצה מחוץ לה מבטלים את הבחירה).
// שורות: פיצול / איחוד / שורה חדשה / תיבה / לא-שורה / "החיתוך תקין". שורות
// שחיתוכן שונה מסומנות "לזיהוי מחדש" — הן ייחתכו וייקראו שוב בתוכנת-הספר.
// שורה שבולטת מהמסגרת (קו אדום מקווקו): "השורה שייכת למסגרת הזו" — בסרגל-ההסבר ובחלונית
// של המסגרת (לשורה שבסמן), ובמצב "שורות" (לשורה שנבחרה) — פעולת stream אחת לפי המסגרת
// שמכילה את רובה (scanGeometry.straddleClaim); אחריה הסימון יורד.
// כל שינוי במסגרות הוא push אחד = צעד-ביטול אחד (גרירה/שינוי-גודל — רק בשחרור העכבר);
// Ctrl+Z / Ctrl+Y מטופלים ב-ProofEditor גם כשהמיקוד כאן או בחלונית.

const ZOOM_KEY = 'pageProof.scanZoom'
// רוחב משוער לפני שהלוח נמדד (סביבת-בדיקות / רגע הטעינה)
const DEFAULT_VIEWPORT = 640
const EMPTY = new Set()

const FRAME_RULES = [
  'מסגרת = אזור רציף אחד של זרם אחד. פסקה חדשה באותו זרם — לא מסגרת חדשה.',
  'טקסט בשני טורים: שתי מסגרות באותו זרם — הימנית 1, השמאלית 2.',
  'הערות בתחתית: מסגרת בזרם "הערות".',
  'כותרת (של פרק, של סעיף, של ההערות): מסגרת משלה בזרם הכותרת — "כותרת", "כותרת הערות" וכן הלאה.',
  'כותרת-רצה, מספר עמוד, שומר-דף: "ריהוט הדף" (למעלה — כותרת עמוד, למטה — תחתית). הקו שמפריד בין הטקסט להערות: "עוד…" ← מפריד.',
  'שם הפרק מופיע רק בכותרת-הרצה? היא נשארת ריהוט — ובהגשה כתבו בהערה למנהל שפרק חדש מתחיל בעמוד הזה.',
  'קישוט או כתם שהמחשב קרא כשורה — לא ריהוט ולא מסגרת: במצב "שורות" מסמנים אותו "לא-שורה".',
  'שורה שנחתכה על פני שני טורים — נשארת מחוץ למסגרות; לא מרחיבים מסגרת כדי "לתפוס" אותה (מתקנים אותה במצב "שורות" ← פיצול).',
  'שורה שכולה שייכת למסגרת ורק בולטת ממנה מעט (קו אדום) — לוחצים עליה ו«השורה שייכת למסגרת הזו», או מגדילים את המסגרת.',
  'כל שינוי במסגרות — ציור, הזזה, גודל, זרם, מספר, אישור או מחיקה — מתבטל ב-Ctrl+Z (או בכפתור הביטול שבסרגל).',
]

// ההסבר על "השורה שייכת למסגרת הזו"
const CLAIM_TITLE =
  'הזרם של השורה ייקבע ביד לפי המסגרת שמכילה את רובה, והסימון האדום יורד. שורה שנחתכה על פני שני טורים — אל תשייכו אותה: פצלו אותה במצב "שורות"'

const NOTICE = {
  splitTemp: 'את השורה הזאת יצרתם עכשיו בתיקון — היא תיחתך מחדש בתוכנה ואי-אפשר לפצל אותה שוב כאן (לביטול: Ctrl+Z)',
  splitRemoved: 'השורה מסומנת "לא-שורה" — שחזרו אותה קודם',
  splitResized:
    'לשורה הזאת כבר שיניתם את התיבה, והפיצול נבדק מול התיבה המקורית שלה — פצלו בתוך התיבה המקורית, או בטלו קודם את שינוי התיבה (Ctrl+Z)',
  tempSelected: 'שורה שנוצרה בתיקון החיתוך ממתינה לזיהוי מחדש — אפשר לבטל אותה עם Ctrl+Z',
  boxTooSmall: `התיבה קטנה מדי לשורה (לפחות ${MIN_LINE_BOX[0]}×${MIN_LINE_BOX[1]} פיקסלים בסריקה) — הגדילו את הזום וציירו שוב`,
}

// שורה אחת / N שורות
const linesHe = (n) => (n === 1 ? 'שורה אחת' : `${n} שורות`)

// אחרי הצביעה הבאה (בסביבה בלי requestAnimationFrame — מיד אחרי האירוע)
const afterPaint = (fn) =>
  typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame(fn) : setTimeout(fn, 0)

function loadZoomPref() {
  try {
    const v = JSON.parse(window.localStorage.getItem(ZOOM_KEY) || 'null')
    if (v && typeof v.fit === 'boolean' && Number.isFinite(v.zoom)) return { fit: v.fit, zoom: clampZoom(v.zoom) }
  } catch {
    /* אחסון חסום/פגום — ברירת-המחדל */
  }
  return { fit: true, zoom: 1 }
}

function saveZoomPref(v) {
  try {
    window.localStorage.setItem(ZOOM_KEY, JSON.stringify(v))
  } catch {
    /* אחסון חסום — הזום פשוט לא נזכר */
  }
}

// ---- רכיבי-הכותרת (במראה של סרגל-העורך הישן) ----

function Seg({ label, children }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-0 rounded-md bg-neutral-100 p-0.5">
      {children}
    </div>
  )
}

function SegBtn({ active = false, children, ...rest }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`flex h-7 items-center gap-1 whitespace-nowrap rounded px-2 text-[11px] font-medium disabled:opacity-40 ${active ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
      {...rest}
    >
      {children}
    </button>
  )
}

function IconBtn({ icon, label, ...rest }) {
  return (
    <button type="button" aria-label={label} title={label} className="flex h-7 w-7 items-center justify-center rounded hover:bg-white disabled:opacity-40" {...rest}>
      <span className="material-symbols-outlined text-sm">{icon}</span>
    </button>
  )
}

function ActBtn({ children, tone = 'plain', ...rest }) {
  const tones = {
    plain: 'border-surface-variant bg-white text-neutral-700 hover:bg-neutral-50',
    ok: 'border-success-600 bg-success-600 text-white hover:bg-success-700',
    done: 'border-success-200 bg-success-100 text-success-800',
    danger: 'border-surface-variant bg-white text-danger-700 hover:bg-danger-50',
  }
  return (
    <button
      type="button"
      className={`flex h-7 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-[11px] font-medium disabled:cursor-default disabled:opacity-50 ${tones[tone]}`}
      {...rest}
    >
      {children}
    </button>
  )
}

const Sep = () => <span className="h-5 w-px bg-neutral-200" aria-hidden="true" />

function explanation({ mode, tool, readOnly, fs }) {
  if (mode === 'frames') {
    if (readOnly) return 'לחיצה על הסריקה מעבירה את הסמן בטקסט לשורה שם'
    if (tool === 'draw') return 'גררו מלבן סביב אזור טקסט — הוא יתהדק סביב השורות שבתוכו. הזרם של המסגרת החדשה:'
    if (fs.suggested && fs.frames.length) return 'המסגרות המקווקוות הן הצעה של המחשב: אם הן נכונות — «✓ המסגרות נכונות»; אם לא — לחצו על מסגרת ותקנו'
    if (!fs.frames.length) return 'אין מסגרות בעמוד — ציירו מסגרת («מסגרת חדשה») או «עוד ← הצעת המחשב»'
    return 'לחיצה על מסגרת בוחרת אותה (והסמן עובר לשורה שם) · גרירת מסגרת נבחרת מזיזה אותה · הריבועים בפינות ובצדדים משנים את גודלה — והיא מתהדקת לטקסט · Ctrl+Z מבטל כל שינוי'
  }
  if (readOnly) return 'תיבות השורות כפי שנחתכו'
  if (tool === 'split') return 'לחצו בתוך שורה בדיוק במקום שבו צריך לחתוך אותה לשתיים (למשל בין שני טורים)'
  if (tool === 'add') return 'גררו מלבן סביב שורה שהמחשב פספס'
  return 'לחיצה בוחרת שורה (Shift — עוד שורה) · גרירה בוחרת כמה · הריבועים בפינות ובצדדים של שורה נבחרת משנים את התיבה'
}

export default function ScanPanel({
  view,
  imageUrl,
  mode: modeProp = 'frames',
  setMode,
  readOnly = false,
  currentLineId = null,
  currentWord = -1,
  caretY = null,
  lockedLineIds = EMPTY,
  onPickLine,
  push,
  frameStreamDefault = 'main',
}) {
  const [W, H] = pageSize(view)
  const P = view?.page
  const lines = view?.lines || []
  const canEdit = !readOnly && typeof push === 'function'

  const rootRef = useRef(null)
  const bodyRef = useRef(null)
  const moreRef = useRef(null)
  const [ownMode, setOwnMode] = useState(modeProp || 'frames')
  const mode = setMode ? modeProp || 'frames' : ownMode
  const [zoomPref, setZoomPref] = useState(loadZoomPref)
  const [vw, setVw] = useState(0)
  const [framesTool, setFramesTool] = useState('select')
  const [linesTool, setLinesTool] = useState('select')
  const [selectedFid, setSelectedFid] = useState(null)
  // החלונית של המסגרת הנבחרת פתוחה: נפתחת רק בלחיצה על מסגרת; "סגירה" סוגרת רק אותה (המסגרת
  // נשארת בחורה); ציור מסגרת חדשה, גרירה ושינוי-גודל אינם פותחים אותה
  const [popOpen, setPopOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [picked, setPicked] = useState(null) // {forDefault, key} — זרם שנבחר ביד ל"מסגרת חדשה"
  const [notice, setNotice] = useState(null)
  const [moreOpen, setMoreOpen] = useState(false)
  // "✓ המסגרות נכונות" כשיש שורות מחוץ לכל מסגרת — שואלים קודם. נשמר ה-framesState שעליו
  // נשאלה השאלה: כל שינוי בעמוד מבטל אותה מאליו
  const [askFor, setAskFor] = useState(null)

  // רוחב הלוח (להתאמה-לרוחב)
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return undefined
    const measure = () => setVw(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') {
      const id = requestAnimationFrame(measure)
      window.addEventListener('resize', measure)
      return () => {
        cancelAnimationFrame(id)
        window.removeEventListener('resize', measure)
      }
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // סגירת תפריט "עוד" בלחיצה מחוצה לו
  useEffect(() => {
    if (!moreOpen) return undefined
    const onDown = (e) => {
      if (!moreRef.current?.contains(e.target)) setMoreOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [moreOpen])

  // לחיצה מחוץ ללוח (בטקסט, בסרגל) סוגרת את חלונית-המסגרת: אחרת היא נשארת פתוחה בזמן
  // ההקלדה, ו-Delete/Esc כבר לא מגיעים אליה. בשלב-הלכידה — גם כשרכיב אחר עוצר את האירוע
  useEffect(() => {
    if (!selectedFid) return undefined
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setSelectedFid(null)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [selectedFid])

  const zoom = zoomPref.fit ? fitZoom(vw || DEFAULT_VIEWPORT, W) : zoomPref.zoom
  const applyZoom = (v) => {
    setZoomPref(v)
    saveZoomPref(v)
  }
  const setZoom = (z) => applyZoom({ fit: false, zoom: clampZoom(z) })

  const fs = useMemo(() => framesState(view), [view])
  const seqs = useMemo(() => seqInStream(fs.frames), [fs])
  const chips = useMemo(() => streamChips(view, fs.frames), [view, fs])
  const recut = useMemo(() => recutSet(view?.lines, lockedLineIds), [view, lockedLineIds])
  // גם על ההצעה: שורה שנחתכה על פני שני טורים נשארת מחוץ למסגרות המוצעות — ורואים אותה לפני
  // האישור. מחושב בשני המצבים (בשביל "השורה שייכת למסגרת הזו"); הסימון האדום — רק ב"מסגרות"
  const straddleAll = useMemo(() => (fs.frames.length ? straddlingLineIds(view?.lines || [], fs.frames) : EMPTY), [fs, view])
  const straddle = mode === 'frames' ? straddleAll : EMPTY
  const outside = useMemo(() => (mode === 'frames' ? outsideLineIds(view?.lines, fs.frames) : EMPTY), [mode, fs, view])
  const asking = askFor === fs && outside.size > 0
  const selInfo = useMemo(() => selectionInfo(view?.lines, selectedIds), [view, selectedIds])

  const tool = mode === 'frames' ? framesTool : linesTool
  // הבחירה ל"מסגרת חדשה": זרם, זרם-כותרת או "ריהוט הדף" (הזרם האמיתי נקבע בציור)
  const drawStream = picked && picked.forDefault === frameStreamDefault ? picked.key : drawStreamFor(frameStreamDefault)
  const selFrame = mode === 'frames' ? fs.frames.find((f) => f.fid === selectedFid) || null : null

  // "השורה שייכת למסגרת הזו" — לשורה שבולטת מהמסגרת: במצב "מסגרות" לשורה שבסמן (לחיצה על
  // השורה בסריקה או בטקסט), במצב "שורות" לשורה היחידה שנבחרה
  const claimOf = (id) => (canEdit && id != null && straddleAll.has(id) ? straddleClaim(view, id, fs.frames) : null)
  const claimHere = mode === 'frames' ? claimOf(currentLineId) : null
  const claimSel = mode === 'lines' && selInfo.live.length === 1 && !selInfo.removed.length ? claimOf(selInfo.live[0]) : null
  const claimLabel = (c) => frameLabel(view, c.frame, seqs.get(c.frame.fid) ?? null)
  const claimLine = (c) => {
    if (c && push(c.op)) setNotice(`השורה שויכה למסגרת «${claimLabel(c)}» — הזרם שלה נקבע ביד (Ctrl+Z מבטל)`)
  }
  const liveLines = () => lines.filter((l) => l.status !== 'removed' && Array.isArray(l.bbox))
  // מסגרת-טקסט מתהדקת לשורות שמרכזן בתוכה (כיווץ בלבד); מסגרת-אובייקט (טבלה/איור) — כמו שצוירה
  const hug = (box, frame = null) => (frame && isObjectFrame(frame) ? clampBox(box, W, H) : clampBox(snapFrame(box, liveLines()), W, H))

  const focusRoot = () => rootRef.current?.focus({ preventScroll: true })
  const changeMode = (m) => {
    setNotice(null)
    setMoreOpen(false)
    setAskFor(null)
    if (setMode) setMode(m)
    else setOwnMode(m)
  }
  const changeTool = (t) => {
    setNotice(null)
    if (mode === 'frames') {
      setFramesTool(t)
      if (t !== 'select') setSelectedFid(null)
    } else setLinesTool(t)
  }

  const pickLine = (line, point) => {
    if (!onPickLine || !line || line.status === 'removed') return
    const wi = point ? wordAtPoint(line, point) : null
    if (wi == null) onPickLine(line.id)
    else onPickLine(line.id, { wordIndex: wi })
    // הסמן בטקסט זז, אבל המקלדת נשארת בסריקה — Delete/Esc שייכים למסגרת או לשורה שנבחרו
    // כאן. דפדפנים מעבירים את המיקוד לעורך כשהבחירה בו נקבעת תוך כדי לחיצה; מחזירים אותו
    afterPaint(focusRoot)
  }

  // ---- מסגרות ----
  // כל עריכה שולחת את רשימת-המסגרות המלאה; כשהמוצג הוא הצעה — כולה נשמרת
  const commitFrames = (next, opts = {}) => {
    if (!canEdit) return false
    return push(...frameEditOps(P, next, W, H, { materialise: fs.suggested, ...opts }))
  }

  const onFramesClick = ({ point, frame, line }) => {
    setNotice(null)
    if (frame) {
      if (canEdit) {
        setSelectedFid(frame.fid)
        setPopOpen(true)
        if (framesTool !== 'select') setFramesTool('select')
      }
      pickLine(nearestLine(lines, point, frame.bbox), point)
      return
    }
    setSelectedFid(null)
    pickLine(line, point)
  }

  const onDrawFrame = (box) => {
    const bbox = hug(box)
    const stream = resolveFrameStream(drawStream, bbox, lines, H)
    const fid = newFid(new Set(fs.frames.map((f) => f.fid)))
    if (commitFrames(insertFrame(fs.frames, { fid, stream, bbox, order: 0 }))) {
      // המסגרת החדשה נבחרת (הידיות שלה מוצגות), אבל החלונית לא נפתחת — כמו אחרי הזזה או שינוי-גודל;
      // היא נפתחת בלחיצה על המסגרת. במפורש false: אחרת חלונית שהייתה פתוחה למסגרת אחרת הייתה עוברת אליה
      setSelectedFid(fid)
      setPopOpen(false)
      setFramesTool('select')
    }
  }

  // הזזה / שינוי-גודל: המסגרת מתהדקת שוב לטקסט שבתוכה; בלי שינוי בפועל — בלי פעולה
  const onFrameBox = (fid, box) => {
    const f = fs.frames.find((x) => x.fid === fid)
    if (!f) return false
    const bbox = hug(box, f)
    if (!bbox || (Array.isArray(f.bbox) && bbox.every((v, i) => v === f.bbox[i]))) return false
    return commitFrames(patchFrame(fs.frames, fid, { bbox }))
  }

  // שורות-תוכן מחוץ לכל מסגרת — קודם שואלים (לחיצה שנייה, או "כן, לאשר", מאשרת)
  const confirmFrames = () => {
    setNotice(null)
    if (outside.size > 0 && askFor !== fs) {
      setAskFor(fs)
      return
    }
    setAskFor(null)
    commitFrames(fs.frames, { extra: { confirmed: true } })
  }

  const resuggest = () => {
    setMoreOpen(false)
    const sug = suggestedFrames(view)
    if (!canEdit || !sug.length) return
    if (push(...frameEditOps(P, sug, W, H, { materialise: true }))) setSelectedFid(null)
  }

  const clearFrames = () => {
    setMoreOpen(false)
    if (canEdit && push({ kind: 'frames_clear', page: P })) setSelectedFid(null)
  }

  // החלונית (ProofScan ממקם אותה מחוץ למסגרת ומסתיר אותה בזמן גרירה)
  const popover = (() => {
    if (!selFrame || !canEdit || framesTool !== 'select' || !popOpen) return null
    const fid = selFrame.fid
    return (
      <FramePopover
        frame={selFrame}
        seq={seqs.get(fid) ?? null}
        seqCount={streamFrameCount(fs.frames, selFrame.stream)}
        orderIndex={fs.frames.findIndex((f) => f.fid === fid)}
        orderCount={fs.frames.length}
        chips={chips}
        suggested={fs.suggested}
        onClaimLine={claimHere && claimHere.frame.fid === fid ? () => claimLine(claimHere) : null}
        claimTitle={CLAIM_TITLE}
        onStream={(key) => {
          // "ריהוט הדף" — כותרת עמוד / תחתית לפי השורות שבמסגרת ומקומה בעמוד
          const stream = resolveFrameStream(key, selFrame.bbox, lines, H)
          if (stream !== selFrame.stream) commitFrames(patchFrame(fs.frames, fid, { stream }))
        }}
        onSeq={(n) => commitFrames(reorderInStream(fs.frames, fid, n), { seqFids: [fid] })}
        onOrder={(dir) => commitFrames(moveInOrder(fs.frames, fid, dir))}
        onKind={(kind) => commitFrames(patchFrame(fs.frames, fid, { kind: kind || null }))}
        onDelete={() => {
          if (commitFrames(removeFrame(fs.frames, fid))) setSelectedFid(null)
          focusRoot()
        }}
        onClose={() => {
          setPopOpen(false)
          focusRoot()
        }}
      />
    )
  })()

  // ---- שורות ----
  const onLinesClick = ({ point, line, additive }) => {
    setNotice(null)
    if (linesTool === 'split') {
      if (!canEdit || !line) return
      if (!(line.id > 0) || line._new) return setNotice(NOTICE.splitTemp)
      if (line.status === 'removed') return setNotice(NOTICE.splitRemoved)
      const x = Math.round(point[0])
      if (!(x > line.bbox[0] && x < line.bbox[2])) return
      if (push({ kind: 'line_split', page: P, ids: [line.id], value: { x } })) setSelectedIds([])
      // תיבה ששונתה כאן (_recut בשורה מקורית): הבדיקה היא מול התיבה המקורית — מסבירים למה נדחה
      else if (line._recut) setNotice(NOTICE.splitResized)
      return
    }
    if (linesTool === 'add') return
    setSelectedIds((ids) => toggleSelection(ids, line ? [line.id] : [], additive))
    if (line && (!(line.id > 0) || line._new)) setNotice(NOTICE.tempSelected)
    if (line && !additive) pickLine(line, point)
  }

  const onBand = (box, additive) => setSelectedIds((ids) => toggleSelection(ids, linesInRect(lines, box), additive))

  const onAddLine = (box) => {
    if (!canEdit) return
    if (!lineBoxOk(box)) return setNotice(NOTICE.boxTooSmall)
    // בלי stream: הזרם נגזר (מסגרת / השורה הסמוכה בטור) ואינו נרשם כתיוג-אדם
    if (push({ kind: 'line_add', page: P, value: { bbox: box, text: '' } })) setLinesTool('select')
  }

  const onLineBox = (id, box) => {
    if (!canEdit) return
    if (!lineBoxOk(box)) return setNotice(NOTICE.boxTooSmall)
    push({ kind: 'bbox', page: P, ids: [id], value: box })
  }

  const mergeLines = () => {
    if (canEdit && selInfo.canMerge && push({ kind: 'line_merge', page: P, ids: selInfo.live })) setSelectedIds([])
  }
  const removeLines = () => canEdit && selInfo.live.length > 0 && push({ kind: 'status', page: P, ids: selInfo.live, value: 'removed' })
  const restoreLines = () => canEdit && selInfo.removed.length > 0 && push({ kind: 'status', page: P, ids: selInfo.removed, value: 'restore' })
  const markCutOk = () => canEdit && push({ kind: 'cut_ok', page: P, value: true })

  // ---- מקלדת (כשהמיקוד בלוח הסריקה) ----
  const onKeyDown = (e) => {
    const t = e.target
    const tag = t?.tagName
    // שדה-הקלדה — שלו; תיבת-סימון או רשימה בחלונית עדיין נסגרות ב-Esc
    if (t && (tag === 'TEXTAREA' || t.isContentEditable || (tag === 'INPUT' && !/^(checkbox|radio|button)$/.test(t.type)))) return
    if (isKey(e, 'Escape')) {
      let closed = false
      const close = (fn) => {
        fn()
        closed = true
      }
      setNotice(null)
      if (moreOpen) close(() => setMoreOpen(false))
      if (asking) close(() => setAskFor(null))
      if (mode === 'frames') {
        if (selectedFid) close(() => setSelectedFid(null))
        else if (framesTool !== 'select') close(() => setFramesTool('select'))
      } else if (selectedIds.length) close(() => setSelectedIds([]))
      else if (linesTool !== 'select') close(() => setLinesTool('select'))
      if (closed) {
        // נסגר משהו בסריקה — Esc לא ממשיך לסגור גם את חלון-הסקירה של המנהל; המקלדת נשארת כאן
        e.preventDefault()
        focusRoot()
      }
      return
    }
    if (tag === 'INPUT' || tag === 'SELECT') return
    if (!canEdit || !(isKey(e, 'Delete') || isKey(e, 'Backspace'))) return
    if (mode === 'frames' && selFrame) {
      e.preventDefault()
      if (commitFrames(removeFrame(fs.frames, selFrame.fid))) setSelectedFid(null)
    } else if (mode === 'lines' && selInfo.live.length) {
      e.preventDefault()
      removeLines()
    }
  }

  const tip = notice || explanation({ mode, tool, readOnly: !canEdit, fs })

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      dir="rtl"
      data-testid="scan-panel"
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-surface-variant bg-white outline-none"
    >
      {/* שורת-הכלים */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-surface-variant px-2 py-1.5">
        <Seg label="מה מוצג על הסריקה">
          <SegBtn active={mode === 'frames'} onClick={() => changeMode('frames')} title="אזורי הטקסט בעמוד — זרם וסדר קריאה">
            מסגרות
          </SegBtn>
          <SegBtn active={mode === 'lines'} onClick={() => changeMode('lines')} title="תיבות השורות — תיקון החיתוך">
            שורות
          </SegBtn>
        </Seg>
        <Sep />
        <Seg label="זום">
          <IconBtn icon="zoom_out" label="הקטנה (Ctrl+גלגלת)" onClick={() => setZoom(zoomStep(zoom, -1))} />
          <span className="min-w-[2.5rem] text-center text-[10px] font-medium tabular-nums text-neutral-700" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <IconBtn icon="zoom_in" label="הגדלה (Ctrl+גלגלת)" onClick={() => setZoom(zoomStep(zoom, 1))} />
          <SegBtn active={zoomPref.fit} onClick={() => applyZoom({ fit: true, zoom })} title="התאמה לרוחב הלוח">
            רוחב
          </SegBtn>
        </Seg>

        {canEdit && mode === 'frames' && (
          <>
            <Sep />
            <Seg label="כלי המסגרות">
              <SegBtn active={framesTool === 'select'} onClick={() => changeTool('select')} title="בחירה, הזזה ושינוי גודל של מסגרת">
                בחירה
              </SegBtn>
              <SegBtn active={framesTool === 'draw'} onClick={() => changeTool('draw')} title="ציור מסגרת סביב אזור טקסט">
                מסגרת חדשה
              </SegBtn>
            </Seg>
          </>
        )}

        {canEdit && mode === 'lines' && (
          <>
            <Sep />
            <Seg label="כלי השורות">
              <SegBtn active={linesTool === 'select'} onClick={() => changeTool('select')} title="בחירת שורות ושינוי תיבה">
                בחירה
              </SegBtn>
              <SegBtn active={linesTool === 'split'} onClick={() => changeTool('split')} title="חיתוך שורה לשתיים בנקודה שלוחצים עליה">
                פיצול
              </SegBtn>
              <SegBtn active={linesTool === 'add'} onClick={() => changeTool('add')} title="שורה שהמחשב פספס">
                שורה חדשה
              </SegBtn>
            </Seg>
            {linesTool === 'select' && (
              <>
                <ActBtn disabled={!selInfo.canMerge} onClick={mergeLines} title="איחוד שתי השורות שנבחרו לשורה אחת (בחרו שתיים עם Shift)">
                  איחוד
                </ActBtn>
                {selInfo.removed.length > 0 && !selInfo.live.length ? (
                  <ActBtn onClick={restoreLines} title="החזרת השורה שסומנה כלא-שורה">
                    שחזור שורה
                  </ActBtn>
                ) : (
                  <ActBtn tone="danger" disabled={!selInfo.live.length} onClick={removeLines} title="התיבה אינה שורת טקסט (כתם, קישוט, רעש) — תוסר (Delete)">
                    לא-שורה
                  </ActBtn>
                )}
                {claimSel && (
                  <ActBtn onClick={() => claimLine(claimSel)} title={CLAIM_TITLE}>
                    שייכת למסגרת «{claimLabel(claimSel)}»
                  </ActBtn>
                )}
              </>
            )}
          </>
        )}

        <span className="flex-1" />

        {canEdit && mode === 'frames' && (
          <>
            <ActBtn
              tone={fs.confirmed ? 'done' : 'ok'}
              disabled={fs.confirmed || !fs.frames.length}
              onClick={confirmFrames}
              title="בדקתי: כל אזור טקסט מוקף במסגרת, בזרם ובמספר הנכונים"
            >
              {fs.confirmed ? '✓ המסגרות אושרו' : '✓ המסגרות נכונות'}
            </ActBtn>
            <div ref={moreRef} className="relative">
              <SegBtn active={moreOpen} onClick={() => setMoreOpen((o) => !o)} aria-haspopup="menu" aria-expanded={moreOpen} title="פעולות נוספות על המסגרות">
                עוד
              </SegBtn>
              {moreOpen && (
                <div role="menu" className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-surface-variant bg-white p-1 text-[11px] shadow-lg">
                  <button type="button" role="menuitem" onClick={resuggest} className="block w-full rounded px-2 py-1.5 text-right hover:bg-neutral-100">
                    הצעת המחשב (במקום המסגרות שיש)
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={clearFrames}
                    disabled={!fs.frames.length && fs.edited}
                    className="block w-full rounded px-2 py-1.5 text-right text-danger-700 hover:bg-danger-50 disabled:opacity-40"
                  >
                    מחיקת כל המסגרות
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {canEdit && mode === 'lines' && (
          <ActBtn tone={view?.cut_ok ? 'done' : 'ok'} disabled={!!view?.cut_ok} onClick={markCutOk} title="בדקתי את כל תיבות השורות בעמוד והחיתוך נכון">
            {view?.cut_ok ? '✓ החיתוך סומן כתקין' : '✓ החיתוך בעמוד תקין'}
          </ActBtn>
        )}
      </div>

      {/* הסבר של שורה אחת (או הודעה) */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-surface-variant bg-surface/60 px-2 py-1 text-[11px] text-on-surface/80">
        <span className={notice ? 'text-warning-800' : undefined} role={notice ? 'status' : undefined}>
          {tip}
        </span>
        {canEdit && mode === 'frames' && framesTool === 'draw' && (
          <StreamPicker
            chips={chips}
            value={drawStream}
            label="הזרם של המסגרת החדשה"
            onPick={(key) => setPicked({ forDefault: frameStreamDefault, key })}
          />
        )}
        {mode === 'frames' && straddle.size > 0 && (
          <span className="text-danger-700" data-testid="straddle-note">
            {straddle.size === 1 ? 'שורה אחת בולטת' : `${straddle.size} שורות בולטות`} מהמסגרות (באדום) ולא ייספרו — שורה שנחתכה על פני שני
            טורים: משאירים כך ומפצלים אותה במצב &quot;שורות&quot;; שורה שכולה של המסגרת ורק בולטת ממנה — לחצו עליה ו«השורה שייכת למסגרת
            הזו»; אחרת — הגדילו את המסגרת
          </span>
        )}
        {claimHere && (
          <span className="flex flex-wrap items-center gap-1.5 font-medium text-danger-700" data-testid="straddle-claim">
            השורה שבסמן בולטת מהמסגרת «{claimLabel(claimHere)}»
            <ActBtn onClick={() => claimLine(claimHere)} title={CLAIM_TITLE}>
              השורה שייכת למסגרת הזו
            </ActBtn>
          </span>
        )}
        {mode === 'frames' && outside.size > 0 && !asking && (
          <span className="text-warning-800" data-testid="outside-note">
            {linesHe(outside.size)} מחוץ לכל מסגרת (בכתום) — טקסט בלי מסגרת: ציירו לו מסגרת; שורה שנחתכה על פני שני טורים: פצלו אותה במצב
            &quot;שורות&quot;
          </span>
        )}
        {asking && (
          <span role="alert" className="flex flex-wrap items-center gap-1.5 font-medium text-warning-800">
            {linesHe(outside.size)} מחוץ לכל מסגרת (בכתום): לפי המסגרות הן לא שייכות לשום זרם. לאשר בכל זאת?
            <ActBtn tone="ok" onClick={confirmFrames}>
              כן, לאשר
            </ActBtn>
            <ActBtn onClick={() => setAskFor(null)}>ביטול</ActBtn>
          </span>
        )}
        {mode === 'lines' && recut.size > 0 && (
          <span className="text-warning-800">שורות מקווקוות בכתום יזוהו מחדש אחרי האישור — אין צורך לתקן עכשיו את הטקסט שלהן</span>
        )}
        {mode === 'frames' && canEdit && (
          <details className="relative ms-auto">
            <summary className="cursor-pointer select-none text-info-700">כללי המסגרות</summary>
            <ul className="absolute left-0 z-30 mt-1 w-80 list-disc space-y-1 rounded-md border border-surface-variant bg-white p-2 pr-5 text-[11px] leading-snug text-on-surface shadow-lg">
              {FRAME_RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* הסריקה */}
      <div ref={bodyRef} className="relative min-h-0 flex-1 bg-surface-variant/40" onPointerDownCapture={focusRoot}>
        <ProofScan
          view={view}
          imageUrl={imageUrl}
          zoom={zoom}
          mode={mode}
          tool={canEdit ? tool : 'select'}
          frames={mode === 'frames' ? fs.frames : []}
          suggested={fs.suggested}
          seqs={seqs}
          selectedFid={selFrame?.fid ?? null}
          selectedIds={selectedIds}
          resizeLineId={mode === 'lines' && linesTool === 'select' ? selInfo.resizeId : null}
          recutIds={recut}
          straddleIds={straddle}
          outsideIds={outside}
          currentLineId={currentLineId}
          currentWord={currentWord}
          caretY={caretY}
          readOnly={!canEdit}
          drawColor={choiceInfo(view, drawStream).color}
          overlay={popover}
          overlayFor={popover ? selFrame.fid : null}
          onClick={mode === 'frames' ? onFramesClick : onLinesClick}
          onDraw={mode === 'frames' ? onDrawFrame : onAddLine}
          onBand={onBand}
          onFrameBox={onFrameBox}
          onLineBox={onLineBox}
          onZoom={setZoom}
        />
      </div>
    </div>
  )
}
