'use client'

import { useMemo } from 'react'
import { buildDiffView } from '@/lib/corrections/diff-view'
import { trimContext } from '@/lib/adminPageReportsScreen/pageReportsQuery'
import { cx } from '@/components/ui/cx'

const CHAR_DEL = 'rounded-(--radius-xs) bg-diff-remove-mark text-on-surface'
const CHAR_ADD = 'rounded-(--radius-xs) bg-diff-add-mark text-on-surface'

/** הקטע שהשתנה, צד אחד — האותיות שהשתנו מודגשות (אות עם הניקוד שלה יחד) */
function Changed({ segs, side }) {
  return segs.map((s, i) => {
    if (s.type === 'equal') return <span key={i}>{s.text}</span>
    if (s.type === 'change') {
      const parts = side === 'before' ? s.before : s.after
      return (
        <span key={i}>
          {parts.map((p, j) => (p.type === 'equal' ? <span key={j}>{p.text}</span> : <mark key={j} className={side === 'before' ? CHAR_DEL : CHAR_ADD}>{p.text}</mark>))}
        </span>
      )
    }
    if (s.type === 'del' && side === 'before') return <mark key={i} className={CHAR_DEL}>{s.text}</mark>
    if (s.type === 'add' && side === 'after') return <mark key={i} className={CHAR_ADD}>{s.text}</mark>
    return null
  })
}

const SIDES = {
  before: { label: 'בספר', srLabel: 'בספר: ', box: 'bg-diff-remove', ring: 'ring-diff-remove-mark', Tag: 'del', empty: '(לא כתוב כלום)' },
  after: { label: 'התיקון המוצע', srLabel: 'מוצע: ', box: 'bg-diff-add', ring: 'ring-diff-add-mark', Tag: 'ins', empty: '(למחוק)' },
}

/** צד אחד: התווית, ומשפט ההקשר עם הקטע שבספר / התיקון במקומו — מודגש, עם האותיות השונות */
function Side({ side, text, segs, context }) {
  const s = SIDES[side]
  const Tag = s.Tag
  return (
    <div className={cx('flex min-w-0 flex-col gap-1 rounded-(--radius-control) px-3 py-2.5', s.box)}>
      <span className="text-label-md text-on-surface-variant">{s.label}</span>
      <p className="text-body-lg leading-loose text-on-surface-variant [overflow-wrap:anywhere]" dir="rtl">
        {context.before}
        <Tag className={cx('mx-0.5 rounded-(--radius-xs) bg-surface-container-lowest px-1 py-0.5 text-title-md font-bold text-on-surface no-underline ring-1', s.ring)}>
          <span className="sr-only">{s.srLabel}</span>
          {text ? <Changed segs={segs} side={side} /> : <span className="text-body-md font-normal text-on-surface-variant">{s.empty}</span>}
        </Tag>
        {context.after}
      </p>
    </div>
  )
}

/**
 * הלב של כרטיס הטעות: "בספר" מול "התיקון המוצע" — זה ליד זה (בטלפון — זה מתחת לזה). בכל צד משפט ההקשר מהעמוד
 * (מקוצר — trimContext), והקטע עצמו מודגש בתוכו, עם האותיות שהשתנו מסומנות. ההשוואה — buildDiffView (מילים, ובתוך
 * מילה שהוחלפה — אותיות), אותה פונקציה של מסך דיווחי הטעויות. ל-del/ins משמעות גם לקורא המסך.
 * @param {{ original?: string, proposed?: string, contextBefore?: string, contextAfter?: string }} props
 */
export default function ErrorTextCompare({ original, proposed, contextBefore, contextAfter }) {
  const segs = useMemo(() => buildDiffView(original || '', proposed || ''), [original, proposed])
  const context = trimContext(contextBefore, contextAfter)
  return (
    <div className="grid gap-2 sm:grid-cols-2" dir="rtl">
      <Side side="before" text={original} segs={segs} context={context} />
      <Side side="after" text={proposed} segs={segs} context={context} />
    </div>
  )
}
