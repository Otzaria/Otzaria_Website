'use client'

import { Fragment, memo, useEffect, useMemo, useRef } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import { cx } from '@/components/ui/cx'
import { diffWords } from '@/lib/dicta/text-diff'
import { SIDE_LABELS } from '@/lib/adminSuggestions/conflictTerms'
import { EMPTY_SIDE_TEXT, decisionText, inlineCaption, keepLabel, partTitle, suggestionCaptions } from '@/lib/adminSuggestions/diffTerms'
import { inlineGroups, suggestionLayout } from '@/lib/adminSuggestions/inlineDiff'

/**
 * תצוגת ההבדלים בין שני נוסחים, עם הדגשת המילים שהשתנו בתוך החלק. משותף ל"הצעות עריכה"
 * ול"התנגשויות בסנכרון". ההשוואה עצמה (diffWords) לא השתנתה — רק העיצוב (טוקני diff-*) והניסוח.
 *
 * ביצועים: diffWords בונה טבלת DP בגודל O(n*m), לכן מחושב פעם אחת לכל חלק
 * דרך useMemo (תלוי ב-changes בלבד), והרכיב עטוף ב-memo כדי שרינדורים מחדש של
 * ההורה (בחירה/busy/סינון) לא יחשבו את ה-diff שוב.
 *
 * הצעת עריכה: טקסט אחד, "השינוי המוצע" — בכל מקום שהשתנה, מה שיוסר (אדום, קו חוצה, <del>) ומיד אחריו מה
 * שיתווסף (ירוק, קו תחתון, <ins>), ולקורא מסך "נמחק:" / "נוסף:". כשרוב הקטע השתנה (inlineDiff.suggestionLayout)
 * — שתי תיבות כמו קודם: למעלה "כרגע בספר", למטה "מוצע". בכמה חלקים — "חלק 2 מתוך 5" מעל כל חלק. אישור חלקי: כשמועבר selectable=true, כל חלק ממתין
 * מקבל תיבת סימון (ui/Checkbox, 44px; partLabel — השם הנגיש), וחלקים שכבר אושרו או נדחו מסומנים בתג.
 *
 * התנגשות: כשמועבר onResolve — למעלה הנוסח שבמאגר (כחול שקט), למטה הנוסח שבאתר (ניטרלי), ולכל אחד, צמוד
 * לשם שלו, כפתור "השאר את הנוסח ש…" (נוסח ריק — "השאר בלי טקסט (מחק את החלק)"). אחרי בחירה החלק נשאר
 * במקומו (decisions): הכפתור הופך לתג "נבחר", הנוסח השני מתעמעם, ובכותרת החלק — "נבחר: …" ו"בטל" (onCancel)
 * עד שהבקשה יוצאת. כך לחיצה כפולה לא מכריעה את החלק הבא.
 *
 * @param {{
 *   changes: Array<{idx?:number, before:string, after:string, status?:string}>,
 *   total?: number,
 *   selectable?: boolean,
 *   selected?: Set<number>,
 *   onToggle?: (idx:number) => void,
 *   partLabel?: (idx:number) => string,
 *   disabled?: boolean,
 *   onResolve?: (change:object, strategy:'ours'|'theirs') => void,
 *   decisions?: Map<object, { strategy: 'ours'|'theirs', state: 'waiting'|'saving'|'saved' }>,
 *   onCancel?: (change:object) => void,
 * }} props
 */
function DiffPreview({ changes, total, selectable = false, selected, onToggle, partLabel, disabled = false, onResolve, decisions, onCancel }) {
  const conflict = Boolean(onResolve)
  const rows = useMemo(
    () => (changes || []).map((c) => {
      const segs = diffWords(c.before, c.after)
      return { c, segs, layout: conflict ? null : suggestionLayout(c, segs) }
    }),
    [changes, conflict]
  )

  if (!rows.length) return <div className="text-body-sm text-on-surface-variant">אין שינויים להצגה</div>
  const count = total ?? rows.length
  const titled = Boolean(onResolve) || selectable || count > 1
  return (
    <div className="flex flex-col gap-2 text-body-md" dir="rtl">
      {rows.map(({ c, segs, layout }, i) => {
        const idx = c.idx ?? i
        const common = { change: c, segs, title: titled ? partTitle(onResolve ? i + 1 : idx + 1, count) : null }
        return onResolve
          ? <ConflictPart key={idx} {...common} decision={decisions?.get(c)} onResolve={onResolve} onCancel={onCancel} />
          : (
            <SuggestionPart
              key={idx}
              {...common}
              layout={layout}
              selectable={selectable}
              selected={selected?.has(idx) || false}
              onToggle={onToggle}
              label={partLabel ? partLabel(idx) : `חלק ${idx + 1}`}
              disabled={disabled}
            />
          )
      })}
      {count > rows.length && <div className="text-body-sm text-on-surface-variant">ועוד {count - rows.length} חלקים שלא מוצגים כאן</div>}
    </div>
  )
}

const PART = 'overflow-hidden rounded-(--radius-control) bg-surface-container-low'
const PART_HEADER = 'flex min-h-(--touch-target) flex-wrap items-center gap-x-2 px-3 text-label-md text-on-surface-variant'

/** חלק בהצעת עריכה: כותרת (עם תיבת סימון באישור חלקי), ומתחת — טקסט אחד, או "כרגע בספר" ו"מוצע" */
function SuggestionPart({ change: c, segs, layout, title, selectable, selected, onToggle, label, disabled }) {
  const idx = c.idx
  const status = c.status || 'pending'
  const interactive = selectable && status === 'pending' && !disabled
  const captions = suggestionCaptions(c)
  return (
    <div
      onClick={interactive ? () => onToggle?.(idx) : undefined}
      className={cx(PART, interactive && 'cursor-pointer', selected && status === 'pending' && 'outline-2 outline-primary', status === 'rejected' && 'opacity-60')}
    >
      {title && (
        <div className={cx(PART_HEADER, selectable && status === 'pending' && 'ps-0')}>
          {selectable && status === 'pending' && (
            // הלחיצה על התיבה לא עולה לחלק — אחרת היא הייתה מסמנת ומבטלת באותה לחיצה
            <span onClick={(ev) => ev.stopPropagation()} className="contents">
              <Checkbox label={label} checked={selected} disabled={disabled} onChange={() => onToggle?.(idx)} />
            </span>
          )}
          <span>{title}</span>
          {status === 'approved' && <Badge tone="success" icon="check">אושר</Badge>}
          {status === 'rejected' && <Badge tone="error" icon="close">נדחה</Badge>}
        </div>
      )}
      {layout === 'inline' && (
        <DiffSide tone="neutral" caption={inlineCaption(c)}>
          <InlineSegments segs={segs} />
        </DiffSide>
      )}
      {layout === 'split' && captions.before && (
        <DiffSide tone="remove" caption={captions.before}>
          <Segments segs={segs} skip="add" mark="del" markClass="bg-diff-remove-mark line-through decoration-2" />
        </DiffSide>
      )}
      {layout === 'split' && captions.after && (
        <DiffSide tone="add" caption={captions.after}>
          <Segments segs={segs} skip="del" mark="add" markClass="bg-diff-add-mark underline decoration-2 underline-offset-4" />
        </DiffSide>
      )}
    </div>
  )
}

/** חלק בהתנגשות: שני הנוסחים, תמיד (גם ריק — הוא בחירה לגיטימית), ולכל אחד הכפתור שלו */
function ConflictPart({ change: c, segs, title, decision, onResolve, onCancel }) {
  const chosen = decision?.strategy
  const headerText = decision ? decisionText(chosen, decision.state) : null
  const ref = useRef(null)
  // הכפתור שנלחץ הוחלף בתג (או "בטל" נעלם כשהבחירה יצאה): הפוקוס עובר ל"בטל" של החלק, ואחר כך לחלק עצמו —
  // לא לתחילת הדף. Tab ממשיך משם לחלק הבא.
  const state = decision?.state
  const previous = useRef(state)
  useEffect(() => {
    if (previous.current === state) return
    previous.current = state
    const active = document.activeElement
    if (active && active !== document.body) return
    const target = state === 'waiting' ? ref.current?.querySelector('[data-cancel-part]') : ref.current
    target?.focus({ preventScroll: true })
  }, [state])
  return (
    <div ref={ref} tabIndex={-1} className={cx(PART, 'outline-none focus-visible:outline-2 focus-visible:outline-primary')}>
      <div className={PART_HEADER}>
        <span>{title}</span>
        {headerText && (
          <span className="flex items-center gap-1 text-on-surface">
            <AppIcon name={decision.state === 'saved' ? 'check_circle' : 'check'} className="text-lg" />
            {headerText}
          </span>
        )}
        {decision?.state === 'waiting' && (
          <Button data-cancel-part="" variant="text" size="sm" icon="undo" className="ms-auto" onClick={() => onCancel?.(c)} aria-label={`בטל את הבחירה: ${title}`}>
            בטל
          </Button>
        )}
      </div>
      {['theirs', 'ours'].map((side) => {
        const text = side === 'theirs' ? c.before : c.after
        const empty = text === ''
        return (
          <DiffSide
            key={side}
            tone={side === 'theirs' ? 'repo' : 'site'}
            caption={SIDE_LABELS[side]}
            dimmed={Boolean(chosen) && chosen !== side}
            selected={chosen === side}
            action={chosen ? (chosen === side && <Badge tone="primary" icon="check">נבחר</Badge>) : (
              <Button type="button" variant="outlined" size="sm" className="bg-surface" onClick={() => onResolve(c, side)} aria-label={`${keepLabel(side, empty)}: ${title}`}>
                {keepLabel(side, empty)}
              </Button>
            )}
          >
            {empty
              ? <span className="text-on-surface-variant">({EMPTY_SIDE_TEXT})</span>
              : <Segments segs={segs} skip={side === 'theirs' ? 'add' : 'del'} mark={side === 'theirs' ? 'del' : 'add'} markClass={cx(side === 'theirs' ? 'bg-diff-repo-mark' : 'bg-diff-site-mark', 'underline decoration-2 underline-offset-4')} />}
          </DiffSide>
        )
      })}
    </div>
  )
}

const SIDE_TONES = {
  neutral: '',
  remove: 'bg-diff-remove',
  add: 'bg-diff-add',
  repo: 'bg-diff-repo',
  site: 'bg-diff-site',
}

/** נוסח אחד: כיתוב קטן (וכפתור / תג צמוד אליו), ומתחת — הטקסט */
function DiffSide({ tone, caption, action, dimmed = false, selected = false, children }) {
  return (
    <div className={cx('px-3 py-2 text-on-surface transition-opacity', SIDE_TONES[tone], dimmed && 'opacity-50', selected && 'outline-2 -outline-offset-2 outline-primary')}>
      <div className={cx('flex flex-wrap items-center gap-x-3 gap-y-1', action ? 'mb-1 min-h-(--touch-target)' : 'mb-0.5')}>
        <span className="text-label-sm text-on-surface-variant">{caption}</span>
        {action}
      </div>
      <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{children}</p>
    </div>
  )
}

/** הטקסט של צד אחד: בלי המילים של הצד השני, והמילים שהשתנו מודגשות */
function Segments({ segs, skip, mark, markClass }) {
  return segs.filter((s) => s.type !== skip).map((s, k) =>
    s.type === mark
      ? <mark key={k} className={cx('rounded-sm text-inherit [box-decoration-break:clone]', markClass)}>{s.text}</mark>
      : <span key={k}>{s.text}</span>
  )
}

const INLINE_MARK = 'rounded-sm px-0.5 text-inherit [box-decoration-break:clone] decoration-2'

/** טקסט אחד: מה שלא השתנה כמו שהוא, ובכל שינוי — המחוק ומיד אחריו (ברווח) החדש */
function InlineSegments({ segs }) {
  return inlineGroups(segs).map((g, k) => g.type === 'equal'
    ? <span key={k}>{g.text}</span>
    : (
      <Fragment key={k}>
        {g.lead}
        {g.del && <del className={cx(INLINE_MARK, 'bg-diff-remove-mark line-through')}><span className="sr-only">נמחק: </span>{g.del}</del>}
        {g.del && g.add && ' '}
        {g.add && <ins className={cx(INLINE_MARK, 'bg-diff-add-mark underline underline-offset-4')}><span className="sr-only">נוסף: </span>{g.add}</ins>}
        {g.trail}
      </Fragment>
    ))
}

export default memo(DiffPreview)
