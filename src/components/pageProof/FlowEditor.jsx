'use client'

import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { buildParagraphs, tabLines, tokenize, isLockedLine, FURNITURE_TAB } from '@/lib/pageProof/textModel'
import { planInsert, planDelete, planEnter, isCollapsed, samePos, wordMarks, lemmaWords, selectionText, linkBadge } from '@/lib/pageProof/flowEdit'
import { readDomSelection, setDomSelection, targetRange, segmentElement, revealInScroller } from './flowDom'

// עורך הטקסט הזורם — הלב של דף ההגהה. הטקסט של זרם אחד (לשונית) מוצג
// כפסקאות רצופות, כמו באוצריא, ולא שורה-לכל-שורה, מיושרות לשני הצדדים כמו בספר
// (paraClass — תצוגה בלבד; ה-DOM והמיפוי אליו לא משתנים). שורש contentEditable אחד;
// כל שינוי נעצר ב-beforeinput (preventDefault) והופך לפעולות-חוזה דרך push —
// הדפדפן עצמו לא משנה את ה-DOM לעולם. אחרי הרינדור הסמן מוחזר למקומו מהמודל.
// מה כל הקשה עושה — flowEdit.js (טהור, עם בדיקות); המיפוי DOM↔מודל —
// flowDom.js. קיצורי-המקלדת (Ctrl+Z, Ctrl+B, F8, Ctrl+Enter…) — בעורך העוטף.
//
// Props:
//   view, tabKey        התצוגה (useProofEditor) והלשונית המוצגת
//   push(...ops, opts?) הוספת פעולות (קבוצת-Undo אחת); opts = {coalesceKey}
//   readOnly            תצוגה בלבד: בלי עריכה, אבל אפשר לסמן ולזוז
//   locked              Set — שורות שממתינות לזיהוי מחדש (recutLineIds)
//   recheck             Set — שורות שזוהו מחדש (מעבר שני) — רקע צהוב
//   approval            paragraphApproval(view, tabKey) — ה-✓ שליד כל פסקה
//   endpoints           linkEndpoints(view) — מספר קטן אחרי מילה שהיא קצה-קישור
//   caretLineId         השורה של הסמן — רקע עדין
//   request             {sel, focus?, n} — בקשה מבחוץ להזיז את הבחירה (לחיצה על
//                       הסריקה, F8, אחרי פעולה מהסרגל); אובייקט חדש = בקשה חדשה.
//                       focus:false (לחיצה על הסריקה) כשהעורך אינו במיקוד — הבחירה
//                       אינה מוצבת בדפדפן עד שהעורך יקבל מיקוד (ראו place)
//   onSelect(sel)       הבחירה זזה ({anchor, focus} במודל)
//   onHint(text)        הסבר קצר למתנדב (למשל "זה סוף-שורה בסריקה")
//   onApprove(key) / onUnapprove(key)   ✓ שליד פסקה
//   onUndo / onRedo / onFormat(style)   מתפריט-העריכה של הדפדפן
//   onWordEnter(lineId, i, rect) / onWordLeave(lineId, i)   חלונית-ההצעות
//   onJump(other)       לחיצה על מספר-קישור: {lineId, page, i} של הצד השני

const DELETE_UNITS = {
  deleteContentBackward: [-1, 'char'],
  deleteContentForward: [1, 'char'],
  deleteContent: [1, 'char'],
  deleteWordBackward: [-1, 'word'],
  deleteWordForward: [1, 'word'],
  deleteSoftLineBackward: [-1, 'line'],
  deleteHardLineBackward: [-1, 'line'],
  deleteSoftLineForward: [1, 'line'],
  deleteHardLineForward: [1, 'line'],
  deleteEntireSoftLine: [-1, 'line'],
  deleteByCut: [-1, 'char'],
}
const INSERT_TYPES = new Set(['insertText', 'insertReplacementText', 'insertFromPaste', 'insertFromYank', 'insertTranspose'])

const LOCK_LABEL = 'ממתינה לזיהוי מחדש'
const EMPTY_LABEL = '(שורה ריקה)'
const NOT_LINE_LABEL = 'לא-שורה'
const HEAD_CLS = { h1: 'text-[1.45em] font-bold', h2: 'text-[1.3em] font-bold', h3: 'text-[1.15em] font-bold' }
const WORD_TITLE = {
  low: 'זיהוי לא בטוח (אין הצעות) — בדקו את המילה מול הסריקה',
  lemma: 'מודגש אוטומטית (דיבור המתחיל) — אין צורך לסמן B',
  latin: 'לועזית — משמאל לימין',
}
const REMOVED_HINT = 'השורה סומנה "לא-שורה" והוסרה מהטקסט — Ctrl+Z מחזיר, או "שחזור" בלוח הפרטים ← עמוד'

// דיווח הבחירה מאוחד לפרק-זמן קצר (גרירת-בחירה שולחת עשרות אירועים)
const SELECT_DELAY_MS = 16
const prevent = (e) => e.preventDefault()
const sameSel = (a, b) => !!a && !!b && samePos(a.anchor, b.anchor) && samePos(a.focus, b.focus)

// יישור לשני הצדדים — כמו בספר (תצוגה בלבד: הטקסט עצמו לא משתנה). השורה האחרונה
// של כל פסקה נשארת בצד ההתחלה (ימין). בלי יישור: כותרות, שורות קצרות (שירה), שורת
// תוכן-עניינים וריהוט הדף — שורות קצרות שמתיחה לרוחב רק מפרקת אותן.
const JUSTIFY_CLS = 'text-justify [text-align-last:start]'
const NOT_JUSTIFIED = new Set(['poem', 'toc'])

function paraClass(p, furniture) {
  if (furniture) return 'text-[0.95em] text-on-surface/70'
  if (HEAD_CLS[p.style]) return HEAD_CLS[p.style]
  if (p.heading) return 'text-[1.2em] font-bold'
  const align = NOT_JUSTIFIED.has(p.style) ? '' : JUSTIFY_CLS
  if (p.style === 'quote') return `ms-10 me-6 text-on-surface/85 ${align}`
  // הגהה — באות קטנה מעט, כמו בדפוס
  if (p.style === 'gloss') return `text-[0.92em] ${align}`
  return align
}

// מודגש "אמיתי": b, או heavy מגלאי-הטיפוגרפיה (שניהם יוצאים <b> באוצריא)
const isBold = (styles) => styles.includes('b') || styles.includes('heavy')

// הסימונים על מילה. קו כחול מנוקד = יש חלופות (ריחוף מציג אותן — גם כשהזיהוי
// לא בטוח); קו אדום מקווקו = זיהוי לא בטוח *בלי הצעות* (לכן לא על מילה שיש לה
// רקע של מודל-השפה — שם יש הצעה בריחוף, כמו במקרא); רקע סגול/כתום = מודל-
// השפה. מילות דיבור-המתחיל המודגשות אוטומטית (בלי b) — מודגשות בגוון מעומעם,
// כדי שיהיה ברור שאין צורך לסמן אותן B.
function wordClass({ low, alt, lm, styles, lemma }) {
  const c = []
  const kinds = lm?.kinds || []
  const lmBg = kinds.includes('lm') ? 'bg-feature-100' : kinds.includes('rec') ? 'bg-warning-strong-100' : null
  if (alt) c.push('underline decoration-dotted decoration-info-600 decoration-2 underline-offset-[5px]')
  else if (low && !lmBg) c.push('underline decoration-dashed decoration-danger-500 decoration-2 underline-offset-[5px]')
  if (lmBg) c.push(`rounded-sm ${lmBg}`)
  if (isBold(styles)) c.push('font-bold')
  else if (lemma) c.push('font-bold text-on-surface/60')
  if (styles.includes('i')) c.push('italic')
  if (styles.includes('big')) c.push('text-[1.2em]')
  if (styles.includes('small')) c.push('text-[0.85em]')
  if (styles.includes('sup')) c.push('align-super text-[0.7em]')
  if (styles.includes('spaced')) c.push('tracking-widest')
  if (styles.includes('latin')) c.push('font-sans')
  return c.join(' ')
}

// טולטיפ למילה בלי חלונית-הצעות (במילה עם הצעות — החלונית מסבירה)
function wordTitle({ low, hover, styles, lemma }) {
  if (hover) return undefined
  const t = []
  if (low) t.push(WORD_TITLE.low)
  if (lemma && !isBold(styles)) t.push(WORD_TITLE.lemma)
  if (styles.includes('latin')) t.push(WORD_TITLE.latin)
  return t.length ? t.join(' · ') : undefined
}

// מספר-הקישור אחרי המילה: ① בשני הקצוות; ריחוף מראה את הצד השני, לחיצה קופצת אליו
function LinkBadge({ ep, otherText, onJump }) {
  const kind = ep.kind === 'dh' ? 'דיבור המתחיל' : 'הערה'
  // צד בעמוד אחר: "עמוד 4, שורה 12: «…»" (flowEdit.linkEndpoints — label)
  const where = otherText ? `«${otherText}»` : ep.other?.label || (ep.other?.page != null ? `עמוד ${ep.other.page}` : '')
  return (
    <sup
      contentEditable={false}
      suppressContentEditableWarning
      data-badge={linkBadge(ep.n)}
      data-link-n={ep.n}
      title={`קישור ${ep.n} (${kind})${where ? ` ← ${where}` : ''} — לחיצה עוברת לצד השני`}
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onClick={(e) => {
        e.preventDefault()
        onJump?.(ep.other)
      }}
      className="mx-px cursor-pointer select-none text-[0.65em] font-bold text-info-700 after:content-[attr(data-badge)] hover:text-info-900"
    />
  )
}

// שורה ריקה (הזיהוי לא קרא בה כלום, או שהמתנדב מחק את כל הטקסט): כפתור קטן
// "לא-שורה" — קישוט/כתם שנחתך כשורה יוסר מהטקסט בלחיצה אחת. בלי צומת-טקסט
// (התווית ב-CSS), כמו שאר הקישוטים — המיפוי DOM↔מודל אינו רואה אותו.
function NotLineButton({ lineId, onRemove }) {
  return (
    <button
      type="button"
      contentEditable={false}
      suppressContentEditableWarning
      data-notline=""
      data-label={NOT_LINE_LABEL}
      aria-label="השורה ריקה — סימון כלא-שורה (קישוט או כתם, לא טקסט)"
      title='אם במקום הזה בסריקה יש קישוט או כתם ולא טקסט — הסרת השורה מהטקסט (Ctrl+Z מחזיר). קו מפריד — לזרם "מפריד" (בסרגל: "זרם")'
      onMouseDown={prevent}
      onClick={() => onRemove?.(lineId)}
      className="mx-1 select-none rounded border border-neutral-300 bg-white px-1.5 align-middle text-[0.6em] font-normal leading-normal text-on-surface/70 after:content-[attr(data-label)] hover:border-danger-300 hover:text-danger-700"
    />
  )
}

function Seg({ line, seg, lemma, isLocked, isRecheck, isCaret, lowWord, eps, wordText, readOnly, onWordEnter, onWordLeave, onJump, onRemoveLine }) {
  const text = String(line?.text ?? '')
  const empty = text.length === 0
  const marks = wordMarks(line, lowWord)
  const toks = empty ? [] : tokenize(text).filter((t) => t.start >= seg.start && t.end <= seg.end)
  const removable = empty && !isLocked && !readOnly && !!onRemoveLine && line.id > 0 && !line._new
  const cls = [
    'rounded-sm transition-colors',
    isLocked ? 'text-on-surface/45 after:ms-1 after:rounded after:bg-warning-100 after:px-1 after:text-[0.6em] after:font-normal after:text-warning-800 after:content-[attr(data-label)]' : '',
    isRecheck && !isLocked ? 'bg-warning-alt-100' : '',
    isCaret && !isRecheck ? 'bg-primary-container' : '',
    empty && !isLocked ? 'after:text-[0.75em] after:text-on-surface/40 after:content-[attr(data-label)]' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const label = isLocked ? LOCK_LABEL : empty ? EMPTY_LABEL : undefined
  const span = (
    <span
      data-line={line.id}
      data-start={seg.start}
      data-end={empty ? 0 : seg.end}
      data-empty={empty ? '1' : undefined}
      data-locked={isLocked ? '1' : undefined}
      data-recheck={isRecheck ? '1' : undefined}
      data-label={label}
      contentEditable={isLocked && !readOnly ? false : undefined}
      suppressContentEditableWarning
      title={isLocked ? 'חיתוך השורה תוקן — היא תיחתך ותיקרא מחדש, ואין טעם לתקן עכשיו את הטקסט שלה' : isRecheck ? 'השורה זוהתה מחדש — בדקו אותה מול הסריקה' : undefined}
      className={cls}
    >
      {empty ? (
        <span data-zw="">{'​'}</span>
      ) : (
        toks.map((t) => {
          if (t.w === 'space') return <Fragment key={`s${t.start}`}>{t.text}</Fragment>
          const alt = marks.alts.get(t.i) || null
          const lm = marks.lm.get(t.i) || null
          const hover = !!(alt || lm)
          const badges = eps?.get(t.i) || null
          const styles = line.words?.[t.i]?.styles || []
          const low = marks.low.has(t.i)
          const inLemma = !!lemma && t.i >= lemma[0] && t.i <= lemma[1]
          return (
            <span
              key={`w${t.i}`}
              data-w={t.i}
              data-auto-bold={inLemma && !isBold(styles) ? '1' : undefined}
              className={wordClass({ low, alt, lm, styles, lemma: inLemma })}
              title={wordTitle({ low, hover, styles, lemma: inLemma })}
              onMouseEnter={hover ? (e) => onWordEnter?.(line.id, t.i, e.currentTarget.getBoundingClientRect()) : undefined}
              // עזיבה מדווחת מכל מילה — גם ממילה שאיבדה את ההצעות שלה בזמן שהעכבר
              // עליה (הוקלדה בה אות); אחרת החלונית "זוכרת" ריחוף שכבר נגמר
              onMouseLeave={onWordLeave ? () => onWordLeave(line.id, t.i) : undefined}
            >
              {t.text}
              {badges?.map((ep) => (
                <LinkBadge key={`${ep.n}-${ep.side}`} ep={ep} otherText={wordText(ep.other)} onJump={onJump} />
              ))}
            </span>
          )
        })
      )}
    </span>
  )
  if (!removable) return span
  return (
    <>
      {span}
      <NotLineButton lineId={line.id} onRemove={onRemoveLine} />
    </>
  )
}

const Para = memo(function Para({ p, byId, info, furniture, locked, recheck, caretLineId, lowWord, endpoints, wordText, readOnly, onApprove, onUnapprove, onWordEnter, onWordLeave, onJump, onRemoveLine }) {
  const approved = !!info?.approved
  // אושרה כבר בסבב הקודם (מעבר שני) — אין כאן מה לבטל
  const pre = approved && !!info?.pre
  const approvable = !furniture && !!info?.approvable
  const first = p.lines[0]
  const lemma = p.style === 'dh' && first ? lemmaWords(String(byId.get(first.lineId)?.text ?? ''), first.w0) : null
  const title = pre
    ? 'הפסקה אושרה כבר בסבב הקודם — אפשר לתקן בה טקסט כרגיל'
    : approved
      ? 'הפסקה אושרה — לחיצה מבטלת את האישור'
      : 'אישור הפסקה — כל השורות בה נכונות (Ctrl+Enter)'
  return (
    <p
      data-para={p.key}
      data-approved={approved ? '1' : undefined}
      data-preapproved={pre ? '1' : undefined}
      className={`relative mb-3 border-s-2 ps-9 pe-1 ${approved ? 'border-success-500' : 'border-transparent'} ${paraClass(p, furniture)}`}
    >
      {approvable && (
        <button
          type="button"
          contentEditable={false}
          suppressContentEditableWarning
          data-gutter=""
          aria-pressed={approved}
          aria-label={pre ? 'הפסקה אושרה כבר בסבב הקודם' : approved ? 'הפסקה אושרה — לחיצה מבטלת את האישור' : 'אישור הפסקה — כל השורות בה נכונות'}
          title={readOnly ? (approved ? 'הפסקה אושרה' : 'הפסקה לא אושרה') : title}
          disabled={readOnly || pre}
          onMouseDown={prevent}
          onClick={() => (approved ? onUnapprove?.(p.key) : onApprove?.(p.key))}
          className={`absolute start-1 top-[0.35em] flex h-6 w-6 select-none items-center justify-center rounded-full border text-base not-italic leading-none transition-colors disabled:cursor-default ${
            approved
              ? 'border-success-600 bg-success-600 text-white'
              : 'border-neutral-300 bg-white text-neutral-400 hover:border-success-500 hover:text-success-600 disabled:hover:border-neutral-300 disabled:hover:text-neutral-400'
          }`}
          style={{ fontSize: '16px' }}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-base leading-none">check</span>
        </button>
      )}
      {p.lines.map((seg, k) => {
        const line = byId.get(seg.lineId)
        if (!line) return null
        return (
          <Fragment key={`${seg.lineId}:${seg.w0}`}>
            {k > 0 && <span data-sep="">{' '}</span>}
            <Seg
              line={line}
              seg={seg}
              lemma={k === 0 ? lemma : null}
              isLocked={isLockedLine(line, locked)}
              isRecheck={!!recheck?.has?.(line.id) || line.recheck === true}
              isCaret={caretLineId === line.id}
              lowWord={lowWord}
              eps={endpoints?.get?.(line.id) || null}
              wordText={wordText}
              readOnly={readOnly}
              onWordEnter={onWordEnter}
              onWordLeave={onWordLeave}
              onJump={onJump}
              onRemoveLine={onRemoveLine}
            />
          </Fragment>
        )
      })}
    </p>
  )
})

function FlowEditor({
  view,
  tabKey,
  push,
  readOnly = false,
  locked = null,
  recheck = null,
  approval = null,
  endpoints = null,
  caretLineId = null,
  request = null,
  onSelect,
  onHint,
  onApprove,
  onUnapprove,
  onUndo,
  onRedo,
  onFormat,
  onWordEnter,
  onWordLeave,
  onJump,
}) {
  const rootRef = useRef(null)
  const pending = useRef(null) // בחירה להחזיר אחרי הרינדור הבא (אחרי עריכה שלנו)
  const deferred = useRef(null) // בחירה מבחוץ שממתינה למיקוד של העורך (לחיצה על הסריקה)
  const pointerIn = useRef(false) // לחיצת-עכבר בתוך העורך בעיצומה
  const lastSel = useRef(null)
  const composing = useRef(null)
  const [epoch, setEpoch] = useState(0)
  // הערכים העדכניים בשביל המאזינים של הדפדפן (נרשמים פעם אחת)
  const latest = useRef({ view, tabKey, push, readOnly, locked, onSelect, onHint, onUndo, onRedo, onFormat })
  useLayoutEffect(() => {
    latest.current = { view, tabKey, push, readOnly, locked, onSelect, onHint, onUndo, onRedo, onFormat }
  })

  const paras = useMemo(() => buildParagraphs(view, tabKey), [view, tabKey])
  const byId = useMemo(() => new Map(tabLines(view, tabKey).map((l) => [l.id, l])), [view, tabKey])
  const allById = useMemo(() => new Map((view?.lines || []).map((l) => [l.id, l])), [view])
  const lowWord = typeof view?.low_word === 'number' ? view.low_word : 0.95
  const furniture = tabKey === FURNITURE_TAB

  // טקסט המילה בצד השני של קישור (לריחוף על מספר-הקישור)
  const wordText = useMemo(() => {
    return (other) => {
      const line = other && (other.page == null || other.page === view?.page) ? allById.get(other.lineId) : null
      if (!line) return null
      const words = tokenize(line.text).filter((t) => t.w === 'word')
      const w = Number.isInteger(other.i) ? words[other.i] : null
      return w ? w.text : words.length ? words.map((x) => x.text).join(' ').slice(0, 40) : null
    }
  }, [allById, view?.page])

  // ---- עריכה: beforeinput / הדבקה / העתקה / גזירה / IME ----
  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    // תוכנית (flowEdit) ← push, רמז, והסמן אחרי הרינדור
    const apply = (plan) => {
      const L = latest.current
      if (!plan) return
      if (plan.hint) L.onHint?.(plan.hint)
      const target = plan.sel || (plan.caret ? { anchor: plan.caret, focus: plan.caret } : null)
      if (plan.ops?.length) {
        const ok = L.push(...plan.ops, plan.coalesceKey ? { coalesceKey: plan.coalesceKey } : null)
        if (ok && target) pending.current = target
      } else if (target) {
        setDomSelection(root, target)
      }
    }
    const currentSel = () => readDomSelection(root) || lastSel.current
    const optsOf = () => ({ locked: latest.current.locked })

    const onBeforeInput = (e) => {
      const L = latest.current
      const type = e.inputType
      // IME: אי-אפשר לבטל את שלבי-ההרכבה — ההכנסה נעשית ב-compositionend
      if (type === 'insertCompositionText' || composing.current) return
      e.preventDefault()
      if (L.readOnly) return
      const sel = currentSel()
      if (type === 'historyUndo') return L.onUndo?.()
      if (type === 'historyRedo') return L.onRedo?.()
      if (type === 'formatBold') return L.onFormat?.('b')
      if (type === 'formatItalic') return L.onFormat?.('i')
      if (!sel) return
      if (INSERT_TYPES.has(type)) {
        let text = e.data
        if (text == null && e.dataTransfer) text = e.dataTransfer.getData('text/plain')
        const t = type === 'insertReplacementText' ? targetRange(root, e) : null
        apply(planInsert(L.view, L.tabKey, t ? { anchor: t.start, focus: t.end } : sel, text ?? '', optsOf()))
      } else if (type === 'insertParagraph' || type === 'insertLineBreak') {
        apply(planEnter(L.view, L.tabKey, sel))
      } else if (DELETE_UNITS[type]) {
        const [dir, unit] = DELETE_UNITS[type]
        apply(planDelete(L.view, L.tabKey, sel, dir, unit, targetRange(root, e), optsOf()))
      }
      // insertFromDrop, deleteByDrag, format* אחרים וכו' — נבלעים
    }

    const onPaste = (e) => {
      e.preventDefault()
      const L = latest.current
      if (L.readOnly) return
      const sel = currentSel()
      if (sel) apply(planInsert(L.view, L.tabKey, sel, e.clipboardData?.getData('text/plain') ?? '', optsOf()))
    }
    // העתקה: הטקסט כמו במודל (בלי ה-✓, מספרי-הקישור ורווחי-העזר)
    const copySel = (e) => {
      const sel = readDomSelection(root)
      if (!sel || isCollapsed(sel) || !e.clipboardData) return null
      e.clipboardData.setData('text/plain', selectionText(latest.current.view, latest.current.tabKey, sel))
      e.preventDefault()
      return sel
    }
    const onCopy = (e) => {
      copySel(e)
    }
    const onCut = (e) => {
      const L = latest.current
      const sel = copySel(e) || readDomSelection(root)
      e.preventDefault()
      if (!L.readOnly && sel && !isCollapsed(sel)) apply(planDelete(L.view, L.tabKey, sel, -1, 'char', null, optsOf()))
    }
    const onCompStart = () => {
      composing.current = currentSel() || { anchor: null, focus: null }
    }
    const onCompEnd = (e) => {
      const sel = composing.current
      composing.current = null
      const L = latest.current
      if (!L.readOnly && sel?.focus && e.data) apply(planInsert(L.view, L.tabKey, sel, e.data, optsOf()))
      // ההרכבה שינתה את ה-DOM בעצמה — מציירים מחדש מהמודל
      setEpoch((n) => n + 1)
    }

    root.addEventListener('beforeinput', onBeforeInput)
    root.addEventListener('paste', onPaste)
    root.addEventListener('copy', onCopy)
    root.addEventListener('cut', onCut)
    root.addEventListener('compositionstart', onCompStart)
    root.addEventListener('compositionend', onCompEnd)
    return () => {
      root.removeEventListener('beforeinput', onBeforeInput)
      root.removeEventListener('paste', onPaste)
      root.removeEventListener('copy', onCopy)
      root.removeEventListener('cut', onCut)
      root.removeEventListener('compositionstart', onCompStart)
      root.removeEventListener('compositionend', onCompEnd)
    }
  }, [])

  // ---- הבחירה: selectionchange ← המודל (מאוחד: פעם אחת לכל רצף אירועים).
  // טיימר ולא requestAnimationFrame — rAF אינו רץ כשהדף לא מצויר (חלון מוסתר),
  // והסמן חייב להתעדכן גם אז (הסרגל פועל על הבחירה האחרונה) ----
  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    let timer = null
    const run = () => {
      timer = null
      const sel = readDomSelection(root)
      if (!sel || sameSel(sel, lastSel.current)) return
      lastSel.current = sel
      latest.current.onSelect?.(sel)
    }
    const onChange = () => {
      if (timer == null) timer = setTimeout(run, SELECT_DELAY_MS)
    }
    document.addEventListener('selectionchange', onChange)
    return () => {
      document.removeEventListener('selectionchange', onChange)
      if (timer != null) clearTimeout(timer)
    }
  }, [])

  // לשונית אחרת — הבחירה הקודמת אינה שייכת אליה
  useEffect(() => {
    lastSel.current = null
  }, [tabKey])

  // בחירה שנדחתה (place, focus:false) מוצבת כשהעורך מקבל מיקוד — מהמקלדת (Tab)
  // או מקוד. מיקוד מלחיצה בתוך העורך — הדפדפן מציב את הסמן במקום הלחיצה, והבחירה
  // הישנה יורדת.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const down = () => {
      pointerIn.current = true
    }
    const up = () => {
      pointerIn.current = false
    }
    const onFocus = () => {
      const sel = deferred.current
      deferred.current = null
      if (sel && !pointerIn.current) setDomSelection(root, sel)
    }
    root.addEventListener('pointerdown', down, true)
    root.addEventListener('mousedown', down, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    window.addEventListener('mouseup', up, true)
    window.addEventListener('keydown', up, true)
    root.addEventListener('focus', onFocus)
    return () => {
      root.removeEventListener('pointerdown', down, true)
      root.removeEventListener('mousedown', down, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
      window.removeEventListener('mouseup', up, true)
      window.removeEventListener('keydown', up, true)
      root.removeEventListener('focus', onFocus)
    }
  }, [])

  // הצבת בחירה מהמודל בדפדפן. focus=false (לחיצה על הסריקה, ביטול שינוי שאינו
  // טקסט) כשהמיקוד מחוץ לעורך: *לא* נוגעים בבחירה של הדפדפן — Chromium מעביר את
  // המיקוד לעורך כשמציבים בו בחירה באמצע לחיצה, ואז Delete/Backspace שנועדו
  // למסגרת או לשורה בסריקה היו מוחקים טקסט. הסמן במודל כבר זז (הסימון על
  // הסריקה, שורת-המצב, הרקע של השורה); כאן רק גוללים את אזור-הטקסט אל השורה,
  // והבחירה תוצב כשהעורך יקבל מיקוד.
  const place = (sel, focus) => {
    const root = rootRef.current
    if (!root || !sel) return
    deferred.current = null
    const pos = sel.focus || sel.anchor
    const active = root.ownerDocument.activeElement === root
    if (!focus && !active && !latest.current.readOnly) {
      deferred.current = sel
      revealInScroller(root, pos)
      return
    }
    if (focus && !latest.current.readOnly && !active) root.focus({ preventScroll: true })
    if (!setDomSelection(root, sel)) return
    if (!focus) {
      revealInScroller(root, pos)
      return
    }
    const el = segmentElement(root, pos)
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  // שורה ריקה ← "לא-שורה" (status removed): קישוט או כתם שנחתך כשורה
  const removeLine = useCallback((lineId) => {
    const L = latest.current
    if (L.readOnly || !L.push) return
    if (L.push({ kind: 'status', page: L.view?.page, ids: [lineId], value: 'removed' })) L.onHint?.(REMOVED_HINT)
  }, [])

  // אחרי עריכה שלנו — הסמן חוזר למקום שהתוכנית קבעה
  useLayoutEffect(() => {
    if (!pending.current) return
    const target = pending.current
    pending.current = null
    place(target, true)
  })

  // בקשה מבחוץ (לחיצה על הסריקה, F8, פעולה מהסרגל, קפיצה לקישור)
  useLayoutEffect(() => {
    if (request?.sel) place(request.sel, request.focus !== false)
  }, [request])

  return (
    <div
      ref={rootRef}
      dir="rtl"
      contentEditable={!readOnly}
      suppressContentEditableWarning
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      translate="no"
      role="textbox"
      aria-multiline="true"
      aria-readonly={readOnly || undefined}
      aria-label="טקסט הזרם — מתקנים ישר בטקסט"
      data-proof-flow=""
      tabIndex={readOnly ? 0 : undefined}
      onDragStart={prevent}
      onDrop={prevent}
      className="min-h-full whitespace-pre-wrap break-words pb-16 leading-[2.1] text-on-surface caret-primary outline-none"
    >
      <Fragment key={epoch}>
        {paras.length === 0 ? (
          <p contentEditable={false} suppressContentEditableWarning className="py-8 text-center text-sm text-on-surface/50">
            אין טקסט בזרם הזה
          </p>
        ) : (
          paras.map((p) => (
            <Para
              key={p.key}
              p={p}
              byId={byId}
              info={approval?.byKey?.get?.(p.key) || null}
              furniture={furniture}
              locked={locked}
              recheck={recheck}
              caretLineId={p.lines.some((s) => s.lineId === caretLineId) ? caretLineId : null}
              lowWord={lowWord}
              endpoints={endpoints}
              wordText={wordText}
              readOnly={readOnly}
              onApprove={onApprove}
              onUnapprove={onUnapprove}
              onWordEnter={onWordEnter}
              onWordLeave={onWordLeave}
              onJump={onJump}
              onRemoveLine={removeLine}
            />
          ))
        )}
      </Fragment>
    </div>
  )
}

export default memo(FlowEditor)
